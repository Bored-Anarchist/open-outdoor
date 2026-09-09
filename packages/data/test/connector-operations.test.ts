import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FileConnectorOperationsStore,
  runMonitoredConnector,
  runConnectorFleet,
  publicConnectorHealth,
  permissionShellManifest,
  type Connector,
  type ConnectorManifest,
  type ConnectorHealthPolicy,
} from '../src/index.js';

const now = '2026-09-09T00:00:00.000Z';
const policy: ConnectorHealthPolicy = {
  requiredFields: { name: 'string', 'geometry.type': 'string' },
  minimumRecords: 1,
  maximumRecords: 10,
  maximumFailureFraction: 0,
  maximumVolumeChangeFraction: 1,
  maximumConsecutiveFailures: 2,
  staleAfterSeconds: 3600,
  rightsReviewWarningSeconds: 86400,
};
type Row = { name?: string; geometry?: { type: string }; extra?: boolean };
const good: Row = { name: 'Synthetic', geometry: { type: 'Point' } };
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function store(boundary: 'public' | 'private' = 'public') {
  const root = await mkdtemp(join(tmpdir(), 'outdoor-operations-'));
  roots.push(root);
  return new FileConnectorOperationsStore<Row>(root, boundary, process.cwd());
}
function connector(id = 'synthetic-health', rows: Row[] = [good]): Connector<Row, Row, Row> {
  const shell = permissionShellManifest('alltrails');
  const manifest: ConnectorManifest = {
    ...shell,
    sourceId: id,
    lifecycle: 'active',
    authorization: 'authorized',
    acquisitionMode: 'manual-import',
    classification: 'PUBLIC_SYNTHETIC',
    rights: {
      ...shell.rights,
      rawRetention: 'P1D',
      parsedFields: ['name', 'geometry'],
      derivedData: true,
      offlineStorage: true,
      distribution: { public: true, 'private-user': true, 'private-organization': true },
    },
    limits: { ...shell.limits, maxParserMilliseconds: 1000 },
  };
  return {
    manifest,
    discover: vi.fn(async () =>
      rows.map((_row, i) => ({
        externalId: String(i),
        sourcePartition: 'synthetic',
        locator: `file:///synthetic/${i}`,
      })),
    ),
    fetch: async (asset) => ({
      ...asset,
      payload: new TextEncoder().encode(JSON.stringify(rows[Number(asset.externalId)])),
      contentType: 'application/json',
      retrievedAt: now,
    }),
    storeRaw: async (asset) => ({
      ...asset,
      checksum: createHash('sha256').update(asset.payload).digest('hex'),
      byteLength: asset.payload.length,
      storageKey: asset.externalId,
    }),
    parse: async (asset) => JSON.parse(new TextDecoder().decode(asset.payload)) as Row,
    normalize: async (value) => value,
    validate: async () => {},
    checkpoint: vi.fn(async () => {}),
    emit: vi.fn(async (value) => value),
  };
}
const rows = (value: Row) => [value];

describe('WP-406 connector operations', () => {
  it('persists metrics and a last-good snapshot across worker restarts', async () => {
    const destination = await store();
    const source = connector();
    const report = await runMonitoredConnector(source, policy, destination, 'run-one', now, rows);
    expect(report).toMatchObject({
      status: 'healthy',
      consecutiveFailures: 0,
      lastSuccessAt: now,
      alerts: [],
      metrics: {
        discovered: 1,
        fetched: 1,
        parsed: 1,
        records: 1,
        rejected: 0,
        fieldCoverage: { name: 1, 'geometry.type': 1 },
      },
    });
    expect(source.checkpoint).toHaveBeenCalledOnce();
    expect(source.emit).toHaveBeenCalledOnce();
    const restarted = new FileConnectorOperationsStore<Row>(
      destination.root,
      'public',
      process.cwd(),
    );
    expect((await restarted.load(source.manifest))?.lastGood?.output).toEqual([good]);
  });
  it('quarantines missing fields without emitting or checkpointing and preserves previous output', async () => {
    const destination = await store();
    const original = connector();
    await runMonitoredConnector(original, policy, destination, 'one', now, rows);
    const broken = connector('synthetic-health', [{ geometry: { type: 'Point' } }]);
    const report = await runMonitoredConnector(
      broken,
      policy,
      destination,
      'two',
      '2026-09-09T00:01:00Z',
      rows,
    );
    expect(report.status).toBe('quarantined');
    expect(report.alerts).toContain('missing-fields');
    expect(broken.emit).not.toHaveBeenCalled();
    expect(broken.checkpoint).not.toHaveBeenCalled();
    expect((await destination.load(original.manifest))?.lastGood?.output).toEqual([good]);
  });
  it('detects added-field schema drift and requires the exact reviewed fingerprint for recovery', async () => {
    const destination = await store();
    const original = connector();
    await runMonitoredConnector(original, policy, destination, 'one', now, rows);
    const changed = connector('synthetic-health', [{ ...good, extra: true }]);
    const drift = await runMonitoredConnector(
      changed,
      policy,
      destination,
      'two',
      '2026-09-09T00:01:00Z',
      rows,
    );
    expect(drift.alerts).toContain('schema-drift');
    const recovered = await runMonitoredConnector(
      changed,
      policy,
      destination,
      'three',
      '2026-09-09T00:02:00Z',
      rows,
      { reviewedSchemaFingerprint: drift.metrics.schemaFingerprint },
    );
    expect(recovered.status).toBe('healthy');
    expect(recovered.alerts).toContain('schema-change-reviewed');
  });
  it('opens a persisted circuit, skips source contact, and supports an explicit recovery probe', async () => {
    const destination = await store();
    const broken = connector('synthetic-health', []);
    await runMonitoredConnector(broken, policy, destination, 'one', now, rows);
    await runMonitoredConnector(broken, policy, destination, 'two', '2026-09-09T00:01:00Z', rows);
    const healthy = connector();
    expect(
      (
        await runMonitoredConnector(
          healthy,
          policy,
          destination,
          'three',
          '2026-09-09T00:02:00Z',
          rows,
        )
      ).status,
    ).toBe('paused');
    expect(healthy.discover).not.toHaveBeenCalled();
    expect(
      (
        await runMonitoredConnector(
          healthy,
          policy,
          destination,
          'four',
          '2026-09-09T00:03:00Z',
          rows,
          { recoveryProbe: true },
        )
      ).status,
    ).toBe('healthy');
  });
  it('reports staleness and expiring rights without leaking source errors', async () => {
    const destination = await store();
    const original = connector();
    await runMonitoredConnector(original, policy, destination, 'one', now, rows);
    const broken = {
      ...connector(),
      parse: async (): Promise<Row> => {
        throw new Error('private-secret-location');
      },
    };
    const report = await runMonitoredConnector(
      broken,
      policy,
      destination,
      'two',
      '2026-09-09T02:00:00Z',
      rows,
    );
    expect(report.alerts).toContain('stale');
    expect(report.alerts).toContain('rejection-rate');
    expect(await readFile(join(destination.root, 'synthetic-health.json'), 'utf8')).not.toContain(
      'private-secret-location',
    );
    const denied = {
      ...connector(),
      manifest: {
        ...original.manifest,
        rights: { ...original.manifest.rights, reviewExpiresAt: '2026-09-09T02:00:00Z' },
      },
    };
    const expired = await runMonitoredConnector(
      denied,
      policy,
      destination,
      'three',
      '2026-09-09T02:00:00Z',
      rows,
    );
    expect(expired.alerts).toEqual(expect.arrayContaining(['rights-denied', 'rights-review-due']));
    expect(denied.discover).not.toHaveBeenCalled();
  });
  it('isolates a failed source and store failure from unrelated fleet jobs', async () => {
    const destination = await store();
    const result = await runConnectorFleet([
      () => runMonitoredConnector(connector('broken', []), policy, destination, 'a', now, rows),
      async () => {
        throw new Error('private filesystem detail');
      },
      () => runMonitoredConnector(connector('healthy'), policy, destination, 'b', now, rows),
    ]);
    expect(result.failedJobs).toBe(1);
    expect(result.reports.map((report) => report.status)).toEqual(['quarantined', 'healthy']);
    expect((await destination.load(connector('healthy').manifest))?.lastGood?.output).toEqual([
      good,
    ]);
  });
  it('keeps private reports/snapshots out of public stores and summaries', async () => {
    const destination = await store('private');
    const publicStore = await store();
    const base = connector();
    const privateSource = {
      ...base,
      manifest: { ...base.manifest, classification: 'PRIVATE_USER' as const },
    };
    const report = await runMonitoredConnector(
      privateSource,
      policy,
      destination,
      'private',
      now,
      rows,
    );
    expect(publicConnectorHealth([report])).toEqual([]);
    await expect(
      runMonitoredConnector(privateSource, policy, publicStore, 'private', now, rows),
    ).rejects.toThrow(/private operations/);
    const inside = new FileConnectorOperationsStore<Row>(process.cwd(), 'private', process.cwd());
    await expect(inside.load(privateSource.manifest)).rejects.toThrow(/disjoint/);
  });
  it('keeps validated output on checkpoint failure so replay can safely retry', async () => {
    const destination = await store();
    const source = {
      ...connector(),
      checkpoint: async () => {
        throw new Error('storage detail');
      },
    };
    const report = await runMonitoredConnector(source, policy, destination, 'one', now, rows);
    expect(report.status).toBe('healthy');
    expect(report.alerts).toContain('checkpoint-failed');
    expect((await destination.load(source.manifest))?.lastGood?.output).toEqual([good]);
  });
  it('bounds hanging emit callbacks and still runs the next fleet source', async () => {
    const destination = await store();
    const base = connector('hang');
    const hanging = {
      ...base,
      manifest: {
        ...base.manifest,
        limits: { ...base.manifest.limits, maxParserMilliseconds: 20 },
      },
      emit: async (): Promise<Row> => new Promise(() => {}),
    };
    const result = await runConnectorFleet([
      () => runMonitoredConnector(hanging, policy, destination, 'one', now, rows),
      () => runMonitoredConnector(connector('other'), policy, destination, 'two', now, rows),
    ]);
    expect(result.reports.map((report) => report.status)).toEqual(['quarantined', 'healthy']);
    expect(result.reports[0]?.alerts).toContain('run-failed');
  });
  it('rejects invalid health policies and time regression', async () => {
    const destination = await store();
    const source = connector();
    await expect(
      runMonitoredConnector(
        source,
        { ...policy, maximumFailureFraction: NaN },
        destination,
        'one',
        now,
        rows,
      ),
    ).rejects.toThrow(/policy/);
    await runMonitoredConnector(source, policy, destination, 'one', now, rows);
    await expect(
      runMonitoredConnector(source, policy, destination, 'two', '2026-09-08T00:00:00Z', rows),
    ).rejects.toThrow(/backwards/);
  });
});

it('detects nested schema changes and rejects corrupted persisted state', async () => {
  const destination = await store();
  const source = connector();
  await runMonitoredConnector(source, policy, destination, 'one', now, rows);
  const changed = connector('synthetic-health', [
    { ...good, geometry: { type: 'Point', newField: true } as { type: string } },
  ]);
  const drift = await runMonitoredConnector(
    changed,
    policy,
    destination,
    'two',
    '2026-09-09T00:01:00Z',
    rows,
  );
  expect(drift.alerts).toContain('schema-drift');
  const { writeFile } = await import('node:fs/promises');
  const state = await destination.load(source.manifest);
  await writeFile(
    join(destination.root, 'synthetic-health.json'),
    JSON.stringify({ ...state, report: { ...state!.report, consecutiveFailures: -1 } }),
  );
  await expect(destination.load(source.manifest)).rejects.toThrow(/invalid/);
});

it('refreshes freshness alerts without fetching or changing the saved output', async () => {
  const { inspectConnectorHealth } = await import('../src/connector-operations.js');
  const destination = await store();
  const source = connector();
  await runMonitoredConnector(source, policy, destination, 'one', now, rows);
  const state = (await destination.load(source.manifest))!;
  const report = inspectConnectorHealth(source.manifest, policy, state, '2026-09-10T00:00:00Z');
  expect(report.alerts).toContain('stale');
  expect(report.status).toBe('quarantined');
  expect(source.discover).toHaveBeenCalledOnce();
  expect(state.report.status).toBe('healthy');
});

it('requires rights for derived offline output and its distribution boundary before contact', async () => {
  const destination = await store();
  for (const right of ['derivedData', 'offlineStorage', 'distribution'] as const) {
    const source = connector();
    const denied = {
      ...source,
      manifest: {
        ...source.manifest,
        rights: {
          ...source.manifest.rights,
          [right]:
            right === 'distribution'
              ? { public: false, 'private-user': true, 'private-organization': true }
              : false,
        },
      },
    };
    const report = await runMonitoredConnector(denied, policy, destination, 'rights', now, rows, {
      recoveryProbe: true,
    });
    expect(report.alerts).toContain('rights-denied');
    expect(denied.discover).not.toHaveBeenCalled();
    expect((await destination.load(denied.manifest))?.lastGood).toBeNull();
  }
});

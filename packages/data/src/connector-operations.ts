import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, realpath, open, lstat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import {
  evaluateSourceRights,
  validateConnectorManifest,
  type Connector,
  type ConnectorManifest,
  type ConnectorContext,
  type StoredRawAsset,
} from './connector.js';
import { assertProcessingRootIsolation, runConnector } from './ingestion.js';

export type FieldKind = 'string' | 'number' | 'boolean' | 'object' | 'array';
export interface ConnectorHealthPolicy {
  readonly requiredFields: Readonly<Record<string, FieldKind>>;
  readonly minimumRecords: number;
  readonly maximumRecords: number;
  readonly maximumFailureFraction: number;
  readonly maximumVolumeChangeFraction: number;
  readonly maximumConsecutiveFailures: number;
  readonly staleAfterSeconds: number;
  readonly rightsReviewWarningSeconds: number;
}
export type HealthAlert =
  | 'rights-denied'
  | 'rights-review-due'
  | 'never-succeeded'
  | 'stale'
  | 'schema-drift'
  | 'missing-fields'
  | 'volume-anomaly'
  | 'rejection-rate'
  | 'run-failed'
  | 'circuit-open'
  | 'checkpoint-failed'
  | 'schema-change-reviewed';
export interface ConnectorHealthReport {
  readonly sourceId: string;
  readonly classification: ConnectorManifest['classification'];
  readonly at: string;
  readonly status: 'healthy' | 'quarantined' | 'paused';
  readonly alerts: readonly HealthAlert[];
  readonly metrics: {
    readonly discovered: number;
    readonly fetched: number;
    readonly bytes: number;
    readonly parsed: number;
    readonly records: number;
    readonly rejected: number;
    readonly fieldCoverage: Readonly<Record<string, number>>;
    readonly schemaFingerprint: string;
  };
  readonly consecutiveFailures: number;
  readonly lastSuccessAt: string | null;
}
export interface ConnectorOperationsState<T> {
  readonly schemaVersion: 1;
  readonly report: ConnectorHealthReport;
  readonly lastGood: {
    readonly at: string;
    readonly records: number;
    readonly schemaFingerprint: string;
    readonly output: readonly T[];
  } | null;
}
export interface ConnectorOperationsStore<T> {
  readonly load: (manifest: ConnectorManifest) => Promise<ConnectorOperationsState<T> | null>;
  /** Atomically publish state and last-good output together; old output survives rejected runs. */
  readonly commit: (
    manifest: ConnectorManifest,
    state: ConnectorOperationsState<T>,
  ) => Promise<void>;
}
function instant(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error('invalid operations time');
  return Date.parse(value);
}
function validatePolicy(policy: ConnectorHealthPolicy): void {
  for (const key of [
    'minimumRecords',
    'maximumRecords',
    'maximumConsecutiveFailures',
    'staleAfterSeconds',
    'rightsReviewWarningSeconds',
  ] as const) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] < 0)
      throw new Error('invalid health limit');
  }
  if (
    policy.minimumRecords > policy.maximumRecords ||
    policy.maximumConsecutiveFailures < 1 ||
    !Number.isFinite(policy.maximumFailureFraction) ||
    policy.maximumFailureFraction < 0 ||
    policy.maximumFailureFraction > 1 ||
    !Number.isFinite(policy.maximumVolumeChangeFraction) ||
    policy.maximumVolumeChangeFraction < 0 ||
    !policy.requiredFields ||
    Object.entries(policy.requiredFields).some(
      ([name, type]) =>
        !/^[a-zA-Z][\w.]*$/.test(name) ||
        !['string', 'number', 'boolean', 'object', 'array'].includes(type),
    )
  )
    throw new Error('invalid health policy');
}
function kind(value: unknown): string {
  return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
}
function schemaShape(value: unknown, depth = 0): string {
  if (depth > 8) return kind(value);
  if (Array.isArray(value))
    return `array:${[...new Set(value.slice(0, 32).map((item) => schemaShape(item, depth + 1)))].sort().join('|')}`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > 1000) throw new Error('schema field limit');
    return JSON.stringify(
      entries
        .map(([key, item]) => [key, schemaShape(item, depth + 1)])
        .sort(([a], [b]) => a!.localeCompare(b!)),
    );
  }
  return kind(value);
}
function field(record: unknown, path: string): unknown {
  let value = record;
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}
function freshness(
  manifest: ConnectorManifest,
  policy: ConnectorHealthPolicy,
  now: string,
  lastSuccess: string | null,
): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  const at = instant(now);
  const distribution =
    manifest.classification === 'PRIVATE_ORGANIZATION'
      ? 'private-organization'
      : ['PRIVATE_USER', 'SOURCE_RESTRICTED'].includes(manifest.classification)
        ? 'private-user'
        : 'public';
  if (
    ['acquire', 'derive', 'store-offline', 'distribute'].some(
      (operation) =>
        !evaluateSourceRights(manifest, {
          operation: operation as 'acquire' | 'derive' | 'store-offline' | 'distribute',
          now,
          distribution,
        }).allowed,
    )
  )
    alerts.push('rights-denied');
  if (
    manifest.rights.reviewExpiresAt !== null &&
    Date.parse(manifest.rights.reviewExpiresAt) - at <= policy.rightsReviewWarningSeconds * 1000
  )
    alerts.push('rights-review-due');
  if (lastSuccess === null) alerts.push('never-succeeded');
  else if (
    at - instant(lastSuccess) >=
    Math.min(policy.staleAfterSeconds, manifest.requiredFreshnessSeconds ?? Infinity) * 1000
  )
    alerts.push('stale');
  return alerts;
}

async function boundedOperation<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('operation deadline'));
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function runMonitoredConnector<P, N, E>(
  connector: Connector<P, N, E>,
  policy: ConnectorHealthPolicy,
  store: ConnectorOperationsStore<E>,
  runId: string,
  now: string,
  records: (value: N) => readonly unknown[],
  options: { readonly recoveryProbe?: boolean; readonly reviewedSchemaFingerprint?: string } = {},
): Promise<ConnectorHealthReport> {
  const manifest = validateConnectorManifest(connector.manifest);
  validatePolicy(policy);
  instant(now);
  if (
    options.reviewedSchemaFingerprint !== undefined &&
    !/^[a-f0-9]{64}$/.test(options.reviewedSchemaFingerprint)
  )
    throw new Error('invalid reviewed fingerprint');
  const previous = await store.load(manifest);
  if (previous && instant(previous.report.at) > instant(now))
    throw new Error('operations time moved backwards');
  const failures = previous?.report.consecutiveFailures ?? 0;
  const alerts = freshness(manifest, policy, now, previous?.lastGood?.at ?? null);
  const metrics = {
    discovered: 0,
    fetched: 0,
    bytes: 0,
    parsed: 0,
    records: 0,
    rejected: 0,
    fieldCoverage: {} as Record<string, number>,
    schemaFingerprint: '',
  };
  const paused = failures >= policy.maximumConsecutiveFailures && !options.recoveryProbe;
  if (paused) alerts.push('circuit-open');
  let lastGood = previous?.lastGood ?? null;
  let accepted = false;
  if (!paused && !alerts.includes('rights-denied')) {
    const checkpoints: { asset: StoredRawAsset; context: ConnectorContext }[] = [];
    try {
      const staged: Connector<P, N, N> = {
        ...connector,
        discover: async (context) => {
          const assets = await connector.discover(context);
          metrics.discovered = assets.length;
          return assets;
        },
        fetch: async (asset, context) => {
          const result = await connector.fetch(asset, context);
          metrics.fetched++;
          metrics.bytes += result.payload.length;
          return result;
        },
        parse: async (asset, context) => {
          const result = await connector.parse(asset, context);
          metrics.parsed++;
          return result;
        },
        checkpoint: async (asset, context) => {
          checkpoints.push({ asset, context });
        },
        emit: async (value) => value,
      };
      const result = await runConnector(staged, runId, now);
      metrics.rejected = result.quarantine.length;
      if (result.quarantine.some((item) => item.externalId === null)) alerts.push('run-failed');
      const rows = result.emitted.flatMap((value) => [...records(value)]);
      metrics.records = rows.length;
      const shapes = new Set<string>();
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          alerts.push('missing-fields');
          continue;
        }
        shapes.add(schemaShape(row));
      }
      metrics.schemaFingerprint = createHash('sha256')
        .update(JSON.stringify([...shapes].sort()))
        .digest('hex');
      for (const [name, type] of Object.entries(policy.requiredFields)) {
        const present = rows.filter(
          (row) =>
            kind(field(row, name)) === type &&
            (type !== 'number' || Number.isFinite(field(row, name))),
        ).length;
        metrics.fieldCoverage[name] = rows.length ? present / rows.length : 0;
        if (present !== rows.length) alerts.push('missing-fields');
      }
      if (
        metrics.records < policy.minimumRecords ||
        metrics.records > policy.maximumRecords ||
        (lastGood &&
          Math.abs(metrics.records - lastGood.records) / Math.max(1, lastGood.records) >
            policy.maximumVolumeChangeFraction)
      )
        alerts.push('volume-anomaly');
      if (metrics.rejected / Math.max(1, metrics.discovered) > policy.maximumFailureFraction)
        alerts.push('rejection-rate');
      if (lastGood && metrics.schemaFingerprint !== lastGood.schemaFingerprint) {
        alerts.push(
          options.reviewedSchemaFingerprint === metrics.schemaFingerprint
            ? 'schema-change-reviewed'
            : 'schema-drift',
        );
      }
      const rejected = alerts.some((alert) =>
        [
          'missing-fields',
          'volume-anomaly',
          'rejection-rate',
          'schema-drift',
          'run-failed',
        ].includes(alert),
      );
      if (!rejected) {
        // The connector's emit may stage values, but publication belongs exclusively to this store.
        const output: E[] = [];
        for (const value of result.emitted)
          output.push(
            await boundedOperation(
              (signal) => connector.emit(value, { runId, signal }),
              manifest.limits.maxParserMilliseconds,
            ),
          );
        lastGood = {
          at: now,
          records: metrics.records,
          schemaFingerprint: metrics.schemaFingerprint,
          output,
        };
        accepted = true;
      }
      const report: ConnectorHealthReport = {
        sourceId: manifest.sourceId,
        classification: manifest.classification,
        at: now,
        status: accepted ? 'healthy' : 'quarantined',
        alerts: [
          ...new Set(
            accepted
              ? alerts.filter((alert) => alert !== 'stale' && alert !== 'never-succeeded')
              : alerts,
          ),
        ],
        metrics,
        consecutiveFailures: accepted ? 0 : failures + 1,
        lastSuccessAt: lastGood?.at ?? null,
      };
      await store.commit(manifest, { schemaVersion: 1, report, lastGood });
      if (accepted) {
        try {
          for (const checkpoint of checkpoints)
            await boundedOperation(
              (signal) => connector.checkpoint(checkpoint.asset, { ...checkpoint.context, signal }),
              manifest.limits.maxParserMilliseconds,
            );
        } catch {
          const updated = { ...report, alerts: [...report.alerts, 'checkpoint-failed' as const] };
          await store.commit(manifest, { schemaVersion: 1, report: updated, lastGood });
          return updated;
        }
      }
      return report;
    } catch {
      // Do not persist exception messages, raw records, locators, or secret-bearing diagnostics.
      alerts.push('run-failed');
      lastGood = previous?.lastGood ?? null;
    }
  }
  const report: ConnectorHealthReport = {
    sourceId: manifest.sourceId,
    classification: manifest.classification,
    at: now,
    status: paused ? 'paused' : 'quarantined',
    alerts: [...new Set(alerts)],
    metrics,
    consecutiveFailures: paused ? failures : failures + 1,
    lastSuccessAt: lastGood?.at ?? null,
  };
  await store.commit(manifest, { schemaVersion: 1, report, lastGood });
  return report;
}

/** Refresh time-dependent alerts without contacting a source or changing its persisted circuit. */
export function inspectConnectorHealth<T>(
  manifest: ConnectorManifest,
  policy: ConnectorHealthPolicy,
  state: ConnectorOperationsState<T>,
  now: string,
): ConnectorHealthReport {
  validateConnectorManifest(manifest);
  validatePolicy(policy);
  validateOperationsState(manifest, state);
  if (instant(now) < instant(state.report.at)) throw new Error('operations time moved backwards');
  const timed = freshness(manifest, policy, now, state.lastGood?.at ?? null);
  const retained = state.report.alerts.filter(
    (alert) => !['rights-denied', 'rights-review-due', 'stale', 'never-succeeded'].includes(alert),
  );
  return {
    ...structuredClone(state.report),
    at: now,
    alerts: [...new Set([...retained, ...timed])],
    status:
      timed.includes('rights-denied') || timed.includes('stale')
        ? 'quarantined'
        : state.report.status,
  };
}
/** Each job owns its source-specific contract; one failure cannot stop other jobs. */
export async function runConnectorFleet(jobs: readonly (() => Promise<ConnectorHealthReport>)[]) {
  const reports: ConnectorHealthReport[] = [];
  let failedJobs = 0;
  for (const job of jobs) {
    try {
      reports.push(await job());
    } catch {
      failedJobs++;
    }
  }
  return { reports, failedJobs };
}
export function publicConnectorHealth(
  reports: readonly ConnectorHealthReport[],
): readonly ConnectorHealthReport[] {
  return reports
    .filter(
      (report) =>
        report.classification === 'PUBLIC_SYNTHETIC' ||
        report.classification === 'SOURCE_REDISTRIBUTABLE',
    )
    .map((report) => structuredClone(report));
}

function validateOperationsState<T>(
  manifest: ConnectorManifest,
  state: ConnectorOperationsState<T>,
): void {
  if (
    !state ||
    state.schemaVersion !== 1 ||
    !state.report ||
    state.report.sourceId !== manifest.sourceId ||
    state.report.classification !== manifest.classification
  )
    throw new Error('operations state identity mismatch');
  const report = state.report;
  instant(report.at);
  if (
    !['healthy', 'quarantined', 'paused'].includes(report.status) ||
    !Number.isSafeInteger(report.consecutiveFailures) ||
    report.consecutiveFailures < 0
  )
    throw new Error('invalid operations state');
  const allowed: readonly HealthAlert[] = [
    'rights-denied',
    'rights-review-due',
    'never-succeeded',
    'stale',
    'schema-drift',
    'missing-fields',
    'volume-anomaly',
    'rejection-rate',
    'run-failed',
    'circuit-open',
    'checkpoint-failed',
    'schema-change-reviewed',
  ];
  if (!Array.isArray(report.alerts) || report.alerts.some((alert) => !allowed.includes(alert)))
    throw new Error('invalid operations alerts');
  for (const count of [
    report.metrics.discovered,
    report.metrics.fetched,
    report.metrics.bytes,
    report.metrics.parsed,
    report.metrics.records,
    report.metrics.rejected,
  ]) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('invalid operations counters');
  }
  if (
    Object.values(report.metrics.fieldCoverage).some(
      (value) => !Number.isFinite(value) || value < 0 || value > 1,
    ) ||
    !/^(?:[a-f0-9]{64})?$/.test(report.metrics.schemaFingerprint)
  )
    throw new Error('invalid operations coverage');
  if (state.lastGood !== null) {
    if (
      !state.lastGood ||
      !Array.isArray(state.lastGood.output) ||
      !Number.isSafeInteger(state.lastGood.records) ||
      state.lastGood.records < 0 ||
      !/^[a-f0-9]{64}$/.test(state.lastGood.schemaFingerprint) ||
      instant(state.lastGood.at) > instant(report.at) ||
      report.lastSuccessAt !== state.lastGood.at
    )
      throw new Error('invalid last-good snapshot');
  } else if (report.lastSuccessAt !== null || report.status === 'healthy')
    throw new Error('missing last-good snapshot');
}
/** Keep this directory separate from raw payloads and public Git; each source is one atomic file. */
export class FileConnectorOperationsStore<T> implements ConnectorOperationsStore<T> {
  constructor(
    readonly root: string,
    readonly boundary: 'public' | 'private',
    readonly publicCheckout: string,
  ) {}
  private async path(manifest: ConnectorManifest): Promise<string> {
    validateConnectorManifest(manifest);
    if (!isAbsolute(this.root)) throw new Error('operations root must be absolute');
    if (
      this.boundary === 'public' &&
      !['PUBLIC_SYNTHETIC', 'SOURCE_REDISTRIBUTABLE'].includes(manifest.classification)
    )
      throw new Error('private operations cannot enter public storage');
    if (this.boundary === 'private') assertProcessingRootIsolation(this.publicCheckout, this.root);
    if (this.boundary === 'public') await mkdir(this.root, { recursive: true });
    const [root, checkout] = await Promise.all([
      realpath(this.root),
      realpath(this.publicCheckout),
    ]);
    if (this.boundary === 'private') assertProcessingRootIsolation(checkout, root);
    return resolve(root, `${manifest.sourceId}.json`);
  }
  async load(manifest: ConnectorManifest): Promise<ConnectorOperationsState<T> | null> {
    const path = await this.path(manifest);
    try {
      if ((await lstat(path)).isSymbolicLink()) throw new Error('operations state link denied');
      const value = JSON.parse(await readFile(path, 'utf8')) as ConnectorOperationsState<T>;
      if (
        value.schemaVersion !== 1 ||
        value.report.sourceId !== manifest.sourceId ||
        value.report.classification !== manifest.classification
      )
        throw new Error('operations state identity mismatch');
      validateOperationsState(manifest, value);
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new Error('operations state unavailable or invalid');
    }
  }
  async commit(manifest: ConnectorManifest, state: ConnectorOperationsState<T>): Promise<void> {
    if (
      state.report.sourceId !== manifest.sourceId ||
      state.report.classification !== manifest.classification
    )
      throw new Error('operations state identity mismatch');
    validateOperationsState(manifest, state);
    const path = await this.path(manifest);
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify(state));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

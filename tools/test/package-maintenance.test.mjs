import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { reusableSource, sourceHash } from '../packages/package-source-cache.mjs';
import { restoreArtifact } from '../packages/restore-public-package-artifacts.mjs';
import { prohibitedPackageFiles } from '../packages/package-storage-policy.mjs';
import { assertNpsSnapshotUsable } from '../packages/new-york-source-freshness.mjs';
import { stagePrivateNewYorkOprhp } from '../acquisition/stage-private-new-york-oprhp.mjs';
import { stageApprovedFeed } from '../acquisition/state-agency-feeds.mjs';

test('source cache requires edit revision, matching query signature and intact local bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'outdoor-source-'));
  try {
    const bytes = Buffer.from('{}');
    await writeFile(join(directory, 'raw.geojson'), bytes);
    await writeFile(
      join(directory, 'receipt.json'),
      JSON.stringify({
        sourceRevision: 123,
        refreshSignature: 'query',
        sha256: sourceHash(bytes),
        bytes: bytes.length,
      }),
    );
    assert.ok(await reusableSource(directory, 'query', 123));
    for (const revision of [undefined, null, 0, 124])
      assert.equal(await reusableSource(directory, 'query', revision), null);
    assert.equal(await reusableSource(directory, 'changed fields', 123), null);
    await writeFile(join(directory, 'raw.geojson'), '[]');
    assert.equal(await reusableSource(directory, 'query', 123), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('external restoration skips valid files and never replaces an active file with corrupt or oversized bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'outdoor-artifact-'));
  try {
    const path = join(directory, 'state.sqlite');
    const bytes = Buffer.from('verified package');
    const descriptor = { bytes: bytes.length, sha256: sourceHash(bytes) };
    assert.equal(
      await restoreArtifact(path, descriptor, async () => Readable.from([bytes])),
      'restored',
    );
    assert.equal(
      await restoreArtifact(path, descriptor, async () => {
        throw Error('must not download');
      }),
      'cached',
    );
    const changed = Buffer.from('new package');
    const target = { bytes: changed.length, sha256: sourceHash(changed) };
    await assert.rejects(
      restoreArtifact(path, target, async () => Readable.from([Buffer.from('bad')])),
      /mismatch/,
    );
    await assert.rejects(
      restoreArtifact(path, target, async () => Readable.from([bytes])),
      /exceeds/,
    );
    assert.deepEqual(await readFile(path), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Git policy permits notices and manifests but rejects complete generated datasets and private staging', () => {
  assert.deepEqual(
    prohibitedPackageFiles([
      'packages/map/src/assets/state-packages/US/NY/manifest.json',
      'packages/map/src/assets/state-packages/US/NY/outdoors.geojson',
      'packages/map/src/assets/state-packages/US/NY/parts/outdoors-001.geojson',
      'PrivateData/secret.json',
    ]),
    [
      'packages/map/src/assets/state-packages/US/NY/outdoors.geojson',
      'packages/map/src/assets/state-packages/US/NY/parts/outdoors-001.geojson',
      'PrivateData/secret.json',
    ],
  );
});

test('private refresh reuses unchanged API data, refreshes changed revisions, and preserves the old receipt on failure', async () => {
  const stagingRoot = await mkdtemp(join(tmpdir(), 'outdoor-private-'));
  const feed = {
    id: 'test-feed',
    state: 'CT',
    sourceType: 'arcgis-layer',
    url: 'https://example.org/FeatureServer/0',
    rightsStatus: 'Supported',
  };
  const approval = {
    sourceId: feed.id,
    sourceUrl: feed.url,
    collect: true,
    privateStorage: true,
    publicDistribution: false,
    publisherGrant: true,
    evidenceUrl: feed.url,
    reviewedAt: '2026-09-26T00:00:00Z',
    expiresAt: '2030-01-01T00:00:00Z',
  };
  let revision = 123;
  let featureRequests = 0;
  let fail = false;
  const fetchImpl = async (_url, options = {}) => {
    if (!options.body)
      return {
        ok: true,
        json: async () => ({ maxRecordCount: 100, editingInfo: { lastEditDate: revision } }),
      };
    const params = new URLSearchParams(options.body);
    if (params.get('returnIdsOnly') === 'true')
      return { ok: true, json: async () => ({ objectIds: [1], objectIdFieldName: 'OBJECTID' }) };
    featureRequests++;
    if (fail) throw Error('interrupted request');
    return {
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 1,
            geometry: { type: 'Point', coordinates: [-72, 41] },
            properties: { OBJECTID: 1, name: String(revision) },
          },
        ],
      }),
    };
  };
  try {
    const options = { refresh: true, stagingRoot };
    const first = await stageApprovedFeed(feed, approval, fetchImpl, options);
    assert.equal(featureRequests, 1);
    const cached = await stageApprovedFeed(feed, approval, fetchImpl, options);
    assert.equal(cached.status, 'unchanged');
    assert.equal(featureRequests, 1);
    revision++;
    const next = await stageApprovedFeed(feed, approval, fetchImpl, options);
    assert.notEqual(next.receipt.sha256, first.receipt.sha256);
    const previous = JSON.parse(
      await readFile(join(next.outputDirectory, 'previous-receipt.json')),
    );
    assert.equal(previous.sha256, first.receipt.sha256);
    revision++;
    fail = true;
    await assert.rejects(stageApprovedFeed(feed, approval, fetchImpl, options), /interrupted/);
    assert.equal(
      JSON.parse(await readFile(join(next.outputDirectory, 'receipt.json'))).sha256,
      next.receipt.sha256,
    );
    await assert.rejects(
      stageApprovedFeed(feed, { ...approval, expiresAt: '2000-01-01' }, fetchImpl, options),
      /current source evidence/,
    );
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
});

test('OPRHP reacquires existing records and preserves the active receipt if evidence fails', async () => {
  const stagingRoot = await mkdtemp(join(tmpdir(), 'outdoor-oprhp-refresh-'));
  const source = {
    id: 'nys-oprhp-trails',
    state: 'NY',
    sourceType: 'arcgis-layer',
    url: 'https://example.org/FeatureServer/0',
    termsUrl: 'https://example.org/terms',
    rightsStatus: 'Unconfirmed',
    provisionalPrivateValidation: true,
    mode: 'durable',
  };
  let requests = 0;
  let failEvidence = false;
  const fetchImpl = async (url, options = {}) => {
    let value;
    if (url === source.termsUrl) {
      if (failEvidence) throw Error('terms unavailable');
      value = { licenseInfo: 'private reference' };
    } else if (!options.body) value = { maxRecordCount: 100, editingInfo: { lastEditDate: 123 } };
    else if (new URLSearchParams(options.body).get('returnIdsOnly') === 'true')
      value = { objectIds: [1], objectIdFieldName: 'OBJECTID' };
    else {
      requests++;
      value = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 1,
            geometry: { type: 'Point', coordinates: [-74, 42] },
            properties: { OBJECTID: 1, name: String(requests) },
          },
        ],
      };
    }
    return {
      ok: true,
      json: async () => value,
      arrayBuffer: async () => Buffer.from(JSON.stringify(value)),
    };
  };
  try {
    const options = { stagingRoot, sources: [source], fetchImpl };
    await stagePrivateNewYorkOprhp(options);
    const receiptPath = join(stagingRoot, 'US/NY', source.id, 'receipt.json');
    const first = JSON.parse(await readFile(receiptPath));
    await stagePrivateNewYorkOprhp(options);
    const second = await readFile(receiptPath);
    assert.equal(requests, 2);
    assert.notEqual(JSON.parse(second).sha256, first.sha256);
    failEvidence = true;
    await assert.rejects(stagePrivateNewYorkOprhp(options), /terms unavailable/);
    assert.deepEqual(await readFile(receiptPath), second);
    for (const evidence of JSON.parse(second).evidence) {
      const bytes = await readFile(join(stagingRoot, 'US/NY', source.id, evidence.file));
      assert.equal(sourceHash(bytes), evidence.sha256);
    }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
});

test('public NY composition rejects older NPS snapshots and snapshots missing visitor details', () => {
  const previous = [
    {
      properties: {
        sourceId: 'nps-parks-ny',
        sourceUpdated: '2026-09-16T00:00:00Z',
        description: 'Visitor guidance',
      },
    },
  ];
  const snapshot = {
    retrievedAt: '2026-09-14T00:00:00Z',
    parks: [{}],
    campgrounds: [],
    alerts: [],
  };
  assert.throws(() => assertNpsSnapshotUsable(snapshot, previous), /predates/);
  snapshot.retrievedAt = '2026-10-24T00:00:00Z';
  assert.throws(() => assertNpsSnapshotUsable(snapshot, previous), /omits visitor details/);
  snapshot.parks[0].visitorDetails = {};
  assert.doesNotThrow(() => assertNpsSnapshotUsable(snapshot, previous));
});

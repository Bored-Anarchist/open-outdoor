import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquirePrivateNewYorkDec } from '../acquisition/acquire-outdoor-map.mjs';
import { sourceHash } from '../packages/package-source-cache.mjs';

const sources = JSON.parse(await readFile('config/private-new-york-dec-sources.json')).sources;
const approval = (source) => ({
  sourceId: source.id,
  sourceUrl: source.url,
  collect: true,
  privateStorage: true,
  publicDistribution: false,
  publisherGrant: false,
  provisionalPrivateValidation: source.provisionalPrivateValidation === true,
  permissionRequiredPrivateValidation: source.permissionRequiredPrivateValidation === true,
  evidenceUrl: source.termsUrl,
  reviewedAt: '2026-10-24T00:00:00Z',
  expiresAt: '2030-01-01T00:00:00Z',
});

test('DEC owner-private acquisition preserves approvals, verifies complete records and retains last-good sources on failure', async () => {
  const privateRoot = await mkdtemp(join(tmpdir(), 'private-ny-dec-'));
  const stagingRoot = join(privateRoot, 'agency-feeds');
  await mkdir(stagingRoot);
  const ledger = Buffer.from(
    JSON.stringify(Object.fromEntries(sources.map((s) => [s.id, approval(s)]))),
  );
  await writeFile(join(stagingRoot, 'approvals.json'), ledger);
  let incomplete = false;
  let changeRevision = false;
  let requests = 0;
  const metadataCalls = new Map();
  const fetchImpl = async (locator) => {
    requests++;
    const url = new URL(locator);
    let value;
    const source = sources.find((s) => url.href.startsWith(s.url));
    if (url.pathname.includes('/api/views/')) value = { rowsUpdatedAt: 1700000000 };
    else if (url.searchParams.get('$select') === 'count(*)')
      value = [{ count: incomplete ? '2' : '1' }];
    else if (source?.kind === 'poi')
      value = [
        {
          ':id': 'row-1',
          name: 'Fixture',
          facility: 'Test',
          asset: 'PARKING',
          latitude: '42',
          longitude: '-74',
        },
      ];
    else if (!url.pathname.endsWith('/query')) {
      const n = (metadataCalls.get(url.pathname) ?? 0) + 1;
      metadataCalls.set(url.pathname, n);
      value = { editingInfo: { lastEditDate: changeRevision && n % 2 === 0 ? 124 : 123 } };
    } else if (url.searchParams.get('returnIdsOnly') === 'true') value = { objectIds: [1] };
    else
      value = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 1,
            properties: { OBJECTID: 1, NAME: 'Fixture', UNIT: 'Test' },
            geometry:
              source.kind === 'land'
                ? {
                    type: 'Polygon',
                    coordinates: [
                      [
                        [-74, 42],
                        [-74.01, 42],
                        [-74.01, 42.01],
                        [-74, 42],
                      ],
                    ],
                  }
                : {
                    type: 'LineString',
                    coordinates: [
                      [-74, 42],
                      [-74.001, 42.001],
                    ],
                  },
          },
        ],
      };
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(JSON.stringify(value)) };
  };
  try {
    const options = { privateRoot, stagingRoot, fetchImpl };
    const result = await acquirePrivateNewYorkDec(options);
    assert.equal(result.features, 4);
    const manifestPath = join(result.outputDirectory, 'new-york-outdoors.manifest.json');
    const lastGood = await readFile(manifestPath);
    const manifest = JSON.parse(lastGood);
    assert.equal(manifest.classification, 'PRIVATE_USER');
    assert.equal(manifest.publicDistribution, false);
    assert.equal(manifest.publisherGrant, false);
    assert.equal(manifest.rights.redistribution, false);
    const geo = await readFile(join(result.outputDirectory, 'new-york-outdoors.geojson'));
    assert.equal(sourceHash(geo), manifest.sha256);
    assert.ok(JSON.parse(geo).features.every((f) => f.properties.sourceId.startsWith('nys-dec-')));
    for (const s of sources) {
      const receipt = manifest.approvals.find((item) => item.sourceId === s.id);
      assert.equal(receipt.reviewedAt, approval(s).reviewedAt);
      assert.equal(receipt.expiresAt, approval(s).expiresAt);
      assert.equal(receipt.sha256, sourceHash(JSON.stringify(approval(s))));
    }
    incomplete = true;
    await assert.rejects(acquirePrivateNewYorkDec(options), /incomplete or changed/);
    assert.deepEqual(await readFile(manifestPath), lastGood);
    incomplete = false;
    changeRevision = true;
    await assert.rejects(acquirePrivateNewYorkDec(options), /source changed during acquisition/);
    assert.deepEqual(await readFile(manifestPath), lastGood);
    assert.deepEqual(await readFile(join(stagingRoot, 'approvals.json')), ledger);
    await writeFile(join(stagingRoot, 'approvals.json'), '{}');
    requests = 0;
    await assert.rejects(acquirePrivateNewYorkDec(options), /matching private approval required/);
    assert.equal(requests, 0);
    assert.deepEqual(await readFile(manifestPath), lastGood);
  } finally {
    await rm(privateRoot, { recursive: true, force: true });
  }
});

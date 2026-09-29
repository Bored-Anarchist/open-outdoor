import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  selectOprhpFeatures,
  validateOprhpPackage,
  packagePrivateNewYorkAgencies,
} from './package-private-new-york-agencies.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('OPRHP visitor selection excludes nonpublic, closed and proposed records and temporal feeds', () => {
  const source = {
    mode: 'durable',
    selection: { Public_: 'Y' },
    excludeStatuses: ['Closed', 'Proposed'],
  };
  const features = [
    { properties: { Public_: 'Y', Status: 'Open' } },
    { properties: { Public_: 'N' } },
    { properties: {} },
    { properties: { Public_: 'Y', Status: 'Closed' } },
    { properties: { Public_: 'Y', Status: 'Proposed' } },
  ];
  assert.deepEqual(selectOprhpFeatures(source, features), [features[0]]);
  assert.deepEqual(selectOprhpFeatures({ ...source, mode: 'condition-snapshot' }, features), []);
  assert.deepEqual(selectOprhpFeatures({ ...source, mode: 'reference-only' }, features), []);
});

test('private OPRHP overlay is idempotent, pins evidence and preserves existing DEC/iOverlander features', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-oprhp-'));
  const catalog = join(root, 'catalog');
  const sources = join(root, 'sources');
  await mkdir(catalog);
  try {
    const retained = [
      {
        type: 'Feature',
        id: 'dec-1',
        geometry: { type: 'Point', coordinates: [-74, 42] },
        properties: { sourceId: 'nys-dec-lands', name: 'Existing DEC' },
      },
      {
        type: 'Feature',
        id: 'private-1',
        geometry: { type: 'Point', coordinates: [-74, 42] },
        properties: {
          sourceId: 'private-ioverlander',
          communityDescription: 'Retained community narrative',
        },
      },
    ];
    const bytes = Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: retained }));
    const manifest = {
      bundleId: 'private-ioverlander-new-york',
      classification: 'PRIVATE_USER',
      artifacts: [
        { file: 'new-york-outdoors.composed.geojson', bytes: bytes.length, sha256: hash(bytes) },
        { file: 'new-york-outdoors.composed.index.json' },
      ],
    };
    await writeFile(join(catalog, 'new-york-outdoors.composed.geojson'), bytes);
    await writeFile(join(catalog, 'new-york-outdoors.composed.index.json'), '{}');
    await writeFile(join(catalog, 'manifest.json'), JSON.stringify(manifest));
    const config = JSON.parse(await readFile('config/private-new-york-oprhp-sources.json'));
    for (const source of config.sources) {
      const path = join(sources, source.id);
      await mkdir(path, { recursive: true });
      const raw = Buffer.from(
        JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [-74, 42] },
              properties: { OBJECTID: 1, Name: 'Fixture', Public_: 'Y', Status: 'Open' },
            },
          ],
        }),
      );
      const evidence = [];
      for (const file of ['terms.json', 'layer.json']) {
        await writeFile(join(path, file), '{}');
        evidence.push({ file, bytes: 2, sha256: hash('{}') });
      }
      await writeFile(join(path, 'raw.geojson'), raw);
      await writeFile(
        join(path, 'receipt.json'),
        JSON.stringify({
          sourceId: source.id,
          sourceUrl: source.url,
          rightsStatus: source.rightsStatus,
          publicDistribution: false,
          provisionalPrivateValidation: true,
          sha256: hash(raw),
          bytes: raw.length,
          featureCount: 1,
          evidence,
        }),
      );
    }
    const result = await packagePrivateNewYorkAgencies({
      catalogDirectory: catalog,
      sourceRoot: sources,
      refreshProfiles: false,
    });
    assert.equal(result.oprhp, 4);
    assert.equal(result.referenceSnapshots, 4);
    const first = await readFile(join(catalog, 'new-york-outdoors.composed.geojson'));
    assert.deepEqual(JSON.parse(first).features.slice(0, 2), retained);
    await packagePrivateNewYorkAgencies({
      catalogDirectory: catalog,
      sourceRoot: sources,
      refreshProfiles: false,
    });
    assert.deepEqual(await readFile(join(catalog, 'new-york-outdoors.composed.geojson')), first);
    const packaged = JSON.parse(await readFile(join(catalog, 'manifest.json')));
    assert.equal(validateOprhpPackage(packaged, JSON.parse(first).features), 4);
    assert.throws(
      () =>
        validateOprhpPackage(
          { ...packaged, oprhp: { ...packaged.oprhp, featureCount: 3 } },
          JSON.parse(first).features,
        ),
      /mismatch/,
    );
    await writeFile(join(sources, 'nys-oprhp-trails', 'terms.json'), 'tampered');
    await assert.rejects(
      packagePrivateNewYorkAgencies({
        catalogDirectory: catalog,
        sourceRoot: sources,
        refreshProfiles: false,
      }),
      /checksum mismatch/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

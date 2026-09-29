import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deduplicatePrivateFeatures } from './private-public-dedup.mjs';
import { deduplicatePrivateStatePackage } from './deduplicate-private-state-packages.mjs';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const feature = (
  id,
  name,
  coordinates,
  { sourceId = 'private-ioverlander', sourceUrl, category = 'campground', type = 'Point' } = {},
) => ({
  type: 'Feature',
  id,
  geometry: { type, coordinates },
  properties: { name, sourceId, sourceUrl, category },
});
test('same named, compatible POIs within 25 meters prefer public; audit retains private narrative', () => {
  const privateFeature = feature('private:1', 'Pine Campground', [-75, 40]);
  privateFeature.properties.communityDescription = 'Private test narrative';
  const publicFeature = feature('public:1', 'PINE campground', [-75.0001, 40], {
    sourceId: 'public',
  });
  const result = deduplicatePrivateFeatures([privateFeature], [publicFeature]);
  assert.equal(result.features.length, 0);
  assert.equal(result.matches[0].feature, privateFeature);
  assert.equal(result.matches[0].publicId, 'public:1');
  assert.deepEqual(publicFeature.properties, {
    name: 'PINE campground',
    sourceId: 'public',
    sourceUrl: undefined,
    category: 'campground',
  });
});
test('same source record is recognized across private/public IDs and geometry revisions', () => {
  const a = feature('private-agency:abc:7', 'Old name', [-75, 40], {
    sourceId: 'private-agency',
    sourceUrl: 'https://example.invalid/FeatureServer/0',
  });
  const b = feature('public-agency:agency:7', 'New name', [-75.001, 40], {
    sourceId: 'public',
    sourceUrl: 'https://example.invalid/featureserver/0/',
  });
  assert.equal(deduplicatePrivateFeatures([a], [b]).matches[0].method, 'source-record');
  b.properties.sourceUrl = 'https://example.invalid/FeatureServer/1';
  assert.equal(deduplicatePrivateFeatures([a], [b]).matches.length, 0);
});
test('nearby separate POIs, unknown names, and campsite/campground categories are preserved', () => {
  const a = feature('private:1', 'Pine Campground', [-75, 40]);
  for (const b of [
    feature('public:1', 'Pine Campground', [-75.001, 40]),
    feature('public:1', 'Pine Campground', [-75, 40], { category: 'campsite' }),
    feature('public:1', 'Different Campground', [-75, 40]),
  ])
    assert.equal(deduplicatePrivateFeatures([a], [b]).features.length, 1);
  assert.equal(
    deduplicatePrivateFeatures(
      [feature('p', 'Campground', [0, 0])],
      [feature('q', 'Campground', [0, 0])],
    ).features.length,
    1,
  );
});
test('a facility inside a public land polygon is a distinct feature', () => {
  const a = feature('p', 'Pine Campground', [0, 0]);
  const b = feature(
    'q',
    'Pine Campground',
    [
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
        [-1, -1],
      ],
    ],
    { type: 'Polygon' },
  );
  assert.equal(deduplicatePrivateFeatures([a], [b]).features.length, 1);
});
test('shape comparison accepts rounding and direction changes but preserves trail branches and holes', () => {
  const opts = { type: 'LineString', sourceId: 'agency', category: 'trail' };
  const a = feature(
    'p',
    'Pine Trail',
    [
      [0, 0],
      [0.001, 0],
      [0.002, 0],
    ],
    opts,
  );
  const b = feature(
    'q',
    'Pine Trail',
    [
      [0.002, 0],
      [0, 0.00001],
    ],
    opts,
  );
  assert.equal(deduplicatePrivateFeatures([a], [b]).matches.length, 1);
  b.geometry.coordinates = [
    [0, 0],
    [0.001, 0.001],
    [0.002, 0],
  ];
  assert.equal(deduplicatePrivateFeatures([a], [b]).matches.length, 0);
  const ring = [
    [0, 0],
    [0.01, 0],
    [0.01, 0.01],
    [0, 0.01],
    [0, 0],
  ];
  const land = feature('p', 'Pine Park', [ring], { type: 'Polygon', sourceId: 'agency' });
  const withHole = feature(
    'q',
    'Pine Park',
    [
      ring,
      [
        [0.004, 0.004],
        [0.006, 0.004],
        [0.006, 0.006],
        [0.004, 0.006],
        [0.004, 0.004],
      ],
    ],
    { type: 'Polygon', sourceId: 'public' },
  );
  assert.equal(deduplicatePrivateFeatures([land], [withHole]).matches.length, 0);
});
test('deduplication is deterministic and idempotent', () => {
  const a = feature('p', 'Pine Campground', [0, 0]),
    b = feature('q', 'Pine Campground', [0, 0]);
  const result = deduplicatePrivateFeatures([a], [b]);
  assert.deepEqual(deduplicatePrivateFeatures(result.features, [b]), { features: [], matches: [] });
  assert.deepEqual(result, deduplicatePrivateFeatures([a], [b]));
});
test('package reconciliation verifies checksums, replays deterministically, and restores records if public coverage disappears', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-public-dedup-'));
  try {
    const privateDir = join(root, 'PrivateData/catalogs/US/Test/current'),
      publicDir = join(root, 'packages/map/src/assets/state-packages/US/TS');
    await mkdir(privateDir, { recursive: true });
    await mkdir(publicDir, { recursive: true });
    const encode = (value) => Buffer.from(JSON.stringify(value) + '\n');
    const artifact = (bytes, file) => ({
      file,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    const input = encode({
      type: 'FeatureCollection',
      features: [feature('p', 'Pine Campground', [0, 0])],
    });
    await writeFile(join(privateDir, 'agency-ioverlander.private.geojson'), input);
    await writeFile(
      join(privateDir, 'agency-ioverlander.manifest.json'),
      JSON.stringify({
        classification: 'PRIVATE_USER',
        publicDistribution: false,
        ioverlander: { featureCount: 1 },
        agency: { featureCount: 0, sources: [] },
        output: { ...artifact(input, 'agency-ioverlander.private.geojson'), featureCount: 1 },
      }),
    );
    async function publicInput(features) {
      const bytes = encode({ type: 'FeatureCollection', features });
      await writeFile(join(publicDir, 'outdoors.geojson'), bytes);
      await writeFile(
        join(publicDir, 'manifest.json'),
        JSON.stringify({
          state: { code: 'TS' },
          classification: 'SOURCE_REDISTRIBUTABLE',
          publicDistribution: true,
          artifacts: {
            geojson: { ...artifact(bytes, 'outdoors.geojson'), featureCount: features.length },
          },
        }),
      );
    }
    await publicInput([feature('q', 'Pine Campground', [0, 0], { sourceId: 'public' })]);
    const first = await deduplicatePrivateStatePackage(root, 'TS', 'Test');
    assert.equal(first.removed, 1);
    assert.deepEqual(await deduplicatePrivateStatePackage(root, 'TS', 'Test'), first);
    assert.deepEqual(
      await deduplicatePrivateStatePackage(root, 'TS', 'Test', { verifyOnly: true }),
      first,
    );
    await publicInput([]);
    await assert.rejects(
      deduplicatePrivateStatePackage(root, 'TS', 'Test', { verifyOnly: true }),
      /stale/,
    );
    assert.equal((await deduplicatePrivateStatePackage(root, 'TS', 'Test')).total, 1);
    assert.equal(
      await readFile(join(privateDir, 'agency-ioverlander.private.geojson'), 'utf8'),
      input.toString(),
    );
    const path = join(privateDir, 'public-dedup.private.json');
    await writeFile(path, '{}');
    await assert.rejects(
      deduplicatePrivateStatePackage(root, 'TS', 'Test', { verifyOnly: true }),
      /report checksum/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

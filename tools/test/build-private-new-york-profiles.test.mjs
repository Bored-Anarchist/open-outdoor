import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';
import { buildPrivateNewYorkProfiles } from '../packages/build-private-new-york-profiles.mjs';
import { packagePrivateNewYorkHikes } from '../packages/package-private-new-york-hikes.mjs';
import { terrainTilePosition } from '../acquisition/acquire-hike-profiles.mjs';
import { sourceHash } from '../packages/package-source-cache.mjs';

function png() {
  const chunk = (type, data) => {
    const name = Buffer.from(type),
      size = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([size, name, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(256, 0);
  header.writeUInt32BE(256, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc(256 * 769);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) raw[y * 769 + 1 + x * 3] = 128;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('fresh private DEC profiles use cached terrain, bind package geometry, and preserve last-good output when a tile is missing', async (t) => {
  const privateRoot = await mkdtemp(join(tmpdir(), 'private-ny-profiles-'));
  const sourceDirectory = join(privateRoot, 'dec');
  const terrainCache = join(privateRoot, 'terrain');
  const catalogDirectory = join(privateRoot, 'catalog');
  await Promise.all([sourceDirectory, terrainCache, catalogDirectory].map((p) => mkdir(p)));
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => {
    requests++;
    throw Error('private coordinates must not be sent');
  });
  const feature = {
    type: 'Feature',
    id: 'nys-dec-trails-1',
    properties: { sourceId: 'nys-dec-trails' },
    geometry: {
      type: 'LineString',
      coordinates: [
        [-74, 42],
        [-74.0001, 42.0001],
      ],
    },
  };
  const source = Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: [feature] }));
  const sourceManifest = {
    classification: 'PRIVATE_USER',
    publicDistribution: false,
    sha256: sourceHash(source),
    bytes: source.length,
  };
  try {
    await writeFile(join(sourceDirectory, 'new-york-outdoors.geojson'), source);
    await writeFile(
      join(sourceDirectory, 'new-york-outdoors.manifest.json'),
      JSON.stringify(sourceManifest),
    );
    const key = terrainTilePosition(-74, 42, 11).key;
    const tilePath = join(terrainCache, key.replaceAll('/', '-') + '.png');
    await writeFile(tilePath, png());
    const result = await buildPrivateNewYorkProfiles({
      privateRoot,
      sourceDirectory,
      terrainCache,
    });
    assert.equal(result.profiles, 1);
    assert.equal(result.cachedTiles, 1);
    assert.equal(requests, 0);
    const profilePath = join(result.outputDirectory, 'new-york-hikes.json');
    const lastGood = await readFile(profilePath);
    const manifest = JSON.parse(
      await readFile(join(result.outputDirectory, 'new-york-hikes.manifest.json')),
    );
    assert.equal(manifest.classification, 'PRIVATE_USER');
    assert.equal(manifest.publicDistribution, false);
    assert.equal(manifest.terrainCacheOnly, true);
    await writeFile(join(catalogDirectory, 'new-york-outdoors.composed.geojson'), source);
    await writeFile(
      join(catalogDirectory, 'manifest.json'),
      JSON.stringify({
        bundleId: 'private-ioverlander-new-york',
        classification: 'PRIVATE_USER',
        input: {},
        artifacts: [
          {
            file: 'new-york-outdoors.composed.geojson',
            sha256: sourceHash(source),
            bytes: source.length,
          },
        ],
      }),
    );
    assert.equal(
      (
        await packagePrivateNewYorkHikes({
          catalogDirectory,
          profileDirectory: result.outputDirectory,
        })
      ).featureCount,
      1,
    );
    await rm(tilePath);
    await assert.rejects(
      buildPrivateNewYorkProfiles({ privateRoot, sourceDirectory, terrainCache }),
      /Cached terrain tile required/,
    );
    assert.equal(requests, 0);
    assert.deepEqual(await readFile(profilePath), lastGood);
  } finally {
    await rm(privateRoot, { recursive: true, force: true });
  }
});

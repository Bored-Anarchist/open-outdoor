import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { stagePrivateMobileMap } from './stage-private-mobile-map.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('stages a verified private catalog and reports every map source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'open-outdoor-private-map-'));
  const input = join(root, 'catalog');
  const output = join(root, 'mobile');
  const publicAssets = join(root, 'public');
  await Promise.all([mkdir(input), mkdir(publicAssets)]);
  try {
    const sourceIds = ['nys-dec-poi', 'private-ioverlander'];
    const features = Array.from({ length: 2 }, (_, index) => ({
      type: 'Feature',
      id: `feature-${index}`,
      properties: {
        id: `feature-${index}`,
        kind: 'poi',
        name: `Feature ${index}`,
        sourceId: sourceIds[index],
        sourceUpdated: '2026-09-14T00:00:00.000Z',
        ...(sourceIds[index] === 'private-ioverlander'
          ? {
              communityDescription: 'A community description.',
              communityCheckIns: [
                { occurredAt: '2026-09-13T00:00:00.000Z', comment: 'Road was dry.' },
              ],
              communityCheckInCount: 1,
            }
          : {}),
      },
      geometry: { type: 'Point', coordinates: [-74 + index / 100, 42] },
    }));
    const geoBytes = Buffer.from(`${JSON.stringify({ type: 'FeatureCollection', features })}\n`);
    const indexBytes = Buffer.from(
      `${JSON.stringify({ schemaVersion: 1, features: features.map(({ id, properties }) => ({ id, properties, bounds: [-74, 42, -74, 42] })) })}\n`,
    );
    const manifest = {
      schemaVersion: 1,
      bundleId: 'private-ioverlander-new-york',
      classification: 'PRIVATE_USER',
      generatedAt: '2026-09-14T00:00:00.000Z',
      input: {},
      privacy: {
        includesContributorIdentity: false,
        includesDescriptions: true,
        includesCheckInText: true,
      },
      counts: { outputPrivatePlaces: 1 },
      artifacts: [
        {
          file: 'new-york-outdoors.composed.geojson',
          bytes: geoBytes.length,
          sha256: sha256(geoBytes),
        },
        {
          file: 'new-york-outdoors.composed.index.json',
          bytes: indexBytes.length,
          sha256: sha256(indexBytes),
        },
      ],
    };
    await Promise.all([
      writeFile(join(input, 'new-york-outdoors.composed.geojson'), geoBytes),
      writeFile(join(input, 'new-york-outdoors.composed.index.json'), indexBytes),
      writeFile(join(input, 'manifest.json'), `${JSON.stringify(manifest)}\n`),
    ]);
    const publicFeatures = [
      {
        type: 'Feature',
        id: 'public-feature',
        properties: {
          id: 'public-feature',
          kind: 'poi',
          name: 'Public park',
          sourceId: 'nps-parks-ny',
        },
        geometry: { type: 'Point', coordinates: [-74, 42] },
      },
    ];
    const publicGeoBytes = Buffer.from(
      `${JSON.stringify({ type: 'FeatureCollection', features: publicFeatures })}\n`,
    );
    const publicIndexBytes = Buffer.from(
      `${JSON.stringify({ schemaVersion: 1, features: [{ id: 'public-feature', properties: publicFeatures[0].properties, bounds: [-74, 42, -74, 42] }] })}\n`,
    );
    await Promise.all([
      writeFile(join(publicAssets, 'new-york-outdoors.geojson'), publicGeoBytes),
      writeFile(join(publicAssets, 'new-york-outdoors.index.json'), publicIndexBytes),
      writeFile(
        join(publicAssets, 'new-york-outdoors.manifest.json'),
        JSON.stringify({
          classification: 'SOURCE_REDISTRIBUTABLE',
          sha256: sha256(publicGeoBytes),
          indexSha256: sha256(publicIndexBytes),
          featureCount: 1,
          rights: { attribution: ['National Park Service'] },
          catalogSources: [
            { id: 'nps', label: 'National Park Service', featureCount: 1, status: 'public' },
          ],
        }),
      ),
    ]);

    const result = await stagePrivateMobileMap({
      inputDirectory: input,
      outputDirectory: output,
      publicAssetsDirectory: publicAssets,
    });
    assert.equal(result.metadata.featureCount, 3);
    assert.deepEqual(
      result.metadata.sources.map((source) => [source.id, source.featureCount]),
      [
        ['nys-dec', 1],
        ['private-ioverlander', 1],
        ['nps', 1],
      ],
    );
    assert.match(result.metadata.sources.at(-1).status, /public/);
    assert.match(await readFile(join(output, 'mapData.private.ts'), 'utf8'), /composed\.geojson/);
    const staged = JSON.parse(
      await readFile(join(output, 'new-york-outdoors.composed.geojson'), 'utf8'),
    );
    assert.deepEqual(
      staged.features.map((feature) => feature.id),
      ['public-feature', 'feature-0', 'feature-1'],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects catalogs that retain contributor identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'open-outdoor-private-map-'));
  await mkdir(join(root, 'catalog'));
  try {
    await writeFile(
      join(root, 'catalog', 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        bundleId: 'private-ioverlander-new-york',
        classification: 'PRIVATE_USER',
        input: {},
        privacy: {
          includesContributorIdentity: true,
          includesDescriptions: true,
          includesCheckInText: true,
        },
      }),
    );
    await assert.rejects(
      stagePrivateMobileMap({
        inputDirectory: join(root, 'catalog'),
        outputDirectory: join(root, 'mobile'),
      }),
      /privacy boundary/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

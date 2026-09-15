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
  await mkdir(input);
  try {
    const sourceIds = [
      'nys-dec-poi',
      'private-ioverlander',
      'nps-parks-ny',
      'nps-campgrounds-ny',
      'nps-alerts-ny',
      'nps-parks-ny',
      'usfs-surface-ownership-ny',
    ];
    const features = Array.from({ length: 7 }, (_, index) => ({
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
      input: {
        npsSnapshot: { parks: 1, campgrounds: 1, alerts: 1, boundaries: 1 },
        federalSnapshot: {
          usfsSurfaceOwnership: 1,
          usfsRecreationSites: 0,
          usfsMvumRoads: 0,
          usfsMvumTrails: 0,
          blmManagedLands: 0,
        },
      },
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

    const result = await stagePrivateMobileMap({ inputDirectory: input, outputDirectory: output });
    assert.equal(result.metadata.featureCount, 7);
    assert.deepEqual(
      result.metadata.sources.map((source) => [source.id, source.featureCount]),
      [
        ['nys-dec', 1],
        ['private-ioverlander', 1],
        ['nps', 4],
        ['usfs', 1],
        ['blm', 0],
      ],
    );
    assert.match(result.metadata.sources.at(-1).status, /verified/);
    assert.match(await readFile(join(output, 'mapData.private.ts'), 'utf8'), /composed\.geojson/);
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

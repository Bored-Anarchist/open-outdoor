import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hikeRouteDetails, withHikeElevations } from '../../packages/shared/src/hike-route.ts';
import {
  decodeTerrainPng,
  terrainTilePosition,
  terrainElevation,
} from '../acquisition/acquire-hike-profiles.mjs';
import { verifyPrivateHikeProfiles } from './package-private-new-york-hikes.mjs';
import { stagePrivateDirectory, activatePrivateDirectory } from './private-package-transaction.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function buildPrivateNewYorkProfiles({
  privateRoot = resolve('PrivateData'),
  sourceDirectory = join(privateRoot, 'catalogs/US/New York/dec-source-acquisition/current'),
  terrainCache = resolve('.scratch/hike-terrain-tiles'),
} = {}) {
  const location = relative(resolve(privateRoot), resolve(sourceDirectory));
  if (!location || location === '..' || location.startsWith('..' + sep) || isAbsolute(location))
    throw new Error('Private profile sources must stay inside the private root');
  const sourceBytes = await readFile(join(sourceDirectory, 'new-york-outdoors.geojson'));
  const sourceManifest = JSON.parse(
    await readFile(join(sourceDirectory, 'new-york-outdoors.manifest.json')),
  );
  if (
    sourceManifest.classification !== 'PRIVATE_USER' ||
    sourceManifest.publicDistribution !== false ||
    sourceManifest.sha256 !== hash(sourceBytes) ||
    sourceManifest.bytes !== sourceBytes.length
  )
    throw new Error('Verified private DEC source required');
  const collection = JSON.parse(sourceBytes);
  const trails = collection.features.filter((f) => f.properties?.sourceId === 'nys-dec-trails');
  const hikes = Object.fromEntries(trails.map((f) => [f.id, hikeRouteDetails(f.geometry)]));
  const tiles = new Map();
  const receipts = new Map();
  for (const [id, route] of Object.entries(hikes)) {
    const elevations = [];
    for (const sample of route.samples) {
      const position = terrainTilePosition(sample[2], sample[3], 11);
      if (!tiles.has(position.key)) {
        // Never send private geometry or derived tile requests to a provider.
        const bytes = await readFile(
          join(terrainCache, position.key.replaceAll('/', '-') + '.png'),
        ).catch((error) => {
          if (error.code === 'ENOENT')
            throw new Error(
              `Cached terrain tile required: ${position.key}; private geometry was not sent to a provider`,
            );
          throw error;
        });
        tiles.set(position.key, decodeTerrainPng(bytes));
        receipts.set(position.key, { key: position.key, bytes: bytes.length, sha256: hash(bytes) });
      }
      elevations.push(terrainElevation(tiles.get(position.key), position.pixelX, position.pixelY));
    }
    hikes[id] = withHikeElevations(route, elevations, 'terrain-model');
  }
  verifyPrivateHikeProfiles(hikes, collection);
  const terrainTerms = JSON.parse(
    await readFile('packages/map/src/assets/new-york-hikes.manifest.json'),
  );
  const generatedAt = new Date().toISOString();
  const profile = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      sourceSha256: hash(sourceBytes),
      generatedAt,
      attribution: terrainTerms.attribution,
      hikes,
    }) + '\n',
  );
  const manifest = Buffer.from(
    JSON.stringify(
      {
        ...terrainTerms,
        classification: 'PRIVATE_USER',
        publicDistribution: false,
        generatedAt,
        sha256: hash(profile),
        bytes: profile.length,
        sourceSha256: hash(sourceBytes),
        featureCount: trails.length,
        coverage:
          'Private DEC trail profiles regenerated from the current acquired geometry and locally cached terrain.',
        terrainCacheOnly: true,
        tiles: [...receipts.values()].sort((a, b) => a.key.localeCompare(b.key)),
      },
      null,
      2,
    ) + '\n',
  );
  const receipt = Buffer.from(
    JSON.stringify(
      {
        classification: 'PRIVATE_USER',
        publicDistribution: false,
        sourceSha256: hash(sourceBytes),
        files: {
          'new-york-hikes.json': { bytes: profile.length, sha256: hash(profile) },
          'new-york-hikes.manifest.json': { bytes: manifest.length, sha256: hash(manifest) },
        },
      },
      null,
      2,
    ) + '\n',
  );
  const output = join(sourceDirectory, 'profiles');
  const stage = await stagePrivateDirectory(output, { copyCurrent: false });
  for (const [file, bytes] of [
    ['new-york-hikes.json', profile],
    ['new-york-hikes.manifest.json', manifest],
    ['private-profile-source.receipt.json', receipt],
  ])
    await writeFile(join(stage, file), bytes);
  await activatePrivateDirectory(output, stage);
  return { outputDirectory: output, profiles: trails.length, cachedTiles: tiles.size };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(JSON.stringify(await buildPrivateNewYorkProfiles()));

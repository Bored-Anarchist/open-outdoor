#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyPrivateHikeProfiles } from './package-private-new-york-hikes.mjs';
import { validateOprhpPackage } from './package-private-new-york-agencies.mjs';

const GEOJSON_FILE = 'new-york-outdoors.composed.geojson';
const INDEX_FILE = 'new-york-outdoors.composed.index.json';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function artifactByName(manifest, file) {
  const artifact = manifest.artifacts?.find((candidate) => candidate?.file === file);
  if (!artifact) throw new Error(`manifest does not pin ${file}`);
  return artifact;
}

async function verifyArtifact(directory, descriptor) {
  const path = join(directory, descriptor.file);
  const [bytes, details] = await Promise.all([readFile(path), stat(path)]);
  if (details.size !== descriptor.bytes) {
    throw new Error(`${descriptor.file} byte length does not match its manifest`);
  }
  if (sha256(bytes) !== descriptor.sha256) {
    throw new Error(`${descriptor.file} SHA-256 does not match its manifest`);
  }
  return bytes;
}

export async function stagePrivateMobileMap({
  inputDirectory,
  outputDirectory = resolve('apps/mobile/.private-map-data'),
  publicAssetsDirectory = resolve('packages/map/src/assets'),
}) {
  const input = resolve(inputDirectory);
  const output = resolve(outputDirectory);
  if (output === parse(output).root || output === resolve('.')) {
    throw new Error('refusing to stage into a filesystem or repository root');
  }

  const manifest = requireObject(
    JSON.parse(await readFile(join(input, 'manifest.json'), 'utf8')),
    'manifest',
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.bundleId !== 'private-ioverlander-new-york' ||
    manifest.classification !== 'PRIVATE_USER'
  ) {
    throw new Error('catalog is not a supported private iOverlander New York bundle');
  }
  const privacy = requireObject(manifest.privacy, 'manifest privacy');
  if (
    privacy.includesContributorIdentity !== false ||
    privacy.includesDescriptions !== true ||
    privacy.includesCheckInText !== true
  ) {
    throw new Error('private catalog violates the mobile privacy boundary');
  }
  requireObject(manifest.input, 'manifest input');
  const counts = requireObject(manifest.counts, 'manifest counts');
  const geoDescriptor = artifactByName(manifest, GEOJSON_FILE);
  const indexDescriptor = artifactByName(manifest, INDEX_FILE);
  const [geoBytes, indexBytes] = await Promise.all([
    verifyArtifact(input, geoDescriptor),
    verifyArtifact(input, indexDescriptor),
  ]);
  const geojson = JSON.parse(geoBytes.toString('utf8'));
  const index = JSON.parse(indexBytes.toString('utf8'));
  const publicManifest = JSON.parse(
    await readFile(join(publicAssetsDirectory, 'new-york-outdoors.manifest.json'), 'utf8'),
  );
  const publicGeoBytes = await readFile(join(publicAssetsDirectory, 'new-york-outdoors.geojson'));
  const publicIndexBytes = await readFile(
    join(publicAssetsDirectory, 'new-york-outdoors.index.json'),
  );
  if (
    publicManifest.classification !== 'SOURCE_REDISTRIBUTABLE' ||
    publicManifest.sha256 !== sha256(publicGeoBytes) ||
    publicManifest.indexSha256 !== sha256(publicIndexBytes)
  ) {
    throw new Error('public New York asset does not match its redistributable manifest');
  }
  const publicGeojson = JSON.parse(publicGeoBytes.toString('utf8'));
  const publicIndex = JSON.parse(publicIndexBytes.toString('utf8'));
  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('composed GeoJSON is not a FeatureCollection');
  }
  if (!Array.isArray(index.features) || index.features.length !== geojson.features.length) {
    throw new Error('composed index and GeoJSON feature counts differ');
  }
  for (const feature of index.features) {
    const properties = requireObject(feature?.properties, 'feature properties');
    const privateIoverlander = properties.sourceId === 'private-ioverlander';
    if (!privateIoverlander) {
      if (
        'communityDescription' in properties ||
        'communityCheckIns' in properties ||
        'communityCheckInCount' in properties
      ) {
        throw new Error('community narrative fields must remain private iOverlander metadata');
      }
      continue;
    }
    if (
      typeof properties.communityDescription !== 'string' ||
      properties.communityDescription.length > 4_000 ||
      !Array.isArray(properties.communityCheckIns) ||
      properties.communityCheckIns.length > 100 ||
      !Number.isSafeInteger(properties.communityCheckInCount) ||
      properties.communityCheckInCount < properties.communityCheckIns.length
    ) {
      throw new Error('private iOverlander community metadata is malformed');
    }
    for (const checkIn of properties.communityCheckIns) {
      const item = requireObject(checkIn, 'community check-in');
      if (
        Object.keys(item).some((key) => !['occurredAt', 'comment'].includes(key)) ||
        typeof item.occurredAt !== 'string' ||
        !Number.isFinite(Date.parse(item.occurredAt)) ||
        typeof item.comment !== 'string' ||
        item.comment.length > 2_000
      ) {
        throw new Error('private iOverlander check-in contains unsafe or malformed fields');
      }
    }
  }

  if (
    publicGeojson.type !== 'FeatureCollection' ||
    !Array.isArray(publicGeojson.features) ||
    !Array.isArray(publicIndex.features) ||
    publicGeojson.features.length !== publicIndex.features.length ||
    publicGeojson.features.length !== publicManifest.featureCount
  ) {
    throw new Error('public New York feature inventory is invalid');
  }
  const sourceCount = (prefix) =>
    index.features.filter((feature) =>
      String(feature?.properties?.sourceId ?? '').startsWith(prefix),
    ).length;
  const ioverlanderCount = sourceCount('private-ioverlander');
  const decCount = sourceCount('nys-dec-');
  const oprhpCount = validateOprhpPackage(manifest, geojson.features);
  validateOprhpPackage(manifest, index.features);
  if (sourceCount('nys-oprhp-') !== oprhpCount) throw new Error('OPRHP index count mismatch');
  if (
    ioverlanderCount !== nonNegativeInteger(counts.outputPrivatePlaces, 'iOverlander output count')
  ) {
    throw new Error('private catalog count does not match its composed index');
  }
  if (decCount + ioverlanderCount + oprhpCount !== index.features.length) {
    throw new Error('private catalog contains a source outside DEC and iOverlander');
  }
  if (decCount < 1) throw new Error('composed catalog does not include held New York agency data');
  if (
    publicIndex.features.some(
      (feature) =>
        String(feature?.properties?.sourceId ?? '').startsWith('nys-dec-') ||
        String(feature?.properties?.sourceId ?? '').startsWith('nys-oprhp-') ||
        feature?.properties?.sourceId === 'private-ioverlander',
    )
  ) {
    throw new Error('public catalog contains private New York data');
  }
  const ids = new Set(index.features.map((feature) => feature.id));
  if (publicIndex.features.some((feature) => ids.has(feature.id))) {
    throw new Error('public and private New York feature IDs overlap');
  }
  const combinedGeojson = {
    type: 'FeatureCollection',
    features: [...publicGeojson.features, ...geojson.features],
  };
  const combinedIndex = {
    schemaVersion: 1,
    features: [...publicIndex.features, ...index.features],
  };
  const profileBytes = await verifyArtifact(
    input,
    artifactByName(manifest, 'new-york-hikes.private.json'),
  );
  const profileManifestBytes = await verifyArtifact(
    input,
    artifactByName(manifest, 'new-york-hikes.private.manifest.json'),
  );
  const profiles = JSON.parse(profileBytes);
  const profileManifest = JSON.parse(profileManifestBytes);
  if (
    profiles.sourceSha256 !== sha256(geoBytes) ||
    profileManifest.sourceSha256 !== sha256(geoBytes) ||
    profileManifest.sha256 !== sha256(profileBytes) ||
    profileManifest.bytes !== profileBytes.length ||
    profileManifest.classification !== 'PRIVATE_USER' ||
    profileManifest.publicDistribution !== false
  ) {
    throw new Error('private hike profiles do not match the private map and manifest');
  }
  const profileCount = verifyPrivateHikeProfiles(profiles.hikes, geojson);
  if (profileCount !== profileManifest.featureCount)
    throw new Error('private hike profile count mismatch');
  const combinedGeoBytes = Buffer.from(`${JSON.stringify(combinedGeojson)}\n`);
  const stagedProfiles = { ...profiles, sourceSha256: sha256(combinedGeoBytes) };

  const metadata = {
    schemaVersion: 1,
    classification: manifest.classification,
    hasPrivateData: true,
    label: 'Public New York + private agency + iOverlander catalog',
    featureCount: combinedGeojson.features.length,
    sha256: sha256(combinedGeoBytes),
    hikeProfileCount: profileCount,
    acquiredAt: manifest.generatedAt,
    attribution: `NYS DEC; ${oprhpCount ? 'NY State Parks (NYS OPRHP); ' : ''}private iOverlander catalog; ${publicManifest.rights.attribution.join('; ')}`,
    sources: [
      {
        id: 'nys-dec',
        label: 'NYS DEC',
        featureCount: decCount,
        status: 'private rights-held offline snapshot',
      },
      {
        id: 'private-ioverlander',
        label: 'iOverlander',
        featureCount: ioverlanderCount,
        status:
          'private on-device places with community descriptions and check-ins; contributor identities removed',
      },
      ...(oprhpCount
        ? [
            {
              id: 'nys-oprhp',
              label: 'NY State Parks (NYS OPRHP)',
              featureCount: oprhpCount,
              status:
                'private noncommercial dated reference; temporal snapshots excluded; verify current access',
            },
          ]
        : []),
      ...publicManifest.catalogSources,
    ],
  };

  const temporary = join(dirname(output), `.${basename(output)}.stage-${randomUUID()}`);
  await mkdir(temporary, { recursive: false });
  try {
    await Promise.all([
      writeFile(join(temporary, GEOJSON_FILE), combinedGeoBytes, {
        flag: 'wx',
      }),
      writeFile(join(temporary, INDEX_FILE), `${JSON.stringify(combinedIndex)}\n`, { flag: 'wx' }),
      writeFile(
        join(temporary, 'new-york-hikes.private.json'),
        `${JSON.stringify(stagedProfiles)}\n`,
        { flag: 'wx' },
      ),
      writeFile(join(temporary, 'mobile-manifest.json'), `${JSON.stringify(metadata, null, 2)}\n`, {
        flag: 'wx',
      }),
      writeFile(
        join(temporary, 'mapData.private.ts'),
        `import mobileMapDataAsset from './${GEOJSON_FILE}';\nimport mobileMapDataIndex from './${INDEX_FILE}';\nimport mobileMapDataMetadata from './mobile-manifest.json';\nimport mobileHikeData from './new-york-hikes.private.json';\n\nexport { mobileMapDataAsset, mobileMapDataIndex, mobileMapDataMetadata, mobileHikeData };\n`,
        { flag: 'wx' },
      ),
    ]);
    await rm(output, { recursive: true, force: true });
    await rename(temporary, output);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return { outputDirectory: output, metadata };
}

function argumentsByName(values) {
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`invalid argument near ${name ?? '<end>'}`);
    }
    parsed.set(name.slice(2), value);
  }
  return parsed;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = argumentsByName(process.argv.slice(2));
  const inputDirectory = args.get('input');
  if (!inputDirectory) {
    throw new Error(
      'usage: node tools/packages/stage-private-mobile-map.mjs --input <catalog directory>',
    );
  }
  const result = await stagePrivateMobileMap({ inputDirectory });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

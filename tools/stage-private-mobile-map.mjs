#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
    privacy.includesDescriptions !== false ||
    privacy.includesCheckInText !== false
  ) {
    throw new Error('private catalog violates the mobile privacy boundary');
  }
  const manifestInput = requireObject(manifest.input, 'manifest input');
  const nps = requireObject(manifestInput.npsSnapshot, 'manifest NPS snapshot');
  const federal = requireObject(manifestInput.federalSnapshot, 'manifest federal snapshot');
  const counts = requireObject(manifest.counts, 'manifest counts');
  const geoDescriptor = artifactByName(manifest, GEOJSON_FILE);
  const indexDescriptor = artifactByName(manifest, INDEX_FILE);
  const [geoBytes, indexBytes] = await Promise.all([
    verifyArtifact(input, geoDescriptor),
    verifyArtifact(input, indexDescriptor),
  ]);
  const geojson = JSON.parse(geoBytes.toString('utf8'));
  const index = JSON.parse(indexBytes.toString('utf8'));
  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('composed GeoJSON is not a FeatureCollection');
  }
  if (!Array.isArray(index.features) || index.features.length !== geojson.features.length) {
    throw new Error('composed index and GeoJSON feature counts differ');
  }

  const ioverlanderCount = nonNegativeInteger(
    counts.outputPrivatePlaces,
    'iOverlander output count',
  );
  const npsCount =
    nonNegativeInteger(nps.parks, 'NPS park count') +
    nonNegativeInteger(nps.campgrounds, 'NPS campground count') +
    nonNegativeInteger(nps.alerts, 'NPS alert count') +
    nonNegativeInteger(nps.boundaries, 'NPS boundary count');
  const usfsCount =
    nonNegativeInteger(federal.usfsSurfaceOwnership, 'USFS ownership count') +
    nonNegativeInteger(federal.usfsRecreationSites, 'USFS recreation count') +
    nonNegativeInteger(federal.usfsMvumRoads, 'USFS road count') +
    nonNegativeInteger(federal.usfsMvumTrails, 'USFS trail count');
  const blmCount = nonNegativeInteger(federal.blmManagedLands, 'BLM managed-land count');
  const decCount = geojson.features.length - ioverlanderCount - npsCount - usfsCount - blmCount;
  if (decCount < 1) throw new Error('composed catalog does not retain its public DEC base');

  const metadata = {
    schemaVersion: 1,
    classification: manifest.classification,
    hasPrivateData: true,
    label: 'DEC + iOverlander + NPS + USFS + BLM catalog',
    featureCount: geojson.features.length,
    acquiredAt: manifest.generatedAt,
    attribution:
      'NYS ITS; NYS DEC; private iOverlander catalog; National Park Service; USDA Forest Service; Bureau of Land Management',
    sources: [
      {
        id: 'nys-dec',
        label: 'NYS DEC',
        featureCount: decCount,
        status: 'public offline snapshot',
      },
      {
        id: 'private-ioverlander',
        label: 'iOverlander',
        featureCount: ioverlanderCount,
        status: 'private on-device places; narrative and contributor data removed',
      },
      {
        id: 'nps',
        label: 'National Park Service',
        featureCount: npsCount,
        status: 'official parks, campgrounds, alerts and boundaries',
      },
      {
        id: 'usfs',
        label: 'US Forest Service',
        featureCount: usfsCount,
        status: 'official ownership, recreation and MVUM snapshot',
      },
      {
        id: 'blm',
        label: 'Bureau of Land Management',
        featureCount: blmCount,
        status:
          blmCount === 0
            ? 'official New York query verified; no managed-land features returned'
            : 'official managed-land snapshot',
      },
    ],
  };

  const temporary = join(dirname(output), `.${basename(output)}.stage-${randomUUID()}`);
  await mkdir(temporary, { recursive: false });
  try {
    await Promise.all([
      copyFile(join(input, GEOJSON_FILE), join(temporary, GEOJSON_FILE)),
      copyFile(join(input, INDEX_FILE), join(temporary, INDEX_FILE)),
      writeFile(join(temporary, 'mobile-manifest.json'), `${JSON.stringify(metadata, null, 2)}\n`, {
        flag: 'wx',
      }),
      writeFile(
        join(temporary, 'mapData.private.ts'),
        `import mobileMapDataAsset from './${GEOJSON_FILE}';\nimport mobileMapDataIndex from './${INDEX_FILE}';\nimport mobileMapDataMetadata from './mobile-manifest.json';\n\nexport { mobileMapDataAsset, mobileMapDataIndex, mobileMapDataMetadata };\n`,
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
    throw new Error('usage: node tools/stage-private-mobile-map.mjs --input <catalog directory>');
  }
  const result = await stagePrivateMobileMap({ inputDirectory });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

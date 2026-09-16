#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  federalNewYorkAppFeatures,
  npsNewYorkAppFeatures,
  outdoorAppCollection,
  outdoorAppIndex,
} from '../packages/data/dist/ioverlander-private.js';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function count(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

async function verifiedSnapshot(path, manifestPath, label) {
  const [bytes, manifestBytes] = await Promise.all([readFile(path), readFile(manifestPath)]);
  const manifest = object(JSON.parse(manifestBytes.toString('utf8')), `${label} manifest`);
  const artifact = object(manifest.artifact, `${label} artifact`);
  const details = await stat(path);
  if (
    artifact.file !== basename(path) ||
    artifact.bytes !== details.size ||
    artifact.sha256 !== sha256(bytes)
  ) {
    throw new Error(`${label} snapshot does not match its acquisition manifest`);
  }
  return {
    document: JSON.parse(bytes.toString('utf8')),
    manifest,
    snapshot: {
      file: artifact.file,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      manifestFile: basename(manifestPath),
      manifestBytes: manifestBytes.byteLength,
      manifestSha256: sha256(manifestBytes),
    },
  };
}

function sourceReceipt({ id, kind, url, featureCount, attribution, snapshotSha256, pages }) {
  return {
    id,
    kind,
    url,
    fields: [
      'id',
      'kind',
      'name',
      'sourceId',
      'unit',
      'category',
      'publicUse',
      'sourceUpdated',
      'sourceUrl',
      'origin',
      'description',
      'directionsInfo',
      'amenities',
      'openingHours',
      'fees',
    ],
    attribution,
    featureCount,
    inventorySha256: snapshotSha256,
    pages,
  };
}

const args = argumentsByName(process.argv.slice(2));
const outputDirectory = resolve(args.get('output') ?? 'packages/map/src/assets');
const basePath = resolve(args.get('base') ?? 'packages/map/src/assets/new-york-outdoors.geojson');
const baseManifestPath = resolve(
  args.get('base-manifest') ?? 'packages/map/src/assets/new-york-outdoors.manifest.json',
);
const npsPath = resolve(args.get('nps') ?? 'PrivateData/sources/nps/US/New York/nps-new-york.json');
const npsManifestPath = resolve(
  args.get('nps-manifest') ?? 'PrivateData/sources/nps/US/New York/manifest.json',
);
const federalPath = resolve(
  args.get('federal') ?? 'PrivateData/sources/federal/US/New York/federal-new-york.json',
);
const federalManifestPath = resolve(
  args.get('federal-manifest') ?? 'PrivateData/sources/federal/US/New York/manifest.json',
);
const requestedGeneratedAt = args.get('generated-at');
if (
  requestedGeneratedAt !== undefined &&
  new Date(requestedGeneratedAt).toISOString() !== requestedGeneratedAt
) {
  throw new Error('generated-at must be a normalized UTC timestamp');
}

const [baseBytes, baseManifestBytes, nps, federal] = await Promise.all([
  readFile(basePath),
  readFile(baseManifestPath),
  verifiedSnapshot(npsPath, npsManifestPath, 'NPS'),
  verifiedSnapshot(federalPath, federalManifestPath, 'federal'),
]);
const baseDocument = object(JSON.parse(baseBytes.toString('utf8')), 'base GeoJSON');
const baseManifest = object(JSON.parse(baseManifestBytes.toString('utf8')), 'base manifest');
const sourceTimes = [
  baseManifest.acquiredAt,
  nps.manifest.retrievedAt,
  federal.manifest.retrievedAt,
].map((value) => {
  if (typeof value !== 'string' || !Number.isFinite(new Date(value).valueOf())) {
    throw new Error('source manifests must contain valid acquisition timestamps');
  }
  return new Date(value).toISOString();
});
const generatedAt = requestedGeneratedAt ?? sourceTimes.sort().at(-1);
if (
  baseDocument.type !== 'FeatureCollection' ||
  !Array.isArray(baseDocument.features) ||
  baseManifest.classification !== 'SOURCE_REDISTRIBUTABLE'
) {
  throw new Error('base catalog is not a redistributable outdoor FeatureCollection');
}
const decFeatures = baseDocument.features.filter((feature) =>
  String(feature?.properties?.sourceId ?? '').startsWith('nys-'),
);
const decSources = baseManifest.sources.filter((source) =>
  String(source?.id ?? '').startsWith('nys-'),
);
const expectedDecCount = decSources.reduce(
  (total, source) => total + count(source.featureCount, `${source.id} count`),
  0,
);
if (decFeatures.length !== expectedDecCount || decFeatures.length === 0) {
  throw new Error('base catalog does not contain its complete DEC source inventory');
}

const npsFeatures = npsNewYorkAppFeatures(nps.document);
const federalFeatures = federalNewYorkAppFeatures(federal.document);
const features = [...decFeatures, ...npsFeatures, ...federalFeatures];
if (new Set(features.map((feature) => String(feature.id))).size !== features.length) {
  throw new Error('public composition produced duplicate feature IDs');
}

const npsCounts = object(nps.manifest.counts, 'NPS counts');
const federalCounts = object(federal.manifest.counts, 'federal counts');
const sourceCount = (sourceId) =>
  features.filter((feature) => feature.properties.sourceId === sourceId).length;
const npsParkFeatures = npsFeatures.filter(
  (feature) => feature.properties.sourceId === 'nps-parks-ny',
);
const npsParkPointCount = npsParkFeatures.filter(
  (feature) => feature.geometry.type === 'Point',
).length;
const npsParkBoundaryCount = npsParkFeatures.length - npsParkPointCount;
const expectedCounts = new Map([
  ['nps-parks-ny', sourceCount('nps-parks-ny')],
  ['nps-campgrounds-ny', sourceCount('nps-campgrounds-ny')],
  ['nps-alerts-ny', sourceCount('nps-alerts-ny')],
  ['usfs-surface-ownership-ny', count(federalCounts.usfsSurfaceOwnership, 'USFS ownership')],
  ['usfs-recreation-sites-ny', count(federalCounts.usfsRecreationSites, 'USFS recreation')],
  ['usfs-mvum-roads-ny', count(federalCounts.usfsMvumRoads, 'USFS roads')],
  ['usfs-mvum-trails-ny', count(federalCounts.usfsMvumTrails, 'USFS trails')],
  ['blm-managed-lands-ny', count(federalCounts.blmManagedLands, 'BLM lands')],
]);
if (
  npsParkPointCount > count(npsCounts.parks, 'NPS parks') ||
  npsParkBoundaryCount > count(npsCounts.boundaries, 'NPS boundaries') ||
  sourceCount('nps-campgrounds-ny') > count(npsCounts.campgrounds, 'NPS campgrounds') ||
  sourceCount('nps-alerts-ny') > count(npsCounts.alerts, 'NPS alerts')
) {
  throw new Error('NPS public output exceeds its source snapshot inventory');
}
for (const [sourceId, expected] of expectedCounts) {
  if (sourceCount(sourceId) !== expected) {
    throw new Error(`${sourceId} produced ${sourceCount(sourceId)} features; expected ${expected}`);
  }
}

const npsEndpoints = nps.manifest.endpoints;
const federalEndpoints = federal.manifest.endpoints;
if (!Array.isArray(npsEndpoints) || npsEndpoints.length !== 4) {
  throw new Error('NPS manifest must pin four endpoints');
}
if (!Array.isArray(federalEndpoints) || federalEndpoints.length !== 5) {
  throw new Error('federal manifest must pin five endpoints');
}
const officialSources = [
  sourceReceipt({
    id: 'nps-parks-ny',
    kind: 'land-and-poi',
    url: npsEndpoints[0],
    featureCount: expectedCounts.get('nps-parks-ny'),
    attribution: 'National Park Service',
    snapshotSha256: nps.snapshot.sha256,
    pages: [
      { url: npsEndpoints[0], sha256: nps.snapshot.sha256, count: npsParkPointCount },
      { url: npsEndpoints[3], sha256: nps.snapshot.sha256, count: npsParkBoundaryCount },
    ],
  }),
  sourceReceipt({
    id: 'nps-campgrounds-ny',
    kind: 'poi',
    url: npsEndpoints[1],
    featureCount: expectedCounts.get('nps-campgrounds-ny'),
    attribution: 'National Park Service',
    snapshotSha256: nps.snapshot.sha256,
    pages: [
      {
        url: npsEndpoints[1],
        sha256: nps.snapshot.sha256,
        count: expectedCounts.get('nps-campgrounds-ny'),
      },
    ],
  }),
  sourceReceipt({
    id: 'nps-alerts-ny',
    kind: 'poi',
    url: npsEndpoints[2],
    featureCount: expectedCounts.get('nps-alerts-ny'),
    attribution: 'National Park Service',
    snapshotSha256: nps.snapshot.sha256,
    pages: [
      {
        url: npsEndpoints[2],
        sha256: nps.snapshot.sha256,
        count: expectedCounts.get('nps-alerts-ny'),
      },
    ],
  }),
  ...[
    ['usfs-surface-ownership-ny', 'land', 0],
    ['usfs-recreation-sites-ny', 'poi', 1],
    ['usfs-mvum-roads-ny', 'road', 2],
    ['usfs-mvum-trails-ny', 'trail', 3],
    ['blm-managed-lands-ny', 'land', 4],
  ].map(([id, kind, endpointIndex]) =>
    sourceReceipt({
      id,
      kind,
      url: federalEndpoints[endpointIndex],
      featureCount: expectedCounts.get(id),
      attribution: id.startsWith('blm-') ? 'Bureau of Land Management' : 'USDA Forest Service',
      snapshotSha256: federal.snapshot.sha256,
      pages: [
        {
          url: federalEndpoints[endpointIndex],
          sha256: federal.snapshot.sha256,
          count: expectedCounts.get(id),
        },
      ],
    }),
  ),
];

const collectionBytes = Buffer.from(`${stableJson(outdoorAppCollection(features))}\n`);
const indexBytes = Buffer.from(`${stableJson(outdoorAppIndex(features))}\n`);
if (collectionBytes.byteLength > 24 * 1024 * 1024) {
  throw new Error('public outdoor bundle exceeds 24 MiB');
}
const npsCount = npsFeatures.length;
const usfsCount = [...expectedCounts]
  .filter(([id]) => id.startsWith('usfs-'))
  .reduce((total, [, value]) => total + value, 0);
const blmCount = expectedCounts.get('blm-managed-lands-ny');
const rights = object(baseManifest.rights, 'base rights');
const manifest = {
  ...baseManifest,
  acquiredAt: generatedAt,
  sha256: sha256(collectionBytes),
  bytes: collectionBytes.byteLength,
  indexSha256: sha256(indexBytes),
  indexBytes: indexBytes.byteLength,
  featureCount: features.length,
  coverage:
    'New York DEC lands, roads, trails and recreation points; official NPS parks, campgrounds, alerts and boundaries; official USFS Finger Lakes ownership, recreation and MVUM features; and official BLM managed-land coverage. Display-only and not current permission to camp or enter.',
  rights: {
    ...rights,
    license: 'NYS public GIS terms and United States government public information',
    attribution: [
      'NYS ITS Geospatial Services',
      'New York State Department of Environmental Conservation',
      'OPEN-NY',
      'National Park Service',
      'USDA Forest Service',
      'Bureau of Land Management',
    ],
    terms: [...new Set([...rights.terms, nps.manifest.termsUrl, ...federal.manifest.termsUrls])],
    reviewedAt: generatedAt.slice(0, 10),
  },
  sources: [...decSources, ...officialSources],
  catalogSources: [
    {
      id: 'nys-dec',
      label: 'NYS DEC',
      featureCount: decFeatures.length,
      status: 'public offline snapshot',
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
  officialSnapshots: {
    nps: nps.snapshot,
    federal: federal.snapshot,
  },
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(join(outputDirectory, 'new-york-outdoors.geojson'), collectionBytes),
  writeFile(join(outputDirectory, 'new-york-outdoors.index.json'), indexBytes),
  writeFile(
    join(outputDirectory, 'new-york-outdoors.manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  ),
]);
process.stdout.write(
  `${JSON.stringify(
    {
      outputDirectory,
      featureCount: features.length,
      sources: manifest.catalogSources,
      sha256: manifest.sha256,
    },
    null,
    2,
  )}\n`,
);

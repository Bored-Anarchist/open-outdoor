#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const publicRoot = resolve('packages/map/src/assets');
const privateRoot = resolve('PrivateData/catalogs/US/New York/rights-held-2026-09-27');
const files = [
  'new-york-outdoors.geojson',
  'new-york-outdoors.index.json',
  'new-york-outdoors.manifest.json',
  'new-york-hikes.json',
  'new-york-hikes.manifest.json',
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const input = Object.fromEntries(
  await Promise.all(files.map(async (name) => [name, await readFile(join(publicRoot, name))])),
);
const collection = JSON.parse(input['new-york-outdoors.geojson']);
const index = JSON.parse(input['new-york-outdoors.index.json']);
const manifest = JSON.parse(input['new-york-outdoors.manifest.json']);
const hikes = JSON.parse(input['new-york-hikes.json']);
const hikeManifest = JSON.parse(input['new-york-hikes.manifest.json']);
if (
  manifest.sha256 !== hash(input['new-york-outdoors.geojson']) ||
  manifest.indexSha256 !== hash(input['new-york-outdoors.index.json']) ||
  hikeManifest.sha256 !== hash(input['new-york-hikes.json']) ||
  hikes.sourceSha256 !== manifest.sha256 ||
  collection.features.length !== manifest.featureCount ||
  collection.features.length !== index.features.length
) {
  throw new Error('New York public asset and its manifests do not match');
}
const held = (feature) => /^nys-(dec-|boundary$)/.test(feature.properties?.sourceId ?? '');
const heldFeatures = collection.features.filter(held);
if (heldFeatures.length === 0) throw new Error('No state agency records to quarantine');
if (
  heldFeatures.length !== 14455 ||
  collection.features.some((feature, i) => feature.id !== index.features[i]?.id) ||
  Object.keys(hikes.hikes).length !== 5289
) {
  throw new Error('Unexpected New York source inventory');
}
const ignore = await readFile('.gitignore', 'utf8');
if (!ignore.split(/\r?\n/).includes('/PrivateData/')) {
  throw new Error('PrivateData must be Git-ignored');
}
await mkdir(privateRoot, { recursive: true });
for (const name of files) {
  await writeFile(join(privateRoot, name), input[name], { flag: 'wx' });
}
await writeFile(
  join(privateRoot, 'rights-hold.receipt.json'),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      classification: 'PRIVATE_USER',
      publicDistribution: false,
      preservedAt: new Date().toISOString(),
      heldSourceIds: [...new Set(heldFeatures.map((feature) => feature.properties.sourceId))],
      heldFeatureCount: heldFeatures.length,
      files: Object.fromEntries(
        files.map((name) => [name, { bytes: input[name].length, sha256: hash(input[name]) }]),
      ),
    },
    null,
    2,
  )}\n`,
  { flag: 'wx' },
);
const allowed = collection.features.filter((feature) => !held(feature));
const allowedIds = new Set(allowed.map((feature) => feature.id));
const allowedIndex = index.features.filter((feature) => allowedIds.has(feature.id));
if (allowed.length !== allowedIndex.length) throw new Error('Filtered index count mismatch');
const collectionBytes = Buffer.from(`${JSON.stringify({ ...collection, features: allowed })}\n`);
const indexBytes = Buffer.from(`${JSON.stringify({ ...index, features: allowedIndex })}\n`);
const publicManifest = {
  ...manifest,
  classification: 'SOURCE_REDISTRIBUTABLE',
  sha256: hash(collectionBytes),
  bytes: collectionBytes.length,
  indexSha256: hash(indexBytes),
  indexBytes: indexBytes.length,
  featureCount: allowed.length,
  coverage:
    'Official NPS and USFS New York features; state agency data held in PrivateData pending rights review.',
  rights: {
    license: 'United States government public information',
    offlineStorage: true,
    redistribution: true,
    derivedData: true,
    attribution: ['National Park Service', 'USDA Forest Service', 'Bureau of Land Management'],
    terms: [
      'https://www.nps.gov/aboutus/disclaimer.htm',
      'https://data.fs.usda.gov/geodata/edw/datasets.php',
      'https://www.blm.gov/services/geospatial/GISData',
    ],
    reviewedAt: '2026-09-27',
  },
  sources: manifest.sources.filter((source) => !/^nys-(dec-|boundary$)/.test(source.id)),
  catalogSources: manifest.catalogSources.filter((source) => source.id !== 'nys-dec'),
};
await writeFile(join(publicRoot, 'new-york-outdoors.geojson'), collectionBytes);
await writeFile(join(publicRoot, 'new-york-outdoors.index.json'), indexBytes);
await writeFile(
  join(publicRoot, 'new-york-outdoors.manifest.json'),
  `${JSON.stringify(publicManifest, null, 2)}\n`,
);
console.log(
  JSON.stringify({ privateFeatures: heldFeatures.length, publicFeatures: allowed.length }),
);

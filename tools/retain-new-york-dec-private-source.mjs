#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('PrivateData/catalogs/US/New York/rights-held-2026-09-27');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (name) => readFile(resolve(root, name));
const [geoBytes, indexBytes, manifestBytes, receiptBytes] = await Promise.all([
  read('new-york-outdoors.geojson'),
  read('new-york-outdoors.index.json'),
  read('new-york-outdoors.manifest.json'),
  read('rights-hold.receipt.json'),
]);
const collection = JSON.parse(geoBytes);
const index = JSON.parse(indexBytes);
const manifest = JSON.parse(manifestBytes);
const receipt = JSON.parse(receiptBytes);
if (
  receipt.files['new-york-outdoors.geojson'].sha256 !== hash(geoBytes) ||
  receipt.files['new-york-outdoors.index.json'].sha256 !== hash(indexBytes)
) {
  throw new Error('private source receipt does not match files');
}
const dec = (feature) => String(feature.properties?.sourceId ?? '').startsWith('nys-dec-');
const decFeatures = collection.features.filter(dec);
const decIds = new Set(decFeatures.map((feature) => feature.id));
const decIndex = index.features.filter((feature) => decIds.has(feature.id));
if (decFeatures.length !== 14454 || decIndex.length !== decFeatures.length) {
  throw new Error('unexpected DEC source inventory');
}
if (collection.features.length === decFeatures.length) {
  process.stdout.write('Private New York source is already DEC-only\n');
  process.exit(0);
}
const outputGeo = Buffer.from(`${JSON.stringify({ ...collection, features: decFeatures })}\n`);
const outputIndex = Buffer.from(`${JSON.stringify({ ...index, features: decIndex })}\n`);
const outputManifest = {
  ...manifest,
  classification: 'PRIVATE_USER',
  publicDistribution: false,
  sha256: hash(outputGeo),
  bytes: outputGeo.length,
  indexSha256: hash(outputIndex),
  indexBytes: outputIndex.length,
  featureCount: decFeatures.length,
  coverage:
    'NYS DEC lands, roads, hiking trails, and recreation points; private rights-held source.',
  rights: {
    ...manifest.rights,
    redistribution: false,
    derivedData: false,
    license: 'DEC publisher redistribution review pending',
    attribution: ['New York State Department of Environmental Conservation', 'OPEN-NY'],
    terms: [
      'https://gisservices.dec.ny.gov/gis/dil/content.html?cat=CGS',
      'https://data.ny.gov/about',
    ],
  },
  sources: manifest.sources.filter((source) => String(source.id).startsWith('nys-dec-')),
  catalogSources: [
    {
      id: 'nys-dec',
      label: 'NYS DEC',
      featureCount: decFeatures.length,
      status: 'private rights-held source',
    },
  ],
};
const outputManifestBytes = Buffer.from(`${JSON.stringify(outputManifest, null, 2)}\n`);
for (const [name, bytes] of [
  ['new-york-outdoors.geojson', outputGeo],
  ['new-york-outdoors.index.json', outputIndex],
  ['new-york-outdoors.manifest.json', outputManifestBytes],
]) {
  receipt.files[name] = { bytes: bytes.length, sha256: hash(bytes) };
  await writeFile(resolve(root, name), bytes);
}
receipt.heldSourceIds = [...new Set(decFeatures.map((feature) => feature.properties.sourceId))];
receipt.heldFeatureCount = decFeatures.length;
receipt.description =
  'DEC-only private source. The civil boundary and federal features are in the public catalog.';
await writeFile(resolve(root, 'rights-hold.receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write('Retained 14,454 DEC features in the private New York source\n');

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const publicRoot = resolve('packages/map/src/assets');
const archivedRoot = resolve('PrivateData/catalogs/US/New York/rights-held-2026-09-27');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = async (root, name) => JSON.parse(await readFile(resolve(root, name), 'utf8'));
const [collection, index, manifest] = await Promise.all([
  readJson(publicRoot, 'new-york-outdoors.geojson'),
  readJson(publicRoot, 'new-york-outdoors.index.json'),
  readJson(publicRoot, 'new-york-outdoors.manifest.json'),
]);
if (
  collection.features.some((feature) => String(feature.properties?.sourceId).startsWith('nys-dec-'))
) {
  throw new Error('public New York map contains DEC data');
}
if (collection.features.some((feature) => feature.properties?.sourceId === 'nys-boundary')) {
  process.stdout.write('NYS civil boundary is already public\n');
  process.exit(0);
}
const [archivedCollection, archivedIndex, archivedManifest] = await Promise.all([
  readJson(archivedRoot, 'new-york-outdoors.geojson'),
  readJson(archivedRoot, 'new-york-outdoors.index.json'),
  readJson(archivedRoot, 'new-york-outdoors.manifest.json'),
]);
const boundary = archivedCollection.features.filter(
  (feature) => feature.properties?.sourceId === 'nys-boundary',
);
const boundaryIndex = archivedIndex.features.filter(
  (feature) => feature.properties?.sourceId === 'nys-boundary',
);
const boundarySource = archivedManifest.sources.filter((source) => source.id === 'nys-boundary');
if (
  boundary.length !== 1 ||
  boundaryIndex.length !== 1 ||
  boundarySource.length !== 1 ||
  boundary[0].id !== boundaryIndex[0].id
) {
  throw new Error('archived NYS civil boundary inventory is invalid');
}
const collectionBytes = Buffer.from(
  `${JSON.stringify({ ...collection, features: [boundary[0], ...collection.features] })}\n`,
);
const indexBytes = Buffer.from(
  `${JSON.stringify({ ...index, features: [boundaryIndex[0], ...index.features] })}\n`,
);
const publicManifest = {
  ...manifest,
  sha256: hash(collectionBytes),
  bytes: collectionBytes.length,
  indexSha256: hash(indexBytes),
  indexBytes: indexBytes.length,
  featureCount: collection.features.length + 1,
  coverage:
    'NYS civil boundary and official NPS/USFS New York features; DEC data held privately pending rights review.',
  rights: {
    ...manifest.rights,
    license: 'United States government public information; NYS civil boundaries general-use data',
    attribution: ['NYS ITS Geospatial Services', ...manifest.rights.attribution],
    terms: ['https://gis.ny.gov/civil-boundaries', ...manifest.rights.terms],
  },
  sources: [boundarySource[0], ...manifest.sources],
  catalogSources: [
    {
      id: 'nys-boundary',
      label: 'NYS ITS civil boundary',
      featureCount: 1,
      status: 'public planning and general-use boundary',
    },
    ...manifest.catalogSources,
  ],
};
await Promise.all([
  writeFile(resolve(publicRoot, 'new-york-outdoors.geojson'), collectionBytes),
  writeFile(resolve(publicRoot, 'new-york-outdoors.index.json'), indexBytes),
  writeFile(
    resolve(publicRoot, 'new-york-outdoors.manifest.json'),
    `${JSON.stringify(publicManifest, null, 2)}\n`,
  ),
]);
process.stdout.write('Restored one NYS civil boundary to the public catalog\n');

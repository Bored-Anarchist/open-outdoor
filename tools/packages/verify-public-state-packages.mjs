import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { sha256, geometryStats, normalizePublicFeature } from './build-public-state-packages.mjs';
import { parseMapDataset } from '../../dist/public-state-parser/parser.mjs';

const root = resolve(import.meta.dirname, '../..');
const packagesRoot = join(root, 'packages/map/src/assets/state-packages/US');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const inventory = await json(join(packagesRoot, 'inventory.json'));
if (inventory.states.length !== 50 || new Set(inventory.states.map((s) => s.state)).size !== 50)
  throw new Error('Invalid fifty-state inventory');
let count = 0;
let partCount = 0;
for (const state of inventory.states) {
  const directory = join(packagesRoot, state.state);
  const manifest = await json(join(directory, 'manifest.json'));
  if (
    manifest.publicDistribution !== true ||
    manifest.classification !== 'SOURCE_REDISTRIBUTABLE' ||
    manifest.rights.redistribution !== true
  )
    throw new Error('Not a public package');
  const geo = await readFile(join(directory, 'outdoors.geojson'));
  const idx = await readFile(join(directory, 'index.json'));
  for (const [b, d] of [
    [geo, manifest.artifacts.geojson],
    [idx, manifest.artifacts.index],
  ])
    if (b.length !== d.bytes || sha256(b) !== d.sha256)
      throw new Error(`${state.state}: checksum mismatch`);
  const notices = await readFile(join(directory, 'DATA_NOTICES.md'));
  if (
    notices.length !== manifest.artifacts.notices.bytes ||
    sha256(notices) !== manifest.artifacts.notices.sha256
  )
    throw new Error('Data notice checksum mismatch');
  if (
    state.state === 'UT' &&
    !manifest.sources
      .filter((s) => s.state === 'UT')
      .every((s) => s.disclaimer && notices.toString().includes(s.disclaimer))
  )
    throw new Error('UGRC unmodified disclaimer missing');
  const doc = JSON.parse(geo);
  const index = JSON.parse(idx);
  const allowed = new Set(manifest.sources.map((s) => s.id));
  if (
    doc.features.length !== manifest.featureCount ||
    index.features.length !== manifest.featureCount ||
    state.features !== manifest.featureCount
  )
    throw new Error('Feature count mismatch');
  const ids = new Set();
  doc.features.forEach((f, i) => {
    normalizePublicFeature(f, allowed);
    if (ids.has(f.id)) throw new Error('Duplicate ID');
    ids.add(f.id);
    if (
      index.features[i].id !== f.id ||
      index.features[i].properties.category !== f.properties.category ||
      JSON.stringify(index.features[i].bounds) !== JSON.stringify(geometryStats(f.geometry).bounds)
    )
      throw new Error('Index mismatch');
  });
  for (const source of manifest.agency.sources)
    if (
      !manifest.sources.some(
        (s) =>
          s.id === source.id && s.rightsStatus === 'Supported' && s.publicDistribution === true,
      )
    )
      throw new Error('Agency source not independently public');
  const covered = new Set();
  const partIds = new Set();
  for (const part of manifest.import.parts) {
    if (!/^parts\/outdoors-\d{3}\.geojson$/.test(part.file)) throw new Error('Unsafe part path');
    const b = await readFile(join(directory, part.file));
    if (b.length !== part.bytes || sha256(b) !== part.sha256)
      throw new Error('Part checksum mismatch');
    const p = JSON.parse(b);
    const parsed = parseMapDataset(b.toString(), part.sha256, `${state.name} part`);
    if (
      p.features.length !== part.featureCount ||
      parsed.collection.features.length !== part.normalizedFeatureCount
    )
      throw new Error('Part count mismatch');
    for (const f of p.features) {
      if (partIds.has(f.id)) throw new Error('Duplicate across import parts');
      partIds.add(f.id);
      const parent = f.properties.parentFeatureId ?? f.id;
      if (!ids.has(parent)) throw new Error('Unknown part feature');
      covered.add(parent);
    }
    partCount++;
  }
  if (covered.size !== ids.size) throw new Error('Import parts omit base features');
  count++;
}
const assets = join(root, 'packages/map/src/assets');
const ny = await json(join(assets, 'new-york-outdoors.manifest.json'));
const nyPackage = await json(join(packagesRoot, 'NY/manifest.json'));
if (ny.sha256 !== nyPackage.output.sha256 || ny.indexSha256 !== nyPackage.artifacts.index.sha256)
  throw new Error('Default New York asset differs from state package');
const hikesBytes = await readFile(join(assets, 'new-york-hikes.json'));
const hikes = JSON.parse(hikesBytes);
const hikeManifest = await json(join(assets, 'new-york-hikes.manifest.json'));
if (
  Object.keys(hikes.hikes).length !== 0 ||
  hikes.sourceSha256 !== ny.sha256 ||
  hikeManifest.sourceSha256 !== ny.sha256 ||
  hikeManifest.sha256 !== sha256(hikesBytes)
)
  throw new Error('New York public hike profiles are held or stale');
console.log(
  `Verified ${count} public state packages and ${partCount} import parts; New York public map/profile bindings match.`,
);

#!/usr/bin/env node
import { deduplicatePrivateStatePackage } from './deduplicate-private-state-packages.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { agencyFeature } from './build-private-state-agency-ioverlander.mjs';
import { geometryStats } from './build-public-state-packages.mjs';
import { publicPoiCategory } from '../packages/shared/dist/public-poi-category.js';
import { packagePrivateNewYorkHikes } from './package-private-new-york-hikes.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const configPath = resolve('config/private-new-york-oprhp-sources.json');

export function selectOprhpFeatures(source, features) {
  if (source.mode !== 'durable') return [];
  return features.filter(
    (feature) =>
      Object.entries(source.selection ?? {}).every(
        ([key, value]) => feature.properties?.[key] === value,
      ) && !(source.excludeStatuses ?? []).includes(feature.properties?.Status),
  );
}

export function validateOprhpPackage(manifest, features) {
  const declared = manifest.oprhp;
  const agency = features.filter((feature) =>
    String(feature.properties?.sourceId).startsWith('nys-oprhp-'),
  );
  if (!declared && agency.length === 0) return 0;
  if (
    !declared ||
    declared.publicDistribution !== false ||
    declared.featureCount !== agency.length ||
    !Array.isArray(declared.sources) ||
    new Set(declared.sources.map((s) => s.sourceId)).size !== declared.sources.length
  )
    throw new Error('private OPRHP manifest count or provenance mismatch');
  for (const source of declared.sources) {
    if (
      ![
        'nys-oprhp-trails',
        'nys-oprhp-facilities',
        'nys-oprhp-camping',
        'nys-oprhp-park-points',
      ].includes(source.sourceId) ||
      !/^[a-f0-9]{64}$/.test(source.rawSha256) ||
      !Number.isSafeInteger(source.featureCount) ||
      source.featureCount < 0 ||
      agency.filter((f) => f.properties.sourceId === source.sourceId).length !== source.featureCount
    )
      throw new Error('private OPRHP source count or provenance mismatch');
  }
  if (
    agency.some(
      (f) =>
        !declared.sources.some((s) => s.sourceId === f.properties.sourceId) ||
        f.properties.publicDistribution !== false ||
        f.properties.currentConditions !== false,
    )
  )
    throw new Error('undeclared or unsafe private OPRHP source');
  return agency.length;
}

export async function packagePrivateNewYorkAgencies({
  catalogDirectory = resolve('PrivateData/catalogs/US/New York/current'),
  sourceRoot = resolve('PrivateData/agency-feeds/US/NY'),
  refreshProfiles = true,
  profileDirectory,
} = {}) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  // An unacquired source is an error: a rebuild must never silently lose an existing overlay.
  const manifest = JSON.parse(await readFile(join(catalogDirectory, 'manifest.json'), 'utf8'));
  if (
    manifest.classification !== 'PRIVATE_USER' ||
    manifest.bundleId !== 'private-ioverlander-new-york'
  )
    throw new Error('supported private New York package required');
  const geoFile = 'new-york-outdoors.composed.geojson';
  const indexFile = 'new-york-outdoors.composed.index.json';
  const geoBytes = await readFile(join(catalogDirectory, geoFile));
  const descriptor = manifest.artifacts.find((a) => a.file === geoFile);
  if (descriptor?.sha256 !== hash(geoBytes) || descriptor.bytes !== geoBytes.length)
    throw new Error('base private map checksum mismatch');
  const features = JSON.parse(geoBytes).features.filter(
    (f) => !String(f.properties?.sourceId).startsWith('nys-oprhp-'),
  );
  const originalIds = new Set(features.map((f) => f.id));
  const sources = [];
  const references = [];
  for (const source of config.sources) {
    const directory = join(sourceRoot, source.id);
    const receipt = JSON.parse(await readFile(join(directory, 'receipt.json'), 'utf8'));
    const raw = await readFile(join(directory, 'raw.geojson'));
    if (
      receipt.sourceId !== source.id ||
      receipt.sourceUrl !== source.url ||
      receipt.rightsStatus !== source.rightsStatus ||
      receipt.publicDistribution !== false ||
      receipt.provisionalPrivateValidation !== true ||
      receipt.sha256 !== hash(raw) ||
      receipt.bytes !== raw.length
    )
      throw new Error(`${source.id}: private source receipt mismatch`);
    for (const evidence of receipt.evidence ?? []) {
      const bytes = await readFile(join(directory, evidence.file));
      if (hash(bytes) !== evidence.sha256 || bytes.length !== evidence.bytes)
        throw new Error(`${source.id}: terms/metadata checksum mismatch`);
    }
    if ((receipt.evidence?.length ?? 0) !== 2)
      throw new Error(`${source.id}: terms and metadata required`);
    const collection = JSON.parse(raw);
    if (
      collection.type !== 'FeatureCollection' ||
      collection.features.length !== receipt.featureCount
    )
      throw new Error(`${source.id}: incomplete private source`);
    const selected = selectOprhpFeatures(source, collection.features);
    const converted = selected
      .map((feature, index) => {
        const converted = agencyFeature(receipt, feature, index);
        if (!converted) return null;
        const p = feature.properties ?? {};
        converted.properties = {
          ...converted.properties,
          category:
            source.category ??
            (converted.properties.kind === 'poi'
              ? publicPoiCategory(String(p.Sub_Asset ?? p.Category ?? ''))
              : 'other'),
          sourceCategory: String(p.Sub_Asset ?? p.Category ?? ''),
          unit: String(p.Unit ?? p.Facility ?? p.Name ?? source.name),
          attribution: source.attribution,
          dataTermsUrl: source.termsUrl,
          publicDistribution: false,
          currentConditions: false,
          sourceUpdated: receipt.sourceEditDate
            ? new Date(receipt.sourceEditDate).toISOString()
            : null,
          publicUse:
            'Private noncommercial dated NY State Parks reference; verify current access and conditions with the manager.',
        };
        if (originalIds.has(converted.id))
          throw new Error('OPRHP ID collision with retained private data');
        originalIds.add(converted.id);
        return converted;
      })
      .filter(Boolean);
    const entry = {
      sourceId: source.id,
      sourceUrl: source.url,
      termsUrl: source.termsUrl,
      rawSha256: receipt.sha256,
      rawFeatureCount: receipt.featureCount,
      featureCount: converted.length,
      retrievedAt: receipt.retrievedAt,
      sourceEditDate: receipt.sourceEditDate,
      evidence: receipt.evidence,
      ...(source.selection
        ? { selection: source.selection, excludeStatuses: source.excludeStatuses }
        : {}),
    };
    if (source.mode === 'durable') {
      features.push(...converted);
      sources.push(entry);
    } else
      references.push({
        ...entry,
        mode: source.mode,
        storage: 'PrivateData/agency-feeds/US/NY',
        currentConditions: false,
      });
  }
  const snapshot = join(catalogDirectory, 'before-oprhp');
  await mkdir(snapshot, { recursive: true });
  for (const file of [geoFile, indexFile, 'manifest.json'])
    await copyFile(join(catalogDirectory, file), join(snapshot, file), 1).catch((error) => {
      if (error.code !== 'EEXIST') throw error;
    });
  delete manifest.publicDeduplication;
  manifest.oprhp = {
    publicDistribution: false,
    featureCount: sources.reduce((n, s) => n + s.featureCount, 0),
    sources,
    references,
  };
  validateOprhpPackage(manifest, features);
  const index = {
    schemaVersion: 1,
    features: features.map((f) => ({
      id: f.id,
      bounds: geometryStats(f.geometry).bounds,
      properties: f.properties,
    })),
  };
  for (const [file, value] of [
    [geoFile, { type: 'FeatureCollection', features }],
    [indexFile, index],
  ]) {
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
    await writeFile(join(catalogDirectory, file), bytes);
    const artifact = manifest.artifacts.find((a) => a.file === file);
    Object.assign(artifact, { bytes: bytes.length, sha256: hash(bytes) });
  }
  manifest.generatedAt = new Date().toISOString();
  await writeFile(
    join(catalogDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  if (refreshProfiles)
    await packagePrivateNewYorkHikes({
      catalogDirectory,
      ...(profileDirectory ? { profileDirectory } : {}),
    });
  if (catalogDirectory === resolve('PrivateData/catalogs/US/New York/current'))
    await deduplicatePrivateStatePackage(resolve('.'), 'NY', 'New York');
  return {
    features: features.length,
    oprhp: manifest.oprhp.featureCount,
    referenceSnapshots: references.length,
  };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  console.log(JSON.stringify(await packagePrivateNewYorkAgencies()));

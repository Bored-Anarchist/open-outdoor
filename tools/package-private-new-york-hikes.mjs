#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { hikeRouteDetails, withHikeElevations } from '../packages/shared/src/hike-route.ts';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function verifyPrivateHikeProfiles(hikes, collection) {
  const trails = collection.features.filter(
    (feature) =>
      feature.properties?.sourceId === 'nys-dec-trails' &&
      ['LineString', 'MultiLineString'].includes(feature.geometry?.type),
  );
  const ids = new Set(trails.map((feature) => feature.id));
  if (
    ids.size !== trails.length ||
    Object.keys(hikes).length !== trails.length ||
    Object.keys(hikes).some((id) => !ids.has(id))
  ) {
    throw new Error('DEC profile IDs do not exactly match the packaged trails');
  }
  for (const trail of trails) {
    const profile = hikes[trail.id];
    const route = hikeRouteDetails(trail.geometry);
    if (
      !Array.isArray(profile?.samples) ||
      profile.samples.length !== route.samples.length ||
      profile.samples.some(
        (sample) =>
          !Array.isArray(sample) ||
          sample.length !== 5 ||
          (sample[1] !== null && (!Number.isFinite(sample[1]) || Math.abs(sample[1]) > 100000)),
      )
    ) {
      throw new Error(`${trail.id}: invalid preserved elevation samples`);
    }
    const expected = withHikeElevations(
      route,
      profile.samples.map((sample) => sample[1]),
      'terrain-model',
    );
    if (!isDeepStrictEqual(expected, profile)) {
      throw new Error(
        `${trail.id}: preserved profile no longer matches trail geometry or statistics`,
      );
    }
  }
  return trails.length;
}

export async function packagePrivateNewYorkHikes({
  catalogDirectory = resolve('PrivateData/catalogs/US/New York/current'),
  profileDirectory = resolve('PrivateData/catalogs/US/New York/rights-held-2026-09-27'),
} = {}) {
  const [manifestBytes, receiptBytes, sourceBytes, sourceManifestBytes] = await Promise.all([
    readFile(join(catalogDirectory, 'manifest.json')),
    readFile(join(profileDirectory, 'rights-hold.receipt.json')),
    readFile(join(profileDirectory, 'new-york-hikes.json')),
    readFile(join(profileDirectory, 'new-york-hikes.manifest.json')),
  ]);
  const manifest = JSON.parse(manifestBytes);
  const receipt = JSON.parse(receiptBytes);
  const source = JSON.parse(sourceBytes);
  const sourceManifest = JSON.parse(sourceManifestBytes);
  if (
    manifest.bundleId !== 'private-ioverlander-new-york' ||
    manifest.classification !== 'PRIVATE_USER' ||
    receipt.publicDistribution !== false ||
    sourceManifest.sha256 !== hash(sourceBytes) ||
    sourceManifest.bytes !== sourceBytes.length ||
    source.sourceSha256 !== sourceManifest.sourceSha256 ||
    receipt.files['new-york-hikes.json'].sha256 !== hash(sourceBytes) ||
    receipt.files['new-york-hikes.manifest.json'].sha256 !== hash(sourceManifestBytes)
  ) {
    throw new Error('Private catalog or preserved DEC profile provenance is invalid');
  }
  const descriptor = manifest.artifacts.find(
    (item) => item.file === 'new-york-outdoors.composed.geojson',
  );
  const geoBytes = await readFile(join(catalogDirectory, descriptor.file));
  if (descriptor.sha256 !== hash(geoBytes) || descriptor.bytes !== geoBytes.length) {
    throw new Error('private DEC map checksum mismatch');
  }
  const count = verifyPrivateHikeProfiles(source.hikes, JSON.parse(geoBytes));
  if (count !== sourceManifest.featureCount) throw new Error('preserved profile count mismatch');
  const asset = { ...source, sourceSha256: hash(geoBytes) };
  const bytes = Buffer.from(`${JSON.stringify(asset)}\n`);
  const profileManifest = {
    ...sourceManifest,
    classification: 'PRIVATE_USER',
    publicDistribution: false,
    sha256: hash(bytes),
    bytes: bytes.length,
    sourceSha256: asset.sourceSha256,
    preservedProfileSha256: hash(sourceBytes),
    preservedSourceSha256: source.sourceSha256,
    coverage: 'Verified terrain profiles for the DEC trails in the private New York catalog.',
    modifications: `${sourceManifest.modifications} Every profile was checked against current packaged DEC geometry before rebinding to the private map checksum.`,
  };
  const profileManifestBytes = Buffer.from(`${JSON.stringify(profileManifest, null, 2)}\n`);
  const files = [
    ['new-york-hikes.private.json', bytes],
    ['new-york-hikes.private.manifest.json', profileManifestBytes],
  ];
  manifest.artifacts = manifest.artifacts.filter(
    (item) => !files.some(([file]) => file === item.file),
  );
  for (const [file, data] of files) {
    await writeFile(join(catalogDirectory, file), data);
    manifest.artifacts.push({ file, bytes: data.length, sha256: hash(data) });
  }
  manifest.input.hikeProfiles = {
    preservedProfileSha256: hash(sourceBytes),
    preservedManifestSha256: hash(sourceManifestBytes),
    preservedSourceSha256: source.sourceSha256,
  };
  manifest.hikeProfiles = {
    featureCount: count,
    sourceSha256: asset.sourceSha256,
    geometryVerified: true,
    publicDistribution: false,
  };
  await writeFile(
    join(catalogDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { featureCount: count, sha256: hash(bytes) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await packagePrivateNewYorkHikes()));
}

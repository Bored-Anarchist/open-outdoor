#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { verifyPrivateHikeProfiles } from './package-private-new-york-hikes.mjs';

const repository = resolve('.');
const root = join(repository, 'PrivateData/catalogs/US');
const registry = JSON.parse(await readFile('config/us-state-forestry-agencies.json', 'utf8'));
const rows = [];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const state of registry.states) {
  const current = join(root, state.name, 'current');
  const ny = state.code === 'NY';
  const manifest = JSON.parse(
    await readFile(
      join(current, ny ? 'manifest.json' : 'agency-ioverlander.manifest.json'),
      'utf8',
    ),
  );
  if (
    manifest.classification !== 'PRIVATE_USER' ||
    (!ny && manifest.publicDistribution !== false)
  ) {
    throw new Error(`${state.code}: invalid private classification`);
  }
  const artifact = ny
    ? manifest.artifacts.find((item) => item.file === 'new-york-outdoors.composed.geojson')
    : manifest.output;
  const bytes = await readFile(join(current, artifact.file));
  if (artifact.bytes !== bytes.length || artifact.sha256 !== sha256(bytes)) {
    throw new Error(`${state.code}: package checksum mismatch`);
  }
  const collection = JSON.parse(bytes);
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error(`${state.code}: invalid package GeoJSON`);
  }
  const ioverlander = collection.features.filter(
    (feature) => feature.properties?.sourceId === 'private-ioverlander',
  ).length;
  const agency = collection.features.length - ioverlander;
  if (
    ioverlander !==
      (ny ? manifest.counts.outputPrivatePlaces : manifest.ioverlander.featureCount) ||
    (!ny &&
      (agency !== manifest.agency.featureCount ||
        collection.features.length !== manifest.output.featureCount))
  ) {
    throw new Error(`${state.code}: package counts do not match manifest`);
  }
  if (
    ny &&
    collection.features.some(
      (feature) =>
        feature.properties?.sourceId !== 'private-ioverlander' &&
        !String(feature.properties?.sourceId).startsWith('nys-dec-'),
    )
  ) {
    throw new Error('NY: private catalog includes public source features');
  }
  let hikeProfiles = 0;
  if (ny) {
    const profileFiles = ['new-york-hikes.private.json', 'new-york-hikes.private.manifest.json'];
    const assets = [];
    for (const file of profileFiles) {
      const descriptor = manifest.artifacts.find((item) => item.file === file);
      const data = await readFile(join(current, file));
      if (!descriptor || descriptor.bytes !== data.length || descriptor.sha256 !== sha256(data)) {
        throw new Error(`NY: ${file} checksum mismatch`);
      }
      assets.push({ bytes: data, value: JSON.parse(data) });
    }
    const [profiles, profileManifest] = assets;
    if (
      profiles.value.sourceSha256 !== artifact.sha256 ||
      profileManifest.value.sourceSha256 !== artifact.sha256 ||
      profileManifest.value.sha256 !== sha256(profiles.bytes) ||
      profileManifest.value.bytes !== profiles.bytes.length ||
      profileManifest.value.classification !== 'PRIVATE_USER' ||
      profileManifest.value.publicDistribution !== false
    ) {
      throw new Error('NY: private profile provenance mismatch');
    }
    hikeProfiles = verifyPrivateHikeProfiles(profiles.value.hikes, collection);
    if (
      hikeProfiles !== profileManifest.value.featureCount ||
      hikeProfiles !== manifest.hikeProfiles?.featureCount
    ) {
      throw new Error('NY: private profile count mismatch');
    }
  }
  rows.push({
    state: state.code,
    name: state.name,
    packageMode: ny
      ? 'dec-and-ioverlander'
      : agency > 0
        ? 'agency-and-ioverlander'
        : 'ioverlander-only',
    agency,
    ioverlander,
    total: collection.features.length,
    hikeProfiles,
    sha256: artifact.sha256,
  });
}
if (rows.length !== 50 || new Set(rows.map((row) => row.state)).size !== 50) {
  throw new Error('Expected one verified active package per state');
}
const totals = rows.reduce(
  (result, row) => ({
    agency: result.agency + row.agency,
    ioverlander: result.ioverlander + row.ioverlander,
    features: result.features + row.total,
    hikeProfiles: result.hikeProfiles + row.hikeProfiles,
  }),
  { agency: 0, ioverlander: 0, features: 0, hikeProfiles: 0 },
);
const inventory = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  classification: 'PRIVATE_USER',
  packageCount: rows.length,
  totals,
  packages: rows,
};
await writeFile(
  join(root, 'private-state-package-inventory.json'),
  `${JSON.stringify(inventory, null, 2)}\n`,
);
await writeFile(
  join(root, 'agency-ioverlander-build-report.json'),
  `${JSON.stringify(
    rows
      .filter((row) => row.state !== 'NY')
      .map((row) => ({
        state: row.state,
        status: 'built',
        packageMode: row.packageMode,
        ioverlander: row.ioverlander,
        agency: row.agency,
      })),
    null,
    2,
  )}\n`,
);
const labels = {
  'dec-and-ioverlander': 'DEC + iOverlander',
  'agency-and-ioverlander': 'Agency + iOverlander',
  'ioverlander-only': 'iOverlander only',
};
const format = (value) => value.toLocaleString('en-US');
await writeFile(
  'docs/PRIVATE_STATE_PACKAGE_INVENTORY_2026-09-27.md',
  [
    '# Private state package inventory',
    '',
    '**50 active packages: one for each U.S. state.** This count excludes source ZIPs, historical archives, and territories. All packages remain local under Git-ignored `PrivateData/`; only this inventory and the tooling are published to GitHub.',
    '',
    'The inventory verifier checks each package checksum and its feature counts against the manifest. Forty-three packages contain agency + iOverlander data, New York contains DEC + iOverlander only, and six packages use iOverlander alone because no eligible staged agency records are available.',
    '',
    `Totals: **${format(totals.agency)} agency/DEC features**, **${format(totals.ioverlander)} iOverlander places**, and **${format(totals.features)} features**. Counts do not establish current access, source completeness, or permission to redistribute.`,
    '',
    `New York also packages **${format(totals.hikeProfiles)} DEC trail elevation profiles**, verified against every packaged trail sample and statistic. Profiles describe existing trail features and are not added to the feature total. Florida includes 76 converted forest polygons; Oklahoma includes 44 historical state-park location points. See the [integration report](PRIVATE_PACKAGE_INTEGRATION_2026-09-27.md).`,
    '',
    'California combines both source packages. Connecticut and Massachusetts use their shared source package, filtered to each state boundary. The six fallback packages can add eligible agency data on a later rebuild; their agency permissions remain unchanged.',
    '',
    '| State | Package contents | Agency / DEC features | iOverlander places | Total |',
    '| --- | --- | ---: | ---: | ---: |',
    ...rows.map(
      (row) =>
        `| ${row.name} (${row.state}) | ${labels[row.packageMode]} | ${format(row.agency)} | ${format(row.ioverlander)} | ${format(row.total)} |`,
    ),
    '',
    '## Rebuild and verify',
    '',
    '```text',
    'node tools/build-private-state-agency-ioverlander.mjs --all',
    'node tools/report-private-state-packages.mjs',
    '```',
    '',
    'New York uses its separate reviewed DEC+iOverlander builder. Its civil boundary, NPS, and USFS data remain in the public system. Older private New York archives still contain historical copies of public features; archive cleanup remains a separate approval decision.',
    '',
  ].join('\n'),
);
console.log(
  JSON.stringify({
    packages: rows.length,
    ioverlanderOnly: rows.filter((row) => row.packageMode === 'ioverlander-only').length,
    ...totals,
  }),
);

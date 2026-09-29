#!/usr/bin/env node
import { deduplicatePrivateStatePackage } from './deduplicate-private-state-packages.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { verifyPrivateHikeProfiles } from './package-private-new-york-hikes.mjs';
import { validateOprhpPackage } from './package-private-new-york-agencies.mjs';
import { visitorSourceExclusion } from './state-visitor-source-scope.mjs';

const repository = resolve('.');
const root = join(repository, 'PrivateData/catalogs/US');
const registry = JSON.parse(await readFile('config/us-state-forestry-agencies.json', 'utf8'));
const rows = [];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const state of registry.states) {
  const current = join(root, state.name, 'current');
  const ny = state.code === 'NY';
  const dedup = await deduplicatePrivateStatePackage(repository, state.code, state.name, {
    verifyOnly: true,
  });
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
  if (collection.features.some((feature) => visitorSourceExclusion(feature.properties ?? {})))
    throw new Error(`${state.code}: excluded inventory, land-cover or planning source in package`);
  if (manifest.visitorReferences) {
    const reference = manifest.visitorReferences;
    const referenceBytes = await readFile(join(current, reference.file));
    const document = JSON.parse(referenceBytes);
    if (
      reference.bytes !== referenceBytes.length ||
      reference.sha256 !== sha256(referenceBytes) ||
      document.publicDistribution !== false ||
      document.classification !== 'PRIVATE_USER' ||
      document.state !== state.code ||
      document.profiles.length !== reference.profileCount ||
      reference.bindings.length !== reference.profileCount
    )
      throw new Error(`${state.code}: visitor reference checksum or classification mismatch`);
    for (const binding of reference.bindings) {
      const feature = collection.features.find((item) => item.id === binding.featureId);
      if (
        feature?.properties.agencyVisitorReference?.profileId !== binding.profileId ||
        feature.properties.agencyVisitorReference.publicDistribution !== false
      )
        throw new Error(`${state.code}: visitor reference feature binding mismatch`);
    }
  }
  const agency = collection.features.length - ioverlander;
  if (ny) validateOprhpPackage(manifest, collection.features);
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
        !String(feature.properties?.sourceId).startsWith('nys-dec-') &&
        !String(feature.properties?.sourceId).startsWith('nys-oprhp-'),
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
    duplicatesRemoved: dedup.removed,
    packageMode: ny
      ? manifest.oprhp?.featureCount
        ? 'dec-oprhp-and-ioverlander'
        : 'dec-and-ioverlander'
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
  'dec-oprhp-and-ioverlander': 'DEC + OPRHP + iOverlander',
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
    `The inventory verifier checks each package checksum and its feature counts against the manifest. ${rows.filter((r) => r.packageMode === 'agency-and-ioverlander').length} packages contain agency + iOverlander data, New York contains DEC + selected OPRHP + iOverlander, and ${rows.filter((r) => r.packageMode === 'ioverlander-only').length} packages use iOverlander alone because no eligible staged agency records are available.`,
    '',
    `Totals: **${format(totals.agency)} agency/DEC features**, **${format(totals.ioverlander)} iOverlander places**, and **${format(totals.features)} features**. Counts do not establish current access, source completeness, or permission to redistribute.`,
    '',
    'The [private/public deduplication report](PRIVATE_PUBLIC_STATE_DEDUPLICATION_2026-09-28.md) records same-state matches, retained counts, thresholds and recoverable private audit files. Rebuilds automatically apply these checks; inventory verification replays every match against the pinned public package.',
    '',
    'The [NC/LA visitor coverage update](NC_LA_VISITOR_COVERAGE_2026-09-28.md) records current NC forest selections and the checksum-bound Indian Creek agency visitor reference. Forestry inventory, land-cover and planning sources are excluded; Oklahoma tree-inventory records are removed from its active visitor package.',
    '',
    `New York also packages **${format(totals.hikeProfiles)} DEC trail elevation profiles**, verified against every packaged trail sample and statistic. Profiles describe existing trail features and are not added to the feature total. Florida includes 76 converted forest polygons; Oklahoma includes 44 historical state-park location points. See the [integration report](PRIVATE_PACKAGE_INTEGRATION_2026-09-27.md).`,
    '',
    'California combines both source packages. Connecticut and Massachusetts use their shared source package, filtered to each state boundary. Packages containing only iOverlander can add eligible agency data on a later rebuild; their agency permissions remain unchanged.',
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
    'node tools/deduplicate-private-state-packages.mjs --all',
    'node tools/report-private-state-packages.mjs',
    '```',
    '',
    'New York uses its separate reviewed DEC+iOverlander builder followed by `node tools/package-private-new-york-agencies.mjs`. Selected public-designated OPRHP trails and facilities, camping and park locators are private dated references. Unchanged park polygons and temporal feeds remain separate private reference snapshots. Its civil boundary, NPS, and USFS data remain in the public system. See [remaining-gap resolution](STATE_AGENCY_GAP_RESOLUTION_2026-09-28.md).',
    '',
  ].join('\n'),
);
await writeFile(
  'docs/PRIVATE_PUBLIC_STATE_DEDUPLICATION_2026-09-28.md',
  [
    '# Private packages deduplicated against public state packages',
    '',
    'All 50 active packages under Git-ignored `PrivateData/catalogs/US/<state>/current/` were compared only with the public package for the same state. Public data and its manifests remain unchanged. This report publishes counts only; original records, community narratives, match IDs and coordinates remain private.',
    '',
    `Removed **${format(rows.reduce((n, r) => n + r.duplicatesRemoved, 0))} duplicate private entries** across **${rows.filter((r) => r.duplicatesRemoved > 0).length} states**. Retained **${format(totals.features)} private features**: **${format(totals.agency)} agency/DEC/OPRHP records** and **${format(totals.ioverlander)} iOverlander places**. New York's reviewed identity catalog, map/index and 5,289 DEC profiles remain unchanged; it has zero qualifying public matches.`,
    '',
    'The public feature wins when both entries have the same normalized exact source-layer URL and external record ID with matching geometry dimension. Otherwise matching requires a meaningful normalized name, compatible POI categories and the same geometry dimension. Points must be within 25 meters. Lines and polygons must have bounds within 20 meters, length/area ratio at least 98%, and bidirectional vertex/midpoint-to-segment distances no greater than 20 meters. This accommodates public rounding and simplification. Generic names alone, nearby facilities, overlapping land parcels, and points inside park boundaries are insufficient.',
    '',
    'These are conservative automatic matches, not a claim that every semantic duplicate or alternate-name record has been resolved. Different representations and uncertain matches stay private for review. Rights, access and currency classifications are unchanged.',
    '',
    'Each private manifest pins the public GeoJSON checksum, policy version, output checksum, complete pre-deduplication input and match report. The ignored `before-public-dedup.geojson` and `public-dedup.private.json` preserve every original feature and removed private detail. Repeated runs replay the preserved input, so counts do not drift; a changed public package triggers reconciliation against that input. Raw sources are untouched. Builders apply deduplication after composition; inventory verification rejects stale public pins or a replay mismatch.',
    '',
    '| State | Private entries removed | Retained agency / DEC | Retained iOverlander | Retained total |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows.map(
      (r) =>
        `| ${r.name} (${r.state}) | ${format(r.duplicatesRemoved)} | ${format(r.agency)} | ${format(r.ioverlander)} | ${format(r.total)} |`,
    ),
    '',
    '## Rebuild and verify',
    '',
    '```text',
    'node tools/build-private-state-agency-ioverlander.mjs --all',
    'node tools/deduplicate-private-state-packages.mjs --all',
    'node tools/deduplicate-private-state-packages.mjs --verify',
    'node tools/report-private-state-packages.mjs',
    'node --test tools/private-public-dedup.test.mjs',
    '```',
    '',
    'New York keeps its separate reviewed builder. Future public matches affecting its identity catalog or DEC profile bindings require a coordinated rebuild; the tool fails before modifying that package. The current 50-state verification confirms no such matches.',
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

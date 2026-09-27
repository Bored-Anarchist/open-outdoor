import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const json = (path) => JSON.parse(read(path));
const registry = json('config/us-state-forestry-agencies.json');
const packageRoot = new URL('packages/map/src/assets/state-packages/US/', root);
const packageStates = readdirSync(packageRoot).filter((code) =>
  statSync(new URL(`${code}/`, packageRoot)).isDirectory(),
);
const firstPackage = json(
  `packages/map/src/assets/state-packages/US/${packageStates[0]}/manifest.json`,
);
const newYork = json('packages/map/src/assets/new-york-outdoors.manifest.json');
const worldBasemap = json('packages/map/src/assets/world-basemap.manifest.json');
const regionalBasemap = json('packages/map/src/assets/us-canada-basemap.manifest.json');
const connectedBasemap = json('packages/map/src/assets/openfreemap-liberty.manifest.json');
const hikes = json('packages/map/src/assets/new-york-hikes.manifest.json');

const escape = (value) =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
const link = (label, url) =>
  `[${escape(label)}](${String(url).replaceAll('(', '%28').replaceAll(')', '%29')})`;
const table = (head, rows) =>
  [head, head.map(() => '---'), ...rows]
    .map((row) => `| ${row.map(escape).join(' | ')} |`)
    .join('\n');

const registryRows = [];
for (const state of registry.states.filter((item) => item.code !== 'NY')) {
  for (const role of ['parks', 'forestry']) {
    registryRows.push([
      state.code,
      role,
      link(state[`${role}DataSourceName`], state[`${role}DataSourceUrl`]),
      state[`${role}DataSourceType`],
      'Primary candidate; no agency import',
    ]);
    for (const source of state[`${role}SupplementalDataSources`] ?? []) {
      const osm = /openstreetmap|geofabrik/i.test(`${source.name} ${source.url}`);
      registryRows.push([
        state.code,
        role,
        link(source.name, source.url),
        source.kind,
        osm ? 'OSM fallback; no agency import' : 'Supplemental candidate; no agency import',
      ]);
    }
  }
}

const planned =
  read('docs/STATE_DATA_PACKAGE_TRACKER.md')
    .split('### Planned Arkansas, Idaho, and South Dakota agency inputs')[1]
    ?.split('## State-by-state progress')[0]
    .split('\n')
    .filter((line) => /^\| (AR|ID|SD) \/ /.test(line))
    .map((line) => {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      return [cells[0], cells[1], cells[2], cells[4]];
    }) ?? [];

const nyCandidates = [
  [
    'NYS OPRHP',
    'Park polygons',
    'https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NYS_Park_Polygons/FeatureServer/0',
    'land-unit',
  ],
  [
    'NYS OPRHP',
    'Park trails',
    'https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Parks_Trails/FeatureServer/0',
    'trail',
  ],
  [
    'NYS OPRHP',
    'Park facilities',
    'https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Park_Facilities/FeatureServer',
    'place candidate',
  ],
  [
    'NYS OPRHP',
    'Park camping',
    'https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Parks_Camping/FeatureServer',
    'place candidate',
  ],
  [
    'NYS OPRHP',
    'Park points public view',
    'https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Park_Points_(public_view)/FeatureServer',
    'place candidate',
  ],
  [
    'NYS OPRHP',
    'Temporary trail closures',
    'https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Parks_Temporary_Trail_Closure/FeatureServer',
    'condition/restriction',
  ],
  [
    'NYS OPRHP',
    'Beach status',
    'https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Parks_Beach_Status/FeatureServer',
    'condition',
  ],
  [
    'NYS OPRHP',
    '2025–26 snowmobile view',
    'https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/2025_2026_Snowmobile_Data_view/FeatureServer',
    'seasonal trail/condition',
  ],
];

const categoryIds = new Set([
  'campsite',
  'informal_campsite',
  'wild_campsite',
  'farm',
  'hotel',
  'hostel',
  'gas_station',
  'propane',
  'mechanic',
  'water',
  'sanitation_dump',
  'shorterm_parking',
  'ecofriendly',
  'restaurant',
  'tourist_attraction',
  'shopping',
  'financial',
  'wifi',
  'medical',
  'pet_services',
  'laundry',
  'showers',
  'customs_immigration',
  'checkpoint',
  'consulate',
  'vehicle_insurance',
  'vehicle_shipping',
  'vehicle_storage',
  'road_report',
  'warning',
  'overnight-prohibited',
  'other',
]);
const decCategories = new Set([
  'PRIMITIVE CAMPSITE',
  'CAMPSITE',
  'ACCESSIBLE CAMPSITE',
  'CAMPGROUND',
  'LEAN-TO',
  'UNPAVED PARKING LOT',
  'PAVED PARKING LOT',
  'ACCESSIBLE PARKING LOT',
  'ACCESSIBLE PARKING SPACE',
  'PULL-OFF',
  'PICNIC SITE',
  'PICNIC PAVILION',
  'ACCESSIBLE PICNIC TABLE',
  'ACCESSIBLE PICNIC AREA',
  'DAY USE AREA',
  'SCENIC VISTA',
  'FIRE TOWER',
]);
const metrics = [];
const sourceMetrics = new Map();
for (const code of packageStates) {
  const index = json(`packages/map/src/assets/state-packages/US/${code}/index.json`);
  const manifest = json(`packages/map/src/assets/state-packages/US/${code}/manifest.json`);
  let pois = 0;
  let displayedOther = 0;
  for (const feature of index.features) {
    if (feature.properties.kind !== 'poi') continue;
    pois++;
    const category = feature.properties.category ?? '';
    const unmapped =
      !categoryIds.has(category.toLowerCase()) && !decCategories.has(category.toUpperCase());
    if (unmapped) displayedOther++;
    const source = sourceMetrics.get(feature.properties.sourceId) ?? { pois: 0, displayedOther: 0 };
    source.pois++;
    if (unmapped) source.displayedOther++;
    sourceMetrics.set(feature.properties.sourceId, source);
  }
  const importLimit =
    index.features.length > 20_000 || manifest.artifacts.geojson.bytes > 20 * 1024 * 1024;
  metrics.push([
    code,
    pois,
    displayedOther,
    importLimit ? 'Over size/feature limit' : 'Within tested limits',
  ]);
}
const total = [...sourceMetrics.values()].reduce(
  (acc, item) => ({
    pois: acc.pois + item.pois,
    displayedOther: acc.displayedOther + item.displayedOther,
  }),
  { pois: 0, displayedOther: 0 },
);

const sections = [
  '# Complete outdoor dataset tracker',
  '',
  '**Snapshot:** 2026-09-26. This is the single index of every registered non-New-York state source role, all shipped state-package source families, the shipped New York source records, the selected AR/ID/SD layer plan, the identified New York OPRHP candidates, and the remaining map asset manifests. Repeated URLs remain repeated where two agency roles use the same dataset. A candidate or catalog entry is not a shipped layer or release approval.',
  '',
  `**Inventory counts:** ${packageStates.length} state packages; ${firstPackage.sources.length} national source families; ${newYork.sources.length} New York package source records; ${registryRows.length} registry source-role entries (98 primary agency, 44 non-OSM supplements, 70 OSM fallbacks); ${planned.length} selected AR/ID/SD plan rows; ${nyCandidates.length} OPRHP service candidates; two offline basemap manifests, one derived hike-profile manifest, one connected style manifest, and a proposed New York OSM extract. Rights findings remain in the [agency rights matrix](STATE_AGENCY_REDISTRIBUTION_RIGHTS_2026-09-26.md), [three-state rights check](ID_AR_SD_REDISTRIBUTION_RIGHTS_2026-09-26.md), and [New York audit](NYS_AGENCY_SOURCE_COVERAGE_AUDIT.md).`,
  '',
  '**Feed connectors:** The [gated agency feed connector](STATE_AGENCY_FEED_CONNECTORS.md) exposes these registry entries and selected three-state layers as source definitions. Exact ArcGIS layers and direct downloads require a source-specific private approval before feature or file acquisition. No agency records are included in public packages by that code.',
  '',
  '## POI-system gate',
  '',
  `The shipped 49 state packages contain **${total.pois.toLocaleString()} point-of-interest entries**. The current map category mapper displays **${total.displayedOther.toLocaleString()} (${((100 * total.displayedOther) / total.pois).toFixed(1)}%)** as Other because source categories were not mapped to the display taxonomy. This is a category/filter/icon problem, not a geometry failure. These counts are package entries, so cross-border duplicate features can appear in more than one state. The state packages are map GeoJSON/index assets, not canonical PlaceRecord envelopes. Before accepting a new agency or OSM point feed, map its categories to the canonical place taxonomy and current display filters, retain raw category/provenance, validate names/coordinates/status, and keep closures/restrictions in their separate temporal records.`,
  '',
  `**Import limit:** ${metrics.filter((row) => row[3] !== 'Within tested limits').length} state GeoJSON files exceed the current 20 MiB or 20,000-feature user-import limit. Split them or provide a package-specific loader before offering those files through the user-import flow. The other files were not run through every parser check, including the coordinate-count and normalized-size limits.`,
  '',
  '### Shipped national POI source families',
  '',
  table(
    ['Source ID', 'POI entries', 'Displayed as Other', 'Readiness'],
    [...sourceMetrics].map(([id, item]) => [
      id,
      item.pois.toLocaleString(),
      item.displayedOther.toLocaleString(),
      'Category mapping needed',
    ]),
  ),
  '',
  '### State package POI and import status',
  '',
  table(['State', 'POI entries', 'Displayed as Other', '20 MiB / 20,000-feature gate'], metrics),
  '',
  '## Shipped national source families in every state manifest',
  '',
  table(
    ['Source ID', 'Dataset', 'Stage', 'POI-system role'],
    firstPackage.sources.map((source) => [
      source.id,
      link(source.label ?? source.id, source.url),
      'Shipped in applicable state packages',
      sourceMetrics.has(source.id)
        ? 'Point feed; category mapping needed'
        : 'Land/line context; not a POI point feed',
    ]),
  ),
  '',
  '## Shipped New York package sources',
  '',
  'The current public manifest lists only federal feeds and operational alerts. Historical DEC records and trail-derived profiles are preserved under ignored PrivateData pending rights review; see the [New York audit](NYS_AGENCY_SOURCE_COVERAGE_AUDIT.md).',
  '',
  table(
    ['Source ID', 'Dataset', 'Stage'],
    newYork.sources.map((source) => [
      source.id,
      link(source.label ?? source.id, source.url),
      'In existing New York package; rights and freshness vary',
    ]),
  ),
  '',
  '## Registered parks, forestry, and OSM source roles',
  '',
  'These are the complete source roles in `config/us-state-forestry-agencies.json` outside New York. An API or download candidate still needs layer-level POI/route/land classification, category mapping, rights, completeness, and currentness review. A catalog or information page needs an exact dataset before import. OSM rows are community fallbacks under ODbL; they do not become agency-verified by spatial join.',
  '',
  table(['State', 'Agency role', 'Dataset or lead', 'Source type', 'Stage'], registryRows),
  '',
  '## Selected AR/ID/SD agency layer plan',
  '',
  'These rows repeat the selected plan for visibility. No selected agency layer is in a shipped state package. The [package tracker](STATE_DATA_PACKAGE_TRACKER.md#planned-arkansas-idaho-and-south-dakota-agency-inputs) has filters, counts, dates, and gates.',
  '',
  table(['State / manager', 'Exact dataset', 'Planned POI-system use', 'Rights and gate'], planned),
  '',
  '## New York OPRHP candidates',
  '',
  'These sources are not bundled. The [New York audit](NYS_AGENCY_SOURCE_COVERAGE_AUDIT.md) records coverage, vintage, and redistribution concerns.',
  '',
  table(
    ['Agency', 'Dataset', 'Direct source', 'Canonical role to assess'],
    nyCandidates.map(([agency, name, url, role]) => [agency, name, link(name, url), role]),
  ),
  '',
  '## Other map and derived datasets',
  '',
  table(
    ['Asset / source', 'Stage', 'POI-system status'],
    [
      [
        link(
          'World overview PMTiles manifest',
          '../packages/map/src/assets/world-basemap.manifest.json',
        ) +
          ' · ' +
          link('Protomaps source', worldBasemap.source),
        'Bundled OSM/Natural Earth map context',
        'Cartographic POIs are not canonical place records.',
      ],
      [
        link(
          'US/Canada regional PMTiles manifest',
          '../packages/map/src/assets/us-canada-basemap.manifest.json',
        ) +
          ' · ' +
          link('Protomaps source', regionalBasemap.source),
        'Bundled OSM/Natural Earth map context',
        'Cartographic POIs are not agency inventory.',
      ],
      [
        link(
          'New York hike profiles manifest',
          '../packages/map/src/assets/new-york-hikes.manifest.json',
        ) +
          ' · ' +
          link('Mapzen terrain source', 'https://registry.opendata.aws/terrain-tiles/'),
        `${hikes.featureCount} public trail profiles after moving DEC derivatives to PrivateData`,
        'The historical 5,289 DEC trail profiles are retained only in the private archive.',
      ],
      [
        link(
          'OpenFreeMap Liberty style manifest',
          '../packages/map/src/assets/openfreemap-liberty.manifest.json',
        ) +
          ' · ' +
          link('style source', connectedBasemap.source),
        'Connected-only map style',
        'Online cartography, not a validated POI inventory.',
      ],
      [
        link(
          'New York Geofabrik OSM extract',
          'https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf',
        ),
        'Proposed detailed-basemap/visitor-feature candidate',
        'Not in a shipped state overlay; apply ODbL and tag-to-taxonomy mapping before separate POI use.',
      ],
    ],
  ),
  '',
  '## Maintenance rule',
  '',
  'Regenerate this file with `node tools/build-dataset-tracker.mjs` when the registry, shipped package manifests/indexes, or selected three-state plan changes. Update the hard-coded OPRHP candidate list in that script when the New York audit changes. Historical validation snapshots retain their original observations; current decisions belong in the linked audits.',
  '',
];

writeFileSync(new URL('docs/ALL_DATASETS_TRACKER.md', root), sections.join('\n'));

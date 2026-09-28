import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile as writeTemporary, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicPoiCategory } from '../packages/shared/dist/public-poi-category.js';
import { ioverlanderCategoryIds } from '../packages/shared/dist/ioverlander.js';
import { normalizeOutdoorVisitorDetails } from '../packages/shared/dist/outdoor-details.js';

const root = resolve(import.meta.dirname, '..');
const assets = join(root, 'packages/map/src/assets');
const packagesRoot = join(assets, 'state-packages/US');
const staging = join(root, '.tmp-public-agency');
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const bytes = (value) => Buffer.from(JSON.stringify(value) + '\n');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
async function writeFile(path, data) {
  const temporary = path + '.tmp-public-package';
  await writeTemporary(temporary, data);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rename(temporary, path);
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}
export const importPartLimits = { bytes: 12 * 1024 * 1024, features: 10000, positions: 180000 };

export function geometryStats(geometry) {
  const bounds = [180, 90, -180, -90];
  let positions = 0;
  function visit(value) {
    if (!Array.isArray(value) || !value.length) throw new Error('Empty geometry');
    if (typeof value[0] === 'number') {
      if (
        value.length < 2 ||
        value.length > 3 ||
        !value.every(Number.isFinite) ||
        Math.abs(value[0]) > 180 ||
        Math.abs(value[1]) > 90
      )
        throw new Error('Invalid WGS84 position');
      positions++;
      bounds[0] = Math.min(bounds[0], value[0]);
      bounds[1] = Math.min(bounds[1], value[1]);
      bounds[2] = Math.max(bounds[2], value[0]);
      bounds[3] = Math.max(bounds[3], value[1]);
    } else value.forEach(visit);
  }
  if (
    !['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(
      geometry?.type,
    )
  )
    throw new Error('Unsupported geometry');
  visit(geometry.coordinates);
  return { bounds, positions };
}

export function normalizePublicFeature(feature, allowedSources) {
  const p = feature.properties;
  if (
    !p ||
    p.origin === 'private-catalog' ||
    /^private|nys-dec|nys-oprhp/i.test(String(p.sourceId)) ||
    !allowedSources.has(p.sourceId) ||
    (p.rightsStatus && p.rightsStatus !== 'Supported') ||
    ['communityDescription', 'communityCheckIns', 'communityCheckInCount'].some((key) => key in p)
  )
    throw new Error(`Public feature crosses source boundary: ${feature.id}`);
  geometryStats(feature.geometry);
  const sourceCategory = String(p.sourceCategory ?? p.category ?? 'other');
  const category = p.kind === 'poi' ? publicPoiCategory(sourceCategory) : p.category;
  const visitor = normalizeOutdoorVisitorDetails({
    ...p,
    description: p.description ?? p.details?.description ?? p.details?.importantInfo,
    amenities: [
      ...(p.amenities ?? []),
      ...(/toilet|restroom|privy/i.test(sourceCategory)
        ? ['Toilet (source designation; current availability unknown)']
        : []),
    ],
  });
  return {
    ...feature,
    properties: {
      ...p,
      ...visitor,
      id: String(feature.id ?? p.id),
      sourceCategory,
      category,
      origin: 'public-catalog',
    },
  };
}

function field(properties, names) {
  const lookup = new Map(Object.entries(properties).map(([k, v]) => [k.toLowerCase(), v]));
  for (const name of names) {
    const value = lookup.get(name.toLowerCase());
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return '';
}
export function publicAgencyFeature(source, feature, index) {
  if (!feature.geometry) return null;
  geometryStats(feature.geometry);
  const p = feature.properties ?? {};
  const t = feature.geometry.type;
  const kind = /Point$/.test(t) ? 'poi' : /Polygon$/.test(t) ? 'land' : 'trail';
  const nativeId =
    field(p, [source.idField ?? 'OBJECTID', 'OBJECTID', 'FID', 'GlobalID']) ||
    String(feature.id ?? index);
  const id = `public-agency:${source.id}:${nativeId}`;
  let name =
    field(p, [
      'ACCSS_NAME',
      'NAME',
      'PROPERTY',
      'TRAILNAME',
      'Trail_Name',
      'PrimaryName',
      'trailname',
      'SITE_NAME',
      'AreaName',
      'FACILITY_NAME',
      'fname',
      'PARK_NAME',
      'SITE',
      'SITE_NM',
      'OS_NAME',
      'LABEL',
      'TRAILSYSID',
      'ROADNAME',
    ]) || `${source.name} ${nativeId}`;
  const rawType =
    field(p, [
      'POITYPE',
      'TYPE',
      'TYPE_DESC',
      'FEATURE',
      'FEATURETYPE',
      'POINTTYPE',
      'PROP_TYPE',
      'LOCATION_TYPE',
      'PT_TYPE',
      'ftype',
      'fcat',
      'TRAILCLASS',
      'CLASS',
    ]) || (kind === 'poi' && source.id === 'ct-deep-access' ? 'access point' : kind);
  if (
    source.id === 'ma-dcr-points' &&
    !/parking|picnic|camp|toilet|restroom|water|trailhead|trail head|sign|kiosk|bench|entrance/i.test(
      rawType,
    )
  )
    return null;
  if (name === `${source.name} ${nativeId}`) name = `${rawType} ${nativeId}`;
  const description = field(p, [
    'DESCRIPTION',
    'fdescrip',
    'COMMENTS',
    'NOTES',
    'TRAILCOMMENTS',
    'RESTRICTIONS',
  ]);
  const category =
    kind === 'poi' ? publicPoiCategory(rawType) : kind === 'land' ? 'public-land' : 'trail';
  const amenities = /toilet|restroom|privy/i.test(rawType)
    ? ['Toilet (source designation; current availability unknown)']
    : [];
  const visitorFields = {
    HIKING: 'Hiking',
    PICNIC: 'Picnic facilities',
    CABINS: 'Cabins',
    CAMPGROUND: 'Campground',
    BIKE_PAVED: 'Paved cycling',
    BIKE_UNPVD: 'Unpaved cycling',
    FISH_FRESH: 'Freshwater fishing',
  };
  for (const [key, label] of Object.entries(visitorFields))
    if (String(p[key]).toLowerCase() === 'yes') amenities.push(`${label} (source designation)`);
  return {
    type: 'Feature',
    id,
    geometry: feature.geometry,
    properties: {
      id,
      kind,
      name,
      category,
      sourceCategory: rawType,
      origin: 'public-catalog',
      sourceId: source.id,
      sourceUrl: source.url,
      unit: field(p, ['PROPERTY', 'PropName', 'SITE_NAME']) || source.name,
      sourceUpdated: source.sourceUpdated,
      publicUse:
        'Dated agency reference; current visitor access, camping permission and closures are unknown. Verify with the manager.',
      rightsStatus: 'Supported',
      reviewStatus: 'dated-reference',
      details: {
        sourceStatus: field(p, ['STATUS', 'TRAILSTAT']),
        sourceAccess: field(p, ['PUBACCESS', 'PUB_ACCESS', 'ACCESS']),
        manager: field(p, ['MANAGER', 'OwnerSteward']),
      },
      ...normalizeOutdoorVisitorDetails({ description, amenities }),
    },
  };
}

export function importFeature(feature) {
  const p = feature.properties;
  const keys = [
    'id',
    'name',
    'kind',
    'category',
    'sourceCategory',
    'sourceId',
    'sourceUrl',
    'sourceUpdated',
    'publicUse',
    'unit',
    'origin',
    'description',
    'directionsInfo',
    'amenities',
    'openingHours',
    'fees',
  ];
  return {
    ...feature,
    properties: Object.fromEntries(keys.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])),
  };
}

/** Split by all three parser limits, without silently dropping or simplifying geometry. */
export function splitImportParts(features, limits = importPartLimits) {
  const parts = [];
  let part = [];
  let size = 42;
  let positions = 0;
  function add(feature) {
    const stats = geometryStats(feature.geometry);
    const length = bytes(feature).length;
    if (
      stats.positions > limits.positions &&
      ['MultiPolygon', 'MultiLineString', 'MultiPoint'].includes(feature.geometry.type)
    ) {
      const type = feature.geometry.type.slice(5);
      feature.geometry.coordinates.forEach((coordinates, i) =>
        add({
          ...feature,
          id: `${feature.id}:geometry-part:${i}`,
          geometry: { type, coordinates },
          properties: {
            ...feature.properties,
            id: `${feature.id}:geometry-part:${i}`,
            parentFeatureId: feature.id,
          },
        }),
      );
      return;
    }
    if (stats.positions > limits.positions || length + 42 > limits.bytes)
      throw new Error(`Single geometry exceeds import limits: ${feature.id}`);
    if (
      part.length &&
      (part.length >= limits.features ||
        positions + stats.positions > limits.positions ||
        size + length > limits.bytes)
    ) {
      parts.push(part);
      part = [];
      size = 42;
      positions = 0;
    }
    part.push(feature);
    size += length + 1;
    positions += stats.positions;
  }
  features.forEach((f) => add(importFeature(f)));
  if (part.length) parts.push(part);
  return parts;
}

function indexFor(features) {
  return {
    schemaVersion: 1,
    features: features.map((f) => ({
      id: f.id,
      bounds: geometryStats(f.geometry).bounds,
      properties: importFeature(f).properties,
    })),
  };
}
export async function readPublicAgency(state, config) {
  const features = [];
  const sources = [];
  const held = config.held.filter((x) => x.state === state);
  for (const source of config.sources.filter((x) => x.state === state)) {
    const directory = join(staging, source.id);
    let receipt;
    receipt = await json(join(directory, 'receipt.json'));
    if (
      receipt.publicDistribution !== true ||
      receipt.rightsStatus !== 'Supported' ||
      receipt.url !== source.url
    )
      throw new Error('Invalid public agency receipt');
    const raw = await readFile(join(directory, 'raw.geojson'));
    if (sha256(raw) !== receipt.sha256 || raw.length !== receipt.bytes)
      throw new Error('Public agency checksum mismatch');
    const doc = JSON.parse(raw);
    if (doc.features.length !== receipt.featureCount)
      throw new Error('Agency receipt count mismatch');
    const rejected = [];
    const converted = doc.features
      .map((f, i) => {
        try {
          geometryStats(f.geometry);
        } catch (error) {
          rejected.push({ id: f.id ?? i, reason: String(error) });
          return null;
        }
        return publicAgencyFeature(receipt, f, i);
      })
      .filter(Boolean);
    features.push(...converted);
    sources.push({
      ...receipt,
      packagedFeatureCount: converted.length,
      filteredFeatureCount: receipt.featureCount - converted.length,
      geometryRejections: { count: rejected.length, sha256: sha256(JSON.stringify(rejected)) },
      ...(source.id === 'ma-dcr-points'
        ? {
            selection:
              'Visitor parking, picnic, camping, toilet, water, sign/kiosk, bench and entrance points only; maintenance defects, survey boundaries and intersections excluded.',
          }
        : {}),
    });
  }
  return { features, sources, held };
}

export async function buildPublicState(state, config, parser) {
  const directory = join(packagesRoot, state.code);
  await mkdir(directory, { recursive: true });
  const newYork = state.code === 'NY';
  const baseManifest = await json(
    newYork ? join(assets, 'new-york-outdoors.manifest.json') : join(directory, 'manifest.json'),
  );
  if (
    baseManifest.classification !== 'SOURCE_REDISTRIBUTABLE' ||
    baseManifest.rights?.redistribution !== true
  )
    throw new Error(`${state.code}: base is not redistributable`);
  const raw = await readFile(
    newYork ? join(assets, 'new-york-outdoors.geojson') : join(directory, 'outdoors.geojson'),
  );
  const expected = newYork ? baseManifest.sha256 : baseManifest.artifacts.geojson.sha256;
  if (sha256(raw) !== expected) throw new Error(`${state.code}: base package checksum mismatch`);
  const allowed = new Set(baseManifest.sources.map((s) => s.id));
  const doc = JSON.parse(raw);
  // Rebuild agency additions from receipts, so repeated runs never duplicate them.
  const base = doc.features.filter(
    (f) =>
      !String(f.properties.sourceId).startsWith('public-agency:') &&
      !config.sources.some((s) => s.id === f.properties.sourceId),
  );
  const agency = await readPublicAgency(state.code, config);
  for (const source of agency.sources) allowed.add(source.id);
  const features = [...base, ...agency.features]
    .map((f) => normalizePublicFeature(f, allowed))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (new Set(features.map((f) => f.id)).size !== features.length)
    throw new Error(`${state.code}: duplicate IDs`);
  const geo = bytes({ type: 'FeatureCollection', features });
  const idx = bytes(indexFor(features));
  const parts = splitImportParts(features);
  const partDescriptors = [];
  const partDir = join(directory, 'parts');
  await mkdir(partDir, { recursive: true });
  for (let i = 0; i < parts.length; i++) {
    const partBytes = bytes({ type: 'FeatureCollection', features: parts[i] });
    const hash = sha256(partBytes);
    const parsed = parser(partBytes.toString(), hash, `${state.name} part ${i + 1}`);
    const file = `parts/outdoors-${String(i + 1).padStart(3, '0')}.geojson`;
    const count = parts[i].length;
    const positions = parts[i].reduce((total, f) => total + geometryStats(f.geometry).positions, 0);
    await writeFile(join(directory, file), partBytes);
    partDescriptors.push({
      file,
      featureCount: count,
      normalizedFeatureCount: parsed.collection.features.length,
      positions,
      bytes: partBytes.length,
      sha256: hash,
      parserValidation: 'passed',
    });
  }
  const categoryCounts = {};
  let poi = 0;
  for (const f of features.filter((f) => f.properties.kind === 'poi')) {
    poi++;
    categoryCounts[f.properties.category] = (categoryCounts[f.properties.category] ?? 0) + 1;
  }
  const nationalSources = baseManifest.sources.filter(
    (s) => !config.sources.some((c) => c.id === s.id),
  );
  const sources = [...nationalSources, ...agency.sources];
  for (const source of sources) {
    source.packagedFeatureCount = features.filter(
      (f) => f.properties.sourceId === source.id,
    ).length;
    source.packagedFeatureSha256 = sha256(
      JSON.stringify(features.filter((f) => f.properties.sourceId === source.id)),
    );
  }
  const full = {
    file: 'outdoors.geojson',
    featureCount: features.length,
    bytes: geo.length,
    sha256: sha256(geo),
  };
  const manifest = {
    ...baseManifest,
    schemaVersion: 1,
    packageId: `outdoor-${state.code.toLowerCase()}`,
    state: { code: state.code, fips: state.fips, name: state.name },
    stateName: state.name,
    classification: 'SOURCE_REDISTRIBUTABLE',
    distribution: 'public',
    publicDistribution: true,
    packageMode: agency.features.length ? 'federal-and-agency' : 'public-baseline',
    generatedAt: new Date().toISOString(),
    coordinateReferenceSystem: 'EPSG:4326',
    featureCount: features.length,
    output: full,
    artifacts: {
      geojson: full,
      index: { file: 'index.json', bytes: idx.length, sha256: sha256(idx) },
    },
    sources,
    agency: {
      status: agency.features.length ? 'included' : 'no-eligible-staged-feed',
      sourceCount: agency.sources.length,
      featureCount: agency.features.length,
      sources: agency.sources.map((s) => ({
        id: s.id,
        url: s.url,
        count: s.packagedFeatureCount,
        license: s.license,
        attribution: s.attribution,
        sourceUpdated: s.sourceUpdated,
      })),
      held: agency.held,
    },
    poi: {
      taxonomy: 'iOverlander-compatible; PROJECT_SCOPE.md 12.1',
      categoryIds: ioverlanderCategoryIds,
      featureCount: poi,
      categoryCounts,
      recordsFromIoverlander: false,
      unknownTypesPreserved: true,
    },
    import: {
      parts: partDescriptors,
      allPartsParserValidated: true,
      maximumActiveDatasets: 5,
      maximumCombinedStoreBytes: 50 * 1024 * 1024,
      simultaneousWholeStateActivation: 'Not guaranteed; select parts within the app store limits.',
    },
    rights: {
      ...baseManifest.rights,
      offlineStorage: true,
      redistribution: true,
      attribution: [
        ...new Set([
          ...(baseManifest.rights.attribution ?? []),
          ...agency.sources.map((s) => s.attribution),
        ]),
      ],
      sourceTerms: [
        ...new Map(
          [
            ...(baseManifest.rights.sourceTerms ?? []),
            ...agency.sources.map((s) => ({
              id: s.id,
              url: s.termsUrl ?? s.url,
              license: s.license,
              licenseUrl: s.licenseUrl ?? null,
            })),
          ].map((item) => [`${item.id}|${item.url}`, item]),
        ).values(),
      ],
    },
    coverage: {
      ...(typeof baseManifest.coverage === 'object' ? baseManifest.coverage : {}),
      content:
        'Public national baseline plus independently eligible agency snapshots; point categories normalized, land/trails/roads retained separately.',
      limitations: [
        'Dated informational references, not live permission, closure or camping claims.',
        'Some states have no eligible direct agency feed; source gaps remain explicit.',
        'No iOverlander records, DEC held data, OPRHP records, or permission-limited agency data.',
      ],
    },
  };
  const noticeText = Buffer.from(
    `# ${state.name} public data notices\n\n${agency.sources.map((s) => `## ${s.name}\n\nCredit: ${s.attribution}\n\nLicense: ${s.license}${s.licenseUrl ? ` (${s.licenseUrl})` : ''}\n\nSource: ${s.url}\n\nTerms: ${s.termsUrl ?? s.url}\n\nModifications: ${s.modifications}\n\n${s.disclaimer ?? s.licenseText ?? ''}\n`).join('\n')}\nNational and other public-source attributions and terms are recorded in manifest.json. Snapshot geometry is informational; current access and camping permission must be verified with the manager.\n`,
  );
  manifest.artifacts.notices = {
    file: 'DATA_NOTICES.md',
    bytes: noticeText.length,
    sha256: sha256(noticeText),
  };
  await writeFile(join(directory, 'DATA_NOTICES.md'), noticeText);
  if (manifest.stateForestry) {
    manifest.stateForestry.directAgencyLayerIncluded = agency.sources.length > 0;
    manifest.stateForestry.followUp =
      'See agency source receipts and held-source decisions in this manifest.';
  }
  await writeFile(join(directory, 'outdoors.geojson'), geo);
  await writeFile(join(directory, 'index.json'), idx);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  // Remove only obsolete generated part files under this exact state package.
  const active = new Set(partDescriptors.map((x) => x.file.split('/').at(-1)));
  const { unlink } = await import('node:fs/promises');
  for (const name of await readdir(partDir))
    if (/^outdoors-\d{3}\.geojson$/.test(name) && !active.has(name))
      await unlink(join(partDir, name));
  if (newYork) {
    // Keep the default app asset and the private composer's public map binding in sync.
    await writeFile(join(assets, 'new-york-outdoors.geojson'), geo);
    await writeFile(join(assets, 'new-york-outdoors.index.json'), idx);
    const nyManifest = {
      ...baseManifest,
      sha256: sha256(geo),
      bytes: geo.length,
      indexSha256: sha256(idx),
      indexBytes: idx.length,
      featureCount: features.length,
      sources,
      publicStatePackage: 'state-packages/US/NY/manifest.json',
      poi: manifest.poi,
    };
    await writeFile(
      join(assets, 'new-york-outdoors.manifest.json'),
      JSON.stringify(nyManifest, null, 2) + '\n',
    );
    const hikes = await json(join(assets, 'new-york-hikes.json'));
    if (Object.keys(hikes.hikes ?? {}).length)
      throw new Error('Public New York still has held hike profiles');
    hikes.sourceSha256 = sha256(geo);
    const hikeBytes = bytes(hikes);
    const hikeManifest = await json(join(assets, 'new-york-hikes.manifest.json'));
    await writeFile(join(assets, 'new-york-hikes.json'), hikeBytes);
    await writeFile(
      join(assets, 'new-york-hikes.manifest.json'),
      JSON.stringify(
        {
          ...hikeManifest,
          sourceSha256: sha256(geo),
          sha256: sha256(hikeBytes),
          bytes: hikeBytes.length,
        },
        null,
        2,
      ) + '\n',
    );
  }
  return {
    state: state.code,
    name: state.name,
    features: features.length,
    poi,
    other: categoryCounts.other ?? 0,
    agency: agency.features.length,
    agencySources: agency.sources.length,
    parts: parts.length,
    bytes: geo.length,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { parseMapDataset } = await import('../dist/public-state-parser/parser.mjs');
  const config = await json(join(root, 'config/public-state-agency-sources.json'));
  const states = (await json(join(root, 'config/us-state-forestry-agencies.json'))).states;
  const results = [];
  for (const state of states) {
    const r = await buildPublicState(state, config, parseMapDataset);
    results.push(r);
    console.log(JSON.stringify(r));
  }
  if (results.length !== 50) throw new Error('Expected exactly fifty public state packages');
  const inventory = {
    schemaVersion: 1,
    classification: 'SOURCE_REDISTRIBUTABLE',
    publicDistribution: true,
    generatedAt: new Date().toISOString(),
    states: results,
    totals: results.reduce((a, r) => {
      for (const k of ['features', 'poi', 'other', 'agency', 'agencySources', 'parts'])
        a[k] = (a[k] ?? 0) + r[k];
      return a;
    }, {}),
  };
  await writeFile(join(packagesRoot, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
  const rows = results
    .map(
      (r) =>
        `| ${r.state} | ${r.name} | ${r.features.toLocaleString('en-US')} | ${r.poi.toLocaleString('en-US')} | ${r.other.toLocaleString('en-US')} | ${r.agency.toLocaleString('en-US')} | ${r.parts} |`,
    )
    .join('\n');
  await writeFile(
    join(root, 'docs/PUBLIC_STATE_PACKAGE_INVENTORY_2026-09-27.md'),
    `# Public state package inventory\n\nAll 50 states use a public GeoJSON, search index, and checksum manifest following the private system's package structure. Only redistributable public inputs are used. The iOverlander legend is a taxonomy; no iOverlander records, descriptions, reviews or check-ins are included.\n\nGenerated by \`pnpm map:public:package\`. Every import part passed the real app GeoJSON parser, including byte, coordinate, geometry, expanded-feature and normalized-size checks. Parts can be selected separately; the app still permits only five active imports and 50 MiB total stored imports. Complete-state simultaneous activation is not claimed.\n\nThe full \`outdoors.geojson\` preserves source details and provenance; \`parts/\` contains bounded visitor properties with unchanged geometry (oversized multipart geometry is separated with parent IDs). Unknown source categories remain Other, with raw type and available amenities preserved. Source category, not name, drives classification; primitive campsites and developed campgrounds remain distinct.\n\n| State | Name | Features | POIs | Other POIs | Direct agency features | Import parts |\n| --- | --- | ---: | ---: | ---: | ---: | ---: |\n${rows}\n\nTotals: **${inventory.totals.features.toLocaleString('en-US')} features**, **${inventory.totals.poi.toLocaleString('en-US')} POIs**, **${inventory.totals.other.toLocaleString('en-US')} Other POIs**, **${inventory.totals.agency.toLocaleString('en-US')} direct agency features**, **${inventory.totals.parts} validated parts**. Cross-border national features may occur in neighboring state packages; these are package entries, not unique national entities.\n\nAgency receipts record source URLs, current terms checksums, query inventory, field list, edit dates, page checksums, attribution and modifications. Repeated parks/forestry roles ingest a feed only once. Permission-limited, conditional and unconfirmed sources remain excluded. Arkansas facilities, CAL FIRE 2024 boundaries, and Massachusetts's 2015 trails are explicitly dated references; current access and completeness are not asserted. These snapshots make no current access or camping claim.\n\nNew York has the same state package format and a synchronized default app asset. It contains the civil boundary and federal records only; DEC data and their 5,289 profiles remain private. The empty public hike document is rebound to the corrected public map checksum.\n`,
  );
  console.log('TOTALS', JSON.stringify(inventory.totals));
}

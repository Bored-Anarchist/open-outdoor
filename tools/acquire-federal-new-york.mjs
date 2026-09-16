#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';

const STATE_CODE = 'NY';
const NEW_YORK_ENVELOPE = '-79.7624,40.4774,-71.7517,45.0159';
const USFS_SURFACE =
  'https://apps.fs.usda.gov/ArcX/rest/services/EDW/EDW_SurfaceOwnership_01/MapServer/0';
const USFS_RECREATION =
  'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecInfraRecreationSites_02/MapServer/0';
const USFS_MVUM_ROADS = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_02/MapServer/1';
const USFS_MVUM_TRAILS = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_02/MapServer/2';
const BLM_MANAGED_LANDS =
  'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_LimitedScale/MapServer/1';

function argumentsByName(values) {
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`invalid argument near ${name ?? '<end>'}`);
    }
    parsed.set(name.slice(2), value);
  }
  return parsed;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fetchJson(url) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Open-Outdoor private catalog acquisition',
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (response.ok) return response.json();
    if (![429, 502, 503, 504].includes(response.status) || attempt === 4) {
      throw new Error(`federal ArcGIS request failed (${response.status}): ${url}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_500 * 2 ** attempt));
  }
  throw new Error(`federal ArcGIS retry loop ended unexpectedly: ${url}`);
}

async function queryArcgis(endpoint, where, outFields) {
  const url = new URL(`${endpoint}/query`);
  url.searchParams.set('where', where);
  url.searchParams.set('geometry', NEW_YORK_ENVELOPE);
  url.searchParams.set('geometryType', 'esriGeometryEnvelope');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  url.searchParams.set('outFields', outFields.join(','));
  url.searchParams.set('returnGeometry', 'true');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('resultRecordCount', '2000');
  url.searchParams.set('f', 'geojson');
  const document = await fetchJson(url);
  if (document.type !== 'FeatureCollection' || !Array.isArray(document.features)) {
    throw new Error(`ArcGIS response is not GeoJSON: ${endpoint}`);
  }
  if (document.exceededTransferLimit) {
    throw new Error(`ArcGIS result exceeded the 2,000-record acquisition bound: ${endpoint}`);
  }
  return document.features;
}

function ringContains(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (!Array.isArray(currentPoint) || !Array.isArray(previousPoint)) continue;
    const [currentX, currentY] = currentPoint;
    const [previousX, previousY] = previousPoint;
    if (
      typeof currentX !== 'number' ||
      typeof currentY !== 'number' ||
      typeof previousX !== 'number' ||
      typeof previousY !== 'number'
    ) {
      continue;
    }
    const intersects =
      currentY > point[1] !== previousY > point[1] &&
      point[0] <
        ((previousX - currentX) * (point[1] - currentY)) / (previousY - currentY) + currentX;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonContains(point, polygon) {
  const exterior = polygon[0];
  if (!Array.isArray(exterior) || !ringContains(point, exterior)) return false;
  return !polygon.slice(1).some((ring) => Array.isArray(ring) && ringContains(point, ring));
}

function boundaryContains(boundary, point) {
  const coordinates = boundary.geometry.coordinates;
  if (!Array.isArray(coordinates)) return false;
  if (boundary.geometry.type === 'Polygon') return polygonContains(point, coordinates);
  if (boundary.geometry.type === 'MultiPolygon') {
    return coordinates.some((polygon) => Array.isArray(polygon) && polygonContains(point, polygon));
  }
  return false;
}

function positions(value, result = []) {
  if (!Array.isArray(value)) return result;
  if (typeof value[0] === 'number' && typeof value[1] === 'number') {
    result.push([value[0], value[1]]);
  } else {
    value.forEach((item) => positions(item, result));
  }
  return result;
}

function featureTouchesBoundary(feature, boundary) {
  return positions(feature.geometry?.coordinates).some((point) =>
    boundaryContains(boundary, point),
  );
}

function normalizedFeature(feature, prefix) {
  if (
    feature?.type !== 'Feature' ||
    !feature.geometry ||
    typeof feature.geometry.type !== 'string' ||
    !feature.properties ||
    typeof feature.properties !== 'object'
  ) {
    throw new Error(`invalid ${prefix} GeoJSON feature`);
  }
  const objectId = feature.properties.objectid ?? feature.properties.OBJECTID ?? feature.id;
  return {
    type: 'Feature',
    id: `${prefix}:${String(objectId)}`,
    properties: feature.properties,
    geometry: feature.geometry,
  };
}

function sorted(features) {
  return features
    .map((feature) => normalizedFeature(feature.feature, feature.prefix))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

const args = argumentsByName(process.argv.slice(2));
const outputArgument = args.get('output');
if (!outputArgument) {
  throw new Error(
    'usage: pnpm federal:acquire:ny -- --output <directory> [--boundary <geojson>] [--generated-at <normalized UTC>]',
  );
}
const outputDirectory = resolve(outputArgument);
const boundaryPath = resolve(
  args.get('boundary') ?? 'packages/map/src/assets/new-york-outdoors.geojson',
);
if (!isAbsolute(outputDirectory) || !isAbsolute(boundaryPath)) {
  throw new Error('output and boundary must resolve to absolute paths');
}
const retrievedAt = args.get('generated-at') ?? new Date().toISOString();
if (new Date(retrievedAt).toISOString() !== retrievedAt) {
  throw new Error('generated-at must be a normalized UTC timestamp');
}
const boundaryDocument = JSON.parse(await readFile(boundaryPath, 'utf8'));
const boundary = boundaryDocument.features?.find(
  (feature) =>
    feature?.properties?.kind === 'boundary' &&
    (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon'),
);
if (!boundary) throw new Error('boundary GeoJSON is missing the New York polygon');

const [rawSurfaceOwnership, rawRecreationSites, rawRoads, rawTrails, rawBlmManagedLands] =
  await Promise.all([
    queryArcgis(
      USFS_SURFACE,
      "ownerclassification='USDA FOREST SERVICE' AND nfslandunitname='Finger Lakes National Forest'",
      [
        'objectid',
        'surfaceownershipid',
        'ownerclassification',
        'status',
        'actiondate',
        'gis_acres',
        'nfslandunitname',
      ],
    ),
    queryArcgis(USFS_RECREATION, '1=1', [
      'objectid',
      'site_cn',
      'site_name',
      'site_type',
      'activity_type_list',
      'service_type_list',
      'seasonal_operational_status',
      'op_status_reason',
      'total_capacity',
      'fee_charged',
      'public_site_name',
      'usda_portal_url',
      'water_availability',
      'restroom_availability',
      'infra_last_update',
      'edw_last_modify',
    ]),
    queryArcgis(USFS_MVUM_ROADS, '1=1', [
      'objectid',
      'name',
      'mvum_symbol_name',
      'seasonal',
      'passengervehicle_datesopen',
      'highclearancevehicle_datesopen',
      'forestname',
      'districtname',
      'routestatus',
    ]),
    queryArcgis(USFS_MVUM_TRAILS, '1=1', [
      'objectid',
      'name',
      'mvum_symbol_name',
      'seasonal',
      'atv',
      'motorcycle',
      'tracked_ohv_lt50inches',
      'forestname',
      'districtname',
      'trailstatus',
      'trailsystem',
      'trailclass',
    ]),
    queryArcgis(BLM_MANAGED_LANDS, "ADMIN_AGENCY_CODE='BLM'", [
      'OBJECTID',
      'ADMIN_AGENCY_CODE',
      'ADMIN_UNIT_NAME',
      'ADMIN_UNIT_TYPE',
      'ADMIN_ST',
    ]),
  ]);

const inside = (feature) => featureTouchesBoundary(feature, boundary);
const surfaceOwnership = sorted(
  rawSurfaceOwnership.filter(inside).map((feature) => ({ feature, prefix: 'usfs-surface' })),
);
const recreationSites = sorted(
  rawRecreationSites.filter(inside).map((feature) => ({ feature, prefix: 'usfs-recreation' })),
);
const mvumRoads = sorted(
  rawRoads.filter(inside).map((feature) => ({ feature, prefix: 'usfs-mvum-road' })),
);
const mvumTrails = sorted(
  rawTrails.filter(inside).map((feature) => ({ feature, prefix: 'usfs-mvum-trail' })),
);
const managedLands = sorted(
  rawBlmManagedLands.filter(inside).map((feature) => ({ feature, prefix: 'blm-land' })),
);

const snapshot = {
  schemaVersion: 1,
  stateCode: STATE_CODE,
  retrievedAt,
  usfs: { surfaceOwnership, recreationSites, mvumRoads, mvumTrails },
  blm: { managedLands },
};
const snapshotBytes = Buffer.from(`${stableJson(snapshot)}\n`);
const counts = {
  usfsSurfaceOwnership: surfaceOwnership.length,
  usfsRecreationSites: recreationSites.length,
  usfsMvumRoads: mvumRoads.length,
  usfsMvumTrails: mvumTrails.length,
  blmManagedLands: managedLands.length,
};
const manifest = {
  schemaVersion: 1,
  sourceId: 'federal-new-york',
  publishers: ['USDA Forest Service', 'Bureau of Land Management'],
  retrievedAt,
  stateCode: STATE_CODE,
  boundary: { file: basename(boundaryPath), sha256: sha256(await readFile(boundaryPath)) },
  endpoints: [USFS_SURFACE, USFS_RECREATION, USFS_MVUM_ROADS, USFS_MVUM_TRAILS, BLM_MANAGED_LANDS],
  filters: {
    envelope: NEW_YORK_ENVELOPE,
    usfsSurface:
      "ownerclassification='USDA FOREST SERVICE' AND nfslandunitname='Finger Lakes National Forest'",
    otherLayers: 'New York boundary clip after ArcGIS envelope query',
    blm: "ADMIN_AGENCY_CODE='BLM'",
  },
  counts,
  coverage: {
    blm:
      managedLands.length === 0
        ? 'Official national surface-management layer returned no BLM-managed New York features.'
        : 'Official national surface-management features included.',
  },
  artifact: {
    file: 'federal-new-york.json',
    bytes: snapshotBytes.byteLength,
    sha256: sha256(snapshotBytes),
  },
  termsUrls: [
    'https://data.fs.usda.gov/geodata/edw/datasets.php',
    'https://www.blm.gov/services/geospatial/GISData',
  ],
};

await mkdir(outputDirectory, { recursive: false });
await writeFile(join(outputDirectory, 'federal-new-york.json'), snapshotBytes, { flag: 'wx' });
await writeFile(join(outputDirectory, 'manifest.json'), `${stableJson(manifest)}\n`, {
  flag: 'wx',
});
process.stdout.write(
  `${JSON.stringify({ outputDirectory, snapshot: 'federal-new-york.json', counts }, null, 2)}\n`,
);

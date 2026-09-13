import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const output = new URL('../packages/map/src/assets/', import.meta.url);
const sources = [
  {
    id: 'nys-boundary',
    kind: 'boundary',
    url: 'https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Civil_Boundaries/FeatureServer/0',
    fields: ['OBJECTID', 'NAME', 'DATEMOD'],
    attribution: 'NYS ITS Geospatial Services',
  },
  {
    id: 'nys-dec-lands',
    kind: 'land',
    url: 'https://gisservices.dec.ny.gov/arcgis/rest/services/reference/MapServer/2',
    fields: ['OBJECTID', 'UNIT', 'FACILITY', 'CATEGORY', 'CLASS', 'PUBLICUSE', 'UPDATED'],
    attribution: 'New York State Department of Environmental Conservation',
  },
  {
    id: 'nys-dec-roads',
    kind: 'road',
    url: 'https://gisservices.dec.ny.gov/arcgis/rest/services/dil/dil_trails/MapServer/0',
    fields: ['OBJECTID', 'NAME', 'UNIT', 'FACILITY', 'PUBLICUSE', 'UPDATED'],
    attribution: 'New York State Department of Environmental Conservation',
  },
  {
    id: 'nys-dec-trails',
    kind: 'trail',
    url: 'https://gisservices.dec.ny.gov/arcgis/rest/services/dil/dil_trails/MapServer/2',
    fields: ['OBJECTID', 'NAME', 'UNIT', 'FACILITY', 'PUBLICUSE', 'UPDATED'],
    attribution: 'New York State Department of Environmental Conservation',
  },
];
const hash = (b) => createHash('sha256').update(b).digest('hex');
function geometryPositions(value) {
  if (!Array.isArray(value)) throw new Error('Invalid geometry');
  if (typeof value[0] === 'number') return [[value[0], value[1]]];
  return value.flatMap(geometryPositions);
}
function boundsForGeometry(geometry) {
  const points = geometryPositions(geometry.coordinates);
  return points.reduce(
    ([west, south, east, north], [longitude, latitude]) => [
      Math.min(west, longitude),
      Math.min(south, latitude),
      Math.max(east, longitude),
      Math.max(north, latitude),
    ],
    [180, 90, -180, -90],
  );
}
async function query(source, params) {
  const url = new URL(source.url + '/query');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return requestJson(url);
}
async function requestJson(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw Error(`Source HTTP ${response.status}`);
  const bytes = await response.text();
  if (bytes.length > 32 * 1024 * 1024) throw Error('Source exceeds limit');
  const json = JSON.parse(bytes);
  if (json.error) throw Error(`Source error ${JSON.stringify(json.error)}`);
  return { json, sha256: hash(bytes), url: url.href };
}
const features = [];
const receipts = [];
for (const source of sources) {
  const idsResult = await query(source, { where: '1=1', returnIdsOnly: true, f: 'json' });
  const ids = idsResult.json.objectIds?.sort((a, b) => a - b);
  if (!ids?.length || ids.length > 30000 || new Set(ids).size !== ids.length)
    throw Error('Invalid source inventory');
  const seen = new Set();
  const pages = [];
  console.log(`${source.id}: acquiring ${ids.length} features`);
  for (let i = 0; i < ids.length; i += 50) {
    const page = await query(source, {
      objectIds: ids.slice(i, i + 50).join(','),
      outFields: source.fields.join(','),
      outSR: 4326,
      returnGeometry: true,
      geometryPrecision: 5,
      maxAllowableOffset: 0.00003,
      f: 'geojson',
    });
    if (page.json.exceededTransferLimit || page.json.type !== 'FeatureCollection')
      throw Error('Incomplete page');
    pages.push({ url: page.url, sha256: page.sha256, count: page.json.features.length });
    for (const f of page.json.features) {
      const p = f.properties;
      const objectId = p.OBJECTID ?? f.id;
      if (!ids.includes(objectId) || seen.has(objectId) || !f.geometry)
        throw Error('Invalid feature inventory');
      seen.add(objectId);
      const name = String(
        p.NAME ||
          p.UNIT ||
          p.FACILITY ||
          (source.kind === 'boundary' ? 'New York' : `DEC ${source.kind}`),
      ).trim();
      features.push({
        type: 'Feature',
        id: `${source.id}-${objectId}`,
        properties: {
          id: `${source.id}-${objectId}`,
          kind: source.kind,
          name,
          sourceId: source.id,
          unit: String(p.UNIT || p.FACILITY || ''),
          category: String(p.CATEGORY || p.CLASS || ''),
          publicUse: String(p.PUBLICUSE || ''),
          sourceUpdated: String(p.UPDATED || p.DATEMOD || 'unknown'),
        },
        geometry: f.geometry,
      });
    }
  }
  if (seen.size !== ids.length) throw Error('Incomplete acquisition');
  receipts.push({ ...source, featureCount: seen.size, inventorySha256: idsResult.sha256, pages });
}
const poiSource = {
  id: 'nys-dec-poi',
  kind: 'poi',
  url: 'https://data.ny.gov/resource/yvkb-z58x.json',
  fields: [':id', 'facility', 'name', 'asset', 'latitude', 'longitude'],
  attribution: 'New York State Department of Environmental Conservation / OPEN-NY',
};
const poiUrl = new URL(poiSource.url);
poiUrl.searchParams.set('$select', poiSource.fields.join(','));
poiUrl.searchParams.set('$limit', '50000');
poiUrl.searchParams.set('$order', ':id');
const poiPage = await requestJson(poiUrl);
const metadata = await requestJson(new URL('https://data.ny.gov/api/views/yvkb-z58x'));
if (!Array.isArray(poiPage.json) || poiPage.json.length === 0 || poiPage.json.length > 30000) {
  throw new Error('Invalid DEC point-of-interest inventory');
}
const poiIds = new Set();
const sourceUpdated = new Date(Number(metadata.json.rowsUpdatedAt) * 1000).toISOString();
for (const row of poiPage.json) {
  const rowId = String(row[':id'] || '');
  const longitude = Number(row.longitude);
  const latitude = Number(row.latitude);
  if (
    rowId === '' ||
    poiIds.has(rowId) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -79.8 ||
    longitude > -71.7 ||
    latitude < 40.4 ||
    latitude > 45.1
  ) {
    throw new Error('Invalid DEC point-of-interest record');
  }
  poiIds.add(rowId);
  const id = poiSource.id + '-' + rowId;
  features.push({
    type: 'Feature',
    id,
    properties: {
      id,
      kind: 'poi',
      name: String(row.name || row.asset || 'DEC point of interest').trim(),
      sourceId: poiSource.id,
      unit: String(row.facility || '').trim(),
      category: String(row.asset || 'OTHER').trim(),
      publicUse: '',
      sourceUpdated,
    },
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
  });
}
receipts.push({
  ...poiSource,
  featureCount: poiIds.size,
  inventorySha256: hash([...poiIds].sort().join('\n')),
  pages: [{ url: poiPage.url, sha256: poiPage.sha256, count: poiIds.size }],
  metadata: { url: metadata.url, sha256: metadata.sha256 },
});
const collection = { type: 'FeatureCollection', features };
const bytes = JSON.stringify(collection) + '\n';
if (Buffer.byteLength(bytes) > 24 * 1024 * 1024) throw Error('Bundle too large');
const indexBytes =
  JSON.stringify({
    schemaVersion: 1,
    features: features.map(({ id, properties, geometry }) => ({
      id,
      properties,
      bounds: boundsForGeometry(geometry),
    })),
  }) + '\n';
await mkdir(output, { recursive: true });
await writeFile(new URL('new-york-outdoors.geojson', output), bytes);
await writeFile(new URL('new-york-outdoors.index.json', output), indexBytes);
await writeFile(
  new URL('new-york-outdoors.manifest.json', output),
  JSON.stringify(
    {
      schemaVersion: 1,
      classification: 'SOURCE_REDISTRIBUTABLE',
      acquiredAt: new Date().toISOString(),
      sha256: hash(bytes),
      bytes: Buffer.byteLength(bytes),
      indexSha256: hash(indexBytes),
      indexBytes: Buffer.byteLength(indexBytes),
      featureCount: features.length,
      coordinateReferenceSystem: 'EPSG:4326',
      simplificationDegrees: 0.00003,
      geometryPrecision: 5,
      coverage:
        'New York State boundary and published DEC lands, roads, hiking trails and recreation points. Not a land-ownership survey, current-status feed or camping authorization.',
      rights: {
        license: 'NYS public GIS data terms',
        offlineStorage: true,
        redistribution: true,
        derivedData: true,
        attribution: [
          'NYS ITS Geospatial Services',
          'New York State Department of Environmental Conservation',
          'OPEN-NY',
        ],
        terms: [
          'https://gis.ny.gov/disclaimer',
          'https://gisservices.dec.ny.gov/gis/dil/content.html?cat=CGS',
          'https://data.ny.gov/about',
        ],
        reviewedAt: '2026-09-11',
      },
      sources: receipts,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Bundled ${features.length} real geographic features, ${Buffer.byteLength(bytes)} bytes.`,
);

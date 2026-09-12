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
async function query(source, params) {
  const url = new URL(source.url + '/query');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
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
const collection = { type: 'FeatureCollection', features };
const bytes = JSON.stringify(collection) + '\n';
if (Buffer.byteLength(bytes) > 24 * 1024 * 1024) throw Error('Bundle too large');
await mkdir(output, { recursive: true });
await writeFile(new URL('new-york-outdoors.json', output), bytes);
await writeFile(
  new URL('new-york-outdoors.manifest.json', output),
  JSON.stringify(
    {
      schemaVersion: 1,
      classification: 'SOURCE_REDISTRIBUTABLE',
      acquiredAt: new Date().toISOString(),
      sha256: hash(bytes),
      bytes: Buffer.byteLength(bytes),
      featureCount: features.length,
      coordinateReferenceSystem: 'EPSG:4326',
      simplificationDegrees: 0.00003,
      geometryPrecision: 5,
      coverage:
        'New York State boundary and published DEC lands, roads and hiking trails. Not a complete street basemap, land-ownership survey or camping authorization.',
      rights: {
        license: 'NYS public GIS data terms',
        offlineStorage: true,
        redistribution: true,
        derivedData: true,
        attribution: [
          'NYS ITS Geospatial Services',
          'New York State Department of Environmental Conservation',
        ],
        terms: [
          'https://gis.ny.gov/disclaimer',
          'https://gisservices.dec.ny.gov/gis/dil/content.html?cat=CGS',
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

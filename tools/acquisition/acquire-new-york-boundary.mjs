import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { nativeCurlFetch } from '../lib/native-curl-fetch.mjs';
import {
  assertNewYorkSourceReady,
  CanonicalSourceIdRegistry,
  createOfficialNewYorkConnector,
  getNewYorkSource,
} from '../../packages/data/dist/new-york.js';
import { RawArtifactStore, runConnector } from '../../packages/data/dist/ingestion.js';

const now = new Date().toISOString();
const output = resolve(process.argv[2] ?? '.scratch/new-york-boundary');
const source = getNewYorkSource('nys-its-state-boundary');
assertNewYorkSourceReady(source, now);
const fields = source.manifest.rights.parsedFields.join(',');
const fetcher = async (locator, signal) => {
  const url = new URL(locator);
  if (url.searchParams.has('outFields')) url.searchParams.set('outFields', fields);
  if (url.searchParams.get('returnGeometry') === 'true') {
    url.searchParams.set('geometryPrecision', '5');
    url.searchParams.set('maxAllowableOffset', '0.00003');
  }
  const response = await nativeCurlFetch(url.toString(), { signal });
  return {
    status: response.status,
    contentType:
      url.searchParams.get('f') === 'geojson' ? 'application/geo+json' : 'application/json',
    body: new Uint8Array(await response.arrayBuffer()),
    redirectCount: 0,
  };
};
const root = resolve(output, 'raw');
const connector = createOfficialNewYorkConnector({
  source,
  fetcher,
  rawStore: new RawArtifactStore({ root, boundary: 'public' }),
  ids: new CanonicalSourceIdRegistry(),
  now: () => now,
});
const result = await runConnector(connector, `ny-boundary-${now}`, now);
if (result.quarantine.length || result.emitted.length !== 1) {
  throw new Error(`NY boundary refresh failed: ${JSON.stringify(result.quarantine)}`);
}
const batch = result.emitted[0];
if (batch.records.length !== 1 || batch.records[0].geometry?.type !== 'MultiPolygon') {
  throw new Error(
    `unexpected normalized boundary: ${JSON.stringify({ records: batch.records.length, type: batch.records[0]?.geometry?.type })}`,
  );
}
await mkdir(output, { recursive: true });
const { readFile, readdir } = await import('node:fs/promises');
const { createHash } = await import('node:crypto');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const collection = JSON.parse(await readFile('packages/map/src/assets/new-york-outdoors.geojson'));
const manifest = JSON.parse(
  await readFile('packages/map/src/assets/new-york-outdoors.manifest.json'),
);
const feature = collection.features.find((item) => item.properties?.sourceId === 'nys-boundary');
if (!feature) throw new Error('NY public boundary missing');
const [record] = batch.records;
feature.geometry = record.geometry;
feature.properties.sourceUpdated = record.sourceUpdatedAt;
const files = [];
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  for (const file of await readdir(resolve(root, entry.name)))
    if (file.endsWith('.raw')) files.push(resolve(root, entry.name, file));
}
if (files.length !== 1) throw new Error('Expected one complete boundary acquisition page');
const bytes = await readFile(files[0]);
const receipt = manifest.sources.find((item) => item.id === 'nys-boundary');
receipt.retrievedAt = now;
receipt.inventorySha256 = hash(bytes);
receipt.fields = source.manifest.rights.parsedFields;
const page = new URL(`${receipt.url}/query`);
for (const [key, value] of Object.entries({
  objectIds: record.source.externalId,
  outFields: fields,
  returnGeometry: 'true',
  outSR: '4326',
  geometryPrecision: '5',
  maxAllowableOffset: '0.00003',
  f: 'geojson',
}))
  page.searchParams.set(key, value);
receipt.pages = [{ url: page.toString(), sha256: hash(bytes), count: 1 }];
manifest.sha256 = hash(Buffer.from(JSON.stringify(collection) + '\n'));
manifest.bytes = Buffer.byteLength(JSON.stringify(collection) + '\n');
await writeFile(resolve(output, 'new-york-outdoors.geojson'), JSON.stringify(collection) + '\n');
await writeFile(
  resolve(output, 'new-york-outdoors.manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(JSON.stringify({ output, acquiredAt: now, features: 1 }));

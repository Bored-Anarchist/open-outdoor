import {
  decOutdoorVisitorDetails,
  outdoorSourceUrl,
} from '../../packages/shared/src/outdoor-details.ts';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, sep, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nativeCurlFetch } from '../lib/native-curl-fetch.mjs';
import { loadPrivateSourceApprovals } from './private-source-approvals.mjs';
import { assertPrivateAcquisitionApproved } from './state-agency-feeds.mjs';
import {
  stagePrivateDirectory,
  activatePrivateDirectory,
  writeImmutable,
} from '../packages/private-package-transaction.mjs';

// Owner authorization permits this private validation path; it never grants redistribution.
export async function loadDecRefreshInputs({
  stagingRoot = resolve('PrivateData/agency-feeds'),
} = {}) {
  const sources = JSON.parse(
    await readFile('config/private-new-york-dec-sources.json', 'utf8'),
  ).sources;
  const approvals = await loadPrivateSourceApprovals(sources, { stagingRoot, label: 'DEC' });
  return { sources, approvals };
}

export async function acquirePrivateNewYorkDec({
  privateRoot = resolve('PrivateData'),
  stagingRoot = join(privateRoot, 'agency-feeds'),
  outputDirectory = join(privateRoot, 'catalogs/US/New York/dec-source-acquisition/current'),
  fetchImpl = process.platform === 'win32' ? nativeCurlFetch : fetch,
} = {}) {
  const { sources: configuredSources, approvals } = await loadDecRefreshInputs({ stagingRoot });
  outputDirectory = resolve(outputDirectory);
  const location = relative(resolve(privateRoot), outputDirectory);
  if (!location || location === '..' || location.startsWith('..' + sep) || isAbsolute(location))
    throw new Error('DEC output must stay inside the private root');
  await mkdir(dirname(outputDirectory), { recursive: true });
  const stage = await stagePrivateDirectory(outputDirectory, { copyCurrent: false });
  const output = pathToFileURL(stage + sep);
  const rawDirectory = join(stage, 'source-pages');
  await mkdir(rawDirectory);
  const sources = configuredSources.filter((source) => source.kind !== 'poi');
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
    const response = await fetchImpl(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw Error(`Source HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer()).toString('utf8');
    if (bytes.length > 32 * 1024 * 1024) throw Error('Source exceeds limit');
    await writeImmutable(rawDirectory, hash(bytes) + '.json', Buffer.from(bytes));
    const json = JSON.parse(bytes);
    if (json.error) throw Error(`Source error ${JSON.stringify(json.error)}`);
    return { json, sha256: hash(bytes), url: url.href };
  }
  const features = [];
  const receipts = [];
  for (const source of sources) {
    const before = await requestJson(new URL(source.url + '?f=pjson'));
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
            ...decOutdoorVisitorDetails(p),
            ...(outdoorSourceUrl(p.URL) ? { sourceUrl: outdoorSourceUrl(p.URL) } : {}),
          },
          geometry: f.geometry,
        });
      }
    }
    if (seen.size !== ids.length) throw Error('Incomplete acquisition');
    const after = await requestJson(new URL(source.url + '?f=pjson'));
    if (before.json.editingInfo?.lastEditDate !== after.json.editingInfo?.lastEditDate)
      throw new Error(source.id + ': source changed during acquisition');
    receipts.push({
      ...source,
      featureCount: seen.size,
      inventorySha256: idsResult.sha256,
      pages,
      metadata: { url: before.url, sha256: before.sha256 },
      ...(before.json.editingInfo?.lastEditDate
        ? { sourceRevision: before.json.editingInfo.lastEditDate }
        : {}),
    });
  }
  const poiSource = configuredSources.find((source) => source.kind === 'poi');
  const poiUrl = new URL(poiSource.url);
  poiUrl.searchParams.set('$select', poiSource.fields.join(','));
  poiUrl.searchParams.set('$limit', '50000');
  poiUrl.searchParams.set('$order', ':id');
  const metadataUrl = new URL('https://data.ny.gov/api/views/yvkb-z58x');
  const metadata = await requestJson(metadataUrl);
  const countUrl = new URL(poiSource.url);
  countUrl.searchParams.set('$select', 'count(*)');
  const countResult = await requestJson(countUrl);
  const expectedPoiCount = Number(countResult.json[0]?.count);
  if (!Number.isSafeInteger(expectedPoiCount) || expectedPoiCount <= 0 || expectedPoiCount > 30000)
    throw new Error('Invalid DEC point-of-interest count');
  const poiPage = await requestJson(poiUrl);
  const afterPoi = await requestJson(metadataUrl);
  if (
    metadata.json.rowsUpdatedAt !== afterPoi.json.rowsUpdatedAt ||
    poiPage.json.length !== expectedPoiCount
  )
    throw new Error('DEC point-of-interest acquisition incomplete or changed');
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
        classification: 'PRIVATE_USER',
        authorizationType: 'owner-private-validation',
        publisherGrant: false,
        approvals: configuredSources.map((source) => ({
          sourceId: source.id,
          reviewedAt: approvals[source.id].reviewedAt,
          expiresAt: approvals[source.id].expiresAt,
          sha256: hash(JSON.stringify(approvals[source.id])),
        })),
        publicDistribution: false,
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
          'DEC lands, roads, hiking trails and recreation points. The NYS civil boundary is bundled publicly. Not a land-ownership survey, current-status feed or camping authorization.',
        rights: {
          license: 'Owner-authorized private validation; publisher redistribution review pending',
          offlineStorage: true,
          redistribution: false,
          derivedData: false,
          attribution: ['New York State Department of Environmental Conservation', 'OPEN-NY'],
          terms: [
            'https://gisservices.dec.ny.gov/gis/dil/content.html?cat=CGS',
            'https://data.ny.gov/about',
          ],
          reviewedAt: new Date().toISOString().slice(0, 10),
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

  for (const source of configuredSources)
    assertPrivateAcquisitionApproved(source, approvals[source.id]);
  await activatePrivateDirectory(outputDirectory, stage);
  return {
    outputDirectory,
    features: features.length,
    sources: receipts.map((source) => ({ id: source.id, features: source.featureCount })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(JSON.stringify(await acquirePrivateNewYorkDec()));

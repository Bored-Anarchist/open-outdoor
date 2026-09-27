import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = join(repository, 'config/us-state-forestry-agencies.json');
const rightsPath = join(repository, 'docs/STATE_AGENCY_REDISTRIBUTION_RIGHTS_2026-09-26.md');
const planPath = join(repository, 'docs/STATE_DATA_PACKAGE_TRACKER.md');
const privateRoot = join(repository, 'PrivateData/agency-feeds');
const exactArcgisLayer = /\/(?:FeatureServer|MapServer)\/\d+$/i;
const directDownload = /\.(?:zip|geojson|json|csv|kml|gpkg)(?:\?.*)?$/i;

function sourceType(url, declaredType) {
  if (/download\.geofabrik\.de\/.*\.osm\.pbf$/i.test(url)) return 'osm-extract';
  if (exactArcgisLayer.test(url)) return 'arcgis-layer';
  if (/\/(?:FeatureServer|MapServer)$/i.test(url)) return 'arcgis-service';
  if (declaredType === 'download' && directDownload.test(url)) return 'download-file';
  return declaredType === 'api' ? 'api-lead' : (declaredType ?? 'lead');
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 45);
}

function feedId(origin, state, role, url) {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 10);
  return `${origin}-${state.toLowerCase()}-${slug(role)}-${hash}`;
}

function rightsRows(markdown) {
  const beforeNewYork = markdown.split('## New York agency addendum')[0];
  const rows = new Map();
  for (const line of beforeNewYork.split(/\r?\n/)) {
    const match = line.match(
      /^\| ([A-Z]{2}) \/ ([^|]+) \| \[[^\]]+\]\((https?:\/\/[^)]+)\) \| \*\*([^*]+)\*\*/,
    );
    if (!match) continue;
    const [, state, role, url, status] = match;
    const key = `${state}|${role.trim()}|${url}`;
    if (rows.has(key)) throw new Error(`duplicate rights decision: ${key}`);
    rows.set(key, status);
  }
  if (rows.size !== 142)
    throw new Error(`expected 142 current agency rights rows, found ${rows.size}`);
  return rows;
}

function plannedRows(markdown) {
  const section = markdown
    .split('### Planned Arkansas, Idaho, and South Dakota agency inputs')[1]
    ?.split('## State-by-state progress')[0];
  if (!section) throw new Error('selected agency layer plan is missing');
  const rows = [];
  for (const line of section.split(/\r?\n/)) {
    if (!/^\| (?:AR|ID|SD) \/ /.test(line)) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((value) => value.trim());
    const match = cells[1]?.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    if (!match) throw new Error(`selected layer lacks a direct source: ${cells[0]}`);
    rows.push({
      state: cells[0].slice(0, 2),
      role: cells[0].slice(5),
      name: match[1],
      url: match[2],
      notes: cells[2],
    });
  }
  if (rows.length !== 19) throw new Error(`expected 19 selected plan rows, found ${rows.length}`);
  return rows;
}

/** Source definitions only. No feature data are embedded in this public catalog. */
export async function loadStateAgencyFeedCatalog() {
  const [registryText, rightsText, planText] = await Promise.all([
    readFile(registryPath, 'utf8'),
    readFile(rightsPath, 'utf8'),
    readFile(planPath, 'utf8'),
  ]);
  const registry = JSON.parse(registryText);
  const decisions = rightsRows(rightsText);
  const feeds = [];
  const seenRights = new Set();
  for (const state of registry.states.filter((item) => item.code !== 'NY')) {
    for (const agencyRole of ['parks', 'forestry']) {
      const sources = [
        {
          role: agencyRole,
          name: state[`${agencyRole}DataSourceName`],
          url: state[`${agencyRole}DataSourceUrl`],
          declaredType: state[`${agencyRole}DataSourceType`],
        },
        ...(state[`${agencyRole}SupplementalDataSources`] ?? []).map((item) => ({
          role: `${agencyRole} supplement`,
          name: item.name,
          url: item.url,
          declaredType: item.kind,
        })),
      ];
      for (const source of sources) {
        const osm = sourceType(source.url, source.declaredType) === 'osm-extract';
        const key = `${state.code}|${source.role}|${source.url}`;
        const rightsStatus = osm ? 'ODbL' : decisions.get(key);
        if (!rightsStatus) throw new Error(`missing rights decision for ${key}`);
        if (!osm) seenRights.add(key);
        feeds.push({
          id: feedId('registry', state.code, source.role, source.url),
          origin: 'registry',
          state: state.code,
          agencyRole: source.role,
          name: source.name,
          url: source.url,
          sourceType: sourceType(source.url, source.declaredType),
          rightsStatus,
          stage: 'candidate',
        });
      }
    }
  }
  if (seenRights.size !== decisions.size)
    throw new Error('rights matrix contains unmatched agency rows');
  for (const item of plannedRows(planText)) {
    const osm = sourceType(item.url) === 'osm-extract';
    const matchingStatus = feeds.find(
      (feed) => feed.state === item.state && feed.url === item.url,
    )?.rightsStatus;
    feeds.push({
      id: feedId('plan', item.state, item.role, item.url),
      origin: 'selected-plan',
      state: item.state,
      agencyRole: item.role,
      name: item.name,
      url: item.url,
      sourceType: sourceType(item.url),
      rightsStatus: matchingStatus ?? (osm ? 'ODbL' : 'Unconfirmed'),
      stage: 'candidate',
      selectionNotes: item.notes,
    });
  }
  const ids = new Set(feeds.map((feed) => feed.id));
  if (ids.size !== feeds.length) throw new Error('agency feed IDs collide');
  return feeds;
}

/** Every feature fetch requires a private, source-specific rights and storage approval. */
export function assertPrivateAcquisitionApproved(feed, approval, now = new Date()) {
  if (!['arcgis-layer', 'download-file'].includes(feed.sourceType)) {
    throw new Error(
      `${feed.id}: exact ArcGIS layer or direct download required; select a child layer or add an adapter`,
    );
  }
  if (!approval || approval.sourceId !== feed.id || approval.sourceUrl !== feed.url) {
    throw new Error(`${feed.id}: matching private approval required`);
  }
  if (
    approval.collect !== true ||
    approval.privateStorage !== true ||
    approval.publicDistribution !== false
  ) {
    throw new Error(
      `${feed.id}: collection/private-storage approval required; public output prohibited`,
    );
  }
  if (
    !/^https:\/\//.test(approval.evidenceUrl ?? '') ||
    !Number.isFinite(Date.parse(approval.reviewedAt)) ||
    !Number.isFinite(Date.parse(approval.expiresAt)) ||
    Date.parse(approval.expiresAt) <= now.getTime()
  ) {
    throw new Error(`${feed.id}: current publisher evidence and review dates required`);
  }
  if (
    !['Supported', 'Conditional', 'ODbL'].includes(feed.rightsStatus) &&
    approval.publisherGrant !== true
  ) {
    throw new Error(`${feed.id}: publisher grant required for ${feed.rightsStatus} source`);
  }
}

/** Metadata discovery only; this does not query or store source feature records. */
export async function discoverArcgisChildLayers(feed, fetchImpl = fetch) {
  if (feed.sourceType !== 'arcgis-service')
    throw new Error(`${feed.id}: not an ArcGIS service root`);
  const response = await fetchImpl(`${feed.url}?f=pjson`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`ArcGIS HTTP ${response.status}: ${feed.url}`);
  const metadata = await response.json();
  if (metadata?.error || !Array.isArray(metadata.layers))
    throw new Error(`${feed.id}: invalid service metadata`);
  return metadata.layers
    .filter((layer) => Number.isSafeInteger(layer.id))
    .map((layer) => ({
      ...feed,
      id: feedId('child', feed.state, `${feed.agencyRole}-${layer.id}`, `${feed.url}/${layer.id}`),
      name: `${feed.name}: ${layer.name ?? `layer ${layer.id}`}`,
      url: `${feed.url}/${layer.id}`,
      sourceType: 'arcgis-layer',
      parentSourceId: feed.id,
    }));
}

async function requestArcgis(url, parameters, fetchImpl) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(parameters),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`ArcGIS HTTP ${response.status}: ${url}`);
  const body = await response.json();
  if (body?.error) throw new Error(`ArcGIS ${body.error.code}: ${body.error.message}`);
  return body;
}

/** Raw, rights-gated staging. POI classification happens only after all feeds are selected. */
export async function acquireApprovedArcgisLayer(feed, approval, fetchImpl = fetch) {
  if (feed.sourceType !== 'arcgis-layer') throw new Error(`${feed.id}: ArcGIS layer required`);
  assertPrivateAcquisitionApproved(feed, approval);
  const inventory = await requestArcgis(
    `${feed.url}/query`,
    {
      where: '1=1',
      returnIdsOnly: 'true',
      returnGeometry: 'false',
      f: 'json',
    },
    fetchImpl,
  );
  if (!Array.isArray(inventory.objectIds) || !inventory.objectIds.every(Number.isSafeInteger)) {
    throw new Error(`${feed.id}: invalid ArcGIS ID inventory`);
  }
  const ids = [...new Set(inventory.objectIds)].sort((a, b) => a - b);
  const features = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const pageIds = ids.slice(offset, offset + 100);
    const page = await requestArcgis(
      `${feed.url}/query`,
      {
        objectIds: pageIds.join(','),
        outFields: '*',
        outSR: '4326',
        returnGeometry: 'true',
        f: 'geojson',
      },
      fetchImpl,
    );
    if (
      page.type !== 'FeatureCollection' ||
      !Array.isArray(page.features) ||
      page.exceededTransferLimit
    ) {
      throw new Error(`${feed.id}: incomplete GeoJSON page`);
    }
    const idField = inventory.objectIdFieldName ?? 'OBJECTID';
    const returnedIds = page.features.map((feature) =>
      Number(feature.properties?.[idField] ?? feature.id ?? feature.properties?.OBJECTID),
    );
    if (
      returnedIds.length !== pageIds.length ||
      returnedIds.some((id) => !Number.isSafeInteger(id) || !pageIds.includes(id)) ||
      new Set(returnedIds).size !== pageIds.length
    ) {
      throw new Error(`${feed.id}: returned feature IDs do not match requested page`);
    }
    features.push(...page.features);
  }
  if (features.length !== ids.length) throw new Error(`${feed.id}: incomplete feature inventory`);
  return { type: 'FeatureCollection', features };
}

export async function acquireApprovedDownload(feed, approval, fetchImpl = fetch) {
  if (feed.sourceType !== 'download-file') throw new Error(`${feed.id}: direct download required`);
  assertPrivateAcquisitionApproved(feed, approval);
  const response = await fetchImpl(feed.url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`download HTTP ${response.status}: ${feed.url}`);
  const declaredSize = Number(response.headers?.get?.('content-length'));
  if (declaredSize > 500 * 1024 * 1024) throw new Error(`${feed.id}: download exceeds 500 MiB`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 500 * 1024 * 1024)
    throw new Error(`${feed.id}: invalid download size`);
  return bytes;
}

export async function stageApprovedFeed(feed, approval, fetchImpl = fetch) {
  const collection =
    feed.sourceType === 'arcgis-layer'
      ? await acquireApprovedArcgisLayer(feed, approval, fetchImpl)
      : null;
  const download =
    feed.sourceType === 'download-file'
      ? await acquireApprovedDownload(feed, approval, fetchImpl)
      : null;
  if (!collection && !download) throw new Error(`${feed.id}: no feature acquisition adapter`);
  const outputDirectory = join(privateRoot, 'US', feed.state, feed.id);
  await mkdir(outputDirectory, { recursive: true });
  const bytes = collection ? Buffer.from(`${JSON.stringify(collection)}\n`) : download;
  const filename = collection
    ? 'raw.geojson'
    : `raw.${new URL(feed.url).pathname.split('.').at(-1).toLowerCase()}`;
  const receipt = {
    sourceId: feed.id,
    sourceUrl: feed.url,
    state: feed.state,
    rightsStatus: feed.rightsStatus,
    publicDistribution: false,
    retrievedAt: new Date().toISOString(),
    featureCount: collection?.features.length ?? null,
    rawFilename: filename,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    approvalEvidenceUrl: approval.evidenceUrl,
  };
  await writeFile(join(outputDirectory, filename), bytes, { flag: 'wx' });
  await writeFile(join(outputDirectory, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: 'wx',
  });
  return { outputDirectory, receipt };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const feeds = await loadStateAgencyFeedCatalog();
    const [command, id, layerId] = process.argv.slice(2);
    if (command === 'list' && (!id || /^[A-Za-z]{2}$/.test(id))) {
      const summary = Object.fromEntries(
        [...new Set(feeds.map((feed) => feed.rightsStatus))]
          .sort()
          .map((status) => [status, feeds.filter((feed) => feed.rightsStatus === status).length]),
      );
      console.log(
        JSON.stringify(
          id
            ? feeds.filter((feed) => feed.state === id.toUpperCase())
            : {
                total: feeds.length,
                exactArcgisLayers: feeds.filter((feed) => feed.sourceType === 'arcgis-layer')
                  .length,
                serviceRoots: feeds.filter((feed) => feed.sourceType === 'arcgis-service').length,
                directDownloads: feeds.filter((feed) => feed.sourceType === 'download-file').length,
                rights: summary,
              },
          null,
          2,
        ),
      );
    } else if (command === 'children' && id) {
      const feed = feeds.find((item) => item.id === id);
      if (!feed) throw new Error(`unknown agency feed: ${id}`);
      console.log(JSON.stringify(await discoverArcgisChildLayers(feed), null, 2));
    } else if (command === 'stage' && id) {
      let feed = feeds.find((item) => item.id === id);
      if (feed?.sourceType === 'arcgis-service' && /^\d+$/.test(layerId ?? '')) {
        feed = (await discoverArcgisChildLayers(feed)).find((item) =>
          item.url.endsWith(`/${layerId}`),
        );
      }
      if (!feed) throw new Error(`unknown agency feed: ${id}`);
      const approvals = JSON.parse(await readFile(join(privateRoot, 'approvals.json'), 'utf8'));
      const result = await stageApprovedFeed(feed, approvals[feed.id]);
      console.log(JSON.stringify(result.receipt, null, 2));
    } else {
      throw new Error(
        'Usage: node tools/state-agency-feeds.mjs list [state-code] | children <service-id> | stage <feed-id> [child-layer-id]',
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deduplicatePrivateStatePackage } from './deduplicate-private-state-packages.mjs';
import { nativeCurlFetch } from './native-curl-fetch.mjs';
import { visitorSourceExclusion } from './state-visitor-source-scope.mjs';
import {
  attachVisitorReferences,
  readPrivateVisitorReferences,
} from './private-state-visitor-references.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const privateRoot = join(repository, 'PrivateData');
const censusUrl =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query';
const resolutions = JSON.parse(
  await readFile(join(repository, 'config/agency-pending-source-resolutions-2026-09-27.json')),
).resolutions;

export function privateSourceResolution(receipt, reviews = resolutions) {
  const matches = reviews.filter(
    (item) => item.parentId === (receipt.parentSourceId ?? receipt.sourceId),
  );
  return (
    matches.find((item) => item.stageId && item.stageId === receipt.sourceId) ??
    matches.find((item) => item.url === receipt.sourceUrl) ??
    matches.find((item) => item.status === 'wrong-subject')
  );
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function inRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index];
    const b = ring[previous];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInGeometry(point, geometry) {
  const polygons =
    geometry?.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
  return polygons.some(
    (rings) =>
      Array.isArray(rings[0]) &&
      inRing(point, rings[0]) &&
      !rings.slice(1).some((hole) => inRing(point, hole)),
  );
}

async function stateBoundary(code) {
  const path = join(privateRoot, 'reference', 'census-state-boundaries', `${code}.geojson`);
  let bytes;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await nativeCurlFetch(censusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        where: `STUSAB='${code}'`,
        outFields: 'STUSAB,NAME',
        outSR: '4326',
        returnGeometry: 'true',
        f: 'geojson',
      }),
    });
    bytes = Buffer.from(await response.arrayBuffer());
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
  const collection = JSON.parse(bytes.toString('utf8'));
  if (collection.features?.length !== 1 || collection.features[0].properties?.STUSAB !== code) {
    throw new Error(`invalid Census state boundary for ${code}`);
  }
  return { geometry: collection.features[0].geometry, sha256: sha256(bytes) };
}

export function ioverlanderFeature(place) {
  const id = String(place.guid ?? '').trim();
  const name = String(place.name ?? '').trim();
  const longitude = Number(place.longitude);
  const latitude = Number(place.latitude);
  if (
    !id ||
    !name ||
    place.deleted === true ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 90
  ) {
    return null;
  }
  const category = String(place.category ?? 'other').trim() || 'other';
  const checkIns = Array.isArray(place.check_ins)
    ? place.check_ins
        .filter((item) => typeof item?.comment === 'string' && item.comment.trim())
        .slice(0, 30)
        .map((item) => ({
          comment: item.comment.trim().slice(0, 2000),
          occurredAt: item.visited_at ?? item.when ?? null,
        }))
    : [];
  return {
    type: 'Feature',
    id: `private:${id}`,
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    properties: {
      id: `private:${id}`,
      kind: 'poi',
      name,
      category,
      origin: 'private-catalog',
      sourceId: 'private-ioverlander',
      unit: 'Private iOverlander reference',
      publicUse: `${place.open ?? 'unknown'}; private reference; verify current access`,
      sourceUpdated: place.date_verified ?? null,
      communityDescription: String(place.description ?? '')
        .trim()
        .slice(0, 4000),
      communityCheckIns: checkIns,
      communityCheckInCount: Array.isArray(place.check_ins) ? place.check_ins.length : 0,
    },
  };
}

export async function readIoverlander(
  stateName,
  boundary,
  sourceRoot = join(privateRoot, 'sources', 'ioverlander', 'US'),
) {
  const source = join(sourceRoot, stateName);
  const tileDirs = (await readdir(source, { withFileTypes: true }))
    .filter((item) => item.isDirectory() && /^tiles_\d+$/.test(item.name))
    .map((item) => item.name)
    .sort();
  if (tileDirs.length === 0) throw new Error(`${stateName}: no iOverlander tile directories`);
  const byId = new Map();
  const packages = [];
  for (const directory of tileDirs) {
    const tileRoot = join(source, directory);
    const manifestBytes = await readFile(join(tileRoot, 'manifest.json'));
    const manifest = JSON.parse(manifestBytes);
    const files = (await readdir(tileRoot)).filter((name) => /^n\d+_w\d+\.json$/.test(name)).sort();
    if (files.length === 0) throw new Error(`${stateName}: empty tile package ${directory}`);
    packages.push({ directory, tileCount: files.length, manifestSha256: sha256(manifestBytes) });
    for (const file of files) {
      const bytes = await readFile(join(tileRoot, file));
      const expected = manifest[file.slice(0, -5)];
      if (
        !expected ||
        expected.size !== bytes.length ||
        expected.md5 !== createHash('md5').update(bytes).digest('hex')
      ) {
        throw new Error(`${stateName}: iOverlander tile checksum mismatch: ${file}`);
      }
      const tile = JSON.parse(bytes.toString('utf8'));
      for (const place of tile.places ?? []) {
        const feature = ioverlanderFeature(place);
        if (!feature || !pointInGeometry(feature.geometry.coordinates, boundary)) continue;
        const earlier = byId.get(feature.id);
        if (
          !earlier ||
          String(feature.properties.sourceUpdated) > String(earlier.properties.sourceUpdated)
        ) {
          byId.set(feature.id, feature);
        }
      }
    }
  }
  return {
    features: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
    tiles: packages.reduce((total, item) => total + item.tileCount, 0),
    packages,
  };
}

export function agencyFeature(source, feature, index) {
  if (!feature?.geometry?.type || !feature.geometry.coordinates) return null;
  const geometryType = feature.geometry.type;
  const kind = /Point$/.test(geometryType)
    ? 'poi'
    : /LineString$/.test(geometryType)
      ? 'trail'
      : /Polygon$/.test(geometryType)
        ? 'land'
        : null;
  if (!kind) return null;
  const fields = feature.properties ?? {};
  const externalId = String(
    fields.OBJECTID ??
      fields.ObjectID ??
      fields.objectid ??
      fields.DNR20A_ID ??
      fields.AUTOID ??
      fields.FID ??
      feature.id ??
      index,
  );
  const sourceHash = sha256(`${source.sourceUrl}#${source.sourcePartition ?? ''}`).slice(0, 12);
  const id = `private-agency:${sourceHash}:${externalId}`;
  let name =
    [
      'NAME',
      'Name',
      'name',
      'NCDA_NAME',
      'GML_HAB',
      'CampsiteName',
      'PropertyName',
      'DNRNAME',
      'PlanName',
      'PARK_NAME',
      'TRAIL_NAME',
      'UNIT_NAME',
      'FACILITY_NAME',
      'FEE_SIMPLE_NAME',
      'FEATURE_NAME',
      'DESCRIPT',
      'Land_owner_openspace_pt.NAME_LABEL',
      'Land_owner_openspace_pt.FACILITY_LABEL',
    ]
      .map((key) => fields[key])
      .find((value) => typeof value === 'string' && value.trim())
      ?.trim() ?? `Agency feature ${externalId}`;
  if (source.sourceId === 'resolved-ms-state-forests-2026-09-28')
    name = /^camden/i.test(name)
      ? 'Camden State Forest'
      : /^kurtz/i.test(name)
        ? 'Kurtz State Forest'
        : 'Jamie L. Whitten State Forest';
  if (source.state === 'NC') {
    name =
      {
        'Dupont Recreational State Forest': 'DuPont State Recreational Forest',
        'Jordan Lake Eductaional State Forest': 'Jordan Lake Educational State Forest',
        'Mountain Island Lakes Educational State Forest':
          'Mountain Island Educational State Forest',
      }[name] ?? name;
  }
  return {
    type: 'Feature',
    id,
    geometry: feature.geometry,
    properties: {
      id,
      kind,
      name,
      category:
        source.sourceUrl?.endsWith('/AIMStrailDataRO/MapServer/0') && kind === 'poi'
          ? 'campsite'
          : source.parentSourceId === 'registry-ok-parks-71807f407a' && kind === 'poi'
            ? 'tourist_attraction'
            : 'other',
      origin: 'private-catalog',
      sourceId: source.sourceId,
      sourceUrl: source.sourceUrl,
      sourceCategory: String(
        fields.Sub_Asset ??
          fields.Category ??
          fields.LOCTYPE ??
          fields.GML_TYPE ??
          fields.DESIG ??
          '',
      ),
      sourceUpdated: fields.last_edited_date ?? source.sourceEditDate ?? null,
      ...((fields.DIVISION ?? fields.GML_OWN)
        ? { agency: String(fields.DIVISION ?? fields.GML_OWN) }
        : {}),
      ...(fields.CONTACT_NU ? { agencyPhone: String(fields.CONTACT_NU) } : {}),
      ...(fields.SITE_ADD ? { address: String(fields.SITE_ADD) } : {}),
      ...(fields.WEBLINK ? { agencyWebsite: String(fields.WEBLINK) } : {}),
      rightsStatus: source.rightsStatus,
      reviewStatus: 'provisional',
      publicUse: 'Private validation only; verify visitor access and publisher terms',
    },
  };
}

const njVisitorUses = new Set([
  'State Park',
  'Trail',
  'State Forest',
  'Historic Site',
  'Natural Area',
  'Recreation Area',
  'State Preserve',
]);

export function privateAgencySelection(receipt, features, resolution) {
  let selected = features;
  const filters = [];
  if (resolution?.excludeFilter) {
    selected = selected.filter(
      (feature) =>
        !Object.entries(resolution.excludeFilter).every(
          ([field, value]) => feature.properties?.[field] === value,
        ),
    );
    filters.push({ exclude: resolution.excludeFilter });
  }
  if (resolution?.filter) {
    selected = selected.filter((feature) =>
      Object.entries(resolution.filter).every(
        ([field, value]) => feature.properties?.[field] === value,
      ),
    );
    filters.push(resolution.filter);
  }
  if (receipt.sourceFilter) filters.push(receipt.sourceFilter);
  const njFilters = {
    'registry-nj-forestry-cecb5c0cc2': {
      predicate: (p) =>
        p.MANAGED_BY === 'Division of Parks and Forestry' &&
        p.ACCESS_TYPE === 'Public Access' &&
        njVisitorUses.has(p.USE_LABEL),
      description: 'Parks and Forestry managed; Public Access; visitor-use labels',
    },
    'resolved-registry-nj-parks-fbd88e5b9e': {
      predicate: (p) => p.TRL_ACCESS === 'Yes' && p.OWNERSHIP === 'State',
      description: 'TRL_ACCESS=Yes; OWNERSHIP=State',
    },
    'child-nj-forestry-supplement-0-d5700aeef8': {
      predicate: (p) => p.TRL_ACCESS === 'Yes' && p.OWNERSHIP === 'State',
      description: 'TRL_ACCESS=Yes; OWNERSHIP=State',
    },
    'child-nj-forestry-supplement-25-8100840e6b': {
      predicate: (p) =>
        p['Land_owner_openspace_pt.PUBLIC_ACCESS'] === 'Yes' &&
        p['Land_owner_openspace_pt.MANAGED_BY'] === 'Division of Parks and Forestry',
      description: 'PUBLIC_ACCESS=Yes; MANAGED_BY=Division of Parks and Forestry',
    },
    'child-nj-forestry-supplement-31-3e3440a95d': {
      predicate: (p) =>
        p.OWNERSHIP === 'State' &&
        p.LAND_MANAGER === 'NJ State Parks, Forests and Historic Sites' &&
        !['Restricted Access', 'Closed to Public', 'Closed'].includes(p.OPNS_STAT),
      description: 'State-owned State Parks POI; excludes restricted and closed',
    },
  };
  const nj = receipt.state === 'NJ' ? njFilters[receipt.sourceId] : null;
  if (nj) {
    selected = selected.filter((feature) => nj.predicate(feature.properties ?? {}));
    filters.push(nj.description);
  }
  return { selected, filters };
}

export async function readAgency(code) {
  const root = join(privateRoot, 'agency-feeds', 'US', code);
  const directories = (
    await readdir(root, { withFileTypes: true }).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    })
  )
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();
  const seenUrls = new Set();
  const features = [];
  const sources = [];
  for (const directory of directories) {
    const path = join(root, directory);
    let receipt;
    try {
      receipt = JSON.parse(await readFile(join(path, 'receipt.json'), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (
      receipt.state !== code ||
      !(
        (receipt.rightsStatus === 'Unconfirmed' && receipt.provisionalPrivateValidation === true) ||
        (receipt.rightsStatus === 'Permission required' &&
          receipt.permissionRequiredPrivateValidation === true)
      ) ||
      receipt.publicDistribution !== false ||
      receipt.validationStatus === 'rejected-subject' ||
      seenUrls.has(`${receipt.sourceUrl}#${receipt.sourcePartition ?? ''}`) ||
      receipt.rawFilename !== 'raw.geojson'
    ) {
      continue;
    }
    if (visitorSourceExclusion(receipt)) continue;
    const resolution = privateSourceResolution(receipt);
    if (resolution?.status === 'wrong-subject') continue;
    const bytes = await readFile(join(path, receipt.rawFilename));
    if (sha256(bytes) !== receipt.sha256) throw new Error(`${directory}: raw checksum mismatch`);
    const collection = JSON.parse(bytes.toString('utf8'));
    if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
      throw new Error(`${directory}: invalid staged GeoJSON`);
    }
    seenUrls.add(`${receipt.sourceUrl}#${receipt.sourcePartition ?? ''}`);
    const { selected, filters } = privateAgencySelection(receipt, collection.features, resolution);
    sources.push({
      sourceId: receipt.sourceId,
      sourceUrl: receipt.sourceUrl,
      count: selected.length,
      ...(receipt.sourcePartition ? { sourcePartition: receipt.sourcePartition } : {}),
      ...(receipt.inputSha256 ? { inputSha256: receipt.inputSha256 } : {}),
      ...(filters.length ? { filters } : {}),
    });
    selected.forEach((feature, index) => {
      const converted = agencyFeature(receipt, feature, index);
      if (converted) features.push(converted);
    });
  }
  return { features, sources };
}

export async function buildPrivateStateAgencyIoverlander(code) {
  const registry = JSON.parse(
    await readFile(join(repository, 'config/us-state-forestry-agencies.json'), 'utf8'),
  );
  const state = registry.states.find((item) => item.code === code && code !== 'NY');
  if (!state) throw new Error(`unknown non-New-York state: ${code}`);
  const ignore = await readFile(join(repository, '.gitignore'), 'utf8');
  if (!ignore.split(/\r?\n/).includes('/PrivateData/')) {
    throw new Error('PrivateData must remain ignored by Git');
  }
  const boundary = await stateBoundary(code);
  const [ioverlander, agency] = await Promise.all([
    readIoverlander(state.name, boundary.geometry),
    readAgency(code),
  ]);
  if (agency.features.length === 0 && ioverlander.features.length === 0) {
    throw new Error(`${code}: no usable agency or iOverlander features`);
  }
  const output = join(privateRoot, 'catalogs', 'US', state.name, 'current');
  await mkdir(output, { recursive: true });
  const visitorReferences = await readPrivateVisitorReferences(code);
  const combined = [...ioverlander.features, ...agency.features];
  const enriched = visitorReferences
    ? attachVisitorReferences(combined, visitorReferences.references, code)
    : { features: combined, bindings: [] };
  const features = enriched.features;
  const collection = Buffer.from(`${JSON.stringify({ type: 'FeatureCollection', features })}\n`);
  const filename = 'agency-ioverlander.private.geojson';
  const manifest = {
    schemaVersion: 1,
    state: code,
    stateName: state.name,
    classification: 'PRIVATE_USER',
    publicDistribution: false,
    packageMode: agency.features.length > 0 ? 'agency-and-ioverlander' : 'ioverlander-only',
    generatedAt: new Date().toISOString(),
    censusBoundary: { url: censusUrl, sha256: boundary.sha256 },
    ioverlander: {
      tileCount: ioverlander.tiles,
      featureCount: ioverlander.features.length,
      packages: ioverlander.packages,
    },
    agency: {
      status: agency.features.length > 0 ? 'staged-private-validation' : 'not-included',
      sourceCount: agency.sources.length,
      featureCount: agency.features.length,
      sources: agency.sources,
    },
    ...(visitorReferences
      ? {
          visitorReferences: {
            file: 'visitor-references.private.json',
            sha256: visitorReferences.sha256,
            bytes: visitorReferences.bytes.length,
            profileCount: visitorReferences.references.profiles.length,
            bindings: enriched.bindings,
          },
        }
      : {}),
    output: {
      file: filename,
      featureCount: features.length,
      bytes: collection.length,
      sha256: sha256(collection),
    },
  };
  await writeFile(join(output, filename), collection);
  if (visitorReferences)
    await writeFile(join(output, 'visitor-references.private.json'), visitorReferences.bytes);
  await writeFile(
    join(output, 'agency-ioverlander.manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await deduplicatePrivateStatePackage(repository, code, state.name);
  return JSON.parse(await readFile(join(output, 'agency-ioverlander.manifest.json'), 'utf8'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = process.argv[2]?.toUpperCase();
  if (!code)
    throw new Error(
      'Usage: node tools/build-private-state-agency-ioverlander.mjs <state-code>|--all',
    );
  if (code === '--ALL') {
    const registry = JSON.parse(
      await readFile(join(repository, 'config/us-state-forestry-agencies.json'), 'utf8'),
    );
    const results = [];
    for (const state of registry.states.filter((item) => item.code !== 'NY')) {
      try {
        const result = await buildPrivateStateAgencyIoverlander(state.code);
        results.push({
          state: state.code,
          status: 'built',
          packageMode: result.packageMode,
          ioverlander: result.ioverlander.featureCount,
          agency: result.agency.featureCount,
        });
      } catch (error) {
        results.push({ state: state.code, status: 'error', error: String(error).slice(0, 250) });
      }
      console.log(`${results.length}/49 ${state.code}: ${results.at(-1).status}`);
    }
    const reportPath = join(privateRoot, 'catalogs', 'US', 'agency-ioverlander-build-report.json');
    await writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`);
    console.log(
      JSON.stringify({
        built: results.filter((item) => item.status === 'built').length,
        ioverlanderOnly: results.filter((item) => item.packageMode === 'ioverlander-only').length,
        errors: results.filter((item) => item.status === 'error').length,
      }),
    );
  } else {
    const result = await buildPrivateStateAgencyIoverlander(code);
    console.log(
      JSON.stringify({
        state: code,
        packageMode: result.packageMode,
        ioverlander: result.ioverlander.featureCount,
        agency: result.agency.featureCount,
        total: result.output.featureCount,
      }),
    );
  }
}

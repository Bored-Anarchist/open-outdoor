import { createHash } from 'node:crypto';
import type {
  CanonicalGeometry,
  CanonicalRecord,
  FieldProvenance,
  LandUnitRecord,
  PlaceRecord,
  RestrictionRecord,
  TrailRecord,
} from './canonical.js';
import {
  CANONICAL_SCHEMA_VERSION,
  canonicalContentChecksum,
  validateCanonicalGeometry,
  validateCanonicalRecord,
} from './canonical.js';
import type { Connector, ConnectorManifest, DiscoveredAsset, StoredRawAsset } from './connector.js';
import { evaluateSourceRights, validateConnectorManifest } from './connector.js';
import type { RawArtifactStore } from './ingestion.js';
import { CanonicalSourceIdRegistry, type GeoJsonSourceFeature } from './new-york.js';
import type { PublicPackArtifact, PublicPackSourceRegistration } from './public-pack.js';

export const SECONDARY_CONNECTOR_VERSION = '1.0.0' as const;
export const SECONDARY_REGISTRY_REVIEWED_AT = '2026-08-31T00:00:00.000Z' as const;

export type SecondarySourceAdapter = 'offset-json' | 'osm-pbf' | 'tnm-json';
export type SecondarySourceFamily = 'ridb' | 'nps' | 'osm' | '3dep';

export interface SecondarySourceDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly owner: string;
  readonly canonicalUrl: string;
  readonly endpoint: string;
  readonly adapter: SecondarySourceAdapter;
  readonly family: SecondarySourceFamily;
  readonly resource: string;
  readonly licenseId: string;
  readonly disclaimer: string;
  readonly pageSize: number;
  readonly query: Readonly<Record<string, string>>;
  readonly staleAfterSeconds: number;
  readonly contentTypes: readonly string[];
  readonly allowedRecordTypes: readonly CanonicalRecord['recordType'][];
  readonly manifest: ConnectorManifest;
}

interface SecondarySourceOptions {
  readonly id: string;
  readonly displayName: string;
  readonly owner: string;
  readonly canonicalUrl: string;
  readonly endpoint: string;
  readonly adapter: SecondarySourceAdapter;
  readonly family: SecondarySourceFamily;
  readonly resource: string;
  readonly licenseId: string;
  readonly disclaimer: string;
  readonly attribution: readonly string[];
  readonly termsUrl: string;
  readonly parsedFields: readonly string[];
  readonly allowedRecordTypes: readonly CanonicalRecord['recordType'][];
  readonly secretNames?: readonly string[];
  readonly acquisitionMode?: ConnectorManifest['acquisitionMode'];
  readonly pageSize?: number;
  readonly query?: Readonly<Record<string, string>>;
  readonly staleAfterSeconds: number;
  readonly contentTypes?: readonly string[];
  readonly allowedHosts?: readonly string[];
}

function secondarySource(options: SecondarySourceOptions): SecondarySourceDefinition {
  const endpoint = new URL(options.endpoint);
  const manifest: ConnectorManifest = {
    schemaVersion: '1.0.0',
    connectorVersion: SECONDARY_CONNECTOR_VERSION,
    sourceId: options.id,
    lifecycle: 'active',
    authorization: 'authorized',
    acquisitionMode: options.acquisitionMode ?? 'automated',
    sourceClass: 'current',
    classification: 'SOURCE_REDISTRIBUTABLE',
    allowedTransports: ['https'],
    allowedHosts: [...new Set([endpoint.hostname, ...(options.allowedHosts ?? [])])],
    secretNames: options.secretNames ?? [],
    rights: {
      rawRetention: options.family === 'osm' ? 'P7D' : 'P30D',
      parsedFields: options.parsedFields,
      media: false,
      derivedData: true,
      offlineStorage: true,
      distribution: { public: true, 'private-user': true, 'private-organization': true },
      attribution: options.attribution,
      termsUrl: options.termsUrl,
      evidenceReviewedAt: SECONDARY_REGISTRY_REVIEWED_AT,
      reviewExpiresAt: '2027-08-31T00:00:00.000Z',
    },
    limits: {
      maxPayloadBytes: options.family === 'osm' ? 700 * 1024 * 1024 : 64 * 1024 * 1024,
      maxArchiveEntries: 10_000,
      maxExpandedBytes: options.family === 'osm' ? 2 * 1024 * 1024 * 1024 : 256 * 1024 * 1024,
      maxCompressionRatio: 100,
      maxParserMilliseconds: 30 * 60 * 1000,
      maxRedirects: 0,
      maxConcurrency: 2,
    },
    requiredFreshnessSeconds: options.staleAfterSeconds,
  };
  return {
    ...options,
    pageSize: options.pageSize ?? 50,
    query: options.query ?? {},
    contentTypes: options.contentTypes ?? ['application/json'],
    manifest,
  };
}

const npsBase = {
  owner: 'U.S. National Park Service',
  canonicalUrl: 'https://www.nps.gov/subjects/developer/',
  family: 'nps' as const,
  adapter: 'offset-json' as const,
  licenseId: 'US-Government-Work',
  attribution: ['National Park Service'],
  termsUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
  secretNames: ['NPS_API_KEY'],
  query: { stateCode: 'NY' },
};

export const SECONDARY_SOURCE_REGISTRY: readonly SecondarySourceDefinition[] = [
  secondarySource({
    id: 'ridb-facilities-ny',
    displayName: 'Recreation.gov RIDB facilities and recreation areas, New York',
    owner: 'Recreation.gov Recreation Information Database',
    canonicalUrl: 'https://ridb.recreation.gov/',
    endpoint: 'https://ridb.recreation.gov/api/v1/facilities',
    adapter: 'offset-json',
    family: 'ridb',
    resource: 'facilities',
    licenseId: 'RIDB-API-Access-Agreement',
    disclaimer:
      'Federal providers remain responsible for source quality; coordinates may be incomplete.',
    attribution: ['Data source: ridb.recreation.gov'],
    termsUrl: 'https://ridb.recreation.gov/',
    parsedFields: [
      'FacilityID',
      'FacilityName',
      'FacilityTypeDescription',
      'FacilityLatitude',
      'FacilityLongitude',
      'LastUpdatedDate',
    ],
    allowedRecordTypes: ['place'],
    secretNames: ['RIDB_API_KEY'],
    query: { state: 'NY' },
    staleAfterSeconds: 30 * 24 * 60 * 60,
  }),
  secondarySource({
    ...npsBase,
    id: 'nps-parks-ny',
    displayName: 'National Park Service parks, New York',
    endpoint: 'https://developer.nps.gov/api/v1/parks',
    resource: 'parks',
    disclaimer: 'Third-party content and NPS trademarks are excluded from the public pack.',
    parsedFields: ['id', 'parkCode', 'fullName', 'latitude', 'longitude', 'lastIndexedDate'],
    allowedRecordTypes: ['place'],
    staleAfterSeconds: 30 * 24 * 60 * 60,
  }),
  secondarySource({
    ...npsBase,
    id: 'nps-campgrounds-ny',
    displayName: 'National Park Service campgrounds, New York',
    endpoint: 'https://developer.nps.gov/api/v1/campgrounds',
    resource: 'campgrounds',
    disclaimer: 'Campground records do not establish dispersed-camping eligibility.',
    parsedFields: ['id', 'parkCode', 'name', 'latitude', 'longitude', 'lastIndexedDate'],
    allowedRecordTypes: ['place'],
    staleAfterSeconds: 7 * 24 * 60 * 60,
  }),
  secondarySource({
    ...npsBase,
    id: 'nps-alerts-ny',
    displayName: 'National Park Service alerts, New York',
    endpoint: 'https://developer.nps.gov/api/v1/alerts',
    resource: 'alerts',
    disclaimer:
      'Bundled alerts are snapshots and must display data age and online verification limits.',
    parsedFields: ['id', 'parkCode', 'title', 'category', 'lastIndexedDate'],
    allowedRecordTypes: ['restriction'],
    staleAfterSeconds: 24 * 60 * 60,
  }),
  secondarySource({
    id: 'osm-geofabrik-ny',
    displayName: 'OpenStreetMap New York extract by Geofabrik',
    owner: 'OpenStreetMap contributors / Geofabrik',
    canonicalUrl: 'https://download.geofabrik.de/north-america/us/new-york.html',
    endpoint: 'https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf',
    adapter: 'osm-pbf',
    family: 'osm',
    resource: 'new-york-osm-pbf',
    licenseId: 'ODbL-1.0',
    disclaimer:
      'OSM is community-maintained and does not override authoritative closures or rules.',
    attribution: ['OpenStreetMap contributors', 'Geofabrik'],
    termsUrl: 'https://www.openstreetmap.org/copyright',
    parsedFields: ['id', 'geometry', 'tags'],
    allowedRecordTypes: ['land-unit', 'place', 'trail'],
    acquisitionMode: 'manual-import',
    staleAfterSeconds: 7 * 24 * 60 * 60,
    contentTypes: ['application/octet-stream', 'application/x-protobuf'],
  }),
  secondarySource({
    id: 'usgs-3dep-ny',
    displayName: 'USGS 3DEP downloadable elevation products, New York',
    owner: 'U.S. Geological Survey',
    canonicalUrl: 'https://www.usgs.gov/3d-elevation-program/about-3dep-products-services',
    endpoint: 'https://tnmaccess.nationalmap.gov/api/v1/products',
    adapter: 'tnm-json',
    family: '3dep',
    resource: '3dep-products',
    licenseId: 'US-Government-Work',
    disclaimer: 'Elevation products retain source resolution, date, and vertical datum metadata.',
    attribution: ['U.S. Geological Survey 3D Elevation Program'],
    termsUrl: 'https://www.usgs.gov/3d-elevation-program/about-3dep-products-services',
    parsedFields: [
      'sourceId',
      'title',
      'downloadURL',
      'sizeInBytes',
      'boundingBox',
      'publicationDate',
    ],
    allowedRecordTypes: [],
    query: {
      bbox: '-79.7624,40.4774,-71.7517,45.0159',
      datasets: 'Digital Elevation Model (DEM) 1 meter',
      prodFormats: 'GeoTIFF',
    },
    pageSize: 100,
    staleAfterSeconds: 90 * 24 * 60 * 60,
    allowedHosts: ['prd-tnm.s3.amazonaws.com', 'rockyweb.usgs.gov'],
  }),
] as const;

export function getSecondarySource(sourceId: string): SecondarySourceDefinition {
  const source = SECONDARY_SOURCE_REGISTRY.find((candidate) => candidate.id === sourceId);
  if (!source) throw new Error(`unknown secondary source: ${sourceId}`);
  return source;
}

export function assertSecondarySourceReady(source: SecondarySourceDefinition, now: string): void {
  validateConnectorManifest(source.manifest);
  for (const request of [
    { operation: 'acquire' as const, acquisitionMode: source.manifest.acquisitionMode },
    { operation: 'retain-raw' as const },
    { operation: 'derive' as const },
    { operation: 'store-offline' as const },
    { operation: 'distribute' as const, distribution: 'public' as const },
  ]) {
    const decision = evaluateSourceRights(source.manifest, { ...request, now });
    if (!decision.allowed) {
      throw new Error(`${source.id} rights gate failed: ${decision.reasons.join(',')}`);
    }
  }
}

export function secondaryPackSource(
  source: SecondarySourceDefinition,
): PublicPackSourceRegistration {
  return {
    sourceId: source.id,
    displayName: source.displayName,
    owner: source.owner,
    canonicalUrl: source.canonicalUrl,
    licenseId: source.licenseId,
    disclaimer: source.disclaimer,
    manifest: source.manifest,
    allowedRecordTypes: source.allowedRecordTypes,
  };
}

export interface ElevationProduct {
  readonly id: string;
  readonly sourceId: string;
  readonly externalId: string;
  readonly title: string;
  readonly downloadUrl: string;
  readonly byteLength: number | null;
  readonly bounds: readonly [number, number, number, number] | null;
  readonly resolutionMeters: number | null;
  readonly verticalDatum: 'orthometric_navd88' | 'other' | 'unknown';
  readonly retrievedAt: string;
  readonly sourceUpdatedAt: string | null;
  readonly metadataChecksum: string;
}

export function elevationProductToPublicPackArtifact(
  product: ElevationProduct,
  contentChecksum: string,
): PublicPackArtifact {
  if (!/^[0-9a-f]{64}$/.test(contentChecksum)) {
    throw new Error('3DEP artifact requires a SHA-256 content checksum');
  }
  if (product.byteLength === null) {
    throw new Error('3DEP artifact requires a verified byte length');
  }
  return {
    id: product.id,
    sourceId: product.sourceId,
    kind: 'elevation-tile',
    locator: product.downloadUrl,
    contentChecksum,
    byteLength: product.byteLength,
    classification: 'SOURCE_REDISTRIBUTABLE',
    sourceUpdatedAt: product.sourceUpdatedAt,
    metadata: {
      bounds: product.bounds,
      metadataChecksum: product.metadataChecksum,
      resolutionMeters: product.resolutionMeters,
      title: product.title,
      verticalDatum: product.verticalDatum,
    },
  };
}

export interface SecondaryNormalizedBatch {
  readonly records: readonly CanonicalRecord[];
  readonly elevationProducts: readonly ElevationProduct[];
}

export interface SecondaryFetchResult {
  readonly status: number;
  readonly contentType: string;
  readonly body: Uint8Array;
  readonly redirectCount: number;
}

export type SecondaryFetcher = (
  url: string,
  headers: Readonly<Record<string, string>>,
  signal: AbortSignal,
) => Promise<SecondaryFetchResult>;

export type OsmPbfDecoder = (
  payload: Uint8Array,
  source: SecondarySourceDefinition,
) => Promise<readonly GeoJsonSourceFeature[]>;

export interface SecondaryConnectorOptions {
  readonly source: SecondarySourceDefinition;
  readonly fetcher: SecondaryFetcher;
  readonly rawStore: RawArtifactStore;
  readonly ids: CanonicalSourceIdRegistry;
  readonly secrets?: Readonly<Record<string, string>>;
  readonly osmDecoder?: OsmPbfDecoder;
  readonly pinnedBulkLocator?: string;
  readonly pinnedBulkChecksum?: string;
  readonly checkpoint?: (asset: StoredRawAsset) => Promise<void>;
  readonly now?: () => string;
}

interface ParsedSecondaryPayload {
  readonly partition: string;
  readonly retrievedAt: string;
  readonly items: readonly Readonly<Record<string, unknown>>[];
  readonly osmFeatures: readonly GeoJsonSourceFeature[];
}

function headersFor(options: SecondaryConnectorOptions): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: options.source.family === 'osm' ? 'application/octet-stream' : 'application/json',
  };
  for (const name of options.source.manifest.secretNames) {
    const secret = options.secrets?.[name];
    if (!secret) throw new Error(`${options.source.id} requires secret ${name}`);
    headers[name === 'NPS_API_KEY' ? 'X-Api-Key' : 'apikey'] = secret;
  }
  return headers;
}

function withQuery(source: SecondarySourceDefinition, offset: number, limit: number): string {
  const url = new URL(source.endpoint);
  Object.entries(source.query).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set(source.family === 'nps' ? 'start' : 'offset', String(offset));
  return url.toString();
}

function jsonTotal(source: SecondarySourceDefinition, payload: unknown): number {
  if (!payload || typeof payload !== 'object') return NaN;
  const object = payload as Record<string, unknown>;
  if (source.family === 'ridb') {
    const metadata = object.METADATA as Record<string, unknown> | undefined;
    const results = metadata?.RESULTS as Record<string, unknown> | undefined;
    return Number(results?.TOTAL_COUNT);
  }
  return Number(object.total);
}

function jsonItems(
  source: SecondarySourceDefinition,
  payload: unknown,
): readonly Readonly<Record<string, unknown>>[] {
  if (!payload || typeof payload !== 'object') return [];
  const object = payload as Record<string, unknown>;
  const value =
    source.family === 'ridb'
      ? object.RECDATA
      : source.family === 'nps'
        ? object.data
        : object.items;
  return Array.isArray(value)
    ? value.filter(
        (item): item is Readonly<Record<string, unknown>> => !!item && typeof item === 'object',
      )
    : [];
}

async function discoverSecondaryAssets(
  options: SecondaryConnectorOptions,
  signal: AbortSignal,
): Promise<readonly DiscoveredAsset[]> {
  const source = options.source;
  if (source.adapter === 'osm-pbf') {
    const locator = options.pinnedBulkLocator;
    if (
      !locator ||
      /latest/.test(locator) ||
      !options.pinnedBulkChecksum ||
      !/^(?:[0-9a-f]{32}|[0-9a-f]{64})$/.test(options.pinnedBulkChecksum)
    ) {
      throw new Error('OSM acquisition requires a dated checksum-pinned extract locator');
    }
    return [{ externalId: 'dated-pbf', sourcePartition: 'new-york-pbf', locator }];
  }
  const response = await options.fetcher(withQuery(source, 0, 1), headersFor(options), signal);
  if (response.status !== 200) {
    throw new Error(`${source.id} discovery failed with ${response.status}`);
  }
  const total = jsonTotal(source, JSON.parse(new TextDecoder().decode(response.body)) as unknown);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error(`${source.id} returned invalid total`);
  }
  return Array.from({ length: Math.ceil(total / source.pageSize) }, (_unused, index) => ({
    externalId: `page-${index}`,
    sourcePartition: `page-${index.toString().padStart(4, '0')}`,
    locator: withQuery(source, index * source.pageSize, source.pageSize),
  }));
}

function text(
  item: Readonly<Record<string, unknown>>,
  names: readonly string[],
  fallback: string,
): string {
  for (const name of names) {
    const value = item[name];
    if ((typeof value === 'string' || typeof value === 'number') && String(value).trim() !== '') {
      return String(value).trim().normalize('NFC');
    }
  }
  return fallback;
}

function numberValue(
  item: Readonly<Record<string, unknown>>,
  names: readonly string[],
): number | null {
  for (const name of names) {
    const raw = item[name];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
      const match = raw.trim().match(/^-?(?:\d+(?:\.\d*)?|\.\d+)/);
      if (match) {
        const value = Number(match[0]);
        if (Number.isFinite(value)) return value;
      }
    }
  }
  return null;
}

function utcValue(
  item: Readonly<Record<string, unknown>>,
  names: readonly string[],
): string | null {
  for (const name of names) {
    const value = item[name];
    if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
      return new Date(value).toISOString();
    }
  }
  return null;
}

function provenance(
  item: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Readonly<Record<string, FieldProvenance>> {
  return Object.fromEntries(
    fields.map((field) => [
      field,
      {
        sourceField: field,
        sourceValue:
          typeof item[field] === 'string' ||
          typeof item[field] === 'number' ||
          typeof item[field] === 'boolean' ||
          item[field] === null
            ? (item[field] as string | number | boolean | null)
            : JSON.stringify(item[field] ?? null),
        observedAt: null,
        transformation: `secondary-normalizer@${SECONDARY_CONNECTOR_VERSION}`,
      },
    ]),
  );
}

function recordBase(
  source: SecondarySourceDefinition,
  externalId: string,
  partition: string,
  retrievedAt: string,
  sourceUpdatedAt: string | null,
  geometry: CanonicalGeometry | null,
  item: Readonly<Record<string, unknown>>,
  ids: CanonicalSourceIdRegistry,
) {
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    id: ids.getOrCreate(source.id, externalId, partition),
    source: {
      sourceId: source.id,
      externalId,
      sourcePartition: partition,
      connectorVersion: SECONDARY_CONNECTOR_VERSION,
      parserVersion: SECONDARY_CONNECTOR_VERSION,
      normalizerVersion: SECONDARY_CONNECTOR_VERSION,
    },
    retrievedAt,
    sourceUpdatedAt,
    geometry,
    geometryQuality: geometry
      ? {
          sourceCrs: 'EPSG:4326',
          sourceAxisOrder: 'longitude-latitude',
          coordinatePrecisionMeters: null,
          flags: ['planning-reference'],
          repair: null,
        }
      : null,
    fieldProvenance: provenance(item, source.manifest.rights.parsedFields),
    rights: {
      policyId: `${source.id}-rights-${SECONDARY_REGISTRY_REVIEWED_AT.slice(0, 10)}`,
      distribution: 'public' as const,
      attribution: source.manifest.rights.attribution,
    },
    validation: { state: 'valid' as const, reasonCodes: [] },
    contentChecksum: canonicalContentChecksum(item),
    tombstone: false,
    classification: 'public-reference' as const,
  };
}

function pointFromItem(item: Readonly<Record<string, unknown>>): CanonicalGeometry | null {
  const latitude = numberValue(item, ['FacilityLatitude', 'latitude', 'lat']);
  const longitude = numberValue(item, ['FacilityLongitude', 'longitude', 'lon', 'long']);
  if (
    latitude === null ||
    longitude === null ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  return { type: 'Point', coordinates: [longitude, latitude] };
}

function placeRecord(
  source: SecondarySourceDefinition,
  item: Readonly<Record<string, unknown>>,
  partition: string,
  retrievedAt: string,
  ids: CanonicalSourceIdRegistry,
): PlaceRecord {
  const externalId = text(item, ['FacilityID', 'id', 'parkCode'], '');
  if (!externalId) throw new Error(`${source.id} record lacks identity`);
  const geometry = pointFromItem(item);
  if (!geometry || geometry.type !== 'Point') {
    throw new Error(`${source.id} place lacks valid coordinates`);
  }
  const rawCategory = text(item, ['FacilityTypeDescription', 'category'], source.resource);
  const lower = `${rawCategory} ${source.resource}`.toLocaleLowerCase('en-US');
  const category = lower.includes('campground')
    ? 'camping.established-campground'
    : lower.includes('facility')
      ? 'traveler.recreation-facility'
      : lower.includes('park')
        ? 'traveler.park'
        : 'other';
  return validateCanonicalRecord({
    ...recordBase(
      source,
      externalId,
      partition,
      retrievedAt,
      utcValue(item, ['LastUpdatedDate', 'lastIndexedDate']),
      geometry,
      item,
      ids,
    ),
    recordType: 'place',
    properties: {
      name: text(item, ['FacilityName', 'name', 'fullName'], `${source.displayName} place`),
      category,
      rawCategory: category === 'other' ? rawCategory : null,
      entrances: [],
      elevation: null,
    },
  }) as PlaceRecord;
}

function restrictionRecord(
  source: SecondarySourceDefinition,
  item: Readonly<Record<string, unknown>>,
  partition: string,
  retrievedAt: string,
  ids: CanonicalSourceIdRegistry,
): RestrictionRecord {
  const externalId = text(item, ['id'], '');
  if (!externalId) throw new Error(`${source.id} alert lacks identity`);
  const sourceUpdatedAt = utcValue(item, ['lastIndexedDate']) ?? retrievedAt;
  return validateCanonicalRecord({
    ...recordBase(source, externalId, partition, retrievedAt, sourceUpdatedAt, null, item, ids),
    recordType: 'restriction',
    properties: {
      name: text(item, ['title'], 'NPS alert'),
      interval: { start: sourceUpdatedAt, end: null, quality: 'known' },
      scope: text(item, ['parkCode'], 'National Park Service unit'),
      authority: 'National Park Service alert',
      relationship: 'independent',
      relatedRecordId: null,
    },
  }) as RestrictionRecord;
}

function osmRecord(
  source: SecondarySourceDefinition,
  feature: GeoJsonSourceFeature,
  partition: string,
  retrievedAt: string,
  ids: CanonicalSourceIdRegistry,
): CanonicalRecord {
  if (!feature.geometry) throw new Error('OSM feature lacks geometry');
  validateCanonicalGeometry(feature.geometry);
  const externalId = String(feature.id ?? feature.properties.id ?? '');
  if (!externalId) throw new Error('OSM feature lacks identity');
  const tags =
    feature.properties.tags && typeof feature.properties.tags === 'object'
      ? (feature.properties.tags as Readonly<Record<string, unknown>>)
      : feature.properties;
  const item = { ...tags, id: externalId };
  const name = text(tags, ['name'], `OpenStreetMap ${externalId}`);
  const base = recordBase(
    source,
    externalId,
    partition,
    retrievedAt,
    null,
    feature.geometry,
    item,
    ids,
  );
  if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
    const fingerprint = createHash('sha256').update(JSON.stringify(feature.geometry)).digest('hex');
    return validateCanonicalRecord({
      ...base,
      recordType: 'trail',
      properties: {
        name,
        trailKind: tags.highway === 'path' || tags.highway === 'footway' ? 'route' : 'system',
        rawTrailKind: text(tags, ['highway', 'route'], 'unknown'),
        lengthMeters: 0,
        fingerprint,
      },
    }) as TrailRecord;
  }
  if (feature.geometry.type === 'Point') {
    const rawCategory = text(tags, ['tourism', 'amenity', 'barrier'], 'unknown');
    const category =
      rawCategory === 'camp_site'
        ? 'camping.dispersed-site'
        : rawCategory === 'parking'
          ? 'vehicle.parking'
          : rawCategory === 'toilets'
            ? 'hygiene.toilet'
            : rawCategory === 'gate'
              ? 'traveler.barrier'
              : 'other';
    return validateCanonicalRecord({
      ...base,
      recordType: 'place',
      properties: {
        name,
        category,
        rawCategory: category === 'other' ? rawCategory : null,
        entrances: [],
        elevation: null,
      },
    }) as PlaceRecord;
  }
  if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
    return validateCanonicalRecord({
      ...base,
      recordType: 'land-unit',
      properties: {
        name,
        ownership: 'unknown',
        manager: text(tags, ['operator'], 'unknown'),
        areaSquareMeters: 0,
        baseRule: 'unknown',
      },
    }) as LandUnitRecord;
  }
  throw new Error('OSM feature geometry is unsupported');
}

function elevationProduct(
  source: SecondarySourceDefinition,
  item: Readonly<Record<string, unknown>>,
  partition: string,
  retrievedAt: string,
  ids: CanonicalSourceIdRegistry,
): ElevationProduct {
  const externalId = text(item, ['sourceId', 'id', 'title'], '');
  const downloadUrl = text(item, ['downloadURL', 'downloadUrl'], '');
  if (!externalId || !/^https:\/\//.test(downloadUrl)) {
    throw new Error('3DEP product lacks identity or HTTPS download');
  }
  const bounding = item.boundingBox as Record<string, unknown> | undefined;
  const bounds = bounding
    ? ([
        Number(bounding.minX),
        Number(bounding.minY),
        Number(bounding.maxX),
        Number(bounding.maxY),
      ] as const)
    : null;
  return {
    id: ids.getOrCreate(source.id, externalId, partition),
    sourceId: source.id,
    externalId,
    title: text(item, ['title'], externalId),
    downloadUrl,
    byteLength: numberValue(item, ['sizeInBytes']),
    bounds: bounds?.every(Number.isFinite) ? bounds : null,
    resolutionMeters: numberValue(item, ['resolution', 'resolutionMeters']),
    verticalDatum: /NAVD\s*88/i.test(text(item, ['verticalDatum'], ''))
      ? 'orthometric_navd88'
      : 'unknown',
    retrievedAt,
    sourceUpdatedAt: utcValue(item, ['publicationDate', 'lastUpdated']),
    metadataChecksum: canonicalContentChecksum(item),
  };
}

function normalizeSecondaryPayload(
  source: SecondarySourceDefinition,
  payload: ParsedSecondaryPayload,
  ids: CanonicalSourceIdRegistry,
): SecondaryNormalizedBatch {
  if (source.family === 'osm') {
    return {
      records: payload.osmFeatures.map((feature) =>
        osmRecord(source, feature, payload.partition, payload.retrievedAt, ids),
      ),
      elevationProducts: [],
    };
  }
  if (source.family === '3dep') {
    return {
      records: [],
      elevationProducts: payload.items.map((item) =>
        elevationProduct(source, item, payload.partition, payload.retrievedAt, ids),
      ),
    };
  }
  return {
    records: payload.items.map((item) =>
      source.resource === 'alerts'
        ? restrictionRecord(source, item, payload.partition, payload.retrievedAt, ids)
        : placeRecord(source, item, payload.partition, payload.retrievedAt, ids),
    ),
    elevationProducts: [],
  };
}

function checksumMatches(payload: Uint8Array, expected: string): boolean {
  const algorithm = expected.length === 32 ? 'md5' : 'sha256';
  return createHash(algorithm).update(payload).digest('hex') === expected;
}

function assertAllowedHost(source: SecondarySourceDefinition, locator: string): void {
  const url = new URL(locator);
  if (url.protocol !== 'https:' || !source.manifest.allowedHosts.includes(url.hostname)) {
    throw new Error(`${source.id} returned a locator outside its allowlist`);
  }
}

export function createSecondaryConnector(
  options: SecondaryConnectorOptions,
): Connector<ParsedSecondaryPayload, SecondaryNormalizedBatch, SecondaryNormalizedBatch> {
  const source = options.source;
  assertSecondarySourceReady(source, (options.now ?? (() => new Date().toISOString()))());
  return {
    manifest: source.manifest,
    discover: ({ signal }) => discoverSecondaryAssets(options, signal),
    fetch: async (asset, { signal }) => {
      assertAllowedHost(source, asset.locator);
      const response = await options.fetcher(asset.locator, headersFor(options), signal);
      if (response.status !== 200) {
        throw new Error(`${source.id} fetch failed with ${response.status}`);
      }
      if (!source.contentTypes.some((type) => response.contentType.toLowerCase().includes(type))) {
        throw new Error(`${source.id} returned unexpected content type ${response.contentType}`);
      }
      if (
        source.family === 'osm' &&
        (!options.pinnedBulkChecksum || !checksumMatches(response.body, options.pinnedBulkChecksum))
      ) {
        throw new Error('OSM extract checksum does not match its pinned checksum');
      }
      return {
        ...asset,
        payload: response.body,
        contentType: response.contentType,
        retrievedAt: (options.now ?? (() => new Date().toISOString()))(),
        redirectCount: response.redirectCount,
      };
    },
    storeRaw: (asset) =>
      options.rawStore.put(asset.payload, {
        sourceId: source.id,
        externalId: asset.externalId,
        sourcePartition: asset.sourcePartition,
        retrievedAt: asset.retrievedAt,
        contentType: asset.contentType,
        classification: source.manifest.classification,
        retention: source.manifest.rights.rawRetention ?? '',
      }),
    parse: async (asset) => {
      if (source.family === 'osm') {
        if (!options.osmDecoder) throw new Error('OSM PBF decoder is required');
        const osmFeatures = await options.osmDecoder(asset.payload, source);
        if (osmFeatures.length === 0) throw new Error('OSM extract produced no approved features');
        return {
          partition: asset.sourcePartition,
          retrievedAt: asset.retrievedAt,
          items: [],
          osmFeatures,
        };
      }
      const payload = JSON.parse(new TextDecoder().decode(asset.payload)) as unknown;
      const items = jsonItems(source, payload);
      if (items.length === 0) throw new Error(`${source.id} page contains no records`);
      return {
        partition: asset.sourcePartition,
        retrievedAt: asset.retrievedAt,
        items,
        osmFeatures: [],
      };
    },
    normalize: async (payload) => normalizeSecondaryPayload(source, payload, options.ids),
    validate: async (batch) => {
      batch.records.forEach(validateCanonicalRecord);
      for (const product of batch.elevationProducts) {
        assertAllowedHost(source, product.downloadUrl);
        if (
          product.sourceId !== source.id ||
          !/^[0-9a-f]{64}$/.test(product.metadataChecksum) ||
          (product.byteLength !== null &&
            (!Number.isSafeInteger(product.byteLength) || product.byteLength < 0))
        ) {
          throw new Error('3DEP product metadata is invalid');
        }
      }
    },
    checkpoint: async (asset) => options.checkpoint?.(asset),
    emit: async (batch) => batch,
  };
}

export const defaultSecondaryFetcher: SecondaryFetcher = async (url, headers, signal) => {
  const response = await fetch(url, { headers, signal, redirect: 'manual' });
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    body: new Uint8Array(await response.arrayBuffer()),
    redirectCount: 0,
  };
};

export interface SecondaryCoverageSource {
  readonly sourceId: string;
  readonly family: SecondarySourceFamily;
  readonly recordCount: number;
  readonly elevationProductCount: number;
  readonly geometryCount: number;
  readonly dataAsOf: string | null;
  readonly stale: boolean;
}

export interface SecondaryCoverageReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly sources: readonly SecondaryCoverageSource[];
  readonly missingFamilies: readonly SecondarySourceFamily[];
  readonly staleSourceIds: readonly string[];
}

export function buildSecondaryCoverageReport(
  generatedAt: string,
  batches: readonly SecondaryNormalizedBatch[],
): SecondaryCoverageReport {
  const now = Date.parse(generatedAt);
  if (!Number.isFinite(now)) throw new Error('coverage generation time must be an instant');
  const sources = SECONDARY_SOURCE_REGISTRY.map((source) => {
    const records = batches
      .flatMap((batch) => batch.records)
      .filter((record) => record.source.sourceId === source.id);
    const products = batches
      .flatMap((batch) => batch.elevationProducts)
      .filter((product) => product.sourceId === source.id);
    const dates = [
      ...records.map((record) => record.sourceUpdatedAt ?? record.retrievedAt),
      ...products.map((product) => product.sourceUpdatedAt ?? product.retrievedAt),
    ].sort((left, right) => Date.parse(right) - Date.parse(left));
    const dataAsOf = dates[0] ?? null;
    return {
      sourceId: source.id,
      family: source.family,
      recordCount: records.length,
      elevationProductCount: products.length,
      geometryCount: records.filter((record) => record.geometry !== null).length,
      dataAsOf,
      stale: dataAsOf === null || now - Date.parse(dataAsOf) > source.staleAfterSeconds * 1000,
    };
  });
  const families: readonly SecondarySourceFamily[] = ['ridb', 'nps', 'osm', '3dep'];
  return {
    schemaVersion: 1,
    generatedAt,
    sources,
    missingFamilies: families.filter((family) =>
      sources
        .filter((source) => source.family === family)
        .every((source) => source.recordCount + source.elevationProductCount === 0),
    ),
    staleSourceIds: sources.filter((source) => source.stale).map((source) => source.sourceId),
  };
}

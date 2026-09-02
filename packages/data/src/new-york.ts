import { createHash, randomUUID } from 'node:crypto';
import type {
  CanonicalGeometry,
  CanonicalRecord,
  ConditionRecord,
  FieldProvenance,
  LandUnitRecord,
  PlaceRecord,
  Position,
  RestrictionRecord,
  TrailRecord,
} from './canonical.js';
import {
  CANONICAL_SCHEMA_VERSION,
  canonicalContentChecksum,
  validateCanonicalGeometry,
  validateCanonicalRecord,
} from './canonical.js';
import type { AccessDirective, CampingRule } from './camping.js';
import type { Connector, ConnectorManifest, DiscoveredAsset, StoredRawAsset } from './connector.js';
import { evaluateSourceRights, validateConnectorManifest } from './connector.js';
import type { RawArtifactStore } from './ingestion.js';

export const NEW_YORK_CONNECTOR_VERSION = '1.0.0' as const;
export const NEW_YORK_REGISTRY_REVIEWED_AT = '2026-08-31T00:00:00.000Z' as const;

export type NewYorkSourceFamily =
  | 'boundary'
  | 'land'
  | 'ownership-cross-check'
  | 'trail'
  | 'road-access'
  | 'poi'
  | 'rule-document'
  | 'restriction-document';

export interface NewYorkSourceDefinition {
  readonly id: string;
  readonly workPackage: 'WP-206' | 'WP-207' | 'WP-208';
  readonly displayName: string;
  readonly owner: string;
  readonly canonicalUrl: string;
  readonly endpoint: string;
  readonly adapter: 'arcgis-feature-service' | 'socrata' | 'bulk-release' | 'reviewed-document';
  readonly family: NewYorkSourceFamily;
  readonly sourceCrs: string;
  readonly attribution: readonly string[];
  readonly disclaimer: string;
  readonly requiredFields: readonly string[];
  readonly contentTypes: readonly string[];
  readonly pageSize: number;
  readonly staleAfterSeconds: number;
  readonly queryParameters: Readonly<Record<string, string>>;
  readonly manifest: ConnectorManifest;
}

interface SourceOptions {
  readonly id: string;
  readonly workPackage: NewYorkSourceDefinition['workPackage'];
  readonly displayName: string;
  readonly owner: string;
  readonly canonicalUrl: string;
  readonly endpoint: string;
  readonly adapter: NewYorkSourceDefinition['adapter'];
  readonly family: NewYorkSourceFamily;
  readonly sourceCrs: string;
  readonly attribution: readonly string[];
  readonly disclaimer: string;
  readonly requiredFields: readonly string[];
  readonly contentTypes?: readonly string[];
  readonly allowedHosts?: readonly string[];
  readonly termsUrl?: string;
  readonly pageSize?: number;
  readonly staleAfterSeconds: number;
  readonly queryParameters?: Readonly<Record<string, string>>;
}

function sourceDefinition(options: SourceOptions): NewYorkSourceDefinition {
  const endpoint = new URL(options.endpoint);
  const rawRetention = options.family.includes('document') ? 'P7D' : 'P30D';
  const manifest: ConnectorManifest = {
    schemaVersion: '1.0.0',
    connectorVersion: NEW_YORK_CONNECTOR_VERSION,
    sourceId: options.id,
    lifecycle: 'active',
    authorization: 'authorized',
    acquisitionMode: 'automated',
    sourceClass: 'current',
    classification: 'SOURCE_REDISTRIBUTABLE',
    allowedTransports: ['https'],
    allowedHosts: [...new Set([endpoint.hostname, ...(options.allowedHosts ?? [])])],
    secretNames: [],
    rights: {
      rawRetention,
      parsedFields: options.requiredFields,
      media: false,
      derivedData: true,
      offlineStorage: true,
      distribution: { public: true, 'private-user': true, 'private-organization': true },
      attribution: options.attribution,
      termsUrl: options.termsUrl ?? options.canonicalUrl,
      evidenceReviewedAt: NEW_YORK_REGISTRY_REVIEWED_AT,
      reviewExpiresAt: '2027-08-31T00:00:00.000Z',
    },
    limits: {
      maxPayloadBytes: 256 * 1024 * 1024,
      maxArchiveEntries: 10_000,
      maxExpandedBytes: 4 * 1024 * 1024 * 1024,
      maxCompressionRatio: 100,
      maxParserMilliseconds: 15 * 60 * 1000,
      maxRedirects: 0,
      maxConcurrency: 2,
    },
    requiredFreshnessSeconds: options.staleAfterSeconds,
  };
  return {
    ...options,
    contentTypes: options.contentTypes ?? ['application/json', 'application/geo+json'],
    pageSize: options.pageSize ?? 1_000,
    queryParameters: options.queryParameters ?? {},
    manifest,
  };
}

export const NEW_YORK_SOURCE_REGISTRY: readonly NewYorkSourceDefinition[] = [
  sourceDefinition({
    id: 'nys-its-state-boundary',
    workPackage: 'WP-206',
    displayName: 'New York State civil boundary',
    owner: 'NYS ITS Geospatial Services',
    canonicalUrl: 'https://gis.ny.gov/civil-boundaries',
    endpoint:
      'https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Civil_Boundaries/FeatureServer/0',
    adapter: 'arcgis-feature-service',
    family: 'boundary',
    sourceCrs: 'EPSG:3857 transformed by service to EPSG:4326',
    attribution: ['NYS Office of Information Technology Services Geospatial Services'],
    disclaimer: 'Planning geometry is not a legal survey boundary.',
    requiredFields: ['OBJECTID', 'NAME', 'ABBREV', 'FIPS_CODE', 'DATEMOD'],
    staleAfterSeconds: 180 * 24 * 60 * 60,
  }),
  sourceDefinition({
    id: 'usgs-padus-ny',
    workPackage: 'WP-206',
    displayName: 'USGS PAD-US New York extract',
    owner: 'U.S. Geological Survey',
    canonicalUrl: 'https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-download',
    endpoint: 'https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-download',
    adapter: 'bulk-release',
    family: 'ownership-cross-check',
    sourceCrs: 'release-declared; transformed to EPSG:4326',
    attribution: ['U.S. Geological Survey Protected Areas Database of the United States'],
    disclaimer: 'PAD-US is a coarse ownership and access cross-check, not parcel evidence.',
    requiredFields: ['OBJECTID', 'Unit_Nm', 'Own_Type', 'Mang_Name', 'State_Nm'],
    allowedHosts: ['sciencebase.gov', 'www.sciencebase.gov'],
    staleAfterSeconds: 366 * 24 * 60 * 60,
  }),
  sourceDefinition({
    id: 'nys-dec-lands',
    workPackage: 'WP-206',
    displayName: 'NYS DEC lands',
    owner: 'New York State Department of Environmental Conservation',
    canonicalUrl: 'https://gisservices.dec.ny.gov/arcgis/rest/services/reference/MapServer/2',
    endpoint: 'https://gisservices.dec.ny.gov/arcgis/rest/services/reference/MapServer/2',
    adapter: 'arcgis-feature-service',
    family: 'land',
    sourceCrs: 'EPSG:26918 transformed by service to EPSG:4326',
    attribution: ['New York State Department of Environmental Conservation'],
    disclaimer: 'DEC category and public-use fields do not establish camping legality.',
    requiredFields: ['OBJECTID', 'CATEGORY', 'UNIT', 'FACILITY', 'CLASS', 'PUBLICUSE', 'UPDATED'],
    staleAfterSeconds: 30 * 24 * 60 * 60,
  }),
  sourceDefinition({
    id: 'usfs-surface-ownership-ny',
    workPackage: 'WP-206',
    displayName: 'USFS surface ownership, New York clip',
    owner: 'USDA Forest Service',
    canonicalUrl:
      'https://apps.fs.usda.gov/ArcX/rest/services/EDW/EDW_SurfaceOwnership_01/MapServer',
    endpoint: 'https://apps.fs.usda.gov/ArcX/rest/services/EDW/EDW_SurfaceOwnership_01/MapServer/0',
    adapter: 'arcgis-feature-service',
    family: 'ownership-cross-check',
    sourceCrs: 'EPSG:4269 transformed by service to EPSG:4326',
    attribution: ['USDA Forest Service Enterprise Data Warehouse'],
    disclaimer: 'Surface ownership is dynamic and is not a legal title or boundary document.',
    requiredFields: ['OBJECTID', 'OWNERCLASSIFICATION', 'ADMINORGANIZATION'],
    queryParameters: {
      geometry: '-79.7624,40.4774,-71.7517,45.0159',
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
    },
    pageSize: 2_000,
    staleAfterSeconds: 30 * 24 * 60 * 60,
  }),
  sourceDefinition({
    id: 'nys-dec-roads',
    workPackage: 'WP-207',
    displayName: 'NYS DEC roads',
    owner: 'New York State Department of Environmental Conservation',
    canonicalUrl: 'https://gisservices.dec.ny.gov/arcgis/rest/services/dil/dil_trails/MapServer/0',
    endpoint: 'https://gisservices.dec.ny.gov/arcgis/rest/services/dil/dil_trails/MapServer/0',
    adapter: 'arcgis-feature-service',
    family: 'road-access',
    sourceCrs: 'service-declared; transformed by service to EPSG:4326',
    attribution: ['New York State Department of Environmental Conservation'],
    disclaimer: 'Road designation and public-use fields do not establish current passability.',
    requiredFields: ['OBJECTID', 'NAME', 'PUBLICUSE', 'UPDATED'],
    staleAfterSeconds: 30 * 24 * 60 * 60,
  }),
  sourceDefinition({
    id: 'nys-dec-trails',
    workPackage: 'WP-207',
    displayName: 'NYS DEC hiking trails',
    owner: 'New York State Department of Environmental Conservation',
    canonicalUrl: 'https://gisservices.dec.ny.gov/arcgis/rest/services/dil/dil_trails/MapServer/2',
    endpoint: 'https://gisservices.dec.ny.gov/arcgis/rest/services/dil/dil_trails/MapServer/2',
    adapter: 'arcgis-feature-service',
    family: 'trail',
    sourceCrs: 'service-declared; transformed by service to EPSG:4326',
    attribution: ['New York State Department of Environmental Conservation'],
    disclaimer: 'Mapped hiking use does not guarantee current trail condition or access.',
    requiredFields: ['OBJECTID', 'NAME', 'TRAILNAME', 'PUBLICUSE', 'UPDATED'],
    staleAfterSeconds: 30 * 24 * 60 * 60,
  }),
  sourceDefinition({
    id: 'nys-dec-poi',
    workPackage: 'WP-207',
    displayName: 'Points of Interest on DEC lands',
    owner: 'New York State Department of Environmental Conservation',
    canonicalUrl:
      'https://data.ny.gov/Recreation/Points-of-Interest-on-Department-of-Environmental-/yvkb-z58x',
    endpoint: 'https://data.ny.gov/resource/yvkb-z58x.json',
    adapter: 'socrata',
    family: 'poi',
    sourceCrs: 'EPSG:4326',
    attribution: ['New York State Department of Environmental Conservation', 'OPEN-NY'],
    disclaimer: 'Asset points require normal validation and deduplication.',
    requiredFields: ['asset', 'name', 'the_geom'],
    termsUrl:
      'https://data.ny.gov/api/views/77gx-ii52/files/ef0c1840-ad54-4240-92fd-6397c49fde46?filename=OPEN-NY_20Terms_20of_20Use.pdf',
    pageSize: 50_000,
    staleAfterSeconds: 90 * 24 * 60 * 60,
  }),
  sourceDefinition({
    id: 'usfs-mvum-roads-ny',
    workPackage: 'WP-207',
    displayName: 'USFS MVUM roads, New York clip',
    owner: 'USDA Forest Service',
    canonicalUrl: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_02/MapServer',
    endpoint: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_02/MapServer/1',
    adapter: 'arcgis-feature-service',
    family: 'road-access',
    sourceCrs: 'EPSG:4269 transformed by service to EPSG:4326',
    attribution: ['USDA Forest Service Motor Vehicle Use Map'],
    disclaimer: 'Vehicle designation and season do not guarantee passability.',
    requiredFields: ['OBJECTID', 'NAME', 'SYMBOL', 'SEASONAL', 'OPERATOR'],
    queryParameters: {
      geometry: '-79.7624,40.4774,-71.7517,45.0159',
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
    },
    pageSize: 2_000,
    staleAfterSeconds: 30 * 24 * 60 * 60,
  }),
  sourceDefinition({
    id: 'nys-dec-statewide-camping-rules',
    workPackage: 'WP-208',
    displayName: 'NYS DEC statewide primitive-camping rules',
    owner: 'New York State Department of Environmental Conservation',
    canonicalUrl: 'https://dec.ny.gov/things-to-do/camping/primitive',
    endpoint: 'https://dec.ny.gov/things-to-do/camping/primitive',
    adapter: 'reviewed-document',
    family: 'rule-document',
    sourceCrs: 'not-applicable',
    attribution: ['New York State Department of Environmental Conservation'],
    disclaimer: 'Statewide guidance does not replace property-specific rules or posted notices.',
    requiredFields: ['reviewedDocument', 'directives'],
    contentTypes: ['text/html'],
    staleAfterSeconds: 30 * 24 * 60 * 60,
  }),
  sourceDefinition({
    id: 'nys-dec-unit-rules',
    workPackage: 'WP-208',
    displayName: 'NYS DEC property and unit rules',
    owner: 'New York State Department of Environmental Conservation',
    canonicalUrl: 'https://dec.ny.gov/places',
    endpoint: 'https://dec.ny.gov/places',
    adapter: 'reviewed-document',
    family: 'rule-document',
    sourceCrs: 'not-applicable',
    attribution: ['New York State Department of Environmental Conservation'],
    disclaimer:
      'Each land unit requires an individually pinned current property page or management plan.',
    requiredFields: ['reviewedDocument', 'landUnitId', 'directives'],
    contentTypes: ['text/html', 'application/pdf'],
    staleAfterSeconds: 30 * 24 * 60 * 60,
  }),
  sourceDefinition({
    id: 'usfs-gmfl-restrictions',
    workPackage: 'WP-208',
    displayName: 'Green Mountain and Finger Lakes alerts and orders',
    owner: 'USDA Forest Service',
    canonicalUrl: 'https://www.fs.usda.gov/r09/gmfl/alerts',
    endpoint: 'https://www.fs.usda.gov/r09/gmfl/alerts',
    adapter: 'reviewed-document',
    family: 'restriction-document',
    sourceCrs: 'not-applicable',
    attribution: ['USDA Forest Service, Green Mountain and Finger Lakes National Forests'],
    disclaimer:
      'Safety-sensitive alerts expire after at most seven days unless an earlier end applies.',
    requiredFields: ['reviewedDocument', 'directives'],
    contentTypes: ['text/html', 'application/pdf'],
    staleAfterSeconds: 7 * 24 * 60 * 60,
  }),
] as const;

export function getNewYorkSource(sourceId: string): NewYorkSourceDefinition {
  const source = NEW_YORK_SOURCE_REGISTRY.find((candidate) => candidate.id === sourceId);
  if (!source) throw new Error(`unknown New York source: ${sourceId}`);
  return source;
}

export function assertNewYorkSourceReady(source: NewYorkSourceDefinition, now: string): void {
  validateConnectorManifest(source.manifest);
  for (const request of [
    { operation: 'acquire' as const },
    { operation: 'retain-raw' as const },
    { operation: 'derive' as const },
    { operation: 'store-offline' as const },
    { operation: 'distribute' as const, distribution: 'public' as const },
  ]) {
    const decision = evaluateSourceRights(source.manifest, { ...request, now });
    if (!decision.allowed) {
      throw new Error(`${source.id} failed rights gate: ${decision.reasons.join(',')}`);
    }
  }
  if (source.attribution.length === 0 || source.disclaimer === '') {
    throw new Error(`${source.id} requires attribution and disclaimer text`);
  }
}

export class CanonicalSourceIdRegistry {
  readonly #ids = new Map<string, string>();

  constructor(seed: Readonly<Record<string, string>> = {}) {
    Object.entries(seed).forEach(([key, value]) => this.#ids.set(key, value));
  }

  getOrCreate(sourceId: string, externalId: string, _partition: string): string {
    const key = `${sourceId}\u0000${externalId}`;
    const existing = this.#ids.get(key);
    if (existing) return existing;
    const created = randomUUID();
    this.#ids.set(key, created);
    return created;
  }

  snapshot(): Readonly<Record<string, string>> {
    return Object.fromEntries([...this.#ids].sort(([left], [right]) => left.localeCompare(right)));
  }
}

export interface SourcePartitionPin {
  readonly sourceId: string;
  readonly partitionId: string;
  readonly partitionIndex: number;
  readonly partitionCount: number;
  readonly complete: boolean;
  readonly schemaVersion: string;
  readonly retrievedAt: string;
  readonly sourceUpdatedAt: string | null;
  readonly recordCount: number;
  readonly payloadChecksum: string;
  readonly geometryChecksum: string;
}

export function createSourcePartitionPin(
  sourceId: string,
  partitionId: string,
  partitionIndex: number,
  partitionCount: number,
  schemaVersion: string,
  retrievedAt: string,
  sourceUpdatedAt: string | null,
  payload: Uint8Array,
  records: readonly CanonicalRecord[],
): SourcePartitionPin {
  const geometryBytes = JSON.stringify(records.map((record) => record.geometry));
  return {
    sourceId,
    partitionId,
    partitionIndex,
    partitionCount,
    complete: true,
    schemaVersion,
    retrievedAt,
    sourceUpdatedAt,
    recordCount: records.length,
    payloadChecksum: createHash('sha256').update(payload).digest('hex'),
    geometryChecksum: createHash('sha256').update(geometryBytes).digest('hex'),
  };
}

export function validateCompletePartitionSet(
  source: NewYorkSourceDefinition,
  pins: readonly SourcePartitionPin[],
): readonly SourcePartitionPin[] {
  if (pins.length === 0) throw new Error(`${source.id} has no completed partitions`);
  const expectedCount = pins[0]?.partitionCount;
  const indexes = pins.map((pin) => pin.partitionIndex).sort((left, right) => left - right);
  const problems: string[] = [];
  if (!Number.isSafeInteger(expectedCount) || expectedCount !== pins.length) {
    problems.push('partition count mismatch');
  }
  pins.forEach((pin) => {
    if (pin.sourceId !== source.id) problems.push('source mismatch');
    if (!pin.complete) problems.push(`incomplete partition ${pin.partitionId}`);
    if (pin.partitionCount !== expectedCount) problems.push('inconsistent partition count');
    if (!/^[0-9a-f]{64}$/.test(pin.payloadChecksum)) problems.push('invalid payload checksum');
    if (!/^[0-9a-f]{64}$/.test(pin.geometryChecksum)) problems.push('invalid geometry checksum');
    if (pin.recordCount < 0 || !Number.isSafeInteger(pin.recordCount)) {
      problems.push('invalid record count');
    }
  });
  if (indexes.some((index, position) => index !== position)) problems.push('partition gap');
  if (new Set(pins.map((pin) => pin.partitionId)).size !== pins.length) {
    problems.push('duplicate partition ID');
  }
  if (problems.length > 0)
    throw new Error(`${source.id} partition gate failed: ${problems.join('; ')}`);
  return [...pins].sort((left, right) => left.partitionIndex - right.partitionIndex);
}

export interface GeoJsonSourceFeature {
  readonly type: 'Feature';
  readonly id?: string | number;
  readonly geometry: CanonicalGeometry | null;
  readonly properties: Readonly<Record<string, unknown>>;
}

interface NormalizeContext {
  readonly source: NewYorkSourceDefinition;
  readonly partition: string;
  readonly retrievedAt: string;
  readonly ids: CanonicalSourceIdRegistry;
}

function property(
  properties: Readonly<Record<string, unknown>>,
  names: readonly string[],
): unknown {
  for (const name of names) {
    const entry = Object.entries(properties).find(
      ([key]) => key.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'),
    );
    if (entry && entry[1] !== null && entry[1] !== '') return entry[1];
  }
  return null;
}

function textProperty(
  properties: Readonly<Record<string, unknown>>,
  names: readonly string[],
  fallback: string,
): string {
  const value = property(properties, names);
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).normalize('NFC')
    : fallback;
}

function numberProperty(
  properties: Readonly<Record<string, unknown>>,
  names: readonly string[],
): number | null {
  const value = property(properties, names);
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function externalId(feature: GeoJsonSourceFeature): string {
  const value =
    feature.id ?? property(feature.properties, ['OBJECTID', 'objectid', 'id', 'facility_n']);
  if (value === null || value === undefined || value === '')
    throw new Error('source feature lacks identity');
  return String(value);
}

function fieldProvenance(
  properties: Readonly<Record<string, unknown>>,
  fields: Readonly<Record<string, readonly string[]>>,
): Readonly<Record<string, FieldProvenance>> {
  return Object.fromEntries(
    Object.entries(fields).map(([canonicalField, sourceFields]) => {
      const sourceField =
        Object.keys(properties).find((key) =>
          sourceFields.some(
            (candidate) => candidate.toLocaleLowerCase('en-US') === key.toLocaleLowerCase('en-US'),
          ),
        ) ??
        sourceFields[0] ??
        canonicalField;
      const sourceValue = properties[sourceField];
      return [
        canonicalField,
        {
          sourceField,
          sourceValue:
            typeof sourceValue === 'string' ||
            typeof sourceValue === 'number' ||
            typeof sourceValue === 'boolean' ||
            sourceValue === null
              ? sourceValue
              : JSON.stringify(sourceValue ?? null),
          observedAt: null,
          transformation: `new-york-normalizer@${NEW_YORK_CONNECTOR_VERSION}`,
        },
      ];
    }),
  );
}

function sourceUpdatedAt(properties: Readonly<Record<string, unknown>>): string | null {
  const value = property(properties, ['UPDATED', 'updated', 'DATEMOD', 'last_edited_date']);
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return null;
}

function geometryQuality(source: NewYorkSourceDefinition, geometry: CanonicalGeometry | null) {
  return geometry
    ? {
        sourceCrs: source.sourceCrs,
        sourceAxisOrder: 'source-declared; service output longitude-latitude',
        coordinatePrecisionMeters: null,
        flags: ['planning-not-legal-boundary'],
        repair: null,
      }
    : null;
}

function envelope<T extends CanonicalRecord>(
  context: NormalizeContext,
  feature: GeoJsonSourceFeature,
  record: Omit<
    T,
    | 'schemaVersion'
    | 'id'
    | 'source'
    | 'retrievedAt'
    | 'sourceUpdatedAt'
    | 'geometryQuality'
    | 'rights'
    | 'validation'
    | 'contentChecksum'
    | 'tombstone'
    | 'classification'
  >,
): T {
  const identity = externalId(feature);
  const complete = {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    id: context.ids.getOrCreate(context.source.id, identity, context.partition),
    source: {
      sourceId: context.source.id,
      externalId: identity,
      sourcePartition: context.partition,
      connectorVersion: NEW_YORK_CONNECTOR_VERSION,
      parserVersion: NEW_YORK_CONNECTOR_VERSION,
      normalizerVersion: NEW_YORK_CONNECTOR_VERSION,
    },
    retrievedAt: context.retrievedAt,
    sourceUpdatedAt: sourceUpdatedAt(feature.properties),
    geometryQuality: geometryQuality(context.source, record.geometry),
    rights: {
      policyId: `${context.source.id}-rights-${NEW_YORK_REGISTRY_REVIEWED_AT.slice(0, 10)}`,
      distribution: 'public' as const,
      attribution: context.source.attribution,
    },
    validation: { state: 'valid' as const, reasonCodes: [] },
    contentChecksum: canonicalContentChecksum(feature),
    tombstone: false,
    classification: 'public-reference' as const,
    ...record,
  } as unknown as T;
  return validateCanonicalRecord(complete) as T;
}

function landRecord(context: NormalizeContext, feature: GeoJsonSourceFeature): LandUnitRecord {
  if (!feature.geometry || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
    throw new Error('land source requires polygon geometry');
  }
  validateCanonicalGeometry(feature.geometry);
  const name = textProperty(
    feature.properties,
    ['FACILITY', 'UNIT', 'Unit_Nm', 'NAME'],
    `${context.source.displayName} feature`,
  );
  const rawOwner = textProperty(
    feature.properties,
    ['OWNERCLASSIFICATION', 'Own_Type', 'ownership'],
    'unknown',
  );
  const ownerLower = rawOwner.toLocaleLowerCase('en-US');
  const ownership =
    context.source.family === 'boundary'
      ? 'unknown'
      : ownerLower.includes('private')
        ? 'private'
        : context.source.id === 'nys-dec-lands' ||
            ownerLower.includes('federal') ||
            ownerLower.includes('forest service') ||
            ownerLower.includes('state')
          ? 'public'
          : rawOwner;
  const manager = textProperty(
    feature.properties,
    ['MANAGE_BY', 'Mang_Name', 'ADMINORGANIZATION'],
    context.source.owner,
  );
  const squareMeters =
    numberProperty(feature.properties, ['Shape__Area', 'SHAPE.AREA', 'areaSquareMeters']) ??
    (numberProperty(feature.properties, ['ACRES', 'GIS_Acres']) ?? 0) * 4_046.8564224;
  return envelope<LandUnitRecord>(context, feature, {
    recordType: 'land-unit',
    geometry: feature.geometry,
    fieldProvenance: fieldProvenance(feature.properties, {
      name: ['FACILITY', 'UNIT', 'Unit_Nm', 'NAME'],
      ownership: ['OWNERCLASSIFICATION', 'Own_Type', 'ownership'],
      manager: ['MANAGE_BY', 'Mang_Name', 'ADMINORGANIZATION'],
      baseRule: ['CATEGORY', 'CLASS'],
    }),
    properties: {
      name,
      ownership,
      manager,
      areaSquareMeters: Math.max(0, squareMeters),
      baseRule: 'unknown',
    },
  });
}

function lineRecord(context: NormalizeContext, feature: GeoJsonSourceFeature): TrailRecord {
  if (!feature.geometry || !['LineString', 'MultiLineString'].includes(feature.geometry.type)) {
    throw new Error('trail/road source requires line geometry');
  }
  validateCanonicalGeometry(feature.geometry);
  const name = textProperty(feature.properties, ['TRAILNAME', 'NAME', 'name'], 'Unnamed route');
  const lengthMeters =
    numberProperty(feature.properties, ['Shape__Length', 'SHAPE.LEN', 'length_m']) ?? 0;
  const fingerprint = createHash('sha256').update(JSON.stringify(feature.geometry)).digest('hex');
  return envelope<TrailRecord>(context, feature, {
    recordType: 'trail',
    geometry: feature.geometry,
    fieldProvenance: fieldProvenance(feature.properties, {
      name: ['TRAILNAME', 'NAME', 'name'],
      trailKind: ['PUBLICUSE', 'SYMBOL', 'SEASONAL'],
      lengthMeters: ['Shape__Length', 'SHAPE.LEN', 'length_m'],
    }),
    properties: {
      name,
      trailKind: context.source.family === 'trail' ? 'route' : 'system',
      rawTrailKind: context.source.family === 'trail' ? null : 'road-access',
      lengthMeters: Math.max(0, lengthMeters),
      fingerprint,
    },
  });
}

const poiMappings: Readonly<Record<string, string>> = {
  'primitive campsite': 'camping.dispersed-site',
  campsite: 'camping.dispersed-site',
  campground: 'camping.established-campground',
  'lean-to': 'camping.lean-to',
  privy: 'hygiene.toilet',
  toilet: 'hygiene.toilet',
  parking: 'vehicle.parking',
  'visitor center': 'traveler.visitor-center',
  'fishing access site': 'traveler.water-access',
  'fire tower': 'traveler.attraction',
  'scenic vista': 'traveler.attraction',
  picnic: 'traveler.picnic',
  'viewing platform': 'traveler.attraction',
};

export function mapNewYorkPoiCategory(rawValue: string): {
  readonly category: string;
  readonly rawCategory: string | null;
} {
  const normalized = rawValue.normalize('NFC').trim().toLocaleLowerCase('en-US');
  const mapped = poiMappings[normalized];
  return mapped
    ? { category: mapped, rawCategory: null }
    : { category: 'other', rawCategory: rawValue };
}

function pointRecord(context: NormalizeContext, feature: GeoJsonSourceFeature): PlaceRecord {
  if (!feature.geometry || feature.geometry.type !== 'Point') {
    throw new Error('POI source requires point geometry');
  }
  validateCanonicalGeometry(feature.geometry);
  const rawCategory = textProperty(
    feature.properties,
    ['asset', 'ASSET', 'type', 'category'],
    'unknown',
  );
  const mapped = mapNewYorkPoiCategory(rawCategory);
  const name = textProperty(feature.properties, ['name', 'NAME', 'facility'], rawCategory);
  return envelope<PlaceRecord>(context, feature, {
    recordType: 'place',
    geometry: feature.geometry,
    fieldProvenance: fieldProvenance(feature.properties, {
      name: ['name', 'NAME', 'facility'],
      category: ['asset', 'ASSET', 'type', 'category'],
    }),
    properties: {
      name,
      ...mapped,
      entrances: [],
      elevation: null,
    },
  });
}

export function normalizeNewYorkFeature(
  source: NewYorkSourceDefinition,
  feature: GeoJsonSourceFeature,
  partition: string,
  retrievedAt: string,
  ids: CanonicalSourceIdRegistry,
): LandUnitRecord | TrailRecord | PlaceRecord {
  const context: NormalizeContext = { source, partition, retrievedAt, ids };
  switch (source.family) {
    case 'boundary':
    case 'land':
    case 'ownership-cross-check':
      return landRecord(context, feature);
    case 'trail':
    case 'road-access':
      return lineRecord(context, feature);
    case 'poi':
      return pointRecord(context, feature);
    default:
      throw new Error(`${source.id} does not normalize GeoJSON features`);
  }
}

export function normalizeNewYorkAccessDirective(
  source: NewYorkSourceDefinition,
  feature: GeoJsonSourceFeature,
  partition: string,
  retrievedAt: string,
  ids: CanonicalSourceIdRegistry,
): AccessDirective | null {
  if (source.family !== 'road-access') return null;
  const rawPublicUse = textProperty(feature.properties, ['PUBLICUSE', 'publicuse'], 'unknown')
    .trim()
    .toLocaleLowerCase('en-US');
  const seasonal = textProperty(feature.properties, ['SEASONAL', 'seasonal'], '').trim();
  const status = ['no', 'false', 'closed', 'private'].includes(rawPublicUse)
    ? 'closed'
    : seasonal &&
        !['none', 'no', 'false', 'yearlong', 'year-round'].includes(
          seasonal.toLocaleLowerCase('en-US'),
        )
      ? 'restricted'
      : 'open';
  const identity = externalId(feature);
  return {
    id: ids.getOrCreate(source.id, `access:${identity}`, partition),
    status,
    authority: source.id.startsWith('usfs-') ? 'regulation' : 'guidance',
    interval: { start: null, end: null, quality: 'known' },
    reviewedAt: sourceUpdatedAt(feature.properties) ?? retrievedAt,
    staleAfterSeconds: source.staleAfterSeconds,
    explanation:
      status === 'closed'
        ? 'The source marks this mapped route as unavailable for public use.'
        : status === 'restricted'
          ? `The source designates seasonal or conditional motor access: ${seasonal}.`
          : 'The source designates public motor access; this does not guarantee passability.',
  };
}

export interface ReviewedRuleDirective {
  readonly externalId: string;
  readonly recordType: 'condition' | 'restriction';
  readonly name: string;
  readonly geometry: CanonicalGeometry | null;
  readonly interval: {
    readonly start: string | null;
    readonly end: string | null;
    readonly quality: 'known' | 'unknown';
  };
  readonly scope: string;
  readonly authority: string;
  readonly relationship: 'independent' | 'revision-of' | 'supersedes' | 'other' | 'unknown';
  readonly relatedRecordId: string | null;
  readonly campingRule: Omit<CampingRule, 'sourceRecordId'> | null;
  readonly accessDirective: AccessDirective | null;
}

export interface ReviewedRuleDocument {
  readonly sourceId: string;
  readonly documentUrl: string;
  readonly contentChecksum: string;
  readonly reviewedAt: string;
  readonly reviewerRole: string;
  readonly directives: readonly ReviewedRuleDirective[];
}

export interface NewYorkNormalizedBatch {
  readonly records: readonly CanonicalRecord[];
  readonly campingRules: readonly CampingRule[];
  readonly access: readonly AccessDirective[];
}

export function normalizeReviewedRuleDocument(
  source: NewYorkSourceDefinition,
  document: ReviewedRuleDocument,
  partition: string,
  retrievedAt: string,
  ids: CanonicalSourceIdRegistry,
): NewYorkNormalizedBatch {
  if (document.sourceId !== source.id) throw new Error('reviewed rule source mismatch');
  if (!/^[0-9a-f]{64}$/.test(document.contentChecksum)) {
    throw new Error('reviewed rule document requires a SHA-256 content pin');
  }
  const records: CanonicalRecord[] = [];
  const campingRules: CampingRule[] = [];
  const access: AccessDirective[] = [];
  for (const directive of document.directives) {
    if (directive.geometry) validateCanonicalGeometry(directive.geometry);
    const recordId = ids.getOrCreate(source.id, directive.externalId, partition);
    const common = {
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      id: recordId,
      source: {
        sourceId: source.id,
        externalId: directive.externalId,
        sourcePartition: partition,
        connectorVersion: NEW_YORK_CONNECTOR_VERSION,
        parserVersion: NEW_YORK_CONNECTOR_VERSION,
        normalizerVersion: NEW_YORK_CONNECTOR_VERSION,
      },
      retrievedAt,
      sourceUpdatedAt: document.reviewedAt,
      geometry: directive.geometry,
      geometryQuality: geometryQuality(source, directive.geometry),
      fieldProvenance: {
        name: {
          sourceField: 'reviewedDirective.name',
          sourceValue: directive.name,
          observedAt: document.reviewedAt,
          transformation: `human-reviewed-rule@${NEW_YORK_CONNECTOR_VERSION}`,
        },
      },
      rights: {
        policyId: `${source.id}-rights-${NEW_YORK_REGISTRY_REVIEWED_AT.slice(0, 10)}`,
        distribution: 'public' as const,
        attribution: source.attribution,
      },
      validation: { state: 'valid' as const, reasonCodes: [] },
      contentChecksum: canonicalContentChecksum({ document: document.contentChecksum, directive }),
      tombstone: false,
      classification: 'public-reference' as const,
      properties: {
        name: directive.name,
        interval: directive.interval,
        scope: directive.scope,
        authority: directive.authority,
        relationship: directive.relationship,
        relatedRecordId: directive.relatedRecordId,
      },
    };
    const record = validateCanonicalRecord({
      ...common,
      recordType: directive.recordType,
    }) as RestrictionRecord | ConditionRecord;
    records.push(record);
    if (directive.campingRule) {
      campingRules.push({ ...directive.campingRule, sourceRecordId: record.id });
    }
    if (directive.accessDirective) access.push(directive.accessDirective);
  }
  return { records, campingRules, access };
}

export interface NewYorkCoverageReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly sourceIds: readonly string[];
  readonly discovered: number;
  readonly normalized: number;
  readonly rejected: number;
  readonly geometry: { readonly present: number; readonly missing: number };
  readonly land: number;
  readonly trails: number;
  readonly accessRoutes: number;
  readonly pois: number;
  readonly rules: number;
  readonly restrictions: number;
  readonly statusCounts: Readonly<Record<string, number>>;
  readonly duplicateCandidates: number;
  readonly rightsExcluded: number;
  readonly staleSources: readonly string[];
}

export interface CoverageInput {
  readonly generatedAt: string;
  readonly records: readonly CanonicalRecord[];
  readonly pins: readonly SourcePartitionPin[];
  readonly rejected: number;
  readonly duplicateCandidates: number;
  readonly rightsExcluded: number;
  readonly campingRules: readonly CampingRule[];
  readonly statusCounts: Readonly<Record<string, number>>;
}

export function buildNewYorkCoverageReport(input: CoverageInput): NewYorkCoverageReport {
  const sourceIds = [...new Set(input.pins.map((pin) => pin.sourceId))].sort();
  const discovered = input.pins.reduce((sum, pin) => sum + pin.recordCount, 0) + input.rejected;
  const staleSources = sourceIds.filter((sourceId) => {
    const source = getNewYorkSource(sourceId);
    const latest = input.pins
      .filter((pin) => pin.sourceId === sourceId)
      .map((pin) => Date.parse(pin.sourceUpdatedAt ?? pin.retrievedAt))
      .sort((left, right) => right - left)[0];
    return (
      latest === undefined ||
      Date.parse(input.generatedAt) - latest >= source.staleAfterSeconds * 1000
    );
  });
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    sourceIds,
    discovered,
    normalized: input.records.length,
    rejected: input.rejected,
    geometry: {
      present: input.records.filter((record) => record.geometry !== null).length,
      missing: input.records.filter((record) => record.geometry === null).length,
    },
    land: input.records.filter((record) => record.recordType === 'land-unit').length,
    trails: input.records.filter(
      (record) => record.recordType === 'trail' && record.source.sourceId.includes('trails'),
    ).length,
    accessRoutes: input.records.filter(
      (record) =>
        record.recordType === 'trail' &&
        (record.source.sourceId.includes('roads') || record.source.sourceId.includes('mvum')),
    ).length,
    pois: input.records.filter((record) => record.recordType === 'place').length,
    rules: input.campingRules.length,
    restrictions: input.records.filter(
      (record) => record.recordType === 'condition' || record.recordType === 'restriction',
    ).length,
    statusCounts: { ...input.statusCounts },
    duplicateCandidates: input.duplicateCandidates,
    rightsExcluded: input.rightsExcluded,
    staleSources,
  };
}

export interface NewYorkFetchResult {
  readonly status: number;
  readonly contentType: string;
  readonly body: Uint8Array;
  readonly redirectCount: number;
}

export type NewYorkFetcher = (url: string, signal: AbortSignal) => Promise<NewYorkFetchResult>;

export interface OfficialNewYorkConnectorOptions {
  readonly source: NewYorkSourceDefinition;
  readonly fetcher: NewYorkFetcher;
  readonly rawStore: RawArtifactStore;
  readonly ids: CanonicalSourceIdRegistry;
  readonly bulkLocators?: readonly string[];
  readonly reviewedDocuments?: Readonly<Record<string, ReviewedRuleDocument>>;
  readonly checkpoint?: (asset: StoredRawAsset) => Promise<void>;
  readonly now?: () => string;
}

interface ParsedPayload {
  readonly locator: string;
  readonly partition: string;
  readonly retrievedAt: string;
  readonly checksum: string;
  readonly features: readonly GeoJsonSourceFeature[];
  readonly reviewedDocument: ReviewedRuleDocument | null;
}

function queryUrl(endpoint: string, parameters: Readonly<Record<string, string>>): string {
  const url = new URL(`${endpoint.replace(/\/$/, '')}/query`);
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

async function discoverAssets(
  source: NewYorkSourceDefinition,
  fetcher: NewYorkFetcher,
  signal: AbortSignal,
  bulkLocators: readonly string[],
): Promise<readonly DiscoveredAsset[]> {
  if (source.adapter === 'reviewed-document') {
    const locators = bulkLocators.length > 0 ? bulkLocators : [source.endpoint];
    return locators.map((locator, index) => ({
      externalId: `reviewed-document-${index}`,
      sourcePartition: `document-${index.toString().padStart(4, '0')}`,
      locator,
    }));
  }
  if (source.adapter === 'bulk-release') {
    if (bulkLocators.length === 0)
      throw new Error(`${source.id} requires a pinned bulk release locator`);
    return bulkLocators.map((locator, index) => ({
      externalId: `bulk-${index}`,
      sourcePartition: `bulk-${index.toString().padStart(4, '0')}`,
      locator,
    }));
  }
  if (source.adapter === 'socrata') {
    const countUrl = new URL(source.endpoint);
    countUrl.searchParams.set('$select', 'count(*) as count');
    const countResponse = await fetcher(countUrl.toString(), signal);
    if (countResponse.status !== 200) throw new Error(`${source.id} count request failed`);
    const countPayload = JSON.parse(new TextDecoder().decode(countResponse.body)) as unknown;
    const first = Array.isArray(countPayload) ? countPayload[0] : null;
    const count = Number(
      first && typeof first === 'object' ? (first as Record<string, unknown>).count : NaN,
    );
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error(`${source.id} returned invalid count`);
    const partitions = Math.max(1, Math.ceil(count / source.pageSize));
    return Array.from({ length: partitions }, (_unused, index) => {
      const url = new URL(source.endpoint);
      url.searchParams.set('$limit', String(source.pageSize));
      url.searchParams.set('$offset', String(index * source.pageSize));
      url.searchParams.set('$order', ':id');
      return {
        externalId: `page-${index}`,
        sourcePartition: `page-${index.toString().padStart(4, '0')}`,
        locator: url.toString(),
      };
    });
  }
  const idsUrl = queryUrl(source.endpoint, {
    ...source.queryParameters,
    where: '1=1',
    returnIdsOnly: 'true',
    f: 'json',
  });
  const idsResponse = await fetcher(idsUrl, signal);
  if (idsResponse.status !== 200) throw new Error(`${source.id} object ID request failed`);
  const idsPayload = JSON.parse(new TextDecoder().decode(idsResponse.body)) as {
    readonly objectIds?: readonly number[];
  };
  const objectIds = [...(idsPayload.objectIds ?? [])].sort((left, right) => left - right);
  if (!objectIds.every((id) => Number.isSafeInteger(id))) {
    throw new Error(`${source.id} returned invalid object IDs`);
  }
  if (objectIds.length === 0) throw new Error(`${source.id} returned no object IDs`);
  const assets: DiscoveredAsset[] = [];
  for (let offset = 0; offset < objectIds.length; offset += source.pageSize) {
    const page = objectIds.slice(offset, offset + source.pageSize);
    const index = Math.floor(offset / source.pageSize);
    assets.push({
      externalId: `page-${index}`,
      sourcePartition: `page-${index.toString().padStart(4, '0')}`,
      locator: queryUrl(source.endpoint, {
        ...source.queryParameters,
        objectIds: page.join(','),
        outFields: '*',
        returnGeometry: 'true',
        outSR: '4326',
        f: 'geojson',
      }),
    });
  }
  return assets;
}

function socrataFeature(
  row: Readonly<Record<string, unknown>>,
  index: number,
): GeoJsonSourceFeature {
  const geometryValue = row.the_geom ?? row.location ?? row.geocoded_column;
  let geometry: CanonicalGeometry | null = null;
  if (geometryValue && typeof geometryValue === 'object') {
    const candidate = geometryValue as Record<string, unknown>;
    if (candidate.type === 'Point' && Array.isArray(candidate.coordinates)) {
      geometry = { type: 'Point', coordinates: candidate.coordinates as unknown as Position };
    } else if ('longitude' in candidate && 'latitude' in candidate) {
      geometry = {
        type: 'Point',
        coordinates: [Number(candidate.longitude), Number(candidate.latitude)],
      };
    }
  }
  return {
    type: 'Feature',
    id: String(row[':id'] ?? row.id ?? index),
    geometry,
    properties: row,
  };
}

export function createOfficialNewYorkConnector(
  options: OfficialNewYorkConnectorOptions,
): Connector<ParsedPayload, NewYorkNormalizedBatch, NewYorkNormalizedBatch> {
  const source = options.source;
  return {
    manifest: source.manifest,
    discover: ({ signal }) =>
      discoverAssets(source, options.fetcher, signal, options.bulkLocators ?? []),
    fetch: async (asset, { signal }) => {
      const response = await options.fetcher(asset.locator, signal);
      if (response.status !== 200)
        throw new Error(`${source.id} fetch failed with ${response.status}`);
      if (
        !source.contentTypes.some((type) =>
          response.contentType.toLocaleLowerCase('en-US').includes(type),
        )
      ) {
        throw new Error(`${source.id} returned unexpected content type`);
      }
      return {
        ...asset,
        payload: response.body,
        contentType: response.contentType,
        retrievedAt: options.now?.() ?? new Date().toISOString(),
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
        retention: source.manifest.rights.rawRetention ?? 'prohibited',
      }),
    parse: async (asset) => {
      const checksum = createHash('sha256').update(asset.payload).digest('hex');
      if (source.adapter === 'reviewed-document') {
        const reviewedDocument = options.reviewedDocuments?.[checksum];
        if (!reviewedDocument)
          throw new Error(`${source.id} document checksum has not been reviewed`);
        return {
          locator: asset.locator,
          partition: asset.sourcePartition,
          retrievedAt: asset.retrievedAt,
          checksum,
          features: [],
          reviewedDocument,
        };
      }
      const payload = JSON.parse(new TextDecoder().decode(asset.payload)) as unknown;
      const features =
        source.adapter === 'socrata'
          ? Array.isArray(payload)
            ? payload.map((row, index) => socrataFeature(row as Record<string, unknown>, index))
            : []
          : payload &&
              typeof payload === 'object' &&
              Array.isArray((payload as { features?: unknown }).features)
            ? ((payload as { features: GeoJsonSourceFeature[] }).features ?? [])
            : [];
      if (features.length === 0) throw new Error(`${source.id} partition contains no features`);
      return {
        locator: asset.locator,
        partition: asset.sourcePartition,
        retrievedAt: asset.retrievedAt,
        checksum,
        features,
        reviewedDocument: null,
      };
    },
    normalize: async (payload) => {
      if (payload.reviewedDocument) {
        return normalizeReviewedRuleDocument(
          source,
          payload.reviewedDocument,
          payload.partition,
          payload.retrievedAt,
          options.ids,
        );
      }
      const records = payload.features.map((feature) =>
        normalizeNewYorkFeature(
          source,
          feature,
          payload.partition,
          payload.retrievedAt,
          options.ids,
        ),
      );
      const access = payload.features
        .map((feature) =>
          normalizeNewYorkAccessDirective(
            source,
            feature,
            payload.partition,
            payload.retrievedAt,
            options.ids,
          ),
        )
        .filter((directive): directive is AccessDirective => directive !== null);
      return {
        records,
        campingRules: [],
        access,
      };
    },
    validate: async (batch) => {
      batch.records.forEach(validateCanonicalRecord);
    },
    checkpoint: async (asset) => options.checkpoint?.(asset),
    emit: async (batch) => batch,
  };
}

export async function defaultNewYorkFetcher(
  url: string,
  signal: AbortSignal,
): Promise<NewYorkFetchResult> {
  const response = await fetch(url, { signal, redirect: 'manual' });
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    body: new Uint8Array(await response.arrayBuffer()),
    redirectCount: 0,
  };
}

export function flattenNewYorkBatches(
  batches: readonly NewYorkNormalizedBatch[],
): NewYorkNormalizedBatch {
  return {
    records: batches.flatMap((batch) => batch.records),
    campingRules: batches.flatMap((batch) => batch.campingRules),
    access: batches.flatMap((batch) => batch.access),
  };
}

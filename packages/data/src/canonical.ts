import { createHash, randomUUID } from 'node:crypto';

export const CANONICAL_SCHEMA_VERSION = '1.0.0' as const;
export const PREVIOUS_CANONICAL_SCHEMA_VERSION = '0.9.0' as const;
export const CANONICAL_RECORD_TYPES = [
  'land-unit',
  'place',
  'trail',
  'condition',
  'restriction',
  'observation',
  'review',
  'check-in',
  'media-asset',
] as const;

export type CanonicalRecordType = (typeof CANONICAL_RECORD_TYPES)[number];
export type CanonicalClassification = 'public-reference' | 'private-reference' | 'private-user';
export type AssertionValue = 'yes' | 'no' | 'unknown';
export type VerticalDatum = 'ellipsoidal_wgs84' | 'orthometric_navd88' | 'other' | 'unknown';
export type Position = readonly [longitude: number, latitude: number];

export interface PointGeometry {
  readonly type: 'Point';
  readonly coordinates: Position;
}
export interface LineStringGeometry {
  readonly type: 'LineString';
  readonly coordinates: readonly Position[];
}
export interface MultiLineStringGeometry {
  readonly type: 'MultiLineString';
  readonly coordinates: readonly (readonly Position[])[];
}
export interface PolygonGeometry {
  readonly type: 'Polygon';
  readonly coordinates: readonly (readonly Position[])[];
}
export interface MultiPolygonGeometry {
  readonly type: 'MultiPolygon';
  readonly coordinates: readonly (readonly (readonly Position[])[])[];
}
export type CanonicalGeometry =
  | PointGeometry
  | LineStringGeometry
  | MultiLineStringGeometry
  | PolygonGeometry
  | MultiPolygonGeometry;

export interface SourceIdentity {
  readonly sourceId: string;
  readonly externalId: string;
  readonly sourcePartition: string;
  readonly connectorVersion: string;
  readonly parserVersion: string;
  readonly normalizerVersion: string;
}

export interface FieldProvenance {
  readonly sourceField: string;
  readonly sourceValue: string | number | boolean | null;
  readonly observedAt: string | null;
  readonly transformation: string | null;
}

export interface GeometryQuality {
  readonly sourceCrs: string;
  readonly sourceAxisOrder: string;
  readonly coordinatePrecisionMeters: number | null;
  readonly flags: readonly string[];
  readonly repair: {
    readonly operation: string;
    readonly version: string;
    readonly originalChecksum: string;
    readonly maximumMovementMeters: number;
  } | null;
}

export interface CanonicalRights {
  readonly policyId: string;
  readonly distribution: 'public' | 'private-user' | 'private-organization';
  readonly attribution: readonly string[];
}

export interface CanonicalEnvelope<TType extends CanonicalRecordType, TProperties> {
  readonly schemaVersion: typeof CANONICAL_SCHEMA_VERSION;
  readonly recordType: TType;
  readonly id: string;
  readonly source: SourceIdentity;
  readonly retrievedAt: string;
  readonly sourceUpdatedAt: string | null;
  readonly geometry: CanonicalGeometry | null;
  readonly geometryQuality: GeometryQuality | null;
  readonly fieldProvenance: Readonly<Record<string, FieldProvenance>>;
  readonly rights: CanonicalRights;
  readonly validation: {
    readonly state: 'valid' | 'quarantined';
    readonly reasonCodes: readonly string[];
  };
  readonly contentChecksum: string;
  readonly tombstone: boolean;
  readonly classification: CanonicalClassification;
  readonly properties: TProperties;
}

export interface Elevation {
  readonly meters: number;
  readonly verticalDatum: VerticalDatum;
}

export interface EffectiveInterval {
  readonly start: string | null;
  readonly end: string | null;
  readonly quality: 'known' | 'unknown';
}

export interface LandUnitProperties {
  readonly name: string;
  readonly ownership: string | 'unknown';
  readonly manager: string | 'unknown';
  readonly areaSquareMeters: number;
  readonly baseRule: string | 'unknown';
}
export interface PlaceProperties {
  readonly name: string;
  readonly category: string | 'other' | 'unknown';
  readonly rawCategory: string | null;
  readonly entrances: readonly Position[];
  readonly elevation: Elevation | null;
}
export interface TrailProperties {
  readonly name: string;
  readonly trailKind: 'system' | 'route' | 'variant' | 'activity' | 'other' | 'unknown';
  readonly rawTrailKind: string | null;
  readonly lengthMeters: number;
  readonly fingerprint: string;
}
export interface TemporalProperties {
  readonly name: string;
  readonly interval: EffectiveInterval;
  readonly scope: string;
  readonly authority: string | 'unknown';
  readonly relationship: 'independent' | 'revision-of' | 'supersedes' | 'other' | 'unknown';
  readonly relatedRecordId: string | null;
}
export interface ObservationProperties {
  readonly subjectId: string;
  readonly field: string;
  readonly assertion: AssertionValue;
  readonly rawValue: string | null;
  readonly observedAt: string | null;
}
export interface ReviewProperties {
  readonly subjectId: string;
  readonly body: string | null;
  readonly rating: number | null;
  readonly identityPrecision: 'anonymous' | 'pseudonymous' | 'identified';
}
export interface CheckInProperties {
  readonly subjectId: string;
  readonly occurredAt: string;
  readonly spatialPrecisionMeters: number;
}
export interface MediaAssetProperties {
  readonly subjectId: string;
  readonly mediaType: 'image' | 'audio' | 'video' | 'other';
  readonly contentUrl: string | null;
  readonly perceptualHash: string | null;
}

export type LandUnitRecord = CanonicalEnvelope<'land-unit', LandUnitProperties>;
export type PlaceRecord = CanonicalEnvelope<'place', PlaceProperties>;
export type TrailRecord = CanonicalEnvelope<'trail', TrailProperties>;
export type ConditionRecord = CanonicalEnvelope<'condition', TemporalProperties>;
export type RestrictionRecord = CanonicalEnvelope<'restriction', TemporalProperties>;
export type ObservationRecord = CanonicalEnvelope<'observation', ObservationProperties>;
export type ReviewRecord = CanonicalEnvelope<'review', ReviewProperties>;
export type CheckInRecord = CanonicalEnvelope<'check-in', CheckInProperties>;
export type MediaAssetRecord = CanonicalEnvelope<'media-asset', MediaAssetProperties>;
export type CanonicalRecord =
  | LandUnitRecord
  | PlaceRecord
  | TrailRecord
  | ConditionRecord
  | RestrictionRecord
  | ObservationRecord
  | ReviewRecord
  | CheckInRecord
  | MediaAssetRecord;

export class CanonicalValidationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`invalid canonical record: ${problems.join('; ')}`);
    this.name = 'CanonicalValidationError';
  }
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/;
const utcInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function validUtc(value: unknown): value is string {
  return typeof value === 'string' && utcInstant.test(value) && Number.isFinite(Date.parse(value));
}

function validatePosition(position: Position, path: string, problems: string[]): void {
  if (
    !Array.isArray(position) ||
    position.length !== 2 ||
    !position.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
  ) {
    problems.push(`${path} must be a finite [longitude, latitude] position`);
    return;
  }
  const [longitude, latitude] = position;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    problems.push(`${path} is outside EPSG:4326 bounds`);
  }
}

function validateLine(line: readonly Position[], path: string, problems: string[]): void {
  if (line.length < 2) problems.push(`${path} requires at least two positions`);
  line.forEach((position, index) => validatePosition(position, `${path}[${index}]`, problems));
  for (let index = 1; index < line.length; index += 1) {
    const current = line[index];
    const previous = line[index - 1];
    if (current && previous && Math.abs(current[0] - previous[0]) > 180) {
      problems.push(`${path} contains an unnormalized antimeridian edge`);
    }
  }
}

function ringArea(ring: readonly Position[]): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const first = ring[index];
    const second = ring[index + 1];
    if (first && second) area += first[0] * second[1] - second[0] * first[1];
  }
  return area / 2;
}

function orientation(first: Position, second: Position, third: Position): number {
  return (
    (second[1] - first[1]) * (third[0] - second[0]) -
    (second[0] - first[0]) * (third[1] - second[1])
  );
}

function segmentsIntersect(
  firstStart: Position,
  firstEnd: Position,
  secondStart: Position,
  secondEnd: Position,
): boolean {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);
  return firstOrientation * secondOrientation < 0 && thirdOrientation * fourthOrientation < 0;
}

function validatePolygon(
  polygon: readonly (readonly Position[])[],
  path: string,
  problems: string[],
): void {
  if (polygon.length === 0) problems.push(`${path} requires an exterior ring`);
  polygon.forEach((ring, ringIndex) => {
    if (ring.length < 4) problems.push(`${path}[${ringIndex}] requires four positions`);
    validateLine(ring, `${path}[${ringIndex}]`, problems);
    const first = ring[0];
    const last = ring.at(-1);
    if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
      problems.push(`${path}[${ringIndex}] must be closed`);
    }
    const edgeCount = Math.max(0, ring.length - 1);
    for (let firstEdge = 0; firstEdge < edgeCount; firstEdge += 1) {
      for (let secondEdge = firstEdge + 1; secondEdge < edgeCount; secondEdge += 1) {
        const adjacent =
          secondEdge === firstEdge + 1 || (firstEdge === 0 && secondEdge === edgeCount - 1);
        const firstStart = ring[firstEdge];
        const firstEnd = ring[firstEdge + 1];
        const secondStart = ring[secondEdge];
        const secondEnd = ring[secondEdge + 1];
        if (
          !adjacent &&
          firstStart &&
          firstEnd &&
          secondStart &&
          secondEnd &&
          segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)
        ) {
          problems.push(`${path}[${ringIndex}] has a self-intersection`);
        }
      }
    }
    const area = ringArea(ring);
    if (ringIndex === 0 && area <= 0) problems.push(`${path}[0] must be counter-clockwise`);
    if (ringIndex > 0 && area >= 0) problems.push(`${path}[${ringIndex}] must be clockwise`);
  });
}

export function validateCanonicalGeometry(geometry: CanonicalGeometry): void {
  const problems: string[] = [];
  switch (geometry.type) {
    case 'Point':
      validatePosition(geometry.coordinates, 'coordinates', problems);
      break;
    case 'LineString':
      validateLine(geometry.coordinates, 'coordinates', problems);
      break;
    case 'MultiLineString':
      if (geometry.coordinates.length === 0) problems.push('coordinates cannot be empty');
      geometry.coordinates.forEach((line, index) =>
        validateLine(line, `coordinates[${index}]`, problems),
      );
      break;
    case 'Polygon':
      validatePolygon(geometry.coordinates, 'coordinates', problems);
      break;
    case 'MultiPolygon':
      if (geometry.coordinates.length === 0) problems.push('coordinates cannot be empty');
      geometry.coordinates.forEach((polygon, index) =>
        validatePolygon(polygon, `coordinates[${index}]`, problems),
      );
      break;
  }
  if (problems.length > 0) throw new CanonicalValidationError(problems);
}

function inspectText(value: unknown, path: string, problems: string[]): void {
  if (typeof value === 'string') {
    if (value === '') problems.push(`${path} cannot be an empty string`);
    if (/\p{Cc}/u.test(value)) problems.push(`${path} contains a control character`);
    if (value !== value.normalize('NFC')) problems.push(`${path} must use Unicode NFC`);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => inspectText(item, `${path}[${index}]`, problems));
  } else if (value !== null && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => inspectText(item, `${path}.${key}`, problems));
  }
}

function validateGeometryForType(record: CanonicalRecord, problems: string[]): void {
  const geometry = record.geometry;
  const allowed: Partial<Record<CanonicalRecordType, readonly CanonicalGeometry['type'][]>> = {
    'land-unit': ['Polygon', 'MultiPolygon'],
    place: ['Point', 'Polygon', 'MultiPolygon'],
    trail: ['LineString', 'MultiLineString'],
  };
  const expected = allowed[record.recordType];
  if (expected && (!geometry || !expected.includes(geometry.type))) {
    problems.push(`${record.recordType} has an incompatible geometry type`);
  }
  if (geometry) {
    try {
      validateCanonicalGeometry(geometry);
    } catch (error) {
      if (error instanceof CanonicalValidationError) problems.push(...error.problems);
      else throw error;
    }
  }
  if ((geometry === null) !== (record.geometryQuality === null)) {
    problems.push('geometry and geometryQuality must be supplied together');
  }
}

function validateProperties(record: CanonicalRecord, problems: string[]): void {
  if (!record.properties || typeof record.properties !== 'object') {
    problems.push('properties must be an object');
    return;
  }
  switch (record.recordType) {
    case 'land-unit':
      if (
        typeof record.properties.name !== 'string' ||
        typeof record.properties.ownership !== 'string' ||
        typeof record.properties.manager !== 'string' ||
        typeof record.properties.baseRule !== 'string'
      ) {
        problems.push('land-unit text fields are required');
      }
      if (
        typeof record.properties.areaSquareMeters !== 'number' ||
        !Number.isFinite(record.properties.areaSquareMeters) ||
        record.properties.areaSquareMeters < 0
      ) {
        problems.push('areaSquareMeters must be SI');
      }
      break;
    case 'place':
      if (
        typeof record.properties.name !== 'string' ||
        typeof record.properties.category !== 'string'
      ) {
        problems.push('place name and category are required');
      }
      if (!Array.isArray(record.properties.entrances)) {
        problems.push('place entrances must be an array');
      } else {
        record.properties.entrances.forEach((position, index) =>
          validatePosition(position, `properties.entrances[${index}]`, problems),
        );
      }
      if (record.properties.elevation && !Number.isFinite(record.properties.elevation.meters)) {
        problems.push('elevation meters must be finite');
      }
      if (
        record.properties.elevation &&
        !['ellipsoidal_wgs84', 'orthometric_navd88', 'other', 'unknown'].includes(
          record.properties.elevation.verticalDatum,
        )
      ) {
        problems.push('invalid vertical datum');
      }
      if (record.properties.category === 'other' && record.properties.rawCategory === null) {
        problems.push('other place category must preserve its raw value');
      }
      break;
    case 'trail':
      if (
        typeof record.properties.name !== 'string' ||
        typeof record.properties.fingerprint !== 'string' ||
        !['system', 'route', 'variant', 'activity', 'other', 'unknown'].includes(
          record.properties.trailKind,
        )
      ) {
        problems.push('trail name, kind, and fingerprint are required');
      }
      if (
        typeof record.properties.lengthMeters !== 'number' ||
        !Number.isFinite(record.properties.lengthMeters) ||
        record.properties.lengthMeters < 0
      ) {
        problems.push('lengthMeters must be SI');
      }
      if (record.properties.trailKind === 'other' && record.properties.rawTrailKind === null) {
        problems.push('other trail kind must preserve its raw value');
      }
      break;
    case 'condition':
    case 'restriction': {
      const { interval, relatedRecordId } = record.properties;
      if (
        typeof record.properties.name !== 'string' ||
        typeof record.properties.scope !== 'string' ||
        typeof record.properties.authority !== 'string' ||
        !['independent', 'revision-of', 'supersedes', 'other', 'unknown'].includes(
          record.properties.relationship,
        ) ||
        !interval ||
        typeof interval !== 'object'
      ) {
        problems.push('temporal name, interval, scope, authority, and relationship are required');
        break;
      }
      if (interval.quality === 'known' && interval.start === null) {
        problems.push('known interval requires a start');
      }
      if (interval.start !== null && !validUtc(interval.start))
        problems.push('invalid interval start');
      if (interval.end !== null && !validUtc(interval.end)) problems.push('invalid interval end');
      if (
        interval.start !== null &&
        interval.end !== null &&
        Date.parse(interval.end) <= Date.parse(interval.start)
      ) {
        problems.push('effective intervals must be non-empty and half-open');
      }
      if (relatedRecordId !== null && !uuidV4.test(relatedRecordId)) {
        problems.push('relatedRecordId must be UUIDv4');
      }
      break;
    }
    case 'observation':
      if (!uuidV4.test(record.properties.subjectId)) problems.push('subjectId must be UUIDv4');
      if (typeof record.properties.field !== 'string')
        problems.push('observation field is required');
      if (record.properties.observedAt !== null && !validUtc(record.properties.observedAt)) {
        problems.push('invalid observation time');
      }
      if (!['yes', 'no', 'unknown'].includes(record.properties.assertion)) {
        problems.push('invalid observation assertion');
      }
      break;
    case 'review':
      if (!uuidV4.test(record.properties.subjectId)) problems.push('subjectId must be UUIDv4');
      if (record.properties.body !== null && typeof record.properties.body !== 'string') {
        problems.push('review body must be text or null');
      }
      if (
        record.properties.rating !== null &&
        (typeof record.properties.rating !== 'number' ||
          !Number.isFinite(record.properties.rating) ||
          record.properties.rating < 0 ||
          record.properties.rating > 5)
      ) {
        problems.push('rating must be between 0 and 5');
      }
      if (
        !['anonymous', 'pseudonymous', 'identified'].includes(record.properties.identityPrecision)
      ) {
        problems.push('invalid review identity precision');
      }
      break;
    case 'check-in':
      if (!uuidV4.test(record.properties.subjectId)) problems.push('subjectId must be UUIDv4');
      if (!validUtc(record.properties.occurredAt)) problems.push('invalid check-in time');
      if (
        typeof record.properties.spatialPrecisionMeters !== 'number' ||
        !Number.isFinite(record.properties.spatialPrecisionMeters) ||
        record.properties.spatialPrecisionMeters < 0
      ) {
        problems.push('spatialPrecisionMeters must be non-negative');
      }
      break;
    case 'media-asset':
      if (!uuidV4.test(record.properties.subjectId)) problems.push('subjectId must be UUIDv4');
      if (!['image', 'audio', 'video', 'other'].includes(record.properties.mediaType)) {
        problems.push('invalid media type');
      }
      if (
        record.properties.contentUrl !== null &&
        !/^https:\/\//.test(record.properties.contentUrl)
      ) {
        problems.push('media URL must use https');
      }
      break;
  }
}

export function validateCanonicalRecord(value: unknown): CanonicalRecord {
  const problems: string[] = [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CanonicalValidationError(['record must be an object']);
  }
  const record = value as CanonicalRecord;
  if (record.schemaVersion !== CANONICAL_SCHEMA_VERSION) problems.push('unsupported schemaVersion');
  if (!CANONICAL_RECORD_TYPES.includes(record.recordType)) problems.push('invalid recordType');
  if (!uuidV4.test(record.id)) problems.push('id must be an opaque UUIDv4');
  if (!validUtc(record.retrievedAt)) problems.push('retrievedAt must be an RFC 3339 UTC instant');
  if (record.sourceUpdatedAt !== null && !validUtc(record.sourceUpdatedAt)) {
    problems.push('sourceUpdatedAt must be null or an RFC 3339 UTC instant');
  }
  if (!sha256.test(record.contentChecksum)) problems.push('contentChecksum must be SHA-256');
  if (
    !record.source ||
    typeof record.source !== 'object' ||
    Object.values(record.source).some((part) => typeof part !== 'string' || part === '')
  ) {
    problems.push('complete source identity and processor versions are required');
  }
  if (
    !record.fieldProvenance ||
    typeof record.fieldProvenance !== 'object' ||
    Array.isArray(record.fieldProvenance)
  ) {
    problems.push('fieldProvenance must be an object');
  } else {
    for (const [field, provenance] of Object.entries(record.fieldProvenance)) {
      if (
        field === '' ||
        !provenance ||
        typeof provenance !== 'object' ||
        typeof provenance.sourceField !== 'string' ||
        provenance.sourceField === '' ||
        (provenance.observedAt !== null && !validUtc(provenance.observedAt)) ||
        (provenance.transformation !== null && typeof provenance.transformation !== 'string') ||
        !['string', 'number', 'boolean', 'object'].includes(typeof provenance.sourceValue)
      ) {
        problems.push(`invalid field provenance for ${field || '<empty>'}`);
      }
    }
  }
  if (record.geometryQuality) {
    if (
      typeof record.geometryQuality.sourceCrs !== 'string' ||
      record.geometryQuality.sourceCrs === '' ||
      typeof record.geometryQuality.sourceAxisOrder !== 'string' ||
      record.geometryQuality.sourceAxisOrder === '' ||
      !Array.isArray(record.geometryQuality.flags) ||
      (record.geometryQuality.coordinatePrecisionMeters !== null &&
        (typeof record.geometryQuality.coordinatePrecisionMeters !== 'number' ||
          !Number.isFinite(record.geometryQuality.coordinatePrecisionMeters) ||
          record.geometryQuality.coordinatePrecisionMeters < 0))
    ) {
      problems.push('invalid geometry quality metadata');
    }
    if (
      record.geometryQuality.repair &&
      (!sha256.test(record.geometryQuality.repair.originalChecksum) ||
        record.geometryQuality.repair.maximumMovementMeters < 0)
    ) {
      problems.push('invalid geometry repair audit');
    }
  }
  if (!record.rights?.policyId || !record.rights.distribution) {
    problems.push('rights policy and distribution are required');
  }
  if (
    record.rights &&
    !['public', 'private-user', 'private-organization'].includes(record.rights.distribution)
  ) {
    problems.push('invalid rights distribution');
  }
  if (!record.validation || !Array.isArray(record.validation.reasonCodes)) {
    problems.push('validation state is required');
  }
  if (typeof record.tombstone !== 'boolean') problems.push('tombstone must be boolean');
  if (record.validation && !['valid', 'quarantined'].includes(record.validation.state)) {
    problems.push('invalid validation state');
  }
  if (!['public-reference', 'private-reference', 'private-user'].includes(record.classification)) {
    problems.push('invalid classification');
  }
  if (record.classification === 'public-reference' && record.rights?.distribution !== 'public') {
    problems.push('public classification requires public distribution rights');
  }
  validateGeometryForType(record, problems);
  validateProperties(record, problems);
  inspectText(record, '$', problems);
  if (problems.length > 0) throw new CanonicalValidationError(problems);
  return structuredClone(record);
}

export interface CanonicalCatalogDocument {
  readonly schemaVersion: typeof CANONICAL_SCHEMA_VERSION;
  readonly records: readonly CanonicalRecord[];
}

export interface LegacyCatalogDocument {
  readonly schemaVersion: typeof PREVIOUS_CANONICAL_SCHEMA_VERSION;
  readonly records: readonly Omit<CanonicalRecord, 'schemaVersion'>[];
}

export function migrateCanonicalCatalog(
  document: CanonicalCatalogDocument | LegacyCatalogDocument,
): CanonicalCatalogDocument {
  if (document.schemaVersion === CANONICAL_SCHEMA_VERSION) {
    return {
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      records: document.records.map(validateCanonicalRecord),
    };
  }
  if (document.schemaVersion !== PREVIOUS_CANONICAL_SCHEMA_VERSION) {
    throw new CanonicalValidationError(['unsupported catalog migration source']);
  }
  const records = document.records.map((record) =>
    validateCanonicalRecord({ ...record, schemaVersion: CANONICAL_SCHEMA_VERSION }),
  );
  return { schemaVersion: CANONICAL_SCHEMA_VERSION, records };
}

export interface CatalogIdRemap {
  readonly fromId: string;
  readonly toIds: readonly string[];
  readonly reason: 'merge' | 'split' | 'retired';
  readonly eventId: string;
  readonly recordedAt: string;
}

export function validateCatalogIdRemap(remap: CatalogIdRemap): CatalogIdRemap {
  const problems: string[] = [];
  if (!uuidV4.test(remap.fromId)) problems.push('fromId must be UUIDv4');
  if (!uuidV4.test(remap.eventId)) problems.push('eventId must be UUIDv4');
  if (!validUtc(remap.recordedAt)) problems.push('recordedAt must be UTC');
  if (remap.reason === 'retired' && remap.toIds.length !== 0) {
    problems.push('retired remap cannot have targets');
  }
  if (remap.reason === 'merge' && remap.toIds.length !== 1) {
    problems.push('merge remap requires one target');
  }
  if (remap.reason === 'split' && remap.toIds.length < 2) {
    problems.push('split remap requires at least two targets');
  }
  if (remap.toIds.some((id) => !uuidV4.test(id) || id === remap.fromId)) {
    problems.push('remap targets must be distinct UUIDv4 values');
  }
  if (new Set(remap.toIds).size !== remap.toIds.length) problems.push('duplicate remap target');
  if (problems.length > 0) throw new CanonicalValidationError(problems);
  return structuredClone(remap);
}

export function canonicalContentChecksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function newCanonicalId(): string {
  return randomUUID();
}

export const CANONICAL_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://open-outdoor.example/schema/canonical-1.0.0.json',
  title: 'Open Outdoor canonical record',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'recordType',
    'id',
    'source',
    'retrievedAt',
    'sourceUpdatedAt',
    'geometry',
    'geometryQuality',
    'fieldProvenance',
    'rights',
    'validation',
    'contentChecksum',
    'tombstone',
    'classification',
    'properties',
  ],
  properties: {
    schemaVersion: { const: CANONICAL_SCHEMA_VERSION },
    recordType: { enum: CANONICAL_RECORD_TYPES },
    id: { type: 'string', format: 'uuid', pattern: uuidV4.source },
    source: { type: 'object' },
    retrievedAt: { type: 'string', format: 'date-time', pattern: utcInstant.source },
    sourceUpdatedAt: { type: ['string', 'null'] },
    geometry: { type: ['object', 'null'] },
    geometryQuality: { type: ['object', 'null'] },
    fieldProvenance: { type: 'object' },
    rights: { type: 'object' },
    validation: { type: 'object' },
    contentChecksum: { type: 'string', pattern: sha256.source },
    tombstone: { type: 'boolean' },
    classification: {
      enum: ['public-reference', 'private-reference', 'private-user'],
    },
    properties: { type: 'object' },
  },
} as const;

export const CANONICAL_SQL_MIGRATION_001 = `-- canonical-schema: ${CANONICAL_SCHEMA_VERSION}
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS canonical_record (
  id TEXT PRIMARY KEY CHECK(length(id) = 36),
  schema_version TEXT NOT NULL CHECK(schema_version = '${CANONICAL_SCHEMA_VERSION}'),
  record_type TEXT NOT NULL CHECK(record_type IN ('${CANONICAL_RECORD_TYPES.join("','")}')),
  source_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  source_partition TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  source_updated_at TEXT,
  geometry_geojson TEXT,
  geometry_quality_json TEXT,
  field_provenance_json TEXT NOT NULL,
  rights_json TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  properties_json TEXT NOT NULL,
  content_checksum TEXT NOT NULL CHECK(length(content_checksum) = 64),
  tombstone INTEGER NOT NULL CHECK(tombstone IN (0, 1)),
  classification TEXT NOT NULL CHECK(classification IN ('public-reference','private-reference','private-user')),
  UNIQUE(source_id, external_id, source_partition)
);
CREATE TABLE IF NOT EXISTS catalog_id_remap (
  from_id TEXT NOT NULL,
  to_id TEXT,
  reason TEXT NOT NULL CHECK(reason IN ('merge','split','retired')),
  event_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(from_id, to_id, event_id)
);
CREATE VIRTUAL TABLE IF NOT EXISTS canonical_spatial_index USING rtree(
  record_rowid,
  min_longitude, max_longitude,
  min_latitude, max_latitude
);
CREATE INDEX IF NOT EXISTS canonical_record_type_idx ON canonical_record(record_type);
CREATE INDEX IF NOT EXISTS canonical_source_idx ON canonical_record(source_id, source_partition);`;

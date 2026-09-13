import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { PlaceRecord, Position } from './canonical.js';
import { validateCanonicalRecord } from './canonical.js';
import {
  DEFAULT_RESOLUTION_THRESHOLDS,
  ENTITY_RESOLUTION_VERSION,
  scoreEntityPair,
  type EntityCandidate,
} from './entity-resolution.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROCESSOR_VERSION = '1.0.0';
const MAXIMUM_MATCH_DISTANCE_METERS = DEFAULT_RESOLUTION_THRESHOLDS.maximumPlaceDistanceMeters;
const REVIEW_THRESHOLD = DEFAULT_RESOLUTION_THRESHOLDS.place * 0.75;

interface RawIoverlanderPlace {
  readonly id: number;
  readonly guid: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude: number | null;
  readonly elevation: number | null;
  readonly category: string;
  readonly country: string;
  readonly date_verified: string;
  readonly deleted: boolean;
  readonly open: string;
  readonly revision: number;
}

interface RawTileDocument {
  readonly places: readonly unknown[];
}

interface DecFeature {
  readonly type: 'Feature';
  readonly id: string | number;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly geometry: {
    readonly type: string;
    readonly coordinates: unknown;
  };
}

interface DecCollection {
  readonly type: 'FeatureCollection';
  readonly features: readonly DecFeature[];
}

export interface PrivatePlaceSource {
  readonly tile: string;
  readonly raw: RawIoverlanderPlace;
  readonly record: PlaceRecord;
}

export interface DedupLink {
  readonly privateId: string;
  readonly privateExternalId: string;
  readonly privateName: string;
  readonly targetId: string;
  readonly targetName: string;
  readonly targetOrigin: 'private-catalog' | 'public-catalog';
  readonly distanceMeters: number;
  readonly score: number;
  readonly components: Readonly<Record<string, number>>;
  readonly algorithmVersion: string;
}

export interface DedupReview extends DedupLink {
  readonly reason: 'below-link-threshold' | 'ambiguous-public-match' | 'source-id-conflict';
}

export interface ManualReviewDecision {
  readonly privateId: string;
  readonly targetId: string;
  readonly duplicate: boolean;
}

export interface AppliedManualReviewDecision extends DedupReview {
  readonly duplicate: boolean;
}

export interface PrivateCatalogProcessingResult {
  readonly records: readonly PrivatePlaceSource[];
  readonly privateLinks: readonly DedupLink[];
  readonly publicLinks: readonly DedupLink[];
  readonly reviews: readonly DedupReview[];
  readonly manualDecisions: readonly AppliedManualReviewDecision[];
  readonly excluded: readonly {
    readonly tile: string;
    readonly externalId: string;
    readonly reason: 'deleted' | 'outside-new-york' | 'country-not-usa' | 'invalid';
  }[];
  readonly counts: {
    readonly rowsRead: number;
    readonly identityUnique: number;
    readonly deleted: number;
    readonly outsideNewYork: number;
    readonly countryNotUsa: number;
    readonly invalid: number;
    readonly privateDuplicatesRemoved: number;
    readonly matchedToDec: number;
    readonly reviewCandidates: number;
    readonly manualDuplicatesRemoved: number;
    readonly manualNonDuplicates: number;
    readonly pendingReviewCandidates: number;
    readonly outputPrivatePlaces: number;
  };
}

export interface IoverlanderPrivateCatalogOptions {
  readonly inputDirectory: string;
  readonly decGeojsonPath: string;
  readonly outputDirectory: string;
  readonly publicCheckout: string;
  readonly reviewCsvPath?: string;
  readonly generatedAt?: string;
}

export interface IoverlanderPrivateCatalogBuildResult {
  readonly outputDirectory: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly counts: PrivateCatalogProcessingResult['counts'];
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function deterministicUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const text = bytes.toString('hex');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

function utc(value: string): string | null {
  const normalized = value.trim().replace(' UTC', 'Z').replace(' ', 'T');
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rawPlace(value: unknown): RawIoverlanderPlace | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Readonly<Record<string, unknown>>;
  const altitude = item.altitude;
  const elevation = item.elevation;
  if (
    !Number.isSafeInteger(item.id) ||
    Number(item.id) < 1 ||
    typeof item.guid !== 'string' ||
    !UUID_V4.test(item.guid) ||
    typeof item.name !== 'string' ||
    normalizeText(item.name).length === 0 ||
    typeof item.latitude !== 'number' ||
    !Number.isFinite(item.latitude) ||
    Math.abs(item.latitude) > 90 ||
    typeof item.longitude !== 'number' ||
    !Number.isFinite(item.longitude) ||
    Math.abs(item.longitude) > 180 ||
    !(altitude === null || (typeof altitude === 'number' && Number.isFinite(altitude))) ||
    !(elevation === null || (typeof elevation === 'number' && Number.isFinite(elevation))) ||
    typeof item.category !== 'string' ||
    normalizeText(item.category).length === 0 ||
    typeof item.country !== 'string' ||
    typeof item.date_verified !== 'string' ||
    utc(item.date_verified) === null ||
    typeof item.deleted !== 'boolean' ||
    typeof item.open !== 'string' ||
    !Number.isSafeInteger(item.revision)
  ) {
    return null;
  }
  return {
    id: Number(item.id),
    guid: item.guid,
    name: normalizeText(item.name),
    latitude: item.latitude,
    longitude: item.longitude,
    altitude,
    elevation,
    category: normalizeText(item.category).toLocaleLowerCase('en-US'),
    country: normalizeText(item.country).toLocaleUpperCase('en-US'),
    date_verified: item.date_verified,
    deleted: item.deleted,
    open: normalizeText(item.open),
    revision: Number(item.revision),
  };
}

const PRIVATE_CATEGORY = new Map<string, string>([
  ['wild_campsite', 'camping'],
  ['informal_campsite', 'camping'],
  ['campsite', 'camping'],
  ['shorterm_parking', 'parking'],
  ['overnight-prohibited', 'overnight-prohibited'],
  ['water', 'water'],
  ['sanitation_dump', 'sanitation'],
  ['showers', 'showers'],
  ['laundry', 'laundry'],
  ['propane', 'propane'],
  ['tourist_attraction', 'attraction'],
  ['wifi', 'wifi'],
  ['mechanic', 'mechanic'],
  ['gas_station', 'fuel'],
  ['restaurant', 'food'],
  ['shopping', 'shopping'],
  ['hotel', 'lodging'],
  ['hostel', 'lodging'],
  ['warning', 'warning'],
  ['road_report', 'warning'],
]);

function privateCategory(raw: string): string {
  return PRIVATE_CATEGORY.get(raw) ?? 'other';
}

function decCategory(rawValue: unknown): string {
  const raw =
    typeof rawValue === 'string' ? normalizeText(rawValue).toLocaleUpperCase('en-US') : '';
  if (/CAMP|LEAN-TO/.test(raw)) return 'camping';
  if (/PARK|PULL-OFF/.test(raw)) return 'parking';
  if (/BOAT LAUNCH/.test(raw)) return 'boat-launch';
  if (/PICNIC/.test(raw)) return 'picnic';
  if (/FISH/.test(raw)) return 'fishing';
  if (/VIEW|VISTA|FIRE TOWER/.test(raw)) return 'viewpoint';
  return raw ? raw.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '-') : 'unknown';
}

function appCategory(raw: string): string {
  switch (raw) {
    case 'wild_campsite':
    case 'informal_campsite':
      return 'PRIMITIVE CAMPSITE';
    case 'campsite':
      return 'CAMPGROUND';
    case 'shorterm_parking':
      return 'PULL-OFF';
    case 'overnight-prohibited':
      return 'OVERNIGHT PROHIBITED';
    default:
      return raw.replaceAll('_', ' ').toLocaleUpperCase('en-US');
  }
}

function placeRecord(raw: RawIoverlanderPlace, tile: string, generatedAt: string): PlaceRecord {
  const sourceUpdatedAt = utc(raw.date_verified);
  if (!sourceUpdatedAt) throw new Error('validated source time became invalid');
  const category = privateCategory(raw.category);
  const elevation = raw.elevation ?? raw.altitude;
  const core = {
    schemaVersion: '1.0.0' as const,
    recordType: 'place' as const,
    id: raw.guid,
    source: {
      sourceId: 'private-ioverlander',
      externalId: String(raw.id),
      sourcePartition: tile,
      connectorVersion: PROCESSOR_VERSION,
      parserVersion: PROCESSOR_VERSION,
      normalizerVersion: PROCESSOR_VERSION,
    },
    retrievedAt: generatedAt,
    sourceUpdatedAt,
    geometry: {
      type: 'Point' as const,
      coordinates: [raw.longitude, raw.latitude] as Position,
    },
    geometryQuality: {
      sourceCrs: 'EPSG:4326',
      sourceAxisOrder: 'longitude-latitude',
      coordinatePrecisionMeters: null,
      flags: ['source-provided-coordinate'],
      repair: null,
    },
    fieldProvenance: {
      name: {
        sourceField: 'name',
        sourceValue: raw.name,
        observedAt: sourceUpdatedAt,
        transformation: 'Unicode NFC, whitespace normalized',
      },
      category: {
        sourceField: 'category',
        sourceValue: raw.category,
        observedAt: sourceUpdatedAt,
        transformation: `mapped to ${category}`,
      },
      geometry: {
        sourceField: 'longitude,latitude',
        sourceValue: `${raw.longitude},${raw.latitude}`,
        observedAt: sourceUpdatedAt,
        transformation: null,
      },
    },
    rights: {
      policyId: 'private-ioverlander-user-selected-export-v1',
      distribution: 'private-user' as const,
      attribution: ['iOverlander private user-selected export'],
    },
    validation: { state: 'valid' as const, reasonCodes: [] },
    tombstone: false,
    classification: 'private-reference' as const,
    properties: {
      name: raw.name,
      category,
      rawCategory: category === 'other' ? raw.category : null,
      entrances: [[raw.longitude, raw.latitude] as Position],
      elevation:
        elevation === null || elevation < -500
          ? null
          : { meters: elevation, verticalDatum: 'unknown' as const },
    },
  };
  return validateCanonicalRecord({
    ...core,
    contentChecksum: sha256(stableJson(core)),
  }) as PlaceRecord;
}

function decRecord(feature: DecFeature, generatedAt: string): PlaceRecord | null {
  if (
    feature.geometry.type !== 'Point' ||
    !Array.isArray(feature.geometry.coordinates) ||
    feature.geometry.coordinates.length < 2
  ) {
    return null;
  }
  const [longitude, latitude] = feature.geometry.coordinates;
  const name = normalizeText(String(feature.properties.name ?? ''));
  if (
    !name ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude)
  ) {
    return null;
  }
  const rawCategory = normalizeText(String(feature.properties.category ?? 'unknown'));
  const category = decCategory(rawCategory);
  const sourceId = normalizeText(String(feature.properties.sourceId ?? 'nys-dec-poi'));
  const updatedValue = feature.properties.sourceUpdated;
  const sourceUpdatedAt =
    typeof updatedValue === 'string' && /^\d+$/.test(updatedValue)
      ? new Date(Number(updatedValue)).toISOString()
      : typeof updatedValue === 'string'
        ? utc(updatedValue)
        : null;
  const id = deterministicUuid(`dec:${sourceId}:${String(feature.id)}`);
  const core = {
    schemaVersion: '1.0.0' as const,
    recordType: 'place' as const,
    id,
    source: {
      sourceId,
      externalId: String(feature.id),
      sourcePartition: 'new-york',
      connectorVersion: PROCESSOR_VERSION,
      parserVersion: PROCESSOR_VERSION,
      normalizerVersion: PROCESSOR_VERSION,
    },
    retrievedAt: generatedAt,
    sourceUpdatedAt,
    geometry: { type: 'Point' as const, coordinates: [longitude, latitude] as Position },
    geometryQuality: {
      sourceCrs: 'EPSG:4326',
      sourceAxisOrder: 'longitude-latitude',
      coordinatePrecisionMeters: null,
      flags: ['public-dec-reference'],
      repair: null,
    },
    fieldProvenance: {
      name: {
        sourceField: 'properties.name',
        sourceValue: name,
        observedAt: sourceUpdatedAt,
        transformation: 'Unicode NFC, whitespace normalized',
      },
      category: {
        sourceField: 'properties.category',
        sourceValue: rawCategory,
        observedAt: sourceUpdatedAt,
        transformation: `mapped to ${category}`,
      },
    },
    rights: {
      policyId: 'bundled-nys-dec-public-reference-v1',
      distribution: 'public' as const,
      attribution: ['New York State Department of Environmental Conservation'],
    },
    validation: { state: 'valid' as const, reasonCodes: [] },
    tombstone: false,
    classification: 'public-reference' as const,
    properties: {
      name,
      category,
      rawCategory: null,
      entrances: [[longitude, latitude] as Position],
      elevation: null,
    },
  };
  return validateCanonicalRecord({
    ...core,
    contentChecksum: sha256(stableJson(core)),
  }) as PlaceRecord;
}

function ringContains(point: Position, ring: readonly unknown[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (!Array.isArray(currentPoint) || !Array.isArray(previousPoint)) continue;
    const currentX = Number(currentPoint[0]);
    const currentY = Number(currentPoint[1]);
    const previousX = Number(previousPoint[0]);
    const previousY = Number(previousPoint[1]);
    const crosses =
      currentY > point[1] !== previousY > point[1] &&
      point[0] <
        ((previousX - currentX) * (point[1] - currentY)) / (previousY - currentY) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function polygonContains(point: Position, polygon: readonly unknown[]): boolean {
  const exterior = polygon[0];
  if (!Array.isArray(exterior) || !ringContains(point, exterior)) return false;
  return !polygon.slice(1).some((ring) => Array.isArray(ring) && ringContains(point, ring));
}

function boundaryContains(boundary: DecFeature, point: Position): boolean {
  const coordinates = boundary.geometry.coordinates;
  if (!Array.isArray(coordinates)) return false;
  if (boundary.geometry.type === 'Polygon') return polygonContains(point, coordinates);
  if (boundary.geometry.type === 'MultiPolygon') {
    return coordinates.some((polygon) => Array.isArray(polygon) && polygonContains(point, polygon));
  }
  throw new Error('DEC collection does not contain a polygon New York boundary');
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function placeDistanceMeters(left: PlaceRecord, right: PlaceRecord): number {
  if (left.geometry?.type !== 'Point' || right.geometry?.type !== 'Point') return Infinity;
  const [leftLongitude, leftLatitude] = left.geometry.coordinates;
  const [rightLongitude, rightLatitude] = right.geometry.coordinates;
  const latitudeDelta = radians(rightLatitude - leftLatitude);
  const longitudeDelta = radians(rightLongitude - leftLongitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(leftLatitude)) *
      Math.cos(radians(rightLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nameFirstToken(value: string): string {
  return (
    value
      .normalize('NFC')
      .toLocaleLowerCase('en-US')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .split(/\s+/)[0] ?? ''
  );
}

function samePrivateBlock(left: PlaceRecord, right: PlaceRecord): boolean {
  return (
    left.properties.category === right.properties.category ||
    nameFirstToken(left.properties.name) === nameFirstToken(right.properties.name)
  );
}

function candidate(
  left: PlaceRecord,
  right: PlaceRecord,
): (EntityCandidate & { readonly distanceMeters: number }) | null {
  const distance = placeDistanceMeters(left, right);
  if (distance > MAXIMUM_MATCH_DISTANCE_METERS) return null;
  const score = scoreEntityPair(left, right);
  if (!score) return null;
  return {
    leftId: left.id,
    rightId: right.id,
    recordType: 'place',
    score,
    recommendation:
      score.total >= DEFAULT_RESOLUTION_THRESHOLDS.place
        ? 'link'
        : score.total >= REVIEW_THRESHOLD
          ? 'review'
          : 'reject',
    distanceMeters: distance,
  };
}

const GRID_DEGREES = 0.002;

function pointKey(record: PlaceRecord): string {
  if (record.geometry?.type !== 'Point') throw new Error('private place must be a point');
  const [longitude, latitude] = record.geometry.coordinates;
  return `${Math.floor(longitude / GRID_DEGREES)}:${Math.floor(latitude / GRID_DEGREES)}`;
}

function nearby(
  source: PlaceRecord,
  index: ReadonlyMap<string, readonly PlaceRecord[]>,
): readonly PlaceRecord[] {
  if (source.geometry?.type !== 'Point') return [];
  const [longitude, latitude] = source.geometry.coordinates;
  const x = Math.floor(longitude / GRID_DEGREES);
  const y = Math.floor(latitude / GRID_DEGREES);
  const longitudeCells = Math.ceil(
    MAXIMUM_MATCH_DISTANCE_METERS /
      (111_320 * Math.max(0.1, Math.cos(radians(latitude))) * GRID_DEGREES),
  );
  const latitudeCells = Math.ceil(MAXIMUM_MATCH_DISTANCE_METERS / (111_320 * GRID_DEGREES));
  const result: PlaceRecord[] = [];
  for (let dx = -longitudeCells; dx <= longitudeCells; dx += 1) {
    for (let dy = -latitudeCells; dy <= latitudeCells; dy += 1) {
      result.push(...(index.get(`${x + dx}:${y + dy}`) ?? []));
    }
  }
  return result;
}

function spatialIndex(
  records: readonly PlaceRecord[],
): ReadonlyMap<string, readonly PlaceRecord[]> {
  const index = new Map<string, PlaceRecord[]>();
  for (const record of records) {
    const key = pointKey(record);
    const bucket = index.get(key) ?? [];
    bucket.push(record);
    index.set(key, bucket);
  }
  return index;
}

function preferred(left: PrivatePlaceSource, right: PrivatePlaceSource): PrivatePlaceSource {
  return [left, right].sort(
    (first, second) =>
      second.raw.revision - first.raw.revision ||
      Date.parse(second.record.sourceUpdatedAt ?? '') -
        Date.parse(first.record.sourceUpdatedAt ?? '') ||
      first.record.id.localeCompare(second.record.id),
  )[0]!;
}

function dedupLink(
  source: PrivatePlaceSource,
  target: PrivatePlaceSource | PlaceRecord,
  scored: EntityCandidate & { readonly distanceMeters: number },
  targetOrigin: DedupLink['targetOrigin'],
): DedupLink {
  const targetRecord = 'record' in target ? target.record : target;
  return {
    privateId: source.record.id,
    privateExternalId: String(source.raw.id),
    privateName: source.record.properties.name,
    targetId: targetRecord.id,
    targetName: targetRecord.properties.name,
    targetOrigin,
    distanceMeters: Math.round(scored.distanceMeters * 10) / 10,
    score: Math.round(scored.score.total * 10_000) / 10_000,
    components: scored.score.components,
    algorithmVersion: ENTITY_RESOLUTION_VERSION,
  };
}

class DisjointSet {
  private readonly parent = new Map<string, string>();
  add(id: string): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }
  find(id: string): string {
    const parent = this.parent.get(id);
    if (!parent) throw new Error(`unknown disjoint-set member: ${id}`);
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }
  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) {
      const [winner, loser] = [leftRoot, rightRoot].sort();
      this.parent.set(loser!, winner!);
    }
  }
}

function parseDecCollection(value: unknown): DecCollection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('DEC GeoJSON must be an object');
  }
  const document = value as Readonly<Record<string, unknown>>;
  if (document.type !== 'FeatureCollection' || !Array.isArray(document.features)) {
    throw new Error('DEC GeoJSON must be a FeatureCollection');
  }
  return document as unknown as DecCollection;
}

export interface IoverlanderTileInput {
  readonly name: string;
  readonly value: unknown;
}

export function processIoverlanderPrivateData(
  tiles: readonly IoverlanderTileInput[],
  decValue: unknown,
  generatedAt: string,
): PrivateCatalogProcessingResult {
  if (!utc(generatedAt) || utc(generatedAt) !== generatedAt) {
    throw new Error('generatedAt must be a normalized UTC timestamp');
  }
  const dec = parseDecCollection(decValue);
  const boundary = dec.features.find(
    (feature) =>
      feature.properties.kind === 'boundary' &&
      (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon'),
  );
  if (!boundary) throw new Error('DEC GeoJSON is missing the New York boundary');

  let rowsRead = 0;
  const excluded: PrivateCatalogProcessingResult['excluded'][number][] = [];
  const accepted: PrivatePlaceSource[] = [];
  for (const tile of [...tiles].sort((left, right) => left.name.localeCompare(right.name))) {
    const document = tile.value as RawTileDocument;
    if (!document || typeof document !== 'object' || !Array.isArray(document.places)) {
      throw new Error(`${tile.name} is not an iOverlander tile document`);
    }
    for (const value of document.places) {
      rowsRead += 1;
      const parsed = rawPlace(value);
      const externalId =
        value && typeof value === 'object' && !Array.isArray(value)
          ? String((value as Readonly<Record<string, unknown>>).id ?? '')
          : '';
      if (!parsed) {
        excluded.push({ tile: tile.name, externalId, reason: 'invalid' });
        continue;
      }
      if (parsed.deleted) {
        excluded.push({ tile: tile.name, externalId: String(parsed.id), reason: 'deleted' });
        continue;
      }
      if (parsed.country !== 'USA') {
        excluded.push({
          tile: tile.name,
          externalId: String(parsed.id),
          reason: 'country-not-usa',
        });
        continue;
      }
      if (!boundaryContains(boundary, [parsed.longitude, parsed.latitude])) {
        excluded.push({
          tile: tile.name,
          externalId: String(parsed.id),
          reason: 'outside-new-york',
        });
        continue;
      }
      accepted.push({
        tile: tile.name,
        raw: parsed,
        record: placeRecord(parsed, tile.name, generatedAt),
      });
    }
  }

  const identity = new Map<string, PrivatePlaceSource>();
  const privateLinks: DedupLink[] = [];
  const reviews: DedupReview[] = [];
  for (const source of accepted) {
    const keys = [`guid:${source.raw.guid.toLocaleLowerCase('en-US')}`, `id:${source.raw.id}`];
    const existing = keys.map((key) => identity.get(key)).find(Boolean);
    if (existing) {
      const winner = preferred(existing, source);
      const loser = winner === existing ? source : existing;
      const scored = candidate(loser.record, winner.record);
      if (scored) privateLinks.push(dedupLink(loser, winner, scored, 'private-catalog'));
      for (const key of keys) identity.set(key, winner);
    } else {
      for (const key of keys) identity.set(key, source);
    }
  }
  const identityUnique = [
    ...new Map([...identity.values()].map((item) => [item.record.id, item])).values(),
  ];

  const sets = new DisjointSet();
  identityUnique.forEach((item) => sets.add(item.record.id));
  const privateIndex = spatialIndex(identityUnique.map((item) => item.record));
  const byRecordId = new Map(identityUnique.map((item) => [item.record.id, item]));
  const seenPairs = new Set<string>();
  for (const source of identityUnique) {
    for (const otherRecord of nearby(source.record, privateIndex)) {
      if (source.record.id === otherRecord.id || !samePrivateBlock(source.record, otherRecord))
        continue;
      const pair = [source.record.id, otherRecord.id].sort().join(':');
      if (seenPairs.has(pair)) continue;
      seenPairs.add(pair);
      const scored = candidate(source.record, otherRecord);
      if (!scored || scored.recommendation === 'reject') continue;
      const other = byRecordId.get(otherRecord.id)!;
      if (scored.recommendation === 'link') {
        sets.union(source.record.id, other.record.id);
      } else {
        reviews.push({
          ...dedupLink(source, other, scored, 'private-catalog'),
          reason: 'below-link-threshold',
        });
      }
    }
  }

  const groups = new Map<string, PrivatePlaceSource[]>();
  for (const source of identityUnique) {
    const root = sets.find(source.record.id);
    groups.set(root, [...(groups.get(root) ?? []), source]);
  }
  const survivors: PrivatePlaceSource[] = [];
  for (const group of groups.values()) {
    const winner = group.reduce(preferred);
    survivors.push(winner);
    for (const loser of group) {
      if (loser.record.id === winner.record.id) continue;
      const scored = candidate(loser.record, winner.record);
      if (scored) privateLinks.push(dedupLink(loser, winner, scored, 'private-catalog'));
    }
  }

  const decRecords = dec.features
    .filter((feature) => feature.properties.kind === 'poi')
    .map((feature) => decRecord(feature, generatedAt))
    .filter((record): record is PlaceRecord => record !== null);
  const decIndex = spatialIndex(decRecords);
  const publicLinks: DedupLink[] = [];
  const output: PrivatePlaceSource[] = [];
  for (const source of survivors.sort((left, right) =>
    left.record.id.localeCompare(right.record.id),
  )) {
    const scored = nearby(source.record, decIndex)
      .map((record) => ({ record, candidate: candidate(source.record, record) }))
      .filter(
        (
          item,
        ): item is {
          record: PlaceRecord;
          candidate: NonNullable<ReturnType<typeof candidate>>;
        } => item.candidate !== null && item.candidate.recommendation !== 'reject',
      )
      .sort(
        (left, right) =>
          right.candidate.score.total - left.candidate.score.total ||
          left.record.id.localeCompare(right.record.id),
      );
    const links = scored.filter((item) => item.candidate.recommendation === 'link');
    if (links.length === 1) {
      publicLinks.push(dedupLink(source, links[0]!.record, links[0]!.candidate, 'public-catalog'));
      continue;
    }
    if (links.length > 1) {
      reviews.push({
        ...dedupLink(source, links[0]!.record, links[0]!.candidate, 'public-catalog'),
        reason: 'ambiguous-public-match',
      });
    } else if (scored[0]) {
      reviews.push({
        ...dedupLink(source, scored[0].record, scored[0].candidate, 'public-catalog'),
        reason: 'below-link-threshold',
      });
    }
    output.push(source);
  }

  const count = (reason: PrivateCatalogProcessingResult['excluded'][number]['reason']): number =>
    excluded.filter((item) => item.reason === reason).length;
  return {
    records: output,
    privateLinks: privateLinks.sort((left, right) => left.privateId.localeCompare(right.privateId)),
    publicLinks: publicLinks.sort((left, right) => left.privateId.localeCompare(right.privateId)),
    reviews: reviews.sort((left, right) => left.privateId.localeCompare(right.privateId)),
    manualDecisions: [],
    excluded,
    counts: {
      rowsRead,
      identityUnique: identityUnique.length,
      deleted: count('deleted'),
      outsideNewYork: count('outside-new-york'),
      countryNotUsa: count('country-not-usa'),
      invalid: count('invalid'),
      privateDuplicatesRemoved:
        identityUnique.length - survivors.length + (accepted.length - identityUnique.length),
      matchedToDec: publicLinks.length,
      reviewCandidates: reviews.length,
      manualDuplicatesRemoved: 0,
      manualNonDuplicates: 0,
      pendingReviewCandidates: reviews.length,
      outputPrivatePlaces: output.length,
    },
  };
}

export function applyManualReviewDecisions(
  result: PrivateCatalogProcessingResult,
  decisions: readonly ManualReviewDecision[],
): PrivateCatalogProcessingResult {
  const reviewByPair = new Map(
    result.reviews.map((review) => [`${review.privateId}|${review.targetId}`, review]),
  );
  const decisionByPair = new Map<string, ManualReviewDecision>();
  for (const decision of decisions) {
    const key = `${decision.privateId}|${decision.targetId}`;
    if (decisionByPair.has(key)) throw new Error(`duplicate manual decision for ${key}`);
    if (!reviewByPair.has(key))
      throw new Error(`manual decision does not match review candidate ${key}`);
    decisionByPair.set(key, decision);
  }

  const manualDecisions = [...decisionByPair.entries()]
    .map(([key, decision]) => ({ ...reviewByPair.get(key)!, duplicate: decision.duplicate }))
    .sort((left, right) => left.privateId.localeCompare(right.privateId));
  const acceptedDuplicates = manualDecisions.filter((decision) => decision.duplicate);
  const currentPrivateIds = new Set(result.records.map((source) => source.record.id));
  const appliedDuplicates = acceptedDuplicates.filter((decision) =>
    currentPrivateIds.has(decision.privateId),
  );
  const removals = new Set(appliedDuplicates.map((decision) => decision.privateId));
  if (removals.size !== appliedDuplicates.length) {
    throw new Error('only one duplicate target may be accepted for each private place');
  }
  for (const decision of appliedDuplicates) {
    if (
      decision.targetOrigin === 'private-catalog' &&
      (!currentPrivateIds.has(decision.targetId) || removals.has(decision.targetId))
    ) {
      throw new Error(
        `manual private duplicate target is not a retained place: ${decision.targetId}`,
      );
    }
  }
  const asLink = (decision: AppliedManualReviewDecision): DedupLink => {
    const { reason: _reason, duplicate: _duplicate, ...link } = decision;
    return link;
  };
  const manualPrivateLinks = appliedDuplicates
    .filter((decision) => decision.targetOrigin === 'private-catalog')
    .map(asLink);
  const manualPublicLinks = appliedDuplicates
    .filter((decision) => decision.targetOrigin === 'public-catalog')
    .map(asLink);
  const pendingReviews = result.reviews.filter(
    (review) => !decisionByPair.has(`${review.privateId}|${review.targetId}`),
  );
  const records = result.records.filter((source) => !removals.has(source.record.id));
  return {
    ...result,
    records,
    privateLinks: [...result.privateLinks, ...manualPrivateLinks].sort((left, right) =>
      left.privateId.localeCompare(right.privateId),
    ),
    publicLinks: [...result.publicLinks, ...manualPublicLinks].sort((left, right) =>
      left.privateId.localeCompare(right.privateId),
    ),
    reviews: pendingReviews,
    manualDecisions,
    counts: {
      ...result.counts,
      privateDuplicatesRemoved: result.counts.privateDuplicatesRemoved + manualPrivateLinks.length,
      matchedToDec: result.counts.matchedToDec + manualPublicLinks.length,
      manualDuplicatesRemoved: appliedDuplicates.length,
      manualNonDuplicates: manualDecisions.length - acceptedDuplicates.length,
      pendingReviewCandidates: pendingReviews.length,
      outputPrivatePlaces: records.length,
    },
  };
}

interface AppFeature {
  readonly type: 'Feature';
  readonly id: string | number;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly geometry: DecFeature['geometry'];
}

function privateAppFeature(source: PrivatePlaceSource): AppFeature {
  return {
    type: 'Feature',
    id: `private:${source.record.id}`,
    properties: {
      id: `private:${source.record.id}`,
      kind: 'poi',
      name: source.record.properties.name,
      sourceId: 'private-ioverlander',
      unit: 'Private iOverlander reference',
      category: appCategory(source.raw.category),
      publicUse: `${source.raw.open || 'unknown'}; private reference; verify current access`,
      sourceUpdated: source.record.sourceUpdatedAt ?? '',
      origin: 'private-catalog',
    },
    geometry: {
      type: 'Point',
      coordinates: source.record.geometry!.coordinates,
    },
  };
}

function appBounds(feature: AppFeature): readonly [number, number, number, number] {
  const positions: Position[] = [];
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) throw new Error('invalid GeoJSON coordinates');
    if (typeof value[0] === 'number') {
      positions.push([Number(value[0]), Number(value[1])]);
    } else {
      value.forEach(visit);
    }
  };
  visit(feature.geometry.coordinates);
  if (positions.length === 0) throw new Error('empty GeoJSON geometry');
  return positions.reduce<readonly [number, number, number, number]>(
    (bounds, [longitude, latitude]) => [
      Math.min(bounds[0], longitude),
      Math.min(bounds[1], latitude),
      Math.max(bounds[2], longitude),
      Math.max(bounds[3], latitude),
    ],
    [180, 90, -180, -90],
  );
}

function appCollection(features: readonly AppFeature[]): Readonly<Record<string, unknown>> {
  return { type: 'FeatureCollection', features };
}

function appIndex(features: readonly AppFeature[]): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: 1,
    features: features.map((feature) => ({
      id: String(feature.id),
      properties: feature.properties,
      bounds: appBounds(feature),
    })),
  };
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function reviewCsv(reviews: readonly DedupReview[]): string {
  const columns = [
    'reason',
    'private_id',
    'private_external_id',
    'private_name',
    'target_id',
    'target_name',
    'target_origin',
    'distance_meters',
    'score',
  ];
  return `${[
    columns.join(','),
    ...reviews.map((item) =>
      [
        item.reason,
        item.privateId,
        item.privateExternalId,
        item.privateName,
        item.targetId,
        item.targetName,
        item.targetOrigin,
        item.distanceMeters,
        item.score,
      ]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n')}\n`;
}

function csvRows(value: string): readonly (readonly string[])[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error('review CSV contains an unclosed quoted field');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((item) => item.trim() !== ''));
}

export function manualReviewDecisionsFromCsv(value: string): readonly ManualReviewDecision[] {
  const rows = csvRows(value.replace(/^\uFEFF/, ''));
  if (!rows[0]) throw new Error('review CSV is empty');
  const headers = rows[0].map((header) => header.trim().toLocaleLowerCase('en-US'));
  const privateIndex = headers.indexOf('private_id');
  const targetIndex = headers.indexOf('target_id');
  const decisionIndex = headers.indexOf('duplicate');
  if (privateIndex < 0 || targetIndex < 0 || decisionIndex < 0) {
    throw new Error('review CSV must contain private_id, target_id, and Duplicate columns');
  }
  if (decisionIndex !== headers.length - 1) {
    throw new Error('Duplicate must be the rightmost review CSV column');
  }
  return rows.slice(1).map((row, index) => {
    const privateId = row[privateIndex]?.trim() ?? '';
    const targetId = row[targetIndex]?.trim() ?? '';
    const decision = row[decisionIndex]?.trim().toLocaleLowerCase('en-US') ?? '';
    if (!privateId || !targetId) throw new Error(`review CSV row ${index + 2} is missing IDs`);
    if (decision !== 'yes' && decision !== 'no') {
      throw new Error(`review CSV row ${index + 2} must mark Duplicate as Yes or No`);
    }
    return { privateId, targetId, duplicate: decision === 'yes' };
  });
}

function createPrivateCatalog(
  path: string,
  result: PrivateCatalogProcessingResult,
  generatedAt: string,
): void {
  const database = new DatabaseSync(path, {
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
    allowExtension: false,
  });
  try {
    database.exec(`
      PRAGMA page_size = 4096;
      PRAGMA journal_mode = DELETE;
      PRAGMA synchronous = FULL;
      PRAGMA user_version = 1;
      CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      CREATE TABLE sources(source_id TEXT PRIMARY KEY, inventory_json TEXT NOT NULL, rights_checksum TEXT NOT NULL) STRICT;
      CREATE TABLE records(id TEXT PRIMARY KEY, record_type TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES sources(source_id), source_external_id TEXT NOT NULL, source_partition TEXT NOT NULL, retrieved_at TEXT NOT NULL, source_updated_at TEXT, content_checksum TEXT NOT NULL, record_json TEXT NOT NULL) STRICT;
      CREATE VIRTUAL TABLE record_bounds USING rtree(rowid, west, east, south, north);
      CREATE VIRTUAL TABLE record_search USING fts5(id UNINDEXED, name, keywords, tokenize = 'unicode61 remove_diacritics 2');
      CREATE TABLE resolution_link(private_id TEXT NOT NULL, target_id TEXT NOT NULL, target_origin TEXT NOT NULL, score REAL NOT NULL, link_json TEXT NOT NULL, PRIMARY KEY(private_id, target_id)) STRICT;
      CREATE TABLE resolution_review(ordinal INTEGER PRIMARY KEY, private_id TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT NOT NULL, review_json TEXT NOT NULL) STRICT;
      CREATE TABLE resolution_decision(ordinal INTEGER PRIMARY KEY, private_id TEXT NOT NULL, target_id TEXT NOT NULL, duplicate INTEGER NOT NULL CHECK(duplicate IN (0, 1)), decision_json TEXT NOT NULL) STRICT;
      CREATE INDEX records_source_type ON records(source_id, record_type);
    `);
    database.exec('BEGIN IMMEDIATE');
    const metadata = database.prepare('INSERT INTO metadata(key, value) VALUES (?, ?)');
    metadata.run('bundleId', 'private-ioverlander-new-york');
    metadata.run('classification', 'PRIVATE_USER');
    metadata.run('generatedAt', generatedAt);
    metadata.run('catalogSchemaVersion', '1');
    metadata.run('processorVersion', PROCESSOR_VERSION);
    metadata.run('entityResolutionVersion', ENTITY_RESOLUTION_VERSION);
    database
      .prepare('INSERT INTO sources(source_id, inventory_json, rights_checksum) VALUES (?, ?, ?)')
      .run(
        'private-ioverlander',
        stableJson({
          sourceId: 'private-ioverlander',
          displayName: 'Private iOverlander export',
          classification: 'PRIVATE_USER',
          recordCount: result.records.length,
        }),
        sha256('private-ioverlander-user-selected-export-v1'),
      );
    const insertRecord = database.prepare(
      'INSERT INTO records(id, record_type, source_id, source_external_id, source_partition, retrieved_at, source_updated_at, content_checksum, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const insertBounds = database.prepare(
      'INSERT INTO record_bounds(rowid, west, east, south, north) VALUES (?, ?, ?, ?, ?)',
    );
    const insertSearch = database.prepare(
      'INSERT INTO record_search(id, name, keywords) VALUES (?, ?, ?)',
    );
    result.records.forEach((source, index) => {
      const record = source.record;
      if (record.geometry?.type !== 'Point') throw new Error('private place must be a point');
      const [longitude, latitude] = record.geometry.coordinates;
      insertRecord.run(
        record.id,
        record.recordType,
        record.source.sourceId,
        record.source.externalId,
        record.source.sourcePartition,
        record.retrievedAt,
        record.sourceUpdatedAt,
        record.contentChecksum,
        stableJson(record),
      );
      insertBounds.run(index + 1, longitude, longitude, latitude, latitude);
      insertSearch.run(
        record.id,
        record.properties.name,
        `${record.properties.category} ${record.properties.rawCategory ?? ''}`,
      );
    });
    const insertLink = database.prepare(
      'INSERT INTO resolution_link(private_id, target_id, target_origin, score, link_json) VALUES (?, ?, ?, ?, ?)',
    );
    [...result.privateLinks, ...result.publicLinks].forEach((item) =>
      insertLink.run(
        item.privateId,
        item.targetId,
        item.targetOrigin,
        item.score,
        stableJson(item),
      ),
    );
    const insertReview = database.prepare(
      'INSERT INTO resolution_review(ordinal, private_id, target_id, reason, review_json) VALUES (?, ?, ?, ?, ?)',
    );
    result.reviews.forEach((item, index) =>
      insertReview.run(index + 1, item.privateId, item.targetId, item.reason, stableJson(item)),
    );
    const insertDecision = database.prepare(
      'INSERT INTO resolution_decision(ordinal, private_id, target_id, duplicate, decision_json) VALUES (?, ?, ?, ?, ?)',
    );
    result.manualDecisions.forEach((item, index) =>
      insertDecision.run(
        index + 1,
        item.privateId,
        item.targetId,
        item.duplicate ? 1 : 0,
        stableJson(item),
      ),
    );
    database.exec('COMMIT; VACUUM;');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // The transaction may already be closed.
    }
    throw error;
  } finally {
    database.close();
  }
}

async function loadTileInputs(inputDirectory: string): Promise<{
  readonly tiles: readonly IoverlanderTileInput[];
  readonly inventory: readonly Readonly<Record<string, unknown>>[];
}> {
  const inputStat = await stat(inputDirectory);
  if (!inputStat.isDirectory()) throw new Error('inputDirectory must be a directory');
  let tileDirectory = inputDirectory;
  if (!/^tiles_\d+$/.test(basename(inputDirectory))) {
    const entries = await readdir(inputDirectory, { withFileTypes: true });
    const candidates = entries.filter(
      (entry) => entry.isDirectory() && /^tiles_\d+$/.test(entry.name),
    );
    if (candidates.length !== 1) {
      throw new Error('inputDirectory must contain exactly one tiles_<version> directory');
    }
    tileDirectory = join(inputDirectory, candidates[0]!.name);
  }
  const manifestBytes = await readFile(join(tileDirectory, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as Readonly<
    Record<string, { readonly size: number; readonly md5: string }>
  >;
  const tileNames = (await readdir(tileDirectory))
    .filter((name) => /^n\d+_w\d+\.json$/.test(name))
    .sort();
  if (tileNames.length === 0) throw new Error('no base iOverlander tiles found');
  const tiles: IoverlanderTileInput[] = [];
  const inventory: Readonly<Record<string, unknown>>[] = [];
  for (const name of tileNames) {
    const bytes = await readFile(join(tileDirectory, name));
    const expected = manifest[name.slice(0, -5)];
    const md5 = createHash('md5').update(bytes).digest('hex');
    if (!expected || expected.size !== bytes.byteLength || expected.md5 !== md5) {
      throw new Error(`${name} failed source manifest integrity verification`);
    }
    tiles.push({ name, value: JSON.parse(bytes.toString('utf8')) });
    inventory.push({ name, bytes: bytes.byteLength, md5, sha256: sha256(bytes) });
  }
  return { tiles, inventory };
}

async function writeExclusive(path: string, value: string): Promise<void> {
  await writeFile(path, value, { encoding: 'utf8', flag: 'wx' });
}

async function fileDescription(path: string): Promise<Readonly<Record<string, unknown>>> {
  const bytes = await readFile(path);
  return { file: basename(path), bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function pathIsInside(parent: string, child: string): boolean {
  const local = relative(resolve(parent), resolve(child));
  return local !== '' && !local.startsWith(`..${sep}`) && local !== '..' && !isAbsolute(local);
}

export async function buildIoverlanderPrivateCatalog(
  options: IoverlanderPrivateCatalogOptions,
): Promise<IoverlanderPrivateCatalogBuildResult> {
  for (const [name, value] of Object.entries({
    inputDirectory: options.inputDirectory,
    decGeojsonPath: options.decGeojsonPath,
    outputDirectory: options.outputDirectory,
    publicCheckout: options.publicCheckout,
    ...(options.reviewCsvPath ? { reviewCsvPath: options.reviewCsvPath } : {}),
  })) {
    if (!isAbsolute(value)) throw new Error(`${name} must be absolute`);
  }
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  if (!utc(generatedAt) || utc(generatedAt) !== generatedAt) {
    throw new Error('generatedAt must be a normalized UTC timestamp');
  }
  const publicCheckout = await realpath(options.publicCheckout);
  const inputDirectory = await realpath(options.inputDirectory);
  const decGeojsonPath = await realpath(options.decGeojsonPath);
  const reviewCsvPath = options.reviewCsvPath ? await realpath(options.reviewCsvPath) : null;
  const outputDirectory = resolve(options.outputDirectory);
  if (pathIsInside(publicCheckout, outputDirectory) || outputDirectory === publicCheckout) {
    throw new Error('private output must be outside the public checkout');
  }
  if (existsSync(outputDirectory)) throw new Error('outputDirectory already exists');
  await mkdir(dirname(outputDirectory), { recursive: true });
  const temporaryDirectory = join(
    dirname(outputDirectory),
    `.${basename(outputDirectory)}.tmp-${sha256(generatedAt).slice(0, 12)}`,
  );
  if (existsSync(temporaryDirectory)) throw new Error('temporary output directory already exists');
  await mkdir(temporaryDirectory);
  try {
    const [{ tiles, inventory }, decBytes, decisionBytes] = await Promise.all([
      loadTileInputs(inputDirectory),
      readFile(decGeojsonPath),
      reviewCsvPath ? readFile(reviewCsvPath) : Promise.resolve(null),
    ]);
    const dec = parseDecCollection(JSON.parse(decBytes.toString('utf8')));
    const automaticResult = processIoverlanderPrivateData(tiles, dec, generatedAt);
    const result = decisionBytes
      ? applyManualReviewDecisions(
          automaticResult,
          manualReviewDecisionsFromCsv(decisionBytes.toString('utf8')),
        )
      : automaticResult;
    const privateFeatures = result.records.map(privateAppFeature);
    const publicFeatures = dec.features as readonly AppFeature[];
    const composedFeatures = [...publicFeatures, ...privateFeatures];

    const privateGeojsonPath = join(temporaryDirectory, 'private-ioverlander.geojson');
    const privateIndexPath = join(temporaryDirectory, 'private-ioverlander.index.json');
    const composedGeojsonPath = join(temporaryDirectory, 'new-york-outdoors.composed.geojson');
    const composedIndexPath = join(temporaryDirectory, 'new-york-outdoors.composed.index.json');
    const catalogPath = join(temporaryDirectory, 'catalog.sqlite');
    const reportPath = join(temporaryDirectory, 'dedup-report.json');
    const reviewPath = join(temporaryDirectory, 'dedup-review.csv');
    const decisionPath = decisionBytes ? join(temporaryDirectory, 'dedup-decisions.csv') : null;
    await Promise.all([
      writeExclusive(privateGeojsonPath, `${stableJson(appCollection(privateFeatures))}\n`),
      writeExclusive(privateIndexPath, `${stableJson(appIndex(privateFeatures))}\n`),
      writeExclusive(composedGeojsonPath, `${stableJson(appCollection(composedFeatures))}\n`),
      writeExclusive(composedIndexPath, `${stableJson(appIndex(composedFeatures))}\n`),
      writeExclusive(
        reportPath,
        `${stableJson({
          schemaVersion: 1,
          generatedAt,
          processorVersion: PROCESSOR_VERSION,
          entityResolutionVersion: ENTITY_RESOLUTION_VERSION,
          thresholds: {
            automaticLink: DEFAULT_RESOLUTION_THRESHOLDS.place,
            review: REVIEW_THRESHOLD,
            maximumDistanceMeters: MAXIMUM_MATCH_DISTANCE_METERS,
          },
          counts: result.counts,
          privateLinks: result.privateLinks,
          publicLinks: result.publicLinks,
          manualDecisions: result.manualDecisions,
          reviews: result.reviews,
          excluded: result.excluded,
        })}\n`,
      ),
      writeExclusive(reviewPath, reviewCsv(result.reviews)),
    ]);
    if (decisionPath && decisionBytes) {
      await writeFile(decisionPath, decisionBytes, { flag: 'wx' });
    }
    createPrivateCatalog(catalogPath, result, generatedAt);

    const artifactPaths = [
      catalogPath,
      privateGeojsonPath,
      privateIndexPath,
      composedGeojsonPath,
      composedIndexPath,
      reportPath,
      reviewPath,
      ...(decisionPath ? [decisionPath] : []),
    ];
    const artifacts = await Promise.all(artifactPaths.map(fileDescription));
    const manifest = {
      schemaVersion: 1,
      bundleId: 'private-ioverlander-new-york',
      classification: 'PRIVATE_USER',
      generatedAt,
      processorVersion: PROCESSOR_VERSION,
      entityResolutionVersion: ENTITY_RESOLUTION_VERSION,
      input: {
        baseTiles: inventory,
        decGeojson: {
          file: basename(decGeojsonPath),
          bytes: decBytes.byteLength,
          sha256: sha256(decBytes),
        },
        ...(reviewCsvPath && decisionBytes
          ? {
              manualReview: {
                file: basename(reviewCsvPath),
                bytes: decisionBytes.byteLength,
                sha256: sha256(decisionBytes),
              },
            }
          : {}),
      },
      privacy: {
        includesContributorIdentity: false,
        includesDescriptions: false,
        includesCheckInText: false,
        outputLocationPolicy: 'outside-public-checkout',
      },
      compatibility: {
        geojsonSchema: 'OutdoorCollection',
        indexSchema: 'OutdoorFeatureIndex/v1',
        sqliteSchema: 'catalog/v1+private-resolution',
      },
      counts: result.counts,
      artifacts,
    };
    await writeExclusive(join(temporaryDirectory, 'manifest.json'), `${stableJson(manifest)}\n`);
    await writeExclusive(
      join(temporaryDirectory, 'README.txt'),
      [
        'Private iOverlander + NYS DEC deduplicated catalog',
        '',
        'Keep this directory private. It is intentionally outside the public checkout.',
        'Use new-york-outdoors.composed.geojson and its index as the app-readable merged view.',
        'Use private-ioverlander.geojson and its index for the private overlay alone.',
        'catalog.sqlite is compatible with the catalog record/search layout and adds dedup audit tables.',
        decisionBytes
          ? 'dedup-decisions.csv contains the applied decisions; dedup-review.csv contains only pending matches.'
          : 'dedup-review.csv contains uncertain matches that require a human decision.',
        'Contributor identities, descriptions, and check-in text were not retained.',
        '',
      ].join('\n'),
    );
    await rename(temporaryDirectory, outputDirectory);
    return { outputDirectory, manifest, counts: result.counts };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

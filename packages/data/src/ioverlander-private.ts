import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { IoverlanderCategory } from '@open-outdoor/shared';
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
const PROCESSOR_VERSION = '1.3.0';
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
  readonly communityDescription: string;
  readonly communityCheckIns: readonly {
    readonly occurredAt: string;
    readonly comment: string;
  }[];
  readonly communityCheckInCount: number;
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

interface NpsPark {
  readonly id: string;
  readonly parkCode: string;
  readonly fullName: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly lastIndexedDate?: string;
  readonly url?: string;
}

interface NpsCampground {
  readonly id: string;
  readonly parkCode: string;
  readonly name: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly lastIndexedDate?: string;
  readonly url?: string;
}

interface NpsAlert {
  readonly id: string;
  readonly parkCode: string;
  readonly title: string;
  readonly category?: string;
  readonly lastIndexedDate?: string;
  readonly url?: string;
}

interface NpsSnapshot {
  readonly schemaVersion: 1;
  readonly stateCode: 'NY';
  readonly retrievedAt: string;
  readonly parks: readonly NpsPark[];
  readonly campgrounds: readonly NpsCampground[];
  readonly alerts: readonly NpsAlert[];
  readonly boundaries: readonly DecFeature[];
}

interface FederalSnapshot {
  readonly schemaVersion: 1;
  readonly stateCode: 'NY';
  readonly retrievedAt: string;
  readonly usfs: {
    readonly surfaceOwnership: readonly DecFeature[];
    readonly recreationSites: readonly DecFeature[];
    readonly mvumRoads: readonly DecFeature[];
    readonly mvumTrails: readonly DecFeature[];
  };
  readonly blm: {
    readonly managedLands: readonly DecFeature[];
  };
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
  readonly targetSourceId: string;
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
    readonly matchedToNps: number;
    readonly matchedToUsfs: number;
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
  readonly npsSnapshotPath?: string;
  readonly federalSnapshotPath?: string;
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

const MAXIMUM_COMMUNITY_DESCRIPTION_LENGTH = 4_000;
const MAXIMUM_COMMUNITY_COMMENT_LENGTH = 2_000;
const MAXIMUM_COMMUNITY_CHECK_INS = 100;

function communityCheckIns(value: unknown): {
  readonly items: RawIoverlanderPlace['communityCheckIns'];
  readonly total: number;
} {
  if (!Array.isArray(value)) return { items: [], total: 0 };
  const seen = new Set<string>();
  const items = value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const checkIn = candidate as Readonly<Record<string, unknown>>;
    const occurredAt =
      typeof checkIn.when === 'string'
        ? utc(checkIn.when)
        : typeof checkIn.visited_at === 'string'
          ? utc(checkIn.visited_at)
          : null;
    if (!occurredAt) return [];
    const comment =
      typeof checkIn.comment === 'string'
        ? normalizeText(checkIn.comment).slice(0, MAXIMUM_COMMUNITY_COMMENT_LENGTH)
        : '';
    const identity = `${occurredAt}\u0000${comment}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [{ occurredAt, comment }];
  });
  return {
    total: items.length,
    items: items
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, MAXIMUM_COMMUNITY_CHECK_INS),
  };
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
  const checkIns = communityCheckIns(item.check_ins);
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
    communityDescription:
      typeof item.description === 'string'
        ? normalizeText(item.description).slice(0, MAXIMUM_COMMUNITY_DESCRIPTION_LENGTH)
        : '',
    communityCheckIns: checkIns.items,
    communityCheckInCount: checkIns.total,
  };
}

function privateCategory(rawValue: string): IoverlanderCategory {
  const category = normalizeText(rawValue).toLocaleLowerCase('en-US');
  return (category === 'shortterm_parking' ? 'shorterm_parking' : category) as IoverlanderCategory;
}

function decCategory(rawValue: unknown): IoverlanderCategory {
  const raw =
    typeof rawValue === 'string' ? normalizeText(rawValue).toLocaleUpperCase('en-US') : '';
  if (/CAMP|LEAN-TO/.test(raw)) return 'campsite';
  if (/PARK|PULL-OFF/.test(raw)) return 'shorterm_parking';
  if (/PICNIC|VIEW|VISTA|FIRE TOWER/.test(raw)) return 'tourist_attraction';
  return 'other';
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
  const publicSource = sourceId.startsWith('nps-')
    ? {
        flag: 'official-nps-coordinate',
        policyId: 'nps-us-government-work-v1',
        attribution: 'National Park Service',
      }
    : sourceId.startsWith('usfs-')
      ? {
          flag: 'official-usfs-coordinate',
          policyId: 'usfs-us-government-work-v1',
          attribution: 'USDA Forest Service',
        }
      : sourceId.startsWith('blm-')
        ? {
            flag: 'official-blm-coordinate',
            policyId: 'blm-us-government-work-v1',
            attribution: 'Bureau of Land Management',
          }
        : {
            flag: 'public-dec-reference',
            policyId: 'bundled-nys-dec-public-reference-v1',
            attribution: 'New York State Department of Environmental Conservation',
          };
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
      flags: [publicSource.flag],
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
      policyId: publicSource.policyId,
      distribution: 'public' as const,
      attribution: [publicSource.attribution],
    },
    validation: { state: 'valid' as const, reasonCodes: [] },
    tombstone: false,
    classification: 'public-reference' as const,
    properties: {
      name,
      category,
      rawCategory: category === 'other' ? rawCategory : null,
      entrances: [[longitude, latitude] as Position],
      elevation: null,
    },
  };
  return validateCanonicalRecord({
    ...core,
    contentChecksum: sha256(stableJson(core)),
  }) as PlaceRecord;
}

function parseNpsSnapshot(value: unknown): NpsSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('NPS snapshot must be an object');
  }
  const document = value as Readonly<Record<string, unknown>>;
  if (
    document.schemaVersion !== 1 ||
    document.stateCode !== 'NY' ||
    typeof document.retrievedAt !== 'string' ||
    !utc(document.retrievedAt) ||
    !Array.isArray(document.parks) ||
    !Array.isArray(document.campgrounds) ||
    !Array.isArray(document.alerts) ||
    !Array.isArray(document.boundaries)
  ) {
    throw new Error('NPS snapshot does not match the New York snapshot schema');
  }
  return document as unknown as NpsSnapshot;
}

function parseFederalSnapshot(value: unknown): FederalSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('federal snapshot must be an object');
  }
  const document = value as Readonly<Record<string, unknown>>;
  const usfs = document.usfs as Readonly<Record<string, unknown>> | undefined;
  const blm = document.blm as Readonly<Record<string, unknown>> | undefined;
  if (
    document.schemaVersion !== 1 ||
    document.stateCode !== 'NY' ||
    typeof document.retrievedAt !== 'string' ||
    !utc(document.retrievedAt) ||
    !usfs ||
    !Array.isArray(usfs.surfaceOwnership) ||
    !Array.isArray(usfs.recreationSites) ||
    !Array.isArray(usfs.mvumRoads) ||
    !Array.isArray(usfs.mvumTrails) ||
    !blm ||
    !Array.isArray(blm.managedLands)
  ) {
    throw new Error('federal snapshot does not match the New York snapshot schema');
  }
  const features = [
    ...usfs.surfaceOwnership,
    ...usfs.recreationSites,
    ...usfs.mvumRoads,
    ...usfs.mvumTrails,
    ...blm.managedLands,
  ];
  if (
    features.some(
      (feature) =>
        !feature ||
        typeof feature !== 'object' ||
        Array.isArray(feature) ||
        (feature as DecFeature).type !== 'Feature' ||
        !(feature as DecFeature).geometry,
    )
  ) {
    throw new Error('federal snapshot contains an invalid GeoJSON feature');
  }
  return document as unknown as FederalSnapshot;
}

function npsCoordinate(longitudeValue: string, latitudeValue: string): Position | null {
  const longitude = Number(longitudeValue);
  const latitude = Number(latitudeValue);
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 90
  ) {
    return null;
  }
  return [longitude, latitude];
}

function npsRecord(
  sourceId: string,
  externalId: string,
  name: string,
  category: IoverlanderCategory,
  coordinate: Position,
  sourceUpdatedValue: string | undefined,
  generatedAt: string,
): PlaceRecord {
  const sourceUpdatedAt = sourceUpdatedValue ? utc(sourceUpdatedValue) : null;
  const id = deterministicUuid(`nps:${sourceId}:${externalId}`);
  const core = {
    schemaVersion: '1.0.0' as const,
    recordType: 'place' as const,
    id,
    source: {
      sourceId,
      externalId,
      sourcePartition: 'new-york',
      connectorVersion: PROCESSOR_VERSION,
      parserVersion: PROCESSOR_VERSION,
      normalizerVersion: PROCESSOR_VERSION,
    },
    retrievedAt: generatedAt,
    sourceUpdatedAt,
    geometry: { type: 'Point' as const, coordinates: coordinate },
    geometryQuality: {
      sourceCrs: 'EPSG:4326',
      sourceAxisOrder: 'longitude-latitude',
      coordinatePrecisionMeters: null,
      flags: ['official-nps-coordinate'],
      repair: null,
    },
    fieldProvenance: {
      name: {
        sourceField: sourceId === 'nps-campgrounds-ny' ? 'name' : 'fullName/title',
        sourceValue: name,
        observedAt: sourceUpdatedAt,
        transformation: 'Unicode NFC, whitespace normalized',
      },
      category: {
        sourceField: 'NPS endpoint',
        sourceValue: sourceId,
        observedAt: sourceUpdatedAt,
        transformation: `mapped to iOverlander category ${category}`,
      },
    },
    rights: {
      policyId: 'nps-us-government-work-v1',
      distribution: 'public' as const,
      attribution: ['National Park Service'],
    },
    validation: { state: 'valid' as const, reasonCodes: [] },
    tombstone: false,
    classification: 'public-reference' as const,
    properties: {
      name: normalizeText(name),
      category,
      rawCategory: null,
      entrances: [coordinate],
      elevation: null,
    },
  };
  return validateCanonicalRecord({
    ...core,
    contentChecksum: sha256(stableJson(core)),
  }) as PlaceRecord;
}

function npsRecords(snapshot: NpsSnapshot, generatedAt: string): readonly PlaceRecord[] {
  const parkByCode = new Map(snapshot.parks.map((park) => [park.parkCode, park]));
  const parks = snapshot.parks.flatMap((park) => {
    const coordinate = npsCoordinate(park.longitude, park.latitude);
    return coordinate
      ? [
          npsRecord(
            'nps-parks-ny',
            park.id,
            park.fullName,
            'tourist_attraction',
            coordinate,
            park.lastIndexedDate,
            generatedAt,
          ),
        ]
      : [];
  });
  const campgrounds = snapshot.campgrounds.flatMap((campground) => {
    const coordinate = npsCoordinate(campground.longitude, campground.latitude);
    return coordinate
      ? [
          npsRecord(
            'nps-campgrounds-ny',
            campground.id,
            campground.name,
            'campsite',
            coordinate,
            campground.lastIndexedDate,
            generatedAt,
          ),
        ]
      : [];
  });
  const alerts = snapshot.alerts.flatMap((alert) => {
    const park = parkByCode.get(alert.parkCode);
    const coordinate = park ? npsCoordinate(park.longitude, park.latitude) : null;
    return coordinate
      ? [
          npsRecord(
            'nps-alerts-ny',
            alert.id,
            alert.title,
            'warning',
            coordinate,
            alert.lastIndexedDate,
            generatedAt,
          ),
        ]
      : [];
  });
  return [...parks, ...campgrounds, ...alerts];
}

function usfsCategory(value: unknown): IoverlanderCategory {
  const type = normalizeText(String(value ?? '')).toLocaleUpperCase('en-US');
  if (/CAMPGROUND|CAMP SITE/.test(type)) return 'campsite';
  if (/TRAILHEAD|PARKING/.test(type)) return 'shorterm_parking';
  if (/CABIN|LODGE/.test(type)) return 'hotel';
  if (/WATER/.test(type)) return 'water';
  if (
    /PICNIC|OBSERVATION|VISITOR|INTERPRETIVE|BOAT|SCENIC|LOOKOUT|FISHING|DOCUMENTARY/.test(type)
  ) {
    return 'tourist_attraction';
  }
  return 'other';
}

function sourceUpdatedAt(value: unknown, fallback: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === 'string') {
    const parsed = /^\d+$/.test(value) ? new Date(Number(value)).toISOString() : utc(value);
    if (parsed) return parsed;
  }
  return fallback;
}

function federalRecreationRecords(
  snapshot: FederalSnapshot,
  generatedAt: string,
): readonly PlaceRecord[] {
  return snapshot.usfs.recreationSites.flatMap((feature) => {
    if (
      feature.geometry.type !== 'Point' ||
      !Array.isArray(feature.geometry.coordinates) ||
      typeof feature.geometry.coordinates[0] !== 'number' ||
      typeof feature.geometry.coordinates[1] !== 'number'
    ) {
      return [];
    }
    const coordinate = [
      feature.geometry.coordinates[0],
      feature.geometry.coordinates[1],
    ] as Position;
    const externalId = normalizeText(
      String(feature.properties.site_cn ?? feature.properties.objectid ?? feature.id),
    );
    const name = normalizeText(
      String(
        feature.properties.public_site_name ??
          feature.properties.site_name ??
          'USFS recreation site',
      ),
    );
    const category = usfsCategory(feature.properties.site_type);
    const updatedAt = sourceUpdatedAt(
      feature.properties.edw_last_modify ?? feature.properties.infra_last_update,
      snapshot.retrievedAt,
    );
    const id = deterministicUuid(`usfs:recreation:${externalId}`);
    const core = {
      schemaVersion: '1.0.0' as const,
      recordType: 'place' as const,
      id,
      source: {
        sourceId: 'usfs-recreation-sites-ny',
        externalId,
        sourcePartition: 'new-york',
        connectorVersion: PROCESSOR_VERSION,
        parserVersion: PROCESSOR_VERSION,
        normalizerVersion: PROCESSOR_VERSION,
      },
      retrievedAt: generatedAt,
      sourceUpdatedAt: updatedAt,
      geometry: { type: 'Point' as const, coordinates: coordinate },
      geometryQuality: {
        sourceCrs: 'EPSG:4326',
        sourceAxisOrder: 'longitude-latitude',
        coordinatePrecisionMeters: null,
        flags: ['official-usfs-coordinate'],
        repair: null,
      },
      fieldProvenance: {
        name: {
          sourceField: 'public_site_name/site_name',
          sourceValue: name,
          observedAt: updatedAt,
          transformation: 'Unicode NFC, whitespace normalized',
        },
        category: {
          sourceField: 'site_type',
          sourceValue: String(feature.properties.site_type ?? ''),
          observedAt: updatedAt,
          transformation: `mapped to iOverlander category ${category}`,
        },
      },
      rights: {
        policyId: 'usfs-us-government-work-v1',
        distribution: 'public' as const,
        attribution: ['USDA Forest Service Enterprise Data Warehouse'],
      },
      validation: { state: 'valid' as const, reasonCodes: [] },
      tombstone: false,
      classification: 'public-reference' as const,
      properties: {
        name,
        category,
        rawCategory: category === 'other' ? String(feature.properties.site_type ?? '') : null,
        entrances: [coordinate],
        elevation: null,
      },
    };
    return [
      validateCanonicalRecord({
        ...core,
        contentChecksum: sha256(stableJson(core)),
      }) as PlaceRecord,
    ];
  });
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

function samePrivateBlock(left: PlaceRecord, right: PlaceRecord): boolean {
  return left.properties.category === right.properties.category;
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
    targetSourceId: targetRecord.source.sourceId,
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
  npsValue?: unknown,
  federalValue?: unknown,
): PrivateCatalogProcessingResult {
  if (!utc(generatedAt) || utc(generatedAt) !== generatedAt) {
    throw new Error('generatedAt must be a normalized UTC timestamp');
  }
  const dec = parseDecCollection(decValue);
  const nps = npsValue === undefined ? null : parseNpsSnapshot(npsValue);
  const federal = federalValue === undefined ? null : parseFederalSnapshot(federalValue);
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
  const bundledSourceIds = new Set(decRecords.map((record) => record.source.sourceId));
  const publicRecords = [
    ...decRecords,
    ...(nps && ![...bundledSourceIds].some((sourceId) => sourceId.startsWith('nps-'))
      ? npsRecords(nps, generatedAt)
      : []),
    ...(federal && !bundledSourceIds.has('usfs-recreation-sites-ny')
      ? federalRecreationRecords(federal, generatedAt)
      : []),
  ];
  const publicIndex = spatialIndex(publicRecords);
  const publicLinks: DedupLink[] = [];
  const output: PrivatePlaceSource[] = [];
  for (const source of survivors.sort((left, right) =>
    left.record.id.localeCompare(right.record.id),
  )) {
    const scored = nearby(source.record, publicIndex)
      .filter((record) => record.properties.category === source.record.properties.category)
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
      matchedToDec: publicLinks.filter((link) => link.targetSourceId.startsWith('nys-dec-')).length,
      matchedToNps: publicLinks.filter((link) => link.targetSourceId.startsWith('nps-')).length,
      matchedToUsfs: publicLinks.filter((link) => link.targetSourceId.startsWith('usfs-')).length,
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
  const manualNpsLinks = manualPublicLinks.filter((link) => link.targetSourceId.startsWith('nps-'));
  const manualUsfsLinks = manualPublicLinks.filter((link) =>
    link.targetSourceId.startsWith('usfs-'),
  );
  const manualDecLinks = manualPublicLinks.filter((link) =>
    link.targetSourceId.startsWith('nys-dec-'),
  );
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
      matchedToDec: result.counts.matchedToDec + manualDecLinks.length,
      matchedToNps: result.counts.matchedToNps + manualNpsLinks.length,
      matchedToUsfs: result.counts.matchedToUsfs + manualUsfsLinks.length,
      manualDuplicatesRemoved: appliedDuplicates.length,
      manualNonDuplicates: manualDecisions.length - acceptedDuplicates.length,
      pendingReviewCandidates: pendingReviews.length,
      outputPrivatePlaces: records.length,
    },
  };
}

export interface AppFeature {
  readonly type: 'Feature';
  readonly id: string | number;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly geometry: DecFeature['geometry'];
}

const NEW_YORK_DISPLAY_BOUNDS = [-79.8, 40.4, -71.7, 45.1] as const;

function clipRingToNewYork(value: unknown): readonly Position[] {
  if (!Array.isArray(value)) return [];
  let points = value
    .filter(
      (point): point is [number, number] =>
        Array.isArray(point) &&
        typeof point[0] === 'number' &&
        Number.isFinite(point[0]) &&
        typeof point[1] === 'number' &&
        Number.isFinite(point[1]),
    )
    .map(([longitude, latitude]) => [longitude, latitude] as Position);
  if (
    points.length > 1 &&
    points[0]![0] === points.at(-1)![0] &&
    points[0]![1] === points.at(-1)![1]
  ) {
    points = points.slice(0, -1);
  }
  const edges = [
    {
      inside: ([longitude]: Position) => longitude >= NEW_YORK_DISPLAY_BOUNDS[0],
      intersect: ([ax, ay]: Position, [bx, by]: Position): Position => [
        NEW_YORK_DISPLAY_BOUNDS[0],
        ay + ((by - ay) * (NEW_YORK_DISPLAY_BOUNDS[0] - ax)) / (bx - ax),
      ],
    },
    {
      inside: ([longitude]: Position) => longitude <= NEW_YORK_DISPLAY_BOUNDS[2],
      intersect: ([ax, ay]: Position, [bx, by]: Position): Position => [
        NEW_YORK_DISPLAY_BOUNDS[2],
        ay + ((by - ay) * (NEW_YORK_DISPLAY_BOUNDS[2] - ax)) / (bx - ax),
      ],
    },
    {
      inside: ([, latitude]: Position) => latitude >= NEW_YORK_DISPLAY_BOUNDS[1],
      intersect: ([ax, ay]: Position, [bx, by]: Position): Position => [
        ax + ((bx - ax) * (NEW_YORK_DISPLAY_BOUNDS[1] - ay)) / (by - ay),
        NEW_YORK_DISPLAY_BOUNDS[1],
      ],
    },
    {
      inside: ([, latitude]: Position) => latitude <= NEW_YORK_DISPLAY_BOUNDS[3],
      intersect: ([ax, ay]: Position, [bx, by]: Position): Position => [
        ax + ((bx - ax) * (NEW_YORK_DISPLAY_BOUNDS[3] - ay)) / (by - ay),
        NEW_YORK_DISPLAY_BOUNDS[3],
      ],
    },
  ];
  for (const edge of edges) {
    const input = points;
    points = [];
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index]!;
      const previous = input[(index + input.length - 1) % input.length]!;
      const currentInside = edge.inside(current);
      const previousInside = edge.inside(previous);
      if (currentInside) {
        if (!previousInside) points.push(edge.intersect(previous, current));
        points.push(current);
      } else if (previousInside) {
        points.push(edge.intersect(previous, current));
      }
    }
  }
  if (points.length < 3) return [];
  return [...points, points[0]!];
}

function clipNpsBoundaryGeometry(geometry: DecFeature['geometry']): DecFeature['geometry'] | null {
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)
        ? geometry.coordinates
        : [];
  const clipped = polygons.flatMap((polygon) => {
    if (!Array.isArray(polygon)) return [];
    const exterior = clipRingToNewYork(polygon[0]);
    if (exterior.length < 4) return [];
    const holes = polygon
      .slice(1)
      .map(clipRingToNewYork)
      .filter((ring) => ring.length >= 4);
    return [[exterior, ...holes]];
  });
  if (clipped.length === 0) return null;
  return clipped.length === 1
    ? { type: 'Polygon', coordinates: clipped[0] }
    : { type: 'MultiPolygon', coordinates: clipped };
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
      category: source.record.properties.category,
      publicUse: `${source.raw.open || 'unknown'}; private reference; verify current access`,
      sourceUpdated: source.record.sourceUpdatedAt ?? '',
      origin: 'private-catalog',
      communityDescription: source.raw.communityDescription,
      communityCheckIns: source.raw.communityCheckIns,
      communityCheckInCount: source.raw.communityCheckInCount,
    },
    geometry: {
      type: 'Point',
      coordinates: source.record.geometry!.coordinates,
    },
  };
}

export function npsNewYorkAppFeatures(value: unknown, generatedAt?: string): readonly AppFeature[] {
  const snapshot = parseNpsSnapshot(value);
  const retrievalTime = generatedAt ?? snapshot.retrievedAt;
  if (!utc(retrievalTime) || utc(retrievalTime) !== retrievalTime) {
    throw new Error('generatedAt must be a normalized UTC timestamp');
  }
  const records = npsRecords(snapshot, retrievalTime).filter((record) => {
    if (record.geometry?.type !== 'Point') return false;
    const [longitude, latitude] = record.geometry.coordinates;
    return (
      longitude >= NEW_YORK_DISPLAY_BOUNDS[0] &&
      longitude <= NEW_YORK_DISPLAY_BOUNDS[2] &&
      latitude >= NEW_YORK_DISPLAY_BOUNDS[1] &&
      latitude <= NEW_YORK_DISPLAY_BOUNDS[3]
    );
  });
  const urls = new Map<string, string>();
  snapshot.parks.forEach((item) => item.url && urls.set(`nps-parks-ny:${item.id}`, item.url));
  snapshot.campgrounds.forEach(
    (item) => item.url && urls.set(`nps-campgrounds-ny:${item.id}`, item.url),
  );
  snapshot.alerts.forEach((item) => item.url && urls.set(`nps-alerts-ny:${item.id}`, item.url));
  const points = records.map((record): AppFeature => {
    const sourceId = record.source.sourceId;
    const isAlert = sourceId === 'nps-alerts-ny';
    const id = `nps:${record.source.externalId}`;
    return {
      type: 'Feature',
      id,
      properties: {
        id,
        kind: 'poi',
        name: record.properties.name,
        sourceId,
        unit: 'National Park Service',
        category: record.properties.category,
        publicUse: isAlert
          ? 'NPS alert snapshot; verify current status at nps.gov'
          : 'Official NPS public visitor information',
        sourceUpdated: record.sourceUpdatedAt ?? snapshot.retrievedAt,
        sourceUrl: urls.get(`${sourceId}:${record.source.externalId}`) ?? 'https://www.nps.gov/',
        origin: 'public-catalog',
      },
      geometry: {
        type: 'Point',
        coordinates: record.geometry!.coordinates,
      },
    };
  });
  const boundaries = snapshot.boundaries
    .filter(
      (feature) =>
        feature?.type === 'Feature' &&
        (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon'),
    )
    .flatMap((feature, index): readonly AppFeature[] => {
      const geometry = clipNpsBoundaryGeometry(feature.geometry);
      if (!geometry) return [];
      const parkCode = normalizeText(String(feature.properties.parkCode ?? 'unknown'));
      const name = normalizeText(
        String(feature.properties.fullName ?? feature.properties.name ?? 'NPS park'),
      );
      const id = `nps:boundary:${parkCode}:${index + 1}`;
      return [
        {
          type: 'Feature',
          id,
          properties: {
            id,
            kind: 'land',
            name,
            sourceId: 'nps-parks-ny',
            unit: name,
            category: 'NATIONAL PARK SERVICE',
            publicUse: 'Official NPS park boundary; verify current access at nps.gov',
            sourceUpdated: snapshot.retrievedAt,
            origin: 'public-catalog',
          },
          geometry,
        },
      ];
    });
  return [...boundaries, ...points];
}

export function federalNewYorkAppFeatures(
  value: unknown,
  generatedAt?: string,
): readonly AppFeature[] {
  const snapshot = parseFederalSnapshot(value);
  const retrievalTime = generatedAt ?? snapshot.retrievedAt;
  if (!utc(retrievalTime) || utc(retrievalTime) !== retrievalTime) {
    throw new Error('generatedAt must be a normalized UTC timestamp');
  }
  const recreationById = new Map(
    snapshot.usfs.recreationSites.map((feature) => [
      normalizeText(
        String(feature.properties.site_cn ?? feature.properties.objectid ?? feature.id),
      ),
      feature,
    ]),
  );
  const recreation = federalRecreationRecords(snapshot, retrievalTime).map((record): AppFeature => {
    const feature = recreationById.get(record.source.externalId);
    const id = `usfs:recreation:${record.source.externalId}`;
    const status = normalizeText(
      String(feature?.properties.seasonal_operational_status ?? 'status not supplied'),
    );
    return {
      type: 'Feature',
      id,
      properties: {
        id,
        kind: 'poi',
        name: record.properties.name,
        sourceId: record.source.sourceId,
        unit: 'Finger Lakes National Forest',
        category: record.properties.category,
        publicUse: `Official USFS recreation site; ${status}; verify current access`,
        sourceUpdated: record.sourceUpdatedAt ?? snapshot.retrievedAt,
        sourceUrl:
          normalizeText(String(feature?.properties.usda_portal_url ?? '')) ||
          'https://www.fs.usda.gov/r09/gmfl/',
        origin: 'public-catalog',
      },
      geometry: { type: 'Point', coordinates: record.geometry!.coordinates },
    };
  });
  const mapped = (
    features: readonly DecFeature[],
    sourceId: string,
    kind: 'land' | 'road' | 'trail',
    fallbackName: string,
    category: string,
    publicUse: string,
    sourceUrl: string,
  ): readonly AppFeature[] =>
    features.map((feature): AppFeature => {
      const properties = feature.properties;
      const name = normalizeText(
        String(
          properties.name ??
            properties.ADMIN_UNIT_NAME ??
            properties.nfslandunitname ??
            fallbackName,
        ),
      );
      return {
        type: 'Feature',
        id: String(feature.id),
        properties: {
          id: String(feature.id),
          kind,
          name,
          sourceId,
          unit: normalizeText(
            String(properties.nfslandunitname ?? properties.ADMIN_UNIT_NAME ?? name),
          ),
          category,
          publicUse,
          sourceUpdated: sourceUpdatedAt(
            properties.edw_last_modify ?? properties.actiondate,
            snapshot.retrievedAt,
          ),
          sourceUrl,
          origin: 'public-catalog',
        },
        geometry: feature.geometry,
      };
    });
  return [
    ...mapped(
      snapshot.usfs.surfaceOwnership,
      'usfs-surface-ownership-ny',
      'land',
      'Finger Lakes National Forest',
      'NATIONAL FOREST',
      'Official USFS surface-ownership reference; verify current boundaries and access',
      'https://data.fs.usda.gov/geodata/edw/datasets.php',
    ),
    ...mapped(
      snapshot.usfs.mvumRoads,
      'usfs-mvum-roads-ny',
      'road',
      'USFS MVUM road',
      'MVUM ROAD',
      'Official MVUM designation; verify current season, conditions, and closures',
      'https://www.fs.usda.gov/visit/maps',
    ),
    ...mapped(
      snapshot.usfs.mvumTrails,
      'usfs-mvum-trails-ny',
      'trail',
      'USFS MVUM trail',
      'MVUM TRAIL',
      'Official MVUM designation; verify current season, conditions, and closures',
      'https://www.fs.usda.gov/visit/maps',
    ),
    ...recreation,
    ...mapped(
      snapshot.blm.managedLands,
      'blm-managed-lands-ny',
      'land',
      'BLM managed land',
      'BLM MANAGED LAND',
      'Official BLM surface-management reference; verify current boundaries and access',
      'https://www.blm.gov/services/geospatial/GISData',
    ),
  ];
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

export function outdoorAppCollection(
  features: readonly AppFeature[],
): Readonly<Record<string, unknown>> {
  return { type: 'FeatureCollection', features };
}

export function outdoorAppIndex(
  features: readonly AppFeature[],
): Readonly<Record<string, unknown>> {
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
    'target_source_id',
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
        item.targetSourceId,
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
    ...(options.npsSnapshotPath ? { npsSnapshotPath: options.npsSnapshotPath } : {}),
    ...(options.federalSnapshotPath ? { federalSnapshotPath: options.federalSnapshotPath } : {}),
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
  const npsSnapshotPath = options.npsSnapshotPath ? await realpath(options.npsSnapshotPath) : null;
  const federalSnapshotPath = options.federalSnapshotPath
    ? await realpath(options.federalSnapshotPath)
    : null;
  const reviewCsvPath = options.reviewCsvPath ? await realpath(options.reviewCsvPath) : null;
  const outputDirectory = resolve(options.outputDirectory);
  const privateDataRoot = resolve(publicCheckout, 'PrivateData');
  const outputInCheckout =
    outputDirectory === publicCheckout || pathIsInside(publicCheckout, outputDirectory);
  const outputInPrivateData =
    outputDirectory === privateDataRoot || pathIsInside(privateDataRoot, outputDirectory);
  if (outputInCheckout && !outputInPrivateData) {
    throw new Error('private output must be outside the public checkout or under PrivateData');
  }
  if (outputInPrivateData) {
    const ignoreRules = await readFile(join(publicCheckout, '.gitignore'), 'utf8');
    if (!ignoreRules.split(/\r?\n/).some((line) => line.trim() === '/PrivateData/')) {
      throw new Error('PrivateData output requires an exact /PrivateData/ ignore rule');
    }
  }
  const outputLocationPolicy = outputInPrivateData
    ? 'gitignored-private-root'
    : 'outside-public-checkout';
  if (existsSync(outputDirectory)) throw new Error('outputDirectory already exists');
  await mkdir(dirname(outputDirectory), { recursive: true });
  const temporaryDirectory = join(
    dirname(outputDirectory),
    `.${basename(outputDirectory)}.tmp-${sha256(generatedAt).slice(0, 12)}`,
  );
  if (existsSync(temporaryDirectory)) throw new Error('temporary output directory already exists');
  await mkdir(temporaryDirectory);
  try {
    const [{ tiles, inventory }, decBytes, npsBytes, federalBytes, decisionBytes] =
      await Promise.all([
        loadTileInputs(inputDirectory),
        readFile(decGeojsonPath),
        npsSnapshotPath ? readFile(npsSnapshotPath) : Promise.resolve(null),
        federalSnapshotPath ? readFile(federalSnapshotPath) : Promise.resolve(null),
        reviewCsvPath ? readFile(reviewCsvPath) : Promise.resolve(null),
      ]);
    const dec = parseDecCollection(JSON.parse(decBytes.toString('utf8')));
    const nps = npsBytes ? parseNpsSnapshot(JSON.parse(npsBytes.toString('utf8'))) : null;
    const federal = federalBytes
      ? parseFederalSnapshot(JSON.parse(federalBytes.toString('utf8')))
      : null;
    const automaticResult = processIoverlanderPrivateData(
      tiles,
      dec,
      generatedAt,
      nps ?? undefined,
      federal ?? undefined,
    );
    const result = decisionBytes
      ? applyManualReviewDecisions(
          automaticResult,
          manualReviewDecisionsFromCsv(decisionBytes.toString('utf8')),
        )
      : automaticResult;
    const privateFeatures = result.records.map(privateAppFeature);
    const publicFeatures = dec.features as readonly AppFeature[];
    const publicSourceIds = new Set(
      publicFeatures.map((feature) => normalizeText(String(feature.properties.sourceId ?? ''))),
    );
    const npsFeatures =
      nps && ![...publicSourceIds].some((sourceId) => sourceId.startsWith('nps-'))
        ? npsNewYorkAppFeatures(nps, generatedAt)
        : [];
    const federalFeatures =
      federal &&
      ![...publicSourceIds].some(
        (sourceId) => sourceId.startsWith('usfs-') || sourceId.startsWith('blm-'),
      )
        ? federalNewYorkAppFeatures(federal, generatedAt)
        : [];
    const composedFeatures = [
      ...publicFeatures,
      ...npsFeatures,
      ...federalFeatures,
      ...privateFeatures,
    ];

    const privateGeojsonPath = join(temporaryDirectory, 'private-ioverlander.geojson');
    const privateIndexPath = join(temporaryDirectory, 'private-ioverlander.index.json');
    const composedGeojsonPath = join(temporaryDirectory, 'new-york-outdoors.composed.geojson');
    const composedIndexPath = join(temporaryDirectory, 'new-york-outdoors.composed.index.json');
    const catalogPath = join(temporaryDirectory, 'catalog.sqlite');
    const reportPath = join(temporaryDirectory, 'dedup-report.json');
    const reviewPath = join(temporaryDirectory, 'dedup-review.csv');
    const decisionPath = decisionBytes ? join(temporaryDirectory, 'dedup-decisions.csv') : null;
    await Promise.all([
      writeExclusive(privateGeojsonPath, `${stableJson(outdoorAppCollection(privateFeatures))}\n`),
      writeExclusive(privateIndexPath, `${stableJson(outdoorAppIndex(privateFeatures))}\n`),
      writeExclusive(
        composedGeojsonPath,
        `${stableJson(outdoorAppCollection(composedFeatures))}\n`,
      ),
      writeExclusive(composedIndexPath, `${stableJson(outdoorAppIndex(composedFeatures))}\n`),
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
        ...(npsSnapshotPath && npsBytes && nps
          ? {
              npsSnapshot: {
                file: basename(npsSnapshotPath),
                bytes: npsBytes.byteLength,
                sha256: sha256(npsBytes),
                parks: nps.parks.length,
                campgrounds: nps.campgrounds.length,
                alerts: nps.alerts.length,
                boundaries: nps.boundaries.length,
              },
            }
          : {}),
        ...(federalSnapshotPath && federalBytes && federal
          ? {
              federalSnapshot: {
                file: basename(federalSnapshotPath),
                bytes: federalBytes.byteLength,
                sha256: sha256(federalBytes),
                usfsSurfaceOwnership: federal.usfs.surfaceOwnership.length,
                usfsRecreationSites: federal.usfs.recreationSites.length,
                usfsMvumRoads: federal.usfs.mvumRoads.length,
                usfsMvumTrails: federal.usfs.mvumTrails.length,
                blmManagedLands: federal.blm.managedLands.length,
              },
            }
          : {}),
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
        includesDescriptions: true,
        includesCheckInText: true,
        outputLocationPolicy,
      },
      compatibility: {
        geojsonSchema: 'OutdoorCollection',
        indexSchema: 'OutdoorFeatureIndex/v1',
        sqliteSchema: 'catalog/v1+private-resolution',
        categorySystem: 'ioverlander',
      },
      counts: result.counts,
      artifacts,
    };
    await writeExclusive(join(temporaryDirectory, 'manifest.json'), `${stableJson(manifest)}\n`);
    await writeExclusive(
      join(temporaryDirectory, 'README.txt'),
      [
        [
          'Private iOverlander',
          'NYS DEC',
          ...(nps ? ['National Park Service'] : []),
          ...(federal ? ['USDA Forest Service + Bureau of Land Management'] : []),
        ].join(' + ') + ' deduplicated catalog',
        '',
        outputInPrivateData
          ? 'Keep this directory private. It is under the Git-ignored PrivateData root.'
          : 'Keep this directory private. It is intentionally outside the public checkout.',
        `Use new-york-outdoors.composed.geojson and its index as the app-readable ${[
          'DEC',
          ...(nps ? ['NPS'] : []),
          ...(federal ? ['USFS', 'BLM'] : []),
          'private iOverlander',
        ].join(' + ')} view.`,
        'Use private-ioverlander.geojson and its index for the private overlay alone.',
        'catalog.sqlite is compatible with the catalog record/search layout and adds dedup audit tables.',
        decisionBytes
          ? 'dedup-decisions.csv contains the applied decisions; dedup-review.csv contains only pending matches.'
          : 'dedup-review.csv contains uncertain matches that require a human decision.',
        'Community descriptions and check-in dates/comments are retained only in this private bundle; contributor identifiers are not retained.',
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

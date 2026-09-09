export type OfflineRecordType =
  | 'land-unit'
  | 'place'
  | 'trail'
  | 'condition'
  | 'restriction'
  | 'observation'
  | 'review'
  | 'check-in'
  | 'media-asset';
export type OfflinePosition = readonly [longitude: number, latitude: number];
export type OfflineGeometry =
  | { readonly type: 'Point'; readonly coordinates: OfflinePosition }
  | { readonly type: 'LineString'; readonly coordinates: readonly OfflinePosition[] }
  | {
      readonly type: 'MultiLineString';
      readonly coordinates: readonly (readonly OfflinePosition[])[];
    }
  | { readonly type: 'Polygon'; readonly coordinates: readonly (readonly OfflinePosition[])[] }
  | {
      readonly type: 'MultiPolygon';
      readonly coordinates: readonly (readonly (readonly OfflinePosition[])[])[];
    };
export interface OfflineFieldProvenance {
  readonly sourceField: string;
  readonly sourceValue: string | number | boolean | null;
  readonly observedAt: string | null;
  readonly transformation: string | null;
}
interface OfflineRecordBase<TType extends OfflineRecordType, TProperties> {
  readonly id: string;
  readonly recordType: TType;
  readonly source: { readonly sourceId: string; readonly externalId: string };
  readonly retrievedAt: string;
  readonly sourceUpdatedAt: string | null;
  readonly geometry: OfflineGeometry | null;
  readonly fieldProvenance: Readonly<Record<string, OfflineFieldProvenance>>;
  readonly rights: { readonly attribution: readonly string[] };
  readonly classification: 'public-reference' | 'private-reference' | 'private-user';
  readonly properties: TProperties;
}
export type OfflineCanonicalRecord =
  | OfflineRecordBase<
      'land-unit',
      {
        readonly name: string;
        readonly ownership: string;
        readonly manager: string;
        readonly areaSquareMeters: number;
        readonly baseRule: string;
      }
    >
  | OfflineRecordBase<
      'trail',
      {
        readonly name: string;
        readonly trailKind: string;
        readonly rawTrailKind: string | null;
        readonly lengthMeters: number;
        readonly fingerprint: string;
      }
    >
  | OfflineRecordBase<
      'place',
      {
        readonly name: string;
        readonly category: string;
        readonly rawCategory: string | null;
      }
    >
  | OfflineRecordBase<
      'condition' | 'restriction',
      {
        readonly name: string;
        readonly interval: {
          readonly start: string | null;
          readonly end: string | null;
          readonly quality: string;
        };
        readonly scope: string;
        readonly authority: string;
        readonly relatedRecordId: string | null;
      }
    >
  | OfflineRecordBase<
      'media-asset',
      {
        readonly subjectId: string;
        readonly mediaType: string;
        readonly contentUrl: string | null;
      }
    >
  | OfflineRecordBase<'observation' | 'review' | 'check-in', Readonly<Record<string, unknown>>>;
export interface OfflineCampingEvaluation {
  readonly status:
    | 'generally-eligible'
    | 'verified-allowed'
    | 'restricted'
    | 'permit-required'
    | 'prohibited'
    | 'temporary-closure'
    | 'unknown';
}

export interface OfflineBundleCoverage {
  readonly bundleId: string;
  readonly contentVersion: number;
  readonly origin: 'public-catalog' | 'private-catalog';
  readonly regionId: string;
  readonly bounds: readonly [west: number, south: number, east: number, north: number];
  readonly generatedAt: string;
  readonly dataAsOf: string;
  readonly entityTypes: readonly OfflineRecordType[];
  readonly offlineFeatures: readonly string[];
  readonly attribution: readonly string[];
  readonly sourceFreshness: Readonly<
    Record<string, { readonly dataAsOf: string | null; readonly staleAfterSeconds: number | null }>
  >;
}

export interface OfflineSearchQuery {
  readonly text?: string;
  readonly near?: { readonly coordinate: OfflinePosition; readonly maximumDistanceMeters: number };
  readonly bounds?: readonly [west: number, south: number, east: number, north: number];
  readonly recordTypes?: readonly Extract<OfflineRecordType, 'land-unit' | 'trail' | 'place'>[];
  readonly sourceIds?: readonly string[];
  readonly ownership?: readonly string[];
  readonly categories?: readonly string[];
  readonly campingStatuses?: readonly OfflineCampingEvaluation['status'][];
  readonly freshness?: 'fresh' | 'stale' | 'unknown';
  readonly limit?: number;
}

export interface OfflineSearchResult {
  readonly id: string;
  readonly recordType: Extract<OfflineRecordType, 'land-unit' | 'trail' | 'place'>;
  readonly name: string;
  readonly subtitle: string;
  readonly coordinate: OfflinePosition;
  readonly distanceMeters: number | null;
  readonly sourceId: string;
  readonly origin: OfflineBundleCoverage['origin'];
  readonly freshness: 'fresh' | 'stale' | 'unknown';
  readonly campingStatus: OfflineCampingEvaluation['status'] | null;
}

export interface OfflineFeatureDetails {
  readonly id: string;
  readonly recordType: OfflineSearchResult['recordType'];
  readonly name: string;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly geometry: OfflineGeometry;
  readonly bundle: Pick<
    OfflineBundleCoverage,
    'bundleId' | 'contentVersion' | 'origin' | 'regionId' | 'generatedAt' | 'dataAsOf'
  >;
  readonly source: {
    readonly sourceId: string;
    readonly externalId: string;
    readonly retrievedAt: string;
    readonly sourceUpdatedAt: string | null;
    readonly attribution: readonly string[];
  };
  readonly provenance: readonly {
    readonly field: string;
    readonly evidence: OfflineFieldProvenance;
  }[];
  readonly freshness: {
    readonly status: 'fresh' | 'stale' | 'unknown';
    readonly dataAsOf: string | null;
    readonly staleAfterSeconds: number | null;
    readonly liveVerificationAvailable: false;
  };
  readonly restrictions: readonly {
    readonly id: string;
    readonly kind: 'condition' | 'restriction';
    readonly name: string;
    readonly authority: string;
    readonly scope: string;
    readonly effectiveStart: string | null;
    readonly effectiveEnd: string | null;
  }[];
  readonly media: readonly {
    readonly id: string;
    readonly mediaType: string;
    readonly availability: 'included-offline' | 'unavailable-offline';
    readonly contentUrl: string | null;
  }[];
  readonly camping: OfflineCampingEvaluation | null;
  readonly unavailableOffline: readonly string[];
}

type ExploreRecord = Extract<
  OfflineCanonicalRecord,
  { recordType: 'land-unit' | 'trail' | 'place' }
> & { readonly geometry: OfflineGeometry };
type TemporalRecord = Extract<OfflineCanonicalRecord, { recordType: 'condition' | 'restriction' }>;
type MediaRecord = Extract<OfflineCanonicalRecord, { recordType: 'media-asset' }>;

function validUtc(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function positions(geometry: OfflineGeometry): readonly OfflinePosition[] {
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates];
    case 'LineString':
      return geometry.coordinates;
    case 'MultiLineString':
    case 'Polygon':
      return geometry.coordinates.flat();
    case 'MultiPolygon':
      return geometry.coordinates.flat(2);
  }
}

function center(geometry: OfflineGeometry): OfflinePosition {
  const points = positions(geometry);
  const total = points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]] as const, [
    0, 0,
  ] as const);
  return [total[0] / points.length, total[1] / points.length];
}

function haversineMeters(left: OfflinePosition, right: OfflinePosition): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (right[1] - left[1]) * radians;
  const longitudeDelta = (right[0] - left[0]) * radians;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(left[1] * radians) * Math.cos(right[1] * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInRing(point: OfflinePosition, ring: readonly OfflinePosition[]): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const currentPoint = ring[current];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) continue;
    const crossesLatitude = currentPoint[1] > point[1] !== previousPoint[1] > point[1];
    const longitudeAtLatitude =
      ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
        (previousPoint[1] - currentPoint[1]) +
      currentPoint[0];
    if (crossesLatitude && point[0] < longitudeAtLatitude) inside = !inside;
  }
  return inside;
}

function lineDistanceMeters(line: readonly OfflinePosition[], coordinate: OfflinePosition): number {
  if (line.length === 0) return Number.POSITIVE_INFINITY;
  if (line.length === 1) return haversineMeters(line[0] ?? coordinate, coordinate);
  const radians = Math.PI / 180;
  const metersPerRadian = 6_371_008.8;
  const cosine = Math.cos(coordinate[1] * radians);
  const projected = (point: OfflinePosition): readonly [number, number] => [
    (point[0] - coordinate[0]) * radians * metersPerRadian * cosine,
    (point[1] - coordinate[1]) * radians * metersPerRadian,
  ];
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < line.length; index += 1) {
    const start = line[index - 1];
    const end = line[index];
    if (!start || !end) continue;
    const [startX, startY] = projected(start);
    const [endX, endY] = projected(end);
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const lengthSquared = deltaX ** 2 + deltaY ** 2;
    const proportion =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / lengthSquared));
    minimum = Math.min(
      minimum,
      Math.hypot(startX + proportion * deltaX, startY + proportion * deltaY),
    );
  }
  return minimum;
}

function polygonDistanceMeters(
  polygon: readonly (readonly OfflinePosition[])[],
  coordinate: OfflinePosition,
): number {
  const exterior = polygon[0];
  if (
    exterior &&
    pointInRing(coordinate, exterior) &&
    !polygon.slice(1).some((hole) => pointInRing(coordinate, hole))
  ) {
    return 0;
  }
  return Math.min(...polygon.map((ring) => lineDistanceMeters(ring, coordinate)));
}

function geometryDistanceMeters(geometry: OfflineGeometry, coordinate: OfflinePosition): number {
  switch (geometry.type) {
    case 'Point':
      return haversineMeters(geometry.coordinates, coordinate);
    case 'LineString':
      return lineDistanceMeters(geometry.coordinates, coordinate);
    case 'MultiLineString':
      return Math.min(...geometry.coordinates.map((line) => lineDistanceMeters(line, coordinate)));
    case 'Polygon':
      return polygonDistanceMeters(geometry.coordinates, coordinate);
    case 'MultiPolygon':
      return Math.min(
        ...geometry.coordinates.map((polygon) => polygonDistanceMeters(polygon, coordinate)),
      );
  }
}

function intersectsBounds(
  geometry: OfflineGeometry,
  bounds: readonly [number, number, number, number],
): boolean {
  const points = positions(geometry);
  const west = Math.min(...points.map(([longitude]) => longitude));
  const east = Math.max(...points.map(([longitude]) => longitude));
  const south = Math.min(...points.map(([, latitude]) => latitude));
  const north = Math.max(...points.map(([, latitude]) => latitude));
  return west <= bounds[2] && east >= bounds[0] && south <= bounds[3] && north >= bounds[1];
}

function name(record: ExploreRecord): string {
  return record.properties.name;
}

function subtitle(record: ExploreRecord): string {
  switch (record.recordType) {
    case 'land-unit':
      return `${record.properties.ownership} · ${record.properties.manager}`;
    case 'trail':
      return `${record.properties.trailKind} · ${Math.round(record.properties.lengthMeters)} m`;
    case 'place':
      return record.properties.category;
  }
}

function searchableText(record: ExploreRecord): string {
  switch (record.recordType) {
    case 'land-unit':
      return normalizeText(
        [
          record.properties.name,
          record.properties.ownership,
          record.properties.manager,
          record.properties.baseRule,
        ].join(' '),
      );
    case 'trail':
      return normalizeText(
        [
          record.properties.name,
          record.properties.trailKind,
          record.properties.rawTrailKind ?? '',
        ].join(' '),
      );
    case 'place':
      return normalizeText(
        [
          record.properties.name,
          record.properties.category,
          record.properties.rawCategory ?? '',
        ].join(' '),
      );
  }
}

function intervalApplies(
  interval: {
    readonly start: string | null;
    readonly end: string | null;
    readonly quality: string;
  },
  now: number,
): boolean {
  return (
    interval.quality === 'known' &&
    (interval.start === null || Date.parse(interval.start) <= now) &&
    (interval.end === null || now < Date.parse(interval.end))
  );
}

export class OfflineExploreIndex {
  readonly capabilities = {
    networkRequired: false,
    textSearch: true,
    spatialSearch: true,
    filters: true,
    details: true,
    liveVerification: false,
    turnByTurn: false,
    rerouting: false,
  } as const;

  private readonly exploreRecords: readonly ExploreRecord[];
  private readonly byId: ReadonlyMap<string, OfflineCanonicalRecord>;
  private readonly now: number;

  constructor(
    records: readonly OfflineCanonicalRecord[],
    readonly coverage: OfflineBundleCoverage,
    evaluatedAt: string,
    private readonly campingByLandId: Readonly<Record<string, OfflineCampingEvaluation>> = {},
  ) {
    this.now = Date.parse(evaluatedAt);
    if (
      !validUtc(evaluatedAt) ||
      !validUtc(coverage.generatedAt) ||
      !validUtc(coverage.dataAsOf) ||
      coverage.bundleId.trim() === '' ||
      !Number.isSafeInteger(coverage.contentVersion) ||
      coverage.contentVersion < 1
    ) {
      throw new Error('offline bundle coverage metadata is invalid');
    }
    const ids = new Set<string>();
    for (const record of records) {
      if (ids.has(record.id)) throw new Error(`duplicate offline record id: ${record.id}`);
      ids.add(record.id);
      if (record.classification === 'private-user') {
        throw new Error('private user records cannot be loaded into a read-only reference index');
      }
    }
    this.byId = new Map(records.map((record) => [record.id, record]));
    this.exploreRecords = records.filter(
      (record): record is ExploreRecord =>
        record.geometry !== null &&
        (record.recordType === 'land-unit' ||
          record.recordType === 'trail' ||
          record.recordType === 'place'),
    );
  }

  search(query: OfflineSearchQuery = {}): readonly OfflineSearchResult[] {
    const normalized = normalizeText(query.text ?? '');
    const tokens = normalized === '' ? [] : normalized.split(' ');
    const limit = query.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError('offline search limit must be between 1 and 500');
    }
    if (
      query.near &&
      (!Number.isFinite(query.near.maximumDistanceMeters) || query.near.maximumDistanceMeters < 0)
    ) {
      throw new RangeError('offline spatial radius must be non-negative');
    }

    return this.exploreRecords
      .flatMap((record) => {
        if (query.recordTypes && !query.recordTypes.includes(record.recordType)) return [];
        if (query.sourceIds && !query.sourceIds.includes(record.source.sourceId)) return [];
        if (
          query.ownership &&
          (record.recordType !== 'land-unit' ||
            !query.ownership.includes(record.properties.ownership))
        ) {
          return [];
        }
        if (
          query.categories &&
          (record.recordType !== 'place' || !query.categories.includes(record.properties.category))
        ) {
          return [];
        }
        const camping =
          record.recordType === 'land-unit' ? (this.campingByLandId[record.id] ?? null) : null;
        if (
          query.campingStatuses &&
          (camping === null || !query.campingStatuses.includes(camping.status))
        ) {
          return [];
        }
        const freshness = this.freshness(record.source.sourceId);
        if (query.freshness && freshness.status !== query.freshness) return [];
        if (query.bounds && !intersectsBounds(record.geometry, query.bounds)) return [];
        const text = searchableText(record);
        if (!tokens.every((token) => text.includes(token))) return [];
        const distanceMeters = query.near
          ? geometryDistanceMeters(record.geometry, query.near.coordinate)
          : null;
        if (
          query.near &&
          (distanceMeters === null || distanceMeters > query.near.maximumDistanceMeters)
        ) {
          return [];
        }
        const result: OfflineSearchResult & { readonly relevance: number } = {
          id: record.id,
          recordType: record.recordType,
          name: name(record),
          subtitle: subtitle(record),
          coordinate: center(record.geometry),
          distanceMeters,
          sourceId: record.source.sourceId,
          origin: this.coverage.origin,
          freshness: freshness.status,
          campingStatus: camping?.status ?? null,
          relevance:
            normalized === '' ? 0 : normalizeText(name(record)).startsWith(normalized) ? 2 : 1,
        };
        return [result];
      })
      .sort(
        (left, right) =>
          right.relevance - left.relevance ||
          (left.distanceMeters ?? 0) - (right.distanceMeters ?? 0) ||
          left.name.localeCompare(right.name) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, limit)
      .map(({ relevance: _relevance, ...result }) => result);
  }

  details(id: string): OfflineFeatureDetails | null {
    const record = this.byId.get(id);
    if (
      !record ||
      record.geometry === null ||
      (record.recordType !== 'land-unit' &&
        record.recordType !== 'trail' &&
        record.recordType !== 'place')
    ) {
      return null;
    }
    const freshness = this.freshness(record.source.sourceId);
    const restrictions = [...this.byId.values()]
      .filter(
        (candidate): candidate is TemporalRecord =>
          (candidate.recordType === 'condition' || candidate.recordType === 'restriction') &&
          candidate.properties.relatedRecordId === record.id &&
          intervalApplies(candidate.properties.interval, this.now),
      )
      .map((candidate) => ({
        id: candidate.id,
        kind: candidate.recordType,
        name: candidate.properties.name,
        authority: candidate.properties.authority,
        scope: candidate.properties.scope,
        effectiveStart: candidate.properties.interval.start,
        effectiveEnd: candidate.properties.interval.end,
      }))
      .sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      );
    const media = [...this.byId.values()]
      .filter(
        (candidate): candidate is MediaRecord =>
          candidate.recordType === 'media-asset' && candidate.properties.subjectId === record.id,
      )
      .map((candidate) => {
        const included =
          candidate.properties.contentUrl !== null &&
          /^(?:asset|catalog|file):/i.test(candidate.properties.contentUrl);
        return {
          id: candidate.id,
          mediaType: candidate.properties.mediaType,
          availability: included ? ('included-offline' as const) : ('unavailable-offline' as const),
          contentUrl: included ? candidate.properties.contentUrl : null,
        };
      });
    return {
      id: record.id,
      recordType: record.recordType,
      name: name(record as ExploreRecord),
      properties: record.properties as unknown as Readonly<Record<string, unknown>>,
      geometry: record.geometry,
      bundle: {
        bundleId: this.coverage.bundleId,
        contentVersion: this.coverage.contentVersion,
        origin: this.coverage.origin,
        regionId: this.coverage.regionId,
        generatedAt: this.coverage.generatedAt,
        dataAsOf: this.coverage.dataAsOf,
      },
      source: {
        sourceId: record.source.sourceId,
        externalId: record.source.externalId,
        retrievedAt: record.retrievedAt,
        sourceUpdatedAt: record.sourceUpdatedAt,
        attribution: record.rights.attribution,
      },
      provenance: Object.entries(record.fieldProvenance)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([field, evidence]) => ({ field, evidence })),
      freshness: { ...freshness, liveVerificationAvailable: false },
      restrictions,
      media,
      camping: record.recordType === 'land-unit' ? (this.campingByLandId[record.id] ?? null) : null,
      unavailableOffline: [
        'live source verification',
        'live conditions outside the bundled data-as-of time',
        ...(media.some(({ availability }) => availability === 'unavailable-offline')
          ? ['rights-excluded media']
          : []),
      ],
    };
  }

  private freshness(sourceId: string): {
    readonly status: 'fresh' | 'stale' | 'unknown';
    readonly dataAsOf: string | null;
    readonly staleAfterSeconds: number | null;
  } {
    const source = this.coverage.sourceFreshness[sourceId];
    if (
      !source ||
      source.dataAsOf === null ||
      source.staleAfterSeconds === null ||
      !validUtc(source.dataAsOf) ||
      !Number.isSafeInteger(source.staleAfterSeconds) ||
      source.staleAfterSeconds < 1
    ) {
      return { status: 'unknown', dataAsOf: source?.dataAsOf ?? null, staleAfterSeconds: null };
    }
    return {
      status:
        this.now - Date.parse(source.dataAsOf) >= source.staleAfterSeconds * 1000
          ? 'stale'
          : 'fresh',
      dataAsOf: source.dataAsOf,
      staleAfterSeconds: source.staleAfterSeconds,
    };
  }
}

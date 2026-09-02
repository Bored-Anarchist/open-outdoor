import { randomUUID } from 'node:crypto';
import type {
  CanonicalGeometry,
  CanonicalRecord,
  CatalogIdRemap,
  EffectiveInterval,
  Position,
} from './canonical.js';
import { validateCatalogIdRemap, validateCanonicalRecord } from './canonical.js';

export const ENTITY_RESOLUTION_VERSION = '1.0.0' as const;

export interface ResolutionThresholds {
  readonly place: number;
  readonly trail: number;
  readonly temporal: number;
  readonly media: number;
  readonly maximumPlaceDistanceMeters: number;
}

export const DEFAULT_RESOLUTION_THRESHOLDS: ResolutionThresholds = {
  place: 0.78,
  trail: 0.82,
  temporal: 0.8,
  media: 0.95,
  maximumPlaceDistanceMeters: 250,
};

export interface ResolutionScore {
  readonly total: number;
  readonly components: Readonly<Record<string, number>>;
  readonly algorithmVersion: typeof ENTITY_RESOLUTION_VERSION;
}

export interface EntityCandidate {
  readonly leftId: string;
  readonly rightId: string;
  readonly recordType: CanonicalRecord['recordType'];
  readonly score: ResolutionScore;
  readonly recommendation: 'link' | 'review' | 'reject';
}

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1_000_000) / 1_000_000;
}

function normalizeName(value: string): readonly string[] {
  return value
    .normalize('NFC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

function nameSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeName(left));
  const rightTokens = new Set(normalizeName(right));
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / union.size;
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function distanceMeters(left: Position, right: Position): number {
  const latitudeDelta = radians(right[1] - left[1]);
  const longitudeDelta = radians(right[0] - left[0]);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(left[1])) * Math.cos(radians(right[1])) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function flattenPositions(geometry: CanonicalGeometry): readonly Position[] {
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

function centroid(geometry: CanonicalGeometry | null): Position | null {
  if (!geometry) return null;
  const positions = flattenPositions(geometry);
  if (positions.length === 0) return null;
  const [longitude, latitude] = positions.reduce(
    ([longitudeSum, latitudeSum], position) => [
      longitudeSum + position[0],
      latitudeSum + position[1],
    ],
    [0, 0],
  );
  return [longitude / positions.length, latitude / positions.length];
}

function placeScore(
  left: Extract<CanonicalRecord, { recordType: 'place' }>,
  right: Extract<CanonicalRecord, { recordType: 'place' }>,
  thresholds: ResolutionThresholds,
): ResolutionScore {
  const leftCenter = centroid(left.geometry);
  const rightCenter = centroid(right.geometry);
  const distance =
    leftCenter && rightCenter ? distanceMeters(leftCenter, rightCenter) : Number.POSITIVE_INFINITY;
  const proximity = Number.isFinite(distance)
    ? 1 - Math.min(1, distance / thresholds.maximumPlaceDistanceMeters)
    : 0;
  const name = nameSimilarity(left.properties.name, right.properties.name);
  const category =
    left.properties.category === right.properties.category && left.properties.category !== 'unknown'
      ? 1
      : 0;
  return {
    total: roundScore(name * 0.5 + proximity * 0.4 + category * 0.1),
    components: { name: roundScore(name), proximity: roundScore(proximity), category },
    algorithmVersion: ENTITY_RESOLUTION_VERSION,
  };
}

function trailScore(
  left: Extract<CanonicalRecord, { recordType: 'trail' }>,
  right: Extract<CanonicalRecord, { recordType: 'trail' }>,
): ResolutionScore {
  const fingerprint = left.properties.fingerprint === right.properties.fingerprint ? 1 : 0;
  const name = nameSimilarity(left.properties.name, right.properties.name);
  const maximumLength = Math.max(left.properties.lengthMeters, right.properties.lengthMeters, 1);
  const length =
    1 -
    Math.min(
      1,
      Math.abs(left.properties.lengthMeters - right.properties.lengthMeters) / maximumLength,
    );
  const leftPositions = left.geometry ? flattenPositions(left.geometry) : [];
  const rightPositions = right.geometry ? flattenPositions(right.geometry) : [];
  const endpoints =
    leftPositions[0] && leftPositions.at(-1) && rightPositions[0] && rightPositions.at(-1)
      ? 1 -
        Math.min(
          1,
          (distanceMeters(leftPositions[0], rightPositions[0]) +
            distanceMeters(leftPositions.at(-1)!, rightPositions.at(-1)!)) /
            500,
        )
      : 0;
  return {
    total: roundScore(fingerprint * 0.45 + name * 0.25 + length * 0.15 + endpoints * 0.15),
    components: {
      fingerprint,
      name: roundScore(name),
      length: roundScore(length),
      endpoints: roundScore(endpoints),
    },
    algorithmVersion: ENTITY_RESOLUTION_VERSION,
  };
}

function intervalOverlap(left: EffectiveInterval, right: EffectiveInterval): number {
  if (left.quality === 'unknown' || right.quality === 'unknown') return 0;
  const leftStart = left.start ? Date.parse(left.start) : Number.NEGATIVE_INFINITY;
  const rightStart = right.start ? Date.parse(right.start) : Number.NEGATIVE_INFINITY;
  const leftEnd = left.end ? Date.parse(left.end) : Number.POSITIVE_INFINITY;
  const rightEnd = right.end ? Date.parse(right.end) : Number.POSITIVE_INFINITY;
  if (Math.max(leftStart, rightStart) >= Math.min(leftEnd, rightEnd)) return 0;
  if (!Number.isFinite(leftStart + rightStart + leftEnd + rightEnd)) return 1;
  const intersection = Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart);
  const union = Math.max(leftEnd, rightEnd) - Math.min(leftStart, rightStart);
  return intersection / union;
}

function temporalScore(
  left: Extract<CanonicalRecord, { recordType: 'condition' | 'restriction' }>,
  right: Extract<CanonicalRecord, { recordType: 'condition' | 'restriction' }>,
): ResolutionScore {
  const name = nameSimilarity(left.properties.name, right.properties.name);
  const interval = intervalOverlap(left.properties.interval, right.properties.interval);
  const scope = left.properties.scope === right.properties.scope ? 1 : 0;
  const authority = left.properties.authority === right.properties.authority ? 1 : 0;
  return {
    total: roundScore(name * 0.3 + interval * 0.35 + scope * 0.2 + authority * 0.15),
    components: { name: roundScore(name), interval: roundScore(interval), scope, authority },
    algorithmVersion: ENTITY_RESOLUTION_VERSION,
  };
}

function mediaScore(
  left: Extract<CanonicalRecord, { recordType: 'media-asset' }>,
  right: Extract<CanonicalRecord, { recordType: 'media-asset' }>,
): ResolutionScore {
  const hash =
    left.properties.perceptualHash !== null &&
    left.properties.perceptualHash === right.properties.perceptualHash
      ? 1
      : 0;
  const subject = left.properties.subjectId === right.properties.subjectId ? 1 : 0;
  const mediaType = left.properties.mediaType === right.properties.mediaType ? 1 : 0;
  return {
    total: roundScore(hash * 0.8 + subject * 0.15 + mediaType * 0.05),
    components: { hash, subject, mediaType },
    algorithmVersion: ENTITY_RESOLUTION_VERSION,
  };
}

function thresholdFor(
  recordType: CanonicalRecord['recordType'],
  thresholds: ResolutionThresholds,
): number {
  switch (recordType) {
    case 'place':
      return thresholds.place;
    case 'trail':
      return thresholds.trail;
    case 'condition':
    case 'restriction':
      return thresholds.temporal;
    case 'media-asset':
      return thresholds.media;
    default:
      return 1;
  }
}

export function scoreEntityPair(
  leftValue: CanonicalRecord,
  rightValue: CanonicalRecord,
  thresholds: ResolutionThresholds = DEFAULT_RESOLUTION_THRESHOLDS,
): ResolutionScore | null {
  const left = validateCanonicalRecord(leftValue);
  const right = validateCanonicalRecord(rightValue);
  if (left.id === right.id || left.recordType !== right.recordType) return null;
  switch (left.recordType) {
    case 'place':
      return right.recordType === 'place' ? placeScore(left, right, thresholds) : null;
    case 'trail':
      return right.recordType === 'trail' ? trailScore(left, right) : null;
    case 'condition':
    case 'restriction':
      return right.recordType === left.recordType ? temporalScore(left, right) : null;
    case 'media-asset':
      return right.recordType === 'media-asset' ? mediaScore(left, right) : null;
    default:
      return null;
  }
}

function sameBlock(left: CanonicalRecord, right: CanonicalRecord): boolean {
  if (left.recordType !== right.recordType) return false;
  switch (left.recordType) {
    case 'place': {
      if (right.recordType !== 'place') return false;
      const leftToken = normalizeName(left.properties.name)[0];
      const rightToken = normalizeName(right.properties.name)[0];
      return leftToken === rightToken || left.properties.category === right.properties.category;
    }
    case 'trail':
      return (
        right.recordType === 'trail' &&
        (left.properties.fingerprint.slice(0, 12) === right.properties.fingerprint.slice(0, 12) ||
          normalizeName(left.properties.name)[0] === normalizeName(right.properties.name)[0])
      );
    case 'condition':
    case 'restriction':
      return (
        right.recordType === left.recordType &&
        (left.properties.scope === right.properties.scope ||
          left.properties.authority === right.properties.authority)
      );
    case 'media-asset':
      return (
        right.recordType === 'media-asset' &&
        (left.properties.perceptualHash === right.properties.perceptualHash ||
          left.properties.subjectId === right.properties.subjectId)
      );
    default:
      return false;
  }
}

export function generateEntityCandidates(
  recordValues: readonly CanonicalRecord[],
  thresholds: ResolutionThresholds = DEFAULT_RESOLUTION_THRESHOLDS,
): readonly EntityCandidate[] {
  const records = recordValues.map(validateCanonicalRecord);
  const candidates: EntityCandidate[] = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const left = records[leftIndex];
      const right = records[rightIndex];
      if (!left || !right || !sameBlock(left, right)) continue;
      const score = scoreEntityPair(left, right, thresholds);
      if (!score) continue;
      const threshold = thresholdFor(left.recordType, thresholds);
      candidates.push({
        leftId: left.id,
        rightId: right.id,
        recordType: left.recordType,
        score,
        recommendation:
          score.total >= threshold ? 'link' : score.total >= threshold * 0.75 ? 'review' : 'reject',
      });
    }
  }
  return candidates.sort(
    (left, right) =>
      right.score.total - left.score.total ||
      left.leftId.localeCompare(right.leftId) ||
      left.rightId.localeCompare(right.rightId),
  );
}

export interface LabelledEntityPair {
  readonly leftId: string;
  readonly rightId: string;
  readonly duplicate: boolean;
}

export interface PrecisionReport {
  readonly truePositive: number;
  readonly falsePositive: number;
  readonly trueNegative: number;
  readonly falseNegative: number;
  readonly precision: number;
  readonly recall: number;
}

function pairKey(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join(':');
}

export function evaluateCandidatePrecision(
  candidates: readonly EntityCandidate[],
  labels: readonly LabelledEntityPair[],
): PrecisionReport {
  const predicted = new Set(
    candidates
      .filter((candidate) => candidate.recommendation === 'link')
      .map((candidate) => pairKey(candidate.leftId, candidate.rightId)),
  );
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  for (const label of labels) {
    const positive = predicted.has(pairKey(label.leftId, label.rightId));
    if (positive && label.duplicate) truePositive += 1;
    else if (positive) falsePositive += 1;
    else if (label.duplicate) falseNegative += 1;
    else trueNegative += 1;
  }
  return {
    truePositive,
    falsePositive,
    trueNegative,
    falseNegative,
    precision: truePositive / Math.max(1, truePositive + falsePositive),
    recall: truePositive / Math.max(1, truePositive + falseNegative),
  };
}

export type ResolutionEvent =
  | {
      readonly kind: 'link';
      readonly eventId: string;
      readonly recordedAt: string;
      readonly actorVersion: string;
      readonly reason: string;
      readonly ids: readonly [string, string];
      readonly score: ResolutionScore;
    }
  | {
      readonly kind: 'merge';
      readonly eventId: string;
      readonly recordedAt: string;
      readonly actorVersion: string;
      readonly reason: string;
      readonly fromIds: readonly string[];
      readonly intoId: string;
    }
  | {
      readonly kind: 'split';
      readonly eventId: string;
      readonly recordedAt: string;
      readonly actorVersion: string;
      readonly reason: string;
      readonly fromId: string;
      readonly intoIds: readonly string[];
    }
  | {
      readonly kind: 'tombstone';
      readonly eventId: string;
      readonly recordedAt: string;
      readonly actorVersion: string;
      readonly reason: string;
      readonly id: string;
    }
  | {
      readonly kind: 'reverse';
      readonly eventId: string;
      readonly recordedAt: string;
      readonly actorVersion: string;
      readonly reason: string;
      readonly reversesEventId: string;
    };

export interface ResolutionState {
  readonly remaps: readonly CatalogIdRemap[];
  readonly links: readonly (readonly [string, string])[];
  readonly tombstones: readonly string[];
}

function eventRemaps(event: ResolutionEvent): readonly CatalogIdRemap[] {
  switch (event.kind) {
    case 'merge':
      return event.fromIds
        .filter((id) => id !== event.intoId)
        .map((fromId) =>
          validateCatalogIdRemap({
            fromId,
            toIds: [event.intoId],
            reason: 'merge',
            eventId: event.eventId,
            recordedAt: event.recordedAt,
          }),
        );
    case 'split':
      return [
        validateCatalogIdRemap({
          fromId: event.fromId,
          toIds: event.intoIds,
          reason: 'split',
          eventId: event.eventId,
          recordedAt: event.recordedAt,
        }),
      ];
    case 'tombstone':
      return [
        validateCatalogIdRemap({
          fromId: event.id,
          toIds: [],
          reason: 'retired',
          eventId: event.eventId,
          recordedAt: event.recordedAt,
        }),
      ];
    default:
      return [];
  }
}

export class EntityResolutionAudit {
  readonly #events: ResolutionEvent[] = [];

  get events(): readonly ResolutionEvent[] {
    return structuredClone(this.#events);
  }

  append(event: ResolutionEvent): void {
    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidV4.test(event.eventId)) throw new Error('resolution event ID must be UUIDv4');
    if (this.#events.some((existing) => existing.eventId === event.eventId)) {
      throw new Error('resolution event IDs are immutable and unique');
    }
    if (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(event.recordedAt)) {
      throw new Error('resolution event time must be UTC');
    }
    if (event.reason.trim() === '' || event.actorVersion.trim() === '') {
      throw new Error('resolution event reason and actor version are required');
    }
    if (event.kind === 'reverse') {
      const target = this.#events.find((existing) => existing.eventId === event.reversesEventId);
      if (!target || target.kind === 'reverse')
        throw new Error('reverse target must be a prior decision');
      if (
        this.#events.some(
          (existing) =>
            existing.kind === 'reverse' && existing.reversesEventId === event.reversesEventId,
        )
      ) {
        throw new Error('resolution decision is already reversed');
      }
    } else {
      const referencedIds =
        event.kind === 'link'
          ? event.ids
          : event.kind === 'merge'
            ? [...event.fromIds, event.intoId]
            : event.kind === 'split'
              ? [event.fromId, ...event.intoIds]
              : [event.id];
      if (referencedIds.some((id) => !uuidV4.test(id))) {
        throw new Error('resolution entity IDs must be UUIDv4');
      }
      if (event.kind === 'link' && event.ids[0] === event.ids[1]) {
        throw new Error('resolution link requires distinct IDs');
      }
      if (
        event.kind === 'merge' &&
        (event.fromIds.length < 2 || !event.fromIds.includes(event.intoId))
      ) {
        throw new Error('resolution merge requires two sources and a retained source ID');
      }
      eventRemaps(event);
    }
    this.#events.push(structuredClone(event));
  }

  reverse(eventId: string, recordedAt: string, reason: string): ResolutionEvent {
    const reversal: ResolutionEvent = {
      kind: 'reverse',
      eventId: randomUUID(),
      recordedAt,
      actorVersion: ENTITY_RESOLUTION_VERSION,
      reason,
      reversesEventId: eventId,
    };
    this.append(reversal);
    return reversal;
  }

  state(): ResolutionState {
    const reversed = new Set(
      this.#events
        .filter(
          (event): event is Extract<ResolutionEvent, { kind: 'reverse' }> =>
            event.kind === 'reverse',
        )
        .map((event) => event.reversesEventId),
    );
    const active = this.#events.filter(
      (event) => event.kind !== 'reverse' && !reversed.has(event.eventId),
    );
    const remaps = active.flatMap(eventRemaps);
    const links = active
      .filter((event): event is Extract<ResolutionEvent, { kind: 'link' }> => event.kind === 'link')
      .map((event) => event.ids);
    const tombstones = new Set<string>();
    for (const event of active) {
      if (event.kind === 'merge') {
        event.fromIds.filter((id) => id !== event.intoId).forEach((id) => tombstones.add(id));
      } else if (event.kind === 'split') tombstones.add(event.fromId);
      else if (event.kind === 'tombstone') tombstones.add(event.id);
    }
    return { remaps, links, tombstones: [...tombstones].sort() };
  }
}

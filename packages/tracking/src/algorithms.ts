import type { Coordinate } from '@open-outdoor/shared';
import type { TrackObservation } from './index.js';

export const DISTANCE_ALGORITHM_VERSION = 'distance-v1';
export const ELEVATION_ALGORITHM_VERSION = 'elevation-v1';

export interface DistanceRevision {
  readonly algorithmVersion: typeof DISTANCE_ALGORITHM_VERSION;
  readonly distanceM: number;
  readonly acceptedSegmentCount: number;
  readonly rejectedObservationCount: number;
  readonly uncertaintyM: number;
  readonly qualityFlags: readonly string[];
}

export interface ElevationRevision {
  readonly algorithmVersion: typeof ELEVATION_ALGORITHM_VERSION;
  readonly source: 'barometer' | 'gps' | 'insufficient';
  readonly ascentM: number;
  readonly descentM: number;
  readonly uncertaintyM: number;
  readonly calibrationAnchors: readonly {
    readonly sequence: number;
    readonly altitudeM: number;
    readonly source: 'gps';
  }[];
  readonly filterParameters: {
    readonly hysteresisM: number;
    readonly maximumVerticalAccuracyM: number;
  };
  readonly qualityFlags: readonly string[];
}

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

export function geodesicDistanceM(left: Coordinate, right: Coordinate): number {
  const earthRadiusM = 6_371_008.8;
  const latitudeDelta = radians(right[1] - left[1]);
  const longitudeDelta = radians(right[0] - left[0]);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(left[1])) * Math.cos(radians(right[1])) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(a)));
}

interface NormalizedObservations {
  readonly ordered: readonly TrackObservation[];
  readonly rejectedCount: number;
}

function normalizeObservations(observations: readonly TrackObservation[]): NormalizedObservations {
  const bySequence = new Map<number, TrackObservation>();
  let rejectedCount = 0;
  for (const observation of observations) {
    const [longitude, latitude] = observation.coordinate;
    if (
      !Number.isSafeInteger(observation.sequence) ||
      observation.sequence < 1 ||
      !Number.isFinite(Date.parse(observation.recordedAt)) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(observation.horizontalAccuracyM) ||
      observation.horizontalAccuracyM < 0
    ) {
      rejectedCount += 1;
      continue;
    }
    const prior = bySequence.get(observation.sequence);
    if (prior !== undefined) {
      if (JSON.stringify(prior) !== JSON.stringify(observation)) rejectedCount += 1;
      continue;
    }
    bySequence.set(observation.sequence, observation);
  }

  const sequenced = [...bySequence.values()].sort((left, right) => left.sequence - right.sequence);
  const ordered: TrackObservation[] = [];
  let lastTimestamp = Number.NEGATIVE_INFINITY;
  for (const observation of sequenced) {
    const timestamp = Date.parse(observation.recordedAt);
    if (timestamp <= lastTimestamp) {
      rejectedCount += 1;
      continue;
    }
    ordered.push(observation);
    lastTimestamp = timestamp;
  }
  return { ordered, rejectedCount };
}

function segmentOf(observation: TrackObservation): number {
  return observation.segment ?? 1;
}

export function calculateDistanceRevision(
  observations: readonly TrackObservation[],
  maximumHorizontalAccuracyM = 50,
): DistanceRevision {
  if (!Number.isFinite(maximumHorizontalAccuracyM) || maximumHorizontalAccuracyM <= 0) {
    throw new RangeError('maximum horizontal accuracy must be positive');
  }
  const normalized = normalizeObservations(observations);
  let distanceM = 0;
  let acceptedSegmentCount = 0;
  let rejectedObservationCount = normalized.rejectedCount;
  let uncertaintySquared = 0;
  let previous: TrackObservation | undefined;

  for (const observation of normalized.ordered) {
    if (
      observation.horizontalAccuracyM > maximumHorizontalAccuracyM ||
      observation.paused === true
    ) {
      rejectedObservationCount += 1;
      previous = undefined;
      continue;
    }
    if (
      previous !== undefined &&
      observation.sequence === previous.sequence + 1 &&
      segmentOf(observation) === segmentOf(previous)
    ) {
      const distance = geodesicDistanceM(previous.coordinate, observation.coordinate);
      if (Number.isFinite(distance)) {
        distanceM += distance;
        acceptedSegmentCount += 1;
        uncertaintySquared +=
          previous.horizontalAccuracyM ** 2 + observation.horizontalAccuracyM ** 2;
      }
    }
    previous = observation;
  }

  const qualityFlags: string[] = [];
  if (rejectedObservationCount > 0) qualityFlags.push('observations-rejected');
  if (acceptedSegmentCount === 0) qualityFlags.push('insufficient-distance-data');
  return {
    algorithmVersion: DISTANCE_ALGORITHM_VERSION,
    distanceM,
    acceptedSegmentCount,
    rejectedObservationCount,
    uncertaintyM: Math.sqrt(uncertaintySquared),
    qualityFlags,
  };
}

function pressureAltitudeM(pressureKPa: number, baselineKPa: number): number {
  return 44_330 * (1 - (pressureKPa / baselineKPa) ** 0.1903);
}

function accumulateHysteresis(
  elevations: readonly number[],
  hysteresisM: number,
): { readonly ascentM: number; readonly descentM: number } {
  const first = elevations[0];
  if (first === undefined) return { ascentM: 0, descentM: 0 };
  let pivot = first;
  let extreme = first;
  let direction: -1 | 0 | 1 = 0;
  let ascentM = 0;
  let descentM = 0;

  for (const elevation of elevations.slice(1)) {
    if (direction >= 0) {
      if (elevation > extreme) extreme = elevation;
      if (extreme - elevation >= hysteresisM) {
        if (extreme - pivot >= hysteresisM) ascentM += Math.max(0, extreme - pivot);
        pivot = extreme;
        extreme = elevation;
        direction = -1;
      }
    } else {
      if (elevation < extreme) extreme = elevation;
      if (elevation - extreme >= hysteresisM) {
        if (pivot - extreme >= hysteresisM) descentM += Math.max(0, pivot - extreme);
        pivot = extreme;
        extreme = elevation;
        direction = 1;
      }
    }
  }
  if (direction >= 0 && extreme - pivot >= hysteresisM) ascentM += extreme - pivot;
  if (direction < 0 && pivot - extreme >= hysteresisM) descentM += pivot - extreme;
  return { ascentM, descentM };
}

function observationGroups(
  observations: readonly TrackObservation[],
  accepts: (observation: TrackObservation) => boolean,
): readonly (readonly TrackObservation[])[] {
  const groups: TrackObservation[][] = [];
  let current: TrackObservation[] | undefined;
  let prior: TrackObservation | undefined;
  for (const observation of observations) {
    if (
      observation.paused === true ||
      !accepts(observation) ||
      (prior !== undefined &&
        (observation.sequence !== prior.sequence + 1 ||
          segmentOf(observation) !== segmentOf(prior)))
    ) {
      current = undefined;
    }
    if (observation.paused !== true && accepts(observation)) {
      if (current === undefined) {
        current = [];
        groups.push(current);
      }
      current.push(observation);
    }
    prior = observation;
  }
  return groups.filter((group) => group.length >= 2);
}

function barometricElevations(group: readonly TrackObservation[]): readonly number[] {
  const firstRelative = group.find(
    ({ relativeAltitudeM }) => relativeAltitudeM !== undefined,
  )?.relativeAltitudeM;
  const baselinePressure = group.find(({ pressureKPa }) => pressureKPa !== undefined)?.pressureKPa;
  return group.flatMap((observation) => {
    if (observation.relativeAltitudeM !== undefined && firstRelative !== undefined) {
      return [observation.relativeAltitudeM - firstRelative];
    }
    if (observation.pressureKPa !== undefined && baselinePressure !== undefined) {
      return [pressureAltitudeM(observation.pressureKPa, baselinePressure)];
    }
    return [];
  });
}

export function calculateElevationRevision(
  observations: readonly TrackObservation[],
  options: { readonly hysteresisM?: number; readonly maximumVerticalAccuracyM?: number } = {},
): ElevationRevision {
  const hysteresisM = options.hysteresisM ?? 3;
  const maximumVerticalAccuracyM = options.maximumVerticalAccuracyM ?? 20;
  if (
    !Number.isFinite(hysteresisM) ||
    hysteresisM <= 0 ||
    !Number.isFinite(maximumVerticalAccuracyM) ||
    maximumVerticalAccuracyM <= 0
  ) {
    throw new RangeError('elevation filter parameters must be positive');
  }

  const normalized = normalizeObservations(observations);
  const barometerGroups = observationGroups(
    normalized.ordered,
    (observation) =>
      observation.relativeAltitudeM !== undefined ||
      (observation.pressureKPa !== undefined && observation.pressureKPa > 0),
  );
  const gpsAccepts = (observation: TrackObservation): boolean =>
    observation.altitudeM !== undefined &&
    observation.verticalAccuracyM !== undefined &&
    observation.verticalAccuracyM >= 0 &&
    observation.verticalAccuracyM <= maximumVerticalAccuracyM;
  const gpsGroups = observationGroups(normalized.ordered, gpsAccepts);
  const gps = normalized.ordered.filter(gpsAccepts);
  const anchors = gps.map((observation) => ({
    sequence: observation.sequence,
    altitudeM: observation.altitudeM ?? 0,
    source: 'gps' as const,
  }));

  let source: ElevationRevision['source'] = 'insufficient';
  let selectedGroups: readonly (readonly number[])[] = [];
  if (barometerGroups.length > 0) {
    source = 'barometer';
    selectedGroups = barometerGroups.map(barometricElevations);
  } else if (gpsGroups.length > 0) {
    source = 'gps';
    selectedGroups = gpsGroups.map((group) => group.map(({ altitudeM }) => altitudeM ?? 0));
  }

  const totals = selectedGroups.reduce(
    (sum, elevations) => {
      const group = accumulateHysteresis(elevations, hysteresisM);
      return {
        ascentM: sum.ascentM + group.ascentM,
        descentM: sum.descentM + group.descentM,
      };
    },
    { ascentM: 0, descentM: 0 },
  );
  const qualityFlags: string[] = [];
  if (source === 'gps') qualityFlags.push('lower-confidence-gps-fallback');
  if (source === 'insufficient') qualityFlags.push('insufficient-elevation-data');
  if (normalized.rejectedCount > 0 || normalized.ordered.some(({ paused }) => paused === true)) {
    qualityFlags.push('paused-or-invalid-observations-excluded');
  }
  return {
    algorithmVersion: ELEVATION_ALGORITHM_VERSION,
    source,
    ...totals,
    uncertaintyM:
      source === 'barometer'
        ? Math.max(3, anchors.length === 0 ? 15 : 8)
        : source === 'gps'
          ? Math.max(50, ...gps.map(({ verticalAccuracyM }) => verticalAccuracyM ?? 50))
          : Number.POSITIVE_INFINITY,
    calibrationAnchors: anchors,
    filterParameters: { hysteresisM, maximumVerticalAccuracyM },
    qualityFlags,
  };
}

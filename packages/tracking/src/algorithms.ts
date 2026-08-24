import type { Coordinate } from '@open-outdoor/shared';
import type { TrackObservation } from './index';

export const DISTANCE_ALGORITHM_VERSION = 'distance-v1';
export const ELEVATION_ALGORITHM_VERSION = 'elevation-v2';

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
  readonly source: 'barometer-fused' | 'gps' | 'insufficient';
  readonly ascentM: number;
  readonly descentM: number;
  readonly uncertaintyM: number;
  readonly calibrationAnchors: readonly {
    readonly sequence: number;
    readonly altitudeM: number;
    readonly correctionM: number;
    readonly source: 'gps';
  }[];
  readonly filterParameters: {
    readonly hysteresisM: number;
    readonly maximumVerticalAccuracyM: number;
    readonly maximumSpikeM: number;
  };
  readonly qualityFlags: readonly string[];
  readonly elevationProfile: readonly { readonly sequence: number; readonly elevationM: number }[];
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
  options: {
    readonly hysteresisM?: number;
    readonly maximumVerticalAccuracyM?: number;
    readonly maximumSpikeM?: number;
  } = {},
): ElevationRevision {
  const hysteresisM = options.hysteresisM ?? 3;
  const maximumVerticalAccuracyM = options.maximumVerticalAccuracyM ?? 20;
  const maximumSpikeM = options.maximumSpikeM ?? 25;
  if (
    !Number.isFinite(hysteresisM) ||
    hysteresisM <= 0 ||
    !Number.isFinite(maximumVerticalAccuracyM) ||
    maximumVerticalAccuracyM <= 0 ||
    !Number.isFinite(maximumSpikeM) ||
    maximumSpikeM <= 0
  ) {
    throw new RangeError('elevation filter parameters must be positive');
  }

  const normalized = normalizeObservations(observations);
  const gpsAccepts = (observation: TrackObservation): boolean =>
    observation.altitudeM !== undefined &&
    observation.verticalAccuracyM !== undefined &&
    observation.verticalAccuracyM >= 0 &&
    observation.verticalAccuracyM <= maximumVerticalAccuracyM;
  const barometerGroups = observationGroups(
    normalized.ordered,
    (observation) =>
      observation.relativeAltitudeM !== undefined ||
      (observation.pressureKPa !== undefined && observation.pressureKPa > 0),
  );
  const gpsGroups = observationGroups(normalized.ordered, gpsAccepts);
  const gps = normalized.ordered.filter(gpsAccepts);
  const qualityFlags: string[] = [];
  let spikeCount = 0;
  let driftCorrected = false;

  const rejectSpikes = (values: readonly number[]): readonly number[] => {
    const filtered: number[] = [];
    for (const value of values) {
      const previous = filtered.at(-1);
      if (previous !== undefined && Math.abs(value - previous) > maximumSpikeM) {
        filtered.push(previous);
        spikeCount += 1;
      } else {
        filtered.push(value);
      }
    }
    return filtered;
  };

  const smoothGps = (values: readonly number[]): readonly number[] => {
    if (values.length < 3) return [...values];
    return values.map((_, index) => {
      const window = values
        .slice(Math.max(0, index - 1), index + 2)
        .slice()
        .sort((a, b) => a - b);
      return window[Math.floor(window.length / 2)] ?? values[index] ?? 0;
    });
  };

  let source: ElevationRevision['source'] = 'insufficient';
  let profiles: readonly (readonly { readonly sequence: number; readonly elevationM: number }[])[] =
    [];
  const corrections = new Map<number, number>();

  if (barometerGroups.length > 0) {
    source = 'barometer-fused';
    profiles = barometerGroups.map((group) => {
      const raw = barometricElevations(group);
      const anchors = group.flatMap((observation, index) =>
        gpsAccepts(observation)
          ? [{ index, altitudeM: observation.altitudeM ?? 0, sequence: observation.sequence }]
          : [],
      );
      const first = anchors[0];
      const last = anchors.at(-1);
      let adjusted = [...raw];
      if (first !== undefined) {
        const durationSeconds =
          (Date.parse(group.at(-1)?.recordedAt ?? '') - Date.parse(group[0]?.recordedAt ?? '')) /
          1_000;
        const canCorrectDrift = anchors.length >= 2 && durationSeconds >= 5 * 60;
        const firstCorrection = first.altitudeM - (raw[first.index] ?? raw[0] ?? 0);
        const lastCorrection =
          !canCorrectDrift || last === undefined
            ? firstCorrection
            : last.altitudeM - (raw[last.index] ?? raw.at(-1) ?? 0);
        adjusted = raw.map((value, index) => {
          const lastIndex = canCorrectDrift ? (last?.index ?? first.index) : first.index;
          const span = Math.max(1, lastIndex - first.index);
          const progress = Math.max(0, Math.min(1, (index - first.index) / span));
          return value + firstCorrection + (lastCorrection - firstCorrection) * progress;
        });
        for (const anchor of anchors) {
          corrections.set(anchor.sequence, anchor.altitudeM - (raw[anchor.index] ?? 0));
        }
        driftCorrected = driftCorrected || canCorrectDrift;
      }
      return rejectSpikes(adjusted).map((elevationM, index) => ({
        sequence: group[index]?.sequence ?? group[0]?.sequence ?? 0,
        elevationM,
      }));
    });
  } else if (gpsGroups.length > 0) {
    source = 'gps';
    profiles = gpsGroups.map((group) =>
      smoothGps(group.map(({ altitudeM }) => altitudeM ?? 0)).map((elevationM, index) => ({
        sequence: group[index]?.sequence ?? group[0]?.sequence ?? 0,
        elevationM,
      })),
    );
  }

  const totals = profiles.reduce(
    (sum, profile) => {
      const group = accumulateHysteresis(
        profile.map(({ elevationM }) => elevationM),
        hysteresisM,
      );
      return { ascentM: sum.ascentM + group.ascentM, descentM: sum.descentM + group.descentM };
    },
    { ascentM: 0, descentM: 0 },
  );
  if (source === 'gps') qualityFlags.push('lower-confidence-gps-fallback');
  if (source === 'insufficient') qualityFlags.push('insufficient-elevation-data');
  if (driftCorrected) qualityFlags.push('barometer-drift-corrected');
  if (spikeCount > 0) qualityFlags.push('elevation-spikes-rejected');
  if (normalized.rejectedCount > 0 || normalized.ordered.some(({ paused }) => paused === true)) {
    qualityFlags.push('paused-or-invalid-observations-excluded');
  }
  const acceptedGpsAccuracy = gps.map(({ verticalAccuracyM }) => verticalAccuracyM ?? 50);
  const typicalGpsAccuracy =
    acceptedGpsAccuracy.length === 0
      ? 15
      : (acceptedGpsAccuracy.slice().sort((a, b) => a - b)[
          Math.floor(acceptedGpsAccuracy.length / 2)
        ] ?? 15);
  return {
    algorithmVersion: ELEVATION_ALGORITHM_VERSION,
    source,
    ...totals,
    uncertaintyM:
      source === 'barometer-fused'
        ? Math.max(3, gps.length === 0 ? 15 : typicalGpsAccuracy)
        : source === 'gps'
          ? Math.max(30, typicalGpsAccuracy)
          : Number.POSITIVE_INFINITY,
    calibrationAnchors: gps.map((observation) => ({
      sequence: observation.sequence,
      altitudeM: observation.altitudeM ?? 0,
      correctionM: corrections.get(observation.sequence) ?? 0,
      source: 'gps' as const,
    })),
    filterParameters: { hysteresisM, maximumVerticalAccuracyM, maximumSpikeM },
    elevationProfile: profiles.flat(),
    qualityFlags,
  };
}

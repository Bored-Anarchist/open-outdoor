import { boundedDisplayPoints, type Coordinate } from '@open-outdoor/shared';
import {
  hikeDistanceM,
  type HikeProfileSample,
  type HikeRouteDetails,
} from '@open-outdoor/shared/hike-route';
import {
  calculateDistanceRevision,
  calculateElevationRevision,
  type TrackObservation,
} from '@open-outdoor/tracking';
import type { DerivedRevisionRecord, RecordedActivity } from '@open-outdoor/storage';

export interface RecordedHikeDisplay {
  readonly coordinates: readonly Coordinate[];
  readonly breaks: readonly number[];
  readonly bounds: readonly [number, number, number, number] | null;
  readonly route: HikeRouteDetails | null;
  readonly recordedSeconds: number;
  readonly sequence: number;
  readonly gpsQuality: 'Waiting' | 'Good' | 'Degraded' | 'Poor';
  readonly elevationConfidence: 'gps' | 'barometer-fused' | 'insufficient';
  readonly relativeElevation: boolean;
}
export type CaptureRevision = Pick<
  DerivedRevisionRecord,
  | 'distanceM'
  | 'ascentM'
  | 'descentM'
  | 'elevationSource'
  | 'elevationProfile'
  | 'calibrationAnchors'
>;

/** Private display projection of durable samples; never mutates or exports the recording. */
export function recordedHikeDisplay(
  observations: readonly TrackObservation[],
  savedRevision?: CaptureRevision,
): RecordedHikeDisplay {
  const distance = calculateDistanceRevision(observations);
  const elevation =
    savedRevision ??
    (() => {
      const result = calculateElevationRevision(observations);
      return { ...result, elevationSource: result.source };
    })();
  const levels = new Map(
    elevation.elevationProfile
      .filter((point) => Number.isFinite(point.elevationM) && Math.abs(point.elevationM) <= 100_000)
      .map((point) => [point.sequence, point.elevationM]),
  );
  // Match the recorder's normalization: first valid sequence wins, then strictly increasing time.
  const bySequence = new Map<number, TrackObservation>();
  for (const point of observations) {
    if (
      !Number.isSafeInteger(point.sequence) ||
      point.sequence < 1 ||
      !Number.isFinite(Date.parse(point.recordedAt)) ||
      !point.coordinate.every(Number.isFinite) ||
      Math.abs(point.coordinate[0]) > 180 ||
      Math.abs(point.coordinate[1]) > 90 ||
      !Number.isFinite(point.horizontalAccuracyM) ||
      point.horizontalAccuracyM < 0
    )
      continue;
    if (!bySequence.has(point.sequence)) bySequence.set(point.sequence, point);
  }
  let lastTimestamp = -Infinity;
  const ordered = [...bySequence.values()]
    .sort((a, b) => a.sequence - b.sequence)
    .filter((point) => {
      const timestamp = Date.parse(point.recordedAt);
      if (timestamp <= lastTimestamp) return false;
      lastTimestamp = timestamp;
      return true;
    });
  const accepted: { point: TrackObservation; part: number; distanceM: number }[] = [];
  let previous: TrackObservation | undefined;
  let part = -1;
  let along = 0;
  let recordedSeconds = 0;
  let timingPrevious: TrackObservation | undefined;
  for (const point of ordered) {
    const timestamp = Date.parse(point.recordedAt);
    if (point.paused) {
      previous = undefined;
      timingPrevious = undefined;
      continue;
    }
    if (
      timingPrevious &&
      point.sequence === timingPrevious.sequence + 1 &&
      (point.segment ?? 1) === (timingPrevious.segment ?? 1)
    ) {
      recordedSeconds += Math.max(0, (timestamp - Date.parse(timingPrevious.recordedAt)) / 1000);
    }
    timingPrevious = point;
    if (point.horizontalAccuracyM > 50) {
      previous = undefined;
      continue;
    }
    if (
      !previous ||
      point.sequence !== previous.sequence + 1 ||
      (point.segment ?? 1) !== (previous.segment ?? 1)
    )
      part++;
    else along += hikeDistanceM(previous.coordinate, point.coordinate);
    accepted.push({ point, part, distanceM: along });
    previous = point;
  }
  // Retaining original part IDs prevents simplification from reconnecting omitted gaps.
  const display = boundedDisplayPoints(accepted, 2048);
  const coordinates = display.map(({ point }) => point.coordinate);
  const breaks = display.flatMap((point, i) =>
    i > 0 && point.part !== display[i - 1]?.part ? [i] : [],
  );
  let profilePart = -1;
  let priorProfile: (typeof accepted)[number] | undefined;
  const chartPoints = accepted.map((entry) => {
    if (
      !priorProfile ||
      priorProfile.part !== entry.part ||
      !levels.has(entry.point.sequence) ||
      !levels.has(priorProfile.point.sequence)
    )
      profilePart++;
    priorProfile = entry;
    return { ...entry, profilePart };
  });
  const profile = boundedDisplayPoints(chartPoints, 128);
  const samples: HikeProfileSample[] = profile.map(({ point, profilePart, distanceM }) => {
    const level = levels.get(point.sequence);
    return [
      distanceM,
      level !== undefined && Number.isFinite(level) && Math.abs(level) <= 100_000 ? level : null,
      point.coordinate[0],
      point.coordinate[1],
      profilePart,
    ];
  });
  const values = samples.flatMap((point) => (point[1] === null ? [] : [point[1]]));
  const hasProfile = samples.some(
    (point, i) =>
      i > 0 && point[1] !== null && samples[i - 1]![1] !== null && point[4] === samples[i - 1]![4],
  );
  const first = accepted[0]?.point.coordinate;
  const last = accepted.at(-1)?.point.coordinate;
  const accuracy = ordered.at(-1)?.horizontalAccuracyM;
  const confidence = elevation.elevationSource;
  const route: HikeRouteDetails | null =
    first && last
      ? {
          distanceM: savedRevision?.distanceM ?? distance.distanceM,
          segmentCount: part + 1,
          closedLoop: part === 0 && along >= 40 && hikeDistanceM(first, last) <= 20,
          start: first,
          end: last,
          samples,
          elevationSource: hasProfile ? 'recorded' : 'unavailable',
          ...(confidence !== 'insufficient'
            ? { ascentM: elevation.ascentM, descentM: elevation.descentM }
            : {}),
          ...(values.length
            ? { minimumElevationM: Math.min(...values), maximumElevationM: Math.max(...values) }
            : {}),
        }
      : null;
  const anchorSequences = new Set(elevation.calibrationAnchors.map((anchor) => anchor.sequence));
  const anchoredParts = new Set(
    chartPoints
      .filter(({ point }) => anchorSequences.has(point.sequence))
      .map(({ profilePart }) => profilePart),
  );
  return {
    coordinates,
    breaks,
    route,
    bounds: accepted.length
      ? [
          Math.min(...display.map(({ point }) => point.coordinate[0])),
          Math.min(...display.map(({ point }) => point.coordinate[1])),
          Math.max(...display.map(({ point }) => point.coordinate[0])),
          Math.max(...display.map(({ point }) => point.coordinate[1])),
        ]
      : null,
    recordedSeconds: Math.round(recordedSeconds),
    sequence: ordered.at(-1)?.sequence ?? 0,
    gpsQuality:
      accuracy === undefined
        ? 'Waiting'
        : accuracy <= 10
          ? 'Good'
          : accuracy <= 50
            ? 'Degraded'
            : 'Poor',
    elevationConfidence: confidence,
    relativeElevation:
      confidence === 'barometer-fused' &&
      chartPoints.some(
        ({ point, profilePart }) => levels.has(point.sequence) && !anchoredParts.has(profilePart),
      ),
  };
}

export function storedHikeObservations(activity: RecordedActivity): readonly TrackObservation[] {
  return activity.samples.map((sample) => ({
    sequence: sample.sequence,
    coordinate: sample.coordinate,
    recordedAt: sample.recordedAt,
    horizontalAccuracyM: sample.horizontalAccuracyM,
    segment: sample.segment,
    paused: sample.paused,
    ...(sample.altitudeM === null ? {} : { altitudeM: sample.altitudeM }),
    ...(sample.verticalAccuracyM === null ? {} : { verticalAccuracyM: sample.verticalAccuracyM }),
    ...(sample.pressureKPa === null ? {} : { pressureKPa: sample.pressureKPa }),
  }));
}

import { assertCoordinate, type TrackPoint } from '@open-outdoor/shared';

export type TrackingMode = 'balanced' | 'endurance' | 'high-accuracy';

const trackingModes = new Set<TrackingMode>(['balanced', 'endurance', 'high-accuracy']);

function isTrackingMode(value: unknown): value is TrackingMode {
  return typeof value === 'string' && trackingModes.has(value as TrackingMode);
}

export interface TrackingAdapter {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<readonly TrackPoint[]>;
}

export interface TrackObservation extends TrackPoint {
  readonly sequence: number;
  readonly horizontalAccuracyM: number;
  readonly verticalAccuracyM?: number;
  readonly altitudeM?: number;
  readonly pressureKPa?: number;
  readonly relativeAltitudeM?: number;
  readonly segment?: number;
  readonly paused?: boolean;
}

export interface TrackingBatch {
  readonly sessionId: string;
  readonly mode: TrackingMode;
  readonly firstSequence: number;
  readonly createdAt: string;
  readonly observations: readonly TrackObservation[];
}

export interface SequenceGap {
  readonly firstMissing: number;
  readonly lastMissing: number;
}

export interface TrackingReplayResult {
  readonly sessionId: string | undefined;
  readonly mode: TrackingMode | undefined;
  readonly observations: readonly TrackObservation[];
  readonly points: readonly TrackPoint[];
  readonly duplicateCount: number;
  readonly gaps: readonly SequenceGap[];
  readonly highestCommittedSequence: number;
}

export class TrackingReplayError extends Error {
  constructor(
    readonly code:
      | 'BATCH_INVALID'
      | 'COMMITTED_STATE_INVALID'
      | 'DUPLICATE_CONFLICT'
      | 'MULTIPLE_MODES'
      | 'MULTIPLE_SESSIONS'
      | 'OBSERVATION_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'TrackingReplayError';
  }
}

function replayFailure(code: TrackingReplayError['code'], message: string): never {
  throw new TrackingReplayError(code, message);
}

function validInstant(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
  return new Date(parsed).toISOString() === canonical;
}

function validateObservation(observation: TrackObservation, expectedSequence: number): void {
  if (
    observation.sequence !== expectedSequence ||
    !Number.isSafeInteger(observation.sequence) ||
    observation.sequence < 1 ||
    !validInstant(observation.recordedAt) ||
    !Number.isFinite(observation.horizontalAccuracyM) ||
    observation.horizontalAccuracyM < 0 ||
    (observation.altitudeM !== undefined && !Number.isFinite(observation.altitudeM)) ||
    (observation.pressureKPa !== undefined &&
      (!Number.isFinite(observation.pressureKPa) || observation.pressureKPa <= 0))
  ) {
    replayFailure(
      'OBSERVATION_INVALID',
      `invalid tracking observation at sequence ${expectedSequence}`,
    );
  }
  assertCoordinate(observation.coordinate);
}

function observationsEqual(left: TrackObservation, right: TrackObservation): boolean {
  return (
    left.sequence === right.sequence &&
    left.coordinate[0] === right.coordinate[0] &&
    left.coordinate[1] === right.coordinate[1] &&
    left.recordedAt === right.recordedAt &&
    left.horizontalAccuracyM === right.horizontalAccuracyM &&
    left.verticalAccuracyM === right.verticalAccuracyM &&
    left.altitudeM === right.altitudeM &&
    left.pressureKPa === right.pressureKPa &&
    left.relativeAltitudeM === right.relativeAltitudeM &&
    left.segment === right.segment &&
    left.paused === right.paused
  );
}

export function replayTrackingBatches(
  batches: readonly TrackingBatch[],
  lastCommittedSequence = 0,
): TrackingReplayResult {
  if (!Number.isSafeInteger(lastCommittedSequence) || lastCommittedSequence < 0) {
    replayFailure(
      'COMMITTED_STATE_INVALID',
      'last committed tracking sequence must be a non-negative integer',
    );
  }

  let sessionId: string | undefined;
  let mode: TrackingMode | undefined;
  let duplicateCount = 0;
  const observations = new Map<number, TrackObservation>();

  for (const batch of batches) {
    if (
      batch.sessionId.trim().length === 0 ||
      !isTrackingMode(batch.mode) ||
      !validInstant(batch.createdAt) ||
      !Number.isSafeInteger(batch.firstSequence) ||
      batch.firstSequence < 1 ||
      batch.observations.length === 0 ||
      !Number.isSafeInteger(batch.firstSequence + batch.observations.length - 1)
    ) {
      replayFailure('BATCH_INVALID', 'tracking batch metadata is invalid');
    }
    if (sessionId !== undefined && sessionId !== batch.sessionId) {
      replayFailure('MULTIPLE_SESSIONS', 'tracking replay cannot combine multiple sessions');
    }
    if (mode !== undefined && mode !== batch.mode) {
      replayFailure('MULTIPLE_MODES', 'tracking replay cannot silently change modes');
    }
    sessionId = batch.sessionId;
    mode = batch.mode;

    batch.observations.forEach((observation, index) => {
      const expectedSequence = batch.firstSequence + index;
      validateObservation(observation, expectedSequence);
      if (observation.sequence <= lastCommittedSequence) {
        duplicateCount += 1;
        return;
      }
      const prior = observations.get(observation.sequence);
      if (prior !== undefined) {
        if (!observationsEqual(prior, observation)) {
          replayFailure(
            'DUPLICATE_CONFLICT',
            `sequence ${observation.sequence} contains conflicting observations`,
          );
        }
        duplicateCount += 1;
        return;
      }
      observations.set(observation.sequence, observation);
    });
  }

  const ordered = [...observations.values()].sort((left, right) => left.sequence - right.sequence);
  const gaps: SequenceGap[] = [];
  let expectedSequence = lastCommittedSequence + 1;
  for (const observation of ordered) {
    if (observation.sequence > expectedSequence) {
      gaps.push({ firstMissing: expectedSequence, lastMissing: observation.sequence - 1 });
    }
    expectedSequence = observation.sequence + 1;
  }

  return {
    sessionId,
    mode,
    observations: ordered,
    points: ordered.map(({ coordinate, recordedAt }) => ({ coordinate, recordedAt })),
    duplicateCount,
    gaps,
    highestCommittedSequence: ordered.at(-1)?.sequence ?? lastCommittedSequence,
  };
}
export * from './recorder';
export * from './algorithms';
export * from './field-hardening';

import { describe, expect, it } from 'vitest';
import {
  TrackingReplayError,
  replayTrackingBatches,
  type TrackObservation,
  type TrackingBatch,
} from '../src/index.js';

function observation(sequence: number, longitude = -74): TrackObservation {
  return {
    sequence,
    coordinate: [longitude, 41],
    recordedAt: `2026-08-21T12:00:${String(sequence).padStart(2, '0')}.000Z`,
    horizontalAccuracyM: 5,
    altitudeM: 100 + sequence,
    pressureKPa: 100,
  };
}

function batch(firstSequence: number, sequences: readonly number[]): TrackingBatch {
  return {
    sessionId: 'synthetic-session',
    mode: 'balanced',
    firstSequence,
    createdAt: '2026-08-21T12:01:00.000Z',
    observations: sequences.map((sequence) => observation(sequence)),
  };
}

function expectReplayError(operation: () => unknown, code: TrackingReplayError['code']): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(TrackingReplayError);
    expect((error as TrackingReplayError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

describe('T-PHY-001 deterministic native tracking replay', () => {
  it('T-PHY-001-C01 replays contiguous sequenced batches', () => {
    expect(replayTrackingBatches([batch(1, [1, 2]), batch(3, [3, 4])])).toMatchObject({
      duplicateCount: 0,
      gaps: [],
      highestCommittedSequence: 4,
    });
  });

  it('T-PHY-001-C02 produces the same order from out-of-order batch delivery', () => {
    const result = replayTrackingBatches([batch(3, [3, 4]), batch(1, [1, 2])]);
    expect(result.observations.map(({ sequence }) => sequence)).toEqual([1, 2, 3, 4]);
  });

  it('T-PHY-001-C03 ignores byte-equivalent duplicate sequences idempotently', () => {
    const result = replayTrackingBatches([batch(1, [1, 2]), batch(1, [1, 2])]);
    expect(result.observations).toHaveLength(2);
    expect(result.duplicateCount).toBe(2);
  });

  it('T-PHY-001-C04 rejects a conflicting duplicate sequence', () => {
    const conflicting = { ...batch(1, [1]), observations: [observation(1, -73)] };
    expectReplayError(
      () => replayTrackingBatches([batch(1, [1]), conflicting]),
      'DUPLICATE_CONFLICT',
    );
  });

  it('T-PHY-001-C05 reports missing sequences instead of inventing samples', () => {
    expect(replayTrackingBatches([batch(1, [1]), batch(3, [3])]).gaps).toEqual([
      { firstMissing: 2, lastMissing: 2 },
    ]);
  });

  it('T-PHY-001-C06 rejects invalid committed state and observation sequencing', () => {
    expectReplayError(() => replayTrackingBatches([], -1), 'COMMITTED_STATE_INVALID');
    expectReplayError(() => replayTrackingBatches([batch(1, [2])]), 'OBSERVATION_INVALID');
    expectReplayError(
      () => replayTrackingBatches([{ ...batch(1, [1]), mode: 'unknown' as TrackingBatch['mode'] }]),
      'BATCH_INVALID',
    );
    expectReplayError(
      () =>
        replayTrackingBatches([
          {
            ...batch(1, [1]),
            observations: [{ ...observation(1), recordedAt: '2026-02-31T12:00:01.000Z' }],
          },
        ]),
      'OBSERVATION_INVALID',
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  RecorderStateMachine,
  calculateDistanceRevision,
  calculateElevationRevision,
  type TrackObservation,
} from '../src/index.js';

function point(sequence: number, overrides: Partial<TrackObservation> = {}): TrackObservation {
  return {
    sequence,
    coordinate: [-74 + sequence * 0.001, 41],
    recordedAt: `2026-08-23T12:00:${String(sequence).padStart(2, '0')}.000Z`,
    horizontalAccuracyM: 4,
    altitudeM: 100 + sequence * 5,
    verticalAccuracyM: 6,
    relativeAltitudeM: sequence * 5,
    pressureKPa: 100,
    segment: 1,
    paused: false,
    ...overrides,
  };
}

describe('WP-103 production tracking state machine', () => {
  it('supports start, pause, resume, recovery, duplicate commit, and finish', () => {
    const recorder = new RecorderStateMachine();
    recorder.start('session-1', 'balanced', '2026-08-23T12:00:00.000Z');
    recorder.commit([point(1), point(1)], '2026-08-23T12:00:01.000Z');
    recorder.pause('2026-08-23T12:00:02.000Z');
    recorder.resume('2026-08-23T12:00:03.000Z');
    recorder.interrupt('process-termination');
    recorder.recover('2026-08-23T12:00:04.000Z');
    expect(recorder.finish('2026-08-23T12:01:00.000Z')).toMatchObject({
      kind: 'finished',
      finalSequence: 1,
    });
    expect(recorder.committedObservations).toHaveLength(1);
  });
});

describe('WP-104 distance and elevation revisions', () => {
  it('does not bridge sequence gaps or pauses when calculating distance', () => {
    const result = calculateDistanceRevision([
      point(1),
      point(2),
      point(4),
      point(5, { paused: true }),
      point(6),
    ]);
    expect(result.acceptedSegmentCount).toBe(1);
    expect(result.qualityFlags).toContain('observations-rejected');
  });

  it('prefers barometer data and excludes sub-threshold oscillation', () => {
    const result = calculateElevationRevision([
      point(1, { relativeAltitudeM: 0 }),
      point(2, { relativeAltitudeM: 0.5 }),
      point(3, { relativeAltitudeM: 0 }),
      point(4, { relativeAltitudeM: 10 }),
    ]);
    expect(result.source).toBe('barometer-fused');
    expect(result.ascentM).toBeCloseTo(10, 6);
  });

  it('marks GPS-only fallback lower confidence', () => {
    const observations = [
      point(1, { relativeAltitudeM: undefined, pressureKPa: undefined, altitudeM: 100 }),
      point(2, { relativeAltitudeM: undefined, pressureKPa: undefined, altitudeM: 110 }),
    ];
    expect(calculateElevationRevision(observations)).toMatchObject({
      source: 'gps',
      ascentM: 10,
      qualityFlags: ['lower-confidence-gps-fallback'],
    });
  });

  it('does not interpret pressure or altitude drift during pause as climbing', () => {
    const result = calculateElevationRevision([
      point(1, { relativeAltitudeM: 0, segment: 1 }),
      point(2, { relativeAltitudeM: 5, segment: 1 }),
      point(3, { relativeAltitudeM: 50, segment: 1, paused: true }),
      point(4, { relativeAltitudeM: 50, segment: 2 }),
      point(5, { relativeAltitudeM: 55, segment: 2 }),
    ]);
    expect(result.ascentM).toBeCloseTo(10, 6);
    expect(result.qualityFlags).toContain('paused-or-invalid-observations-excluded');
  });

  it('rejects clock disorder instead of inventing a segment', () => {
    const result = calculateDistanceRevision([
      point(1, { recordedAt: '2026-08-23T12:00:02.000Z' }),
      point(2, { recordedAt: '2026-08-23T12:00:01.000Z' }),
    ]);
    expect(result.distanceM).toBe(0);
    expect(result.rejectedObservationCount).toBe(1);
  });

  it('stays below the flat-replay false-ascent threshold', () => {
    const startedAt = Date.parse('2026-08-23T12:00:00.000Z');
    const flat = Array.from({ length: 101 }, (_, index) =>
      point(index + 1, {
        recordedAt: new Date(startedAt + index * 1_000).toISOString(),
        coordinate: [-74 + index * 0.0012, 41],
        relativeAltitudeM: index % 2 === 0 ? 0.8 : 0,
      }),
    );
    expect(calculateElevationRevision(flat).ascentM).toBeLessThanOrEqual(25);
  });
  it('anchors long barometer drift to accuracy-gated GPS elevations', () => {
    const startedAt = Date.parse('2026-08-23T12:00:00.000Z');
    const observations = Array.from({ length: 6 }, (_, index) =>
      point(index + 1, {
        recordedAt: new Date(startedAt + index * 60_000).toISOString(),
        relativeAltitudeM: index * 12,
        altitudeM: 100 + index * 6,
      }),
    );
    const result = calculateElevationRevision(observations);
    expect(result.ascentM).toBeCloseTo(30, 6);
    expect(result.qualityFlags).toContain('barometer-drift-corrected');
  });

  it('rejects isolated elevation spikes without rewriting raw observations', () => {
    const result = calculateElevationRevision([
      point(1, { relativeAltitudeM: 0 }),
      point(2, { relativeAltitudeM: 5 }),
      point(3, { relativeAltitudeM: 100 }),
      point(4, { relativeAltitudeM: 10 }),
      point(5, { relativeAltitudeM: 15 }),
    ]);
    expect(result.ascentM).toBeCloseTo(15, 6);
    expect(result.qualityFlags).toContain('elevation-spikes-rejected');
  });
});

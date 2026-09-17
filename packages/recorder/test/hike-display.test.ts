import { describe, expect, it, vi } from 'vitest';
import { InMemoryPrivateRepository, type PrivateDatabaseSnapshot } from '@open-outdoor/storage';
import {
  FixtureTrackerAdapter,
  calculateElevationRevision,
  type TrackObservation,
} from '@open-outdoor/tracking';
import {
  RecorderCoordinator,
  recordedHikeDisplay,
  storedHikeObservations,
  type CaptureRevision,
} from '../src/index';

function point(
  sequence: number,
  overrides: Partial<Omit<TrackObservation, 'altitudeM' | 'verticalAccuracyM'>> & {
    altitudeM?: number | null;
    verticalAccuracyM?: number | null;
  } = {},
): TrackObservation {
  const { altitudeM = 100 + sequence, verticalAccuracyM = 6, ...remaining } = overrides;
  return {
    sequence,
    coordinate: [-74 + sequence * 0.0001, 41],
    recordedAt: new Date(Date.UTC(2026, 8, 16) + sequence * 1000).toISOString(),
    horizontalAccuracyM: 4,
    ...(verticalAccuracyM === null ? {} : { verticalAccuracyM }),
    ...(altitudeM === null ? {} : { altitudeM }),
    segment: 1,
    paused: false,
    ...remaining,
  };
}
function revision(
  points: readonly TrackObservation[],
  overrides: Partial<CaptureRevision> = {},
): CaptureRevision {
  return {
    distanceM: 1234,
    ascentM: 42,
    descentM: 7,
    elevationSource: 'gps',
    calibrationAnchors: [],
    elevationProfile: points.map((p) => ({ sequence: p.sequence, elevationM: 100 + p.sequence })),
    ...overrides,
  };
}

describe('WP-403 captured hikes in the map and elevation graphic', () => {
  it('starts empty and projects filtered elevations without changing durable observations', () => {
    expect(recordedHikeDisplay([])).toMatchObject({
      coordinates: [],
      route: null,
      bounds: null,
      sequence: 0,
      gpsQuality: 'Waiting',
    });
    const observations = [point(1), point(2), point(3, { altitudeM: 8000 }), point(4), point(5)];
    const before = structuredClone(observations);
    const expected = calculateElevationRevision(observations);
    const display = recordedHikeDisplay(observations);
    expect(display.route?.ascentM).toBe(expected.ascentM);
    expect(display.route?.samples.map((p) => p[1])).toEqual(
      observations.map(
        (p) => expected.elevationProfile.find((e) => e.sequence === p.sequence)?.elevationM ?? null,
      ),
    );
    expect(display.route?.maximumElevationM).toBeLessThan(8000);
    expect(observations).toEqual(before);
  });

  it('keeps pause, poor GPS, missing sequences, and segment boundaries out of connecting lines', () => {
    const observations = [
      point(1),
      point(2),
      point(3, { paused: true }),
      point(4, { coordinate: [-73, 41] }),
      point(5, { coordinate: [-73.0001, 41] }),
      point(6, { horizontalAccuracyM: 100 }),
      point(7),
      point(8),
      point(10),
      point(11),
      point(12, { segment: 2 }),
      point(13, { segment: 2 }),
    ];
    const display = recordedHikeDisplay(observations);
    expect(display.breaks).toEqual([2, 4, 6, 8]);
    expect(display.route?.segmentCount).toBe(5);
    expect(display.route?.distanceM).toBeLessThan(100);
    expect(display.recordedSeconds).toBe(7);
    expect(display.coordinates).not.toContain(observations[2]!.coordinate);
    expect(display.coordinates).not.toContain(observations[5]!.coordinate);
  });

  it('matches recorder normalization for duplicates and non-increasing timestamps', () => {
    const first = point(1),
      second = point(2);
    const observations = [
      first,
      point(1, { coordinate: [-73, 41] }),
      second,
      point(3, { recordedAt: second.recordedAt, coordinate: [-72, 41] }),
      point(4),
      point(5),
      point(6, { horizontalAccuracyM: NaN }),
      point(6),
      point(7),
    ];
    const display = recordedHikeDisplay(observations);
    expect(display.coordinates).toEqual([
      first.coordinate,
      second.coordinate,
      point(4).coordinate,
      point(5).coordinate,
      point(6).coordinate,
      point(7).coordinate,
    ]);
    expect(display.breaks).toEqual([2]);
    expect(display.route?.distanceM).toBeLessThan(50);
    expect(display.recordedSeconds).toBe(4);
  });

  it('bounds long captures and retains gaps even when their samples are omitted', () => {
    const observations = Array.from({ length: 5000 }, (_, i) =>
      point(i + 1, {
        coordinate: [-74 + i * 0.000001, 41],
        ...(i === 2499 ? { horizontalAccuracyM: 100 } : {}),
      }),
    );
    const display = recordedHikeDisplay(observations);
    expect(display.coordinates).toHaveLength(2048);
    expect(display.route?.samples).toHaveLength(128);
    expect(display.breaks).toHaveLength(1);
    expect(new Set(display.route?.samples.map((p) => p[4])).size).toBe(2);
    expect(display.coordinates[0]).toEqual(observations[0]!.coordinate);
    expect(display.coordinates.at(-1)).toEqual(observations.at(-1)!.coordinate);
  });

  it('retains missing or invalid altitude gaps before profile simplification', () => {
    const observations = Array.from({ length: 1000 }, (_, i) => point(i + 1));
    for (const invalid of [undefined, NaN, 100001]) {
      const saved = revision(observations, {
        elevationProfile: observations.flatMap((p) =>
          p.sequence === 500
            ? invalid === undefined
              ? []
              : [{ sequence: 500, elevationM: invalid }]
            : [{ sequence: p.sequence, elevationM: 100 + p.sequence }],
        ),
      });
      const display = recordedHikeDisplay(observations, saved);
      expect(display.breaks).toEqual([]);
      expect(new Set(display.route?.samples.map((p) => p[4])).size).toBeGreaterThan(1);
      expect(display.route?.samples.every((p) => p[1] === null || Number.isFinite(p[1]))).toBe(
        true,
      );
    }
  });

  it('identifies unanchored barometer profiles as relative elevation', () => {
    const observations = [
      point(1, { altitudeM: null, verticalAccuracyM: null, relativeAltitudeM: 0 }),
      point(2, { altitudeM: null, verticalAccuracyM: null, relativeAltitudeM: 5 }),
      point(3, { altitudeM: null, verticalAccuracyM: null, relativeAltitudeM: 10 }),
    ];
    expect(recordedHikeDisplay(observations)).toMatchObject({
      elevationConfidence: 'barometer-fused',
      relativeElevation: true,
    });
    expect(
      recordedHikeDisplay(
        observations,
        revision(observations, {
          elevationSource: 'barometer-fused',
          calibrationAnchors: [{ sequence: 1, altitudeM: 101 }],
        }),
      ).relativeElevation,
    ).toBe(false);
    const split = [...observations, point(5), point(6)];
    expect(
      recordedHikeDisplay(
        split,
        revision(split, {
          elevationSource: 'barometer-fused',
          calibrationAnchors: [{ sequence: 1, altitudeM: 101 }],
        }),
      ).relativeElevation,
    ).toBe(true);
  });

  it('shows the captured path when no usable elevation exists', () => {
    const observations = [point(1, { altitudeM: null }), point(2, { altitudeM: null })];
    expect(recordedHikeDisplay(observations)).toMatchObject({
      elevationConfidence: 'insufficient',
      route: {
        elevationSource: 'unavailable',
        samples: [
          [expect.any(Number), null, expect.any(Number), expect.any(Number), expect.any(Number)],
          [expect.any(Number), null, expect.any(Number), expect.any(Number), expect.any(Number)],
        ],
      },
    });
    expect(recordedHikeDisplay(observations).route?.ascentM).toBeUndefined();
  });

  it('durably associates an expected path at start, preserves it through recovery, and replays saved totals', async () => {
    const tracker = new FixtureTrackerAdapter();
    const repository = new InMemoryPrivateRepository();
    const commits: PrivateDatabaseSnapshot[] = [];
    const recorder = new RecorderCoordinator(tracker, repository, {
      commit: async (snapshot) => {
        commits.push(snapshot);
      },
    });
    const activity = await recorder.start(
      'balanced',
      'Expected hike',
      '2026-09-16T00:00:00.000Z',
      'import-local-trail',
    );
    expect(commits[0]?.associations).toEqual([
      {
        id: `hike-plan-${activity.id}`,
        activityId: activity.id,
        catalogTrailId: 'import-local-trail',
        userTrailId: null,
        state: 'resolved',
      },
    ]);
    // Native relative altitude is intentionally absent from immutable activity storage.
    const observations = [
      point(1, { relativeAltitudeM: 0 }),
      point(2, { relativeAltitudeM: 5 }),
      point(3, { relativeAltitudeM: 10 }),
    ];
    tracker.inject({
      sessionId: 'fixture-session',
      mode: 'balanced',
      firstSequence: 1,
      createdAt: observations[2]!.recordedAt,
      observations,
    });
    await recorder.synchronize();
    await recorder.pause();
    await recorder.resume();
    const restoredRepository = new InMemoryPrivateRepository(repository.exportSnapshot());
    const recovered = new RecorderCoordinator(tracker, restoredRepository);
    await recovered.recover('2026-09-16T00:01:00.000Z');
    expect(restoredRepository.exportSnapshot().associations[0]?.catalogTrailId).toBe(
      'import-local-trail',
    );
    const summary = await recovered.finish('2026-09-16T00:02:00.000Z');
    const snapshot = restoredRepository.exportSnapshot();
    const reopened = new InMemoryPrivateRepository(snapshot).listActivities()[0]!;
    const saved = snapshot.revisions.at(-1)!;
    const display = recordedHikeDisplay(storedHikeObservations(reopened), saved);
    expect(display.route).toMatchObject({
      distanceM: summary.distanceM,
      ascentM: summary.ascentM,
      descentM: summary.descentM,
    });
    expect(display.route?.samples.map((p) => p[1])).toEqual(
      saved.elevationProfile.map((p) => p.elevationM),
    );
    expect(display.elevationConfidence).toBe(summary.elevationConfidence);
  });

  it('uses a saved filtered profile and totals rather than recomputing missing native relative altitude', () => {
    const observations = [point(1), point(2), point(3)];
    const saved = revision(observations, {
      elevationSource: 'barometer-fused',
      elevationProfile: [
        { sequence: 1, elevationM: 0 },
        { sequence: 2, elevationM: 8 },
        { sequence: 3, elevationM: 16 },
      ],
    });
    const display = recordedHikeDisplay(observations, saved);
    expect(display.route).toMatchObject({ distanceM: 1234, ascentM: 42, descentM: 7 });
    expect(display.route?.samples.map((p) => p[1])).toEqual([0, 8, 16]);
    expect(display.relativeElevation).toBe(true);
  });

  it('rejects invalid expected-path identities before starting sensors', async () => {
    const tracker = new FixtureTrackerAdapter();
    const start = vi.spyOn(tracker, 'start');
    const recorder = new RecorderCoordinator(tracker, new InMemoryPrivateRepository());
    await expect(recorder.start('balanced', 'Hike', undefined, ' ')).rejects.toThrow(
      'Invalid expected hike reference',
    );
    await expect(recorder.start('balanced', 'Hike', undefined, 'x'.repeat(4097))).rejects.toThrow(
      'Invalid expected hike reference',
    );
    expect(start).not.toHaveBeenCalled();
  });
});

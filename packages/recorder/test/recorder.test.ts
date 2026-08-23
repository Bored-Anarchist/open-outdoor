import { describe, expect, it } from 'vitest';
import { InMemoryPrivateRepository } from '@open-outdoor/storage';
import {
  FixtureTrackerAdapter,
  type TrackObservation,
  type TrackingBatch,
} from '@open-outdoor/tracking';
import {
  ActivityLibrary,
  DestructiveConfirmation,
  RecorderCoordinator,
  auditCriticalControls,
} from '../src/index.js';

function batch(): TrackingBatch {
  const observations: TrackObservation[] = [1, 2].map((sequence) => ({
    sequence,
    coordinate: [-74 + sequence * 0.001, 41],
    recordedAt: `2026-08-23T12:00:0${sequence}.000Z`,
    horizontalAccuracyM: 4,
    altitudeM: 100 + sequence * 5,
    verticalAccuracyM: 6,
    relativeAltitudeM: sequence * 5,
    segment: 1,
    paused: false,
  }));
  return {
    sessionId: 'fixture-session',
    mode: 'balanced',
    firstSequence: 1,
    createdAt: '2026-08-23T12:00:02.000Z',
    observations,
  };
}

describe('WP-105 recorder and activity-library UX model', () => {
  it('records, finishes, and creates a separate reusable user trail', async () => {
    const tracker = new FixtureTrackerAdapter();
    const repository = new InMemoryPrivateRepository();
    const recorder = new RecorderCoordinator(tracker, repository);
    await recorder.start('balanced', 'Fixture hike', '2026-08-23T12:00:00.000Z');
    tracker.inject(batch());
    const summary = await recorder.finish('2026-08-23T12:01:00.000Z');
    const trail = new ActivityLibrary(repository).createTrailFromActivity(summary.activity.id, {
      id: 'trail-1',
      name: 'Reusable trail',
      routeForm: 'point-to-point',
      favorite: false,
      notes: '',
    });
    expect(summary.activity.lifecycle).toBe('finished');
    expect(trail.private).toBe(true);
    expect(repository.exportSnapshot()).toMatchObject({
      activities: [{ id: 'activity-fixture-session' }],
      userTrails: [{ id: 'trail-1' }],
      associations: [{ state: 'resolved' }],
    });
  });

  it('passes critical-control semantics and confirms destructive actions', () => {
    expect(auditCriticalControls()).toEqual([]);
    const confirmation = new DestructiveConfirmation();
    expect(confirmation.confirm(confirmation.request('discard'))).toBe('discard');
  });
});

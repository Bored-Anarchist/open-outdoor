import { describe, expect, it } from 'vitest';
import {
  InMemoryPrivateRepository,
  PrivateStorageError,
  type ImmutableActivitySample,
} from '../src/index.js';

function sample(sequence: number, longitude = -74): ImmutableActivitySample {
  return {
    activityId: 'activity-1',
    sequence,
    coordinate: [longitude, 41],
    recordedAt: `2026-08-23T12:00:${String(sequence).padStart(2, '0')}.000Z`,
    horizontalAccuracyM: 4,
    verticalAccuracyM: 6,
    altitudeM: 100 + sequence,
    pressureKPa: 100,
    paused: false,
  };
}
segment: (1,
  describe('WP-102 private activity and user-trail repository', () => {
    it('keeps observations immutable and duplicate delivery idempotent', () => {
      const repository = new InMemoryPrivateRepository();
      repository.createActivity({
        id: 'activity-1',
        name: 'Fixture hike',
        mode: 'balanced',
        lifecycle: 'recording',
        startedAt: '2026-08-23T12:00:00.000Z',
        finishedAt: null,
      });
      repository.appendSamples('activity-1', [sample(1), sample(1)]);
      expect(repository.listActivities()[0]?.samples).toHaveLength(1);
      expect(() => repository.appendSamples('activity-1', [sample(1, -73)])).toThrow(
        PrivateStorageError,
      );
    });

    it('rolls back a failed transaction without touching private data', () => {
      const repository = new InMemoryPrivateRepository();
      const before = repository.exportSnapshot();
      expect(() =>
        repository.transaction(() => {
          throw new Error('interrupted');
        }),
      ).toThrow('interrupted');
      expect(repository.exportSnapshot()).toEqual(before);
    });

    it('keeps user trails separate from activities', () => {
      const repository = new InMemoryPrivateRepository();
      repository.saveUserTrail({
        id: 'trail-1',
        name: 'Saved route',
        geometry: [
          [-74, 41],
          [-73.99, 41.01],
        ],
        routeForm: 'point-to-point',
        favorite: true,
        private: true,
        notes: '',
        provenance: 'user-recorded',
        revision: 1,
      });
      expect(repository.exportSnapshot()).toMatchObject({
        activities: [],
        userTrails: [{ id: 'trail-1', private: true }],
      });
    });
    it('preserves immutable user-trail revision history', () => {
      const repository = new InMemoryPrivateRepository();
      const base = {
        id: 'trail-history',
        name: 'Saved route',
        geometry: [
          [-74, 41],
          [-73.99, 41.01],
        ] as const,
        routeForm: 'point-to-point' as const,
        favorite: false,
        private: true as const,
        notes: '',
        provenance: 'user-recorded' as const,
      };
      repository.saveUserTrail({ ...base, revision: 1 });
      repository.saveUserTrail({ ...base, name: 'Renamed route', revision: 2 });
      expect(repository.exportSnapshot().userTrails).toHaveLength(2);
      expect(() => repository.saveUserTrail({ ...base, revision: 2 })).toThrow(PrivateStorageError);
    });
  }));

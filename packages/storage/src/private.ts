import { assertCoordinate, type Coordinate } from '@open-outdoor/shared';

export const PRIVATE_SCHEMA_VERSION = 2;
export const PRIVATE_SCHEMA_PREVIOUS_VERSION = 1;

export type ActivityLifecycle = 'recording' | 'paused' | 'finished' | 'recovered';

export interface ImmutableActivitySample {
  readonly activityId: string;
  readonly sequence: number;
  readonly coordinate: Coordinate;
  readonly recordedAt: string;
  readonly horizontalAccuracyM: number;
  readonly verticalAccuracyM: number | null;
  readonly altitudeM: number | null;
  readonly pressureKPa: number | null;
  readonly paused: boolean;
}

export interface RecordedActivity {
  readonly id: string;
  readonly name: string;
  readonly mode: 'balanced' | 'endurance' | 'high-accuracy';
  readonly lifecycle: ActivityLifecycle;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly samples: readonly ImmutableActivitySample[];
  readonly qualityFlags: readonly string[];
}

export interface UserTrail {
  readonly id: string;
  readonly name: string;
  readonly geometry: readonly Coordinate[];
  readonly routeForm: 'loop' | 'out-and-back' | 'point-to-point';
  readonly favorite: boolean;
  readonly private: true;
  readonly notes: string;
  readonly provenance: 'user-recorded' | 'imported';
  readonly revision: number;
}

export interface TrailAssociation {
  readonly id: string;
  readonly activityId: string;
  readonly userTrailId: string | null;
  readonly catalogTrailId: string | null;
  readonly state: 'resolved' | 'review';
}

export interface PrivateOverlay {
  readonly id: string;
  readonly catalogFeatureId: string;
  readonly catalogVersion: string;
  readonly operation: 'hide' | 'same-place' | 'not-duplicate' | 'pin-correction';
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
}

export interface DerivedRevisionRecord {
  readonly id: string;
  readonly activityId: string;
  readonly revision: number;
  readonly algorithmVersion: string;
  readonly distanceM: number;
  readonly ascentM: number;
  readonly descentM: number;
  readonly uncertaintyM: number;
  readonly qualityFlags: readonly string[];
  readonly createdAt: string;
}

export interface PrivateDatabaseSnapshot {
  readonly schemaVersion: number;
  readonly activities: readonly RecordedActivity[];
  readonly userTrails: readonly UserTrail[];
  readonly associations: readonly TrailAssociation[];
  readonly overlays: readonly PrivateOverlay[];
  readonly revisions: readonly DerivedRevisionRecord[];
}

export const privateSchemaMigrations: Readonly<Record<number, readonly string[]>> = {
  1: [
    'CREATE TABLE recorded_activity (id TEXT PRIMARY KEY, name TEXT NOT NULL, mode TEXT NOT NULL, lifecycle TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT)',
    'CREATE TABLE activity_sample (activity_id TEXT NOT NULL, sequence INTEGER NOT NULL, longitude REAL NOT NULL, latitude REAL NOT NULL, recorded_at TEXT NOT NULL, horizontal_accuracy_m REAL NOT NULL, altitude_m REAL, pressure_kpa REAL, paused INTEGER NOT NULL, PRIMARY KEY(activity_id, sequence), FOREIGN KEY(activity_id) REFERENCES recorded_activity(id))',
    'CREATE TABLE user_trail (id TEXT PRIMARY KEY, name TEXT NOT NULL, geometry_json TEXT NOT NULL, route_form TEXT NOT NULL, favorite INTEGER NOT NULL, notes TEXT NOT NULL, provenance TEXT NOT NULL, revision INTEGER NOT NULL)',
    'CREATE TABLE trail_association (id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, user_trail_id TEXT, catalog_trail_id TEXT, state TEXT NOT NULL)',
    'CREATE TABLE private_overlay (id TEXT PRIMARY KEY, catalog_feature_id TEXT NOT NULL, catalog_version TEXT NOT NULL, operation TEXT NOT NULL, payload_json TEXT NOT NULL)',
  ],
  2: [
    'ALTER TABLE activity_sample ADD COLUMN vertical_accuracy_m REAL',
    'CREATE TABLE derived_revision (id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, revision INTEGER NOT NULL, algorithm_version TEXT NOT NULL, distance_m REAL NOT NULL, ascent_m REAL NOT NULL, descent_m REAL NOT NULL, uncertainty_m REAL NOT NULL, quality_flags_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(activity_id, revision))',
  ],
};

function validInstant(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function requireId(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new PrivateStorageError('VALIDATION_FAILED', `${label} is invalid`);
  }
}

function cloneSnapshot(snapshot: PrivateDatabaseSnapshot): PrivateDatabaseSnapshot {
  return structuredClone(snapshot);
}

export class PrivateStorageError extends Error {
  constructor(
    readonly code:
      | 'ACTIVITY_NOT_FOUND'
      | 'DUPLICATE_CONFLICT'
      | 'IMMUTABLE_SAMPLE'
      | 'SCHEMA_INCOMPATIBLE'
      | 'VALIDATION_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'PrivateStorageError';
  }
}

export function migratePrivateSnapshot(snapshot: PrivateDatabaseSnapshot): PrivateDatabaseSnapshot {
  if (
    !Number.isSafeInteger(snapshot.schemaVersion) ||
    snapshot.schemaVersion < PRIVATE_SCHEMA_PREVIOUS_VERSION ||
    snapshot.schemaVersion > PRIVATE_SCHEMA_VERSION
  ) {
    throw new PrivateStorageError(
      'SCHEMA_INCOMPATIBLE',
      'private schema is outside the current-plus-previous compatibility window',
    );
  }
  const migrated = cloneSnapshot(snapshot);
  return {
    ...migrated,
    schemaVersion: PRIVATE_SCHEMA_VERSION,
    revisions: migrated.revisions ?? [],
  };
}

const emptySnapshot: PrivateDatabaseSnapshot = {
  schemaVersion: PRIVATE_SCHEMA_VERSION,
  activities: [],
  userTrails: [],
  associations: [],
  overlays: [],
  revisions: [],
};

function samplesEqual(left: ImmutableActivitySample, right: ImmutableActivitySample): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class InMemoryPrivateRepository {
  private data: PrivateDatabaseSnapshot;

  constructor(snapshot: PrivateDatabaseSnapshot = emptySnapshot) {
    this.data = migratePrivateSnapshot(snapshot);
  }

  exportSnapshot(): PrivateDatabaseSnapshot {
    return cloneSnapshot(this.data);
  }

  transaction(operation: (draft: PrivateDatabaseSnapshot) => PrivateDatabaseSnapshot): void {
    const before = this.exportSnapshot();
    try {
      this.data = migratePrivateSnapshot(operation(before));
    } catch (error) {
      this.data = before;
      throw error;
    }
  }

  createActivity(activity: Omit<RecordedActivity, 'samples' | 'qualityFlags'>): RecordedActivity {
    requireId(activity.id, 'activity id');
    if (!validInstant(activity.startedAt) || activity.finishedAt !== null) {
      throw new PrivateStorageError('VALIDATION_FAILED', 'new activity timestamps are invalid');
    }
    const created: RecordedActivity = { ...activity, samples: [], qualityFlags: [] };
    this.transaction((draft) => {
      if (draft.activities.some(({ id }) => id === created.id)) {
        throw new PrivateStorageError('DUPLICATE_CONFLICT', 'activity id already exists');
      }
      return { ...draft, activities: [...draft.activities, created] };
    });
    return structuredClone(created);
  }

  appendSamples(activityId: string, samples: readonly ImmutableActivitySample[]): RecordedActivity {
    const activity = this.data.activities.find(({ id }) => id === activityId);
    if (!activity) throw new PrivateStorageError('ACTIVITY_NOT_FOUND', 'activity does not exist');
    const existing = new Map(activity.samples.map((sample) => [sample.sequence, sample]));
    for (const sample of samples) {
      if (
        sample.activityId !== activityId ||
        !Number.isSafeInteger(sample.sequence) ||
        sample.sequence < 1 ||
        !validInstant(sample.recordedAt) ||
        !Number.isFinite(sample.horizontalAccuracyM) ||
        sample.horizontalAccuracyM < 0
      ) {
        throw new PrivateStorageError('VALIDATION_FAILED', 'activity sample is invalid');
      }
      assertCoordinate(sample.coordinate);
      const prior = existing.get(sample.sequence);
      if (prior && !samplesEqual(prior, sample)) {
        throw new PrivateStorageError(
          'IMMUTABLE_SAMPLE',
          `sequence ${sample.sequence} cannot be rewritten`,
        );
      }
      existing.set(sample.sequence, structuredClone(sample));
    }
    const updated: RecordedActivity = {
      ...activity,
      samples: [...existing.values()].sort((left, right) => left.sequence - right.sequence),
    };
    this.transaction((draft) => ({
      ...draft,
      activities: draft.activities.map((candidate) =>
        candidate.id === activityId ? updated : candidate,
      ),
    }));
    return structuredClone(updated);
  }

  updateActivityLifecycle(
    activityId: string,
    lifecycle: ActivityLifecycle,
    finishedAt: string | null = null,
    qualityFlags: readonly string[] = [],
  ): RecordedActivity {
    const activity = this.data.activities.find(({ id }) => id === activityId);
    if (!activity) throw new PrivateStorageError('ACTIVITY_NOT_FOUND', 'activity does not exist');
    if (finishedAt !== null && !validInstant(finishedAt)) {
      throw new PrivateStorageError('VALIDATION_FAILED', 'finish timestamp is invalid');
    }
    const updated = { ...activity, lifecycle, finishedAt, qualityFlags: [...qualityFlags] };
    this.transaction((draft) => ({
      ...draft,
      activities: draft.activities.map((candidate) =>
        candidate.id === activityId ? updated : candidate,
      ),
    }));
    return structuredClone(updated);
  }

  listActivities(): readonly RecordedActivity[] {
    return structuredClone(this.data.activities);
  }

  saveUserTrail(trail: UserTrail): UserTrail {
    requireId(trail.id, 'user trail id');
    if (trail.geometry.length < 2) {
      throw new PrivateStorageError('VALIDATION_FAILED', 'user trail needs at least two points');
    }
    trail.geometry.forEach(assertCoordinate);
    this.transaction((draft) => ({
      ...draft,
      userTrails: [...draft.userTrails.filter(({ id }) => id !== trail.id), structuredClone(trail)],
    }));
    return structuredClone(trail);
  }

  saveAssociation(association: TrailAssociation): TrailAssociation {
    requireId(association.id, 'association id');
    if (
      association.userTrailId === null &&
      association.catalogTrailId === null &&
      association.state !== 'review'
    ) {
      throw new PrivateStorageError(
        'VALIDATION_FAILED',
        'unresolved association must remain in review',
      );
    }
    this.transaction((draft) => ({
      ...draft,
      associations: [
        ...draft.associations.filter(({ id }) => id !== association.id),
        structuredClone(association),
      ],
    }));
    return structuredClone(association);
  }

  saveOverlay(overlay: PrivateOverlay): PrivateOverlay {
    requireId(overlay.id, 'overlay id');
    this.transaction((draft) => ({
      ...draft,
      overlays: [...draft.overlays.filter(({ id }) => id !== overlay.id), structuredClone(overlay)],
    }));
    return structuredClone(overlay);
  }

  saveDerivedRevision(revision: DerivedRevisionRecord): DerivedRevisionRecord {
    requireId(revision.id, 'revision id');
    if (
      this.data.revisions.some(
        (candidate) =>
          candidate.id === revision.id ||
          (candidate.activityId === revision.activityId &&
            candidate.revision === revision.revision),
      )
    ) {
      throw new PrivateStorageError('DUPLICATE_CONFLICT', 'derived revision already exists');
    }
    this.transaction((draft) => ({ ...draft, revisions: [...draft.revisions, revision] }));
    return structuredClone(revision);
  }
}

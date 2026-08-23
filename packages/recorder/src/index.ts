import {
  InMemoryPrivateRepository,
  type RecordedActivity,
  type UserTrail,
} from '@open-outdoor/storage';
import {
  RecorderStateMachine,
  calculateDistanceRevision,
  calculateElevationRevision,
  replayTrackingBatches,
  type ProductionTrackerAdapter,
  type TrackingMode,
} from '@open-outdoor/tracking';

export interface AccessibleControl {
  readonly id: 'start' | 'pause' | 'resume' | 'finish' | 'recover' | 'discard';
  readonly label: string;
  readonly hint: string;
  readonly minimumTargetPoints: 44;
  readonly destructive: boolean;
  readonly requiresConfirmation: boolean;
}

export const criticalRecorderControls: readonly AccessibleControl[] = [
  {
    id: 'start',
    label: 'Start recording',
    hint: 'Starts offline location and elevation recording',
    minimumTargetPoints: 44,
    destructive: false,
    requiresConfirmation: false,
  },
  {
    id: 'pause',
    label: 'Pause recording',
    hint: 'Stops adding distance and elevation until resumed',
    minimumTargetPoints: 44,
    destructive: false,
    requiresConfirmation: false,
  },
  {
    id: 'resume',
    label: 'Resume recording',
    hint: 'Starts a new recorded segment',
    minimumTargetPoints: 44,
    destructive: false,
    requiresConfirmation: false,
  },
  {
    id: 'finish',
    label: 'Finish and save recording',
    hint: 'Stops sensors and saves this activity',
    minimumTargetPoints: 44,
    destructive: false,
    requiresConfirmation: false,
  },
  {
    id: 'recover',
    label: 'Recover interrupted recording',
    hint: 'Continues from the last durable checkpoint',
    minimumTargetPoints: 44,
    destructive: false,
    requiresConfirmation: false,
  },
  {
    id: 'discard',
    label: 'Discard interrupted recording',
    hint: 'Permanently discards the recoverable recording',
    minimumTargetPoints: 44,
    destructive: true,
    requiresConfirmation: true,
  },
];

export function auditCriticalControls(
  controls: readonly AccessibleControl[] = criticalRecorderControls,
): readonly string[] {
  const defects: string[] = [];
  for (const control of controls) {
    if (control.label.trim().length === 0) defects.push(`${control.id}: missing label`);
    if (control.hint.trim().length === 0) defects.push(`${control.id}: missing hint`);
    if (control.minimumTargetPoints < 44) defects.push(`${control.id}: target below 44 points`);
    if (control.destructive && !control.requiresConfirmation) {
      defects.push(`${control.id}: destructive action lacks confirmation`);
    }
  }
  return defects;
}

export interface FinishedActivitySummary {
  readonly activity: RecordedActivity;
  readonly distanceM: number;
  readonly ascentM: number;
  readonly descentM: number;
  readonly elevationConfidence: 'barometer' | 'gps' | 'insufficient';
}

function activityId(sessionId: string): string {
  return `activity-${sessionId}`;
}

export class RecorderCoordinator {
  readonly stateMachine = new RecorderStateMachine();

  constructor(
    readonly tracker: ProductionTrackerAdapter,
    readonly repository: InMemoryPrivateRepository,
  ) {}

  async start(
    mode: TrackingMode,
    name = 'Recorded hike',
    startedAt = new Date().toISOString(),
  ): Promise<RecordedActivity> {
    const { sessionId } = await this.tracker.start(mode);
    this.stateMachine.start(sessionId, mode, startedAt);
    return this.repository.createActivity({
      id: activityId(sessionId),
      name,
      mode,
      lifecycle: 'recording',
      startedAt,
      finishedAt: null,
    });
  }

  async pause(recordedAt = new Date().toISOString()): Promise<void> {
    await this.tracker.pause();
    this.stateMachine.pause(recordedAt);
    this.repository.updateActivityLifecycle(activityId(this.activeSessionId()), 'paused');
  }

  async resume(recordedAt = new Date().toISOString()): Promise<void> {
    await this.tracker.resume();
    this.stateMachine.resume(recordedAt);
    this.repository.updateActivityLifecycle(activityId(this.activeSessionId()), 'recording');
  }

  private activeSessionId(): string {
    const state = this.stateMachine.state;
    if (state.kind !== 'recording' && state.kind !== 'paused' && state.kind !== 'recoverable') {
      throw new Error('recorder has no active session');
    }
    return state.sessionId;
  }

  async synchronize(recordedAt = new Date().toISOString()): Promise<number> {
    const state = this.stateMachine.state;
    if (state.kind !== 'recording' && state.kind !== 'paused') {
      throw new Error('recorder is not synchronizable');
    }
    const replay = replayTrackingBatches(
      await this.tracker.readPendingBatches(),
      state.highestCommittedSequence,
    );
    if (replay.gaps.length > 0) return state.highestCommittedSequence;
    this.stateMachine.commit(replay.observations, recordedAt);
    this.repository.appendSamples(
      activityId(state.sessionId),
      replay.observations.map((observation) => ({
        activityId: activityId(state.sessionId),
        sequence: observation.sequence,
        coordinate: observation.coordinate,
        recordedAt: observation.recordedAt,
        horizontalAccuracyM: observation.horizontalAccuracyM,
        verticalAccuracyM: observation.verticalAccuracyM ?? null,
        altitudeM: observation.altitudeM ?? null,
        pressureKPa: observation.pressureKPa ?? null,
        paused: observation.paused ?? state.kind === 'paused',
      })),
    );
    await this.tracker.acknowledge(replay.highestCommittedSequence);
    return replay.highestCommittedSequence;
  }

  async finish(finishedAt = new Date().toISOString()): Promise<FinishedActivitySummary> {
    await this.synchronize(finishedAt);
    const sessionId = this.activeSessionId();
    await this.tracker.finish();
    this.stateMachine.finish(finishedAt);
    const observations = this.stateMachine.committedObservations;
    const distance = calculateDistanceRevision(observations);
    const elevation = calculateElevationRevision(observations);
    const activity = this.repository.updateActivityLifecycle(
      activityId(sessionId),
      'finished',
      finishedAt,
      [...distance.qualityFlags, ...elevation.qualityFlags],
    );
    this.repository.saveDerivedRevision({
      id: `revision-${sessionId}-1`,
      activityId: activity.id,
      revision: 1,
      algorithmVersion: `${distance.algorithmVersion}+${elevation.algorithmVersion}`,
      distanceM: distance.distanceM,
      ascentM: elevation.ascentM,
      descentM: elevation.descentM,
      uncertaintyM: Math.max(distance.uncertaintyM, elevation.uncertaintyM),
      qualityFlags: activity.qualityFlags,
      createdAt: finishedAt,
    });
    return {
      activity,
      distanceM: distance.distanceM,
      ascentM: elevation.ascentM,
      descentM: elevation.descentM,
      elevationConfidence: elevation.source,
    };
  }
}

export class ActivityLibrary {
  constructor(readonly repository: InMemoryPrivateRepository) {}

  list(): readonly RecordedActivity[] {
    return this.repository
      .listActivities()
      .slice()
      .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
  }

  createTrailFromActivity(
    activityIdValue: string,
    input: Omit<UserTrail, 'geometry' | 'private' | 'provenance' | 'revision'>,
  ): UserTrail {
    const activity = this.list().find(({ id }) => id === activityIdValue);
    if (!activity) throw new Error('activity does not exist');
    const geometry = activity.samples
      .filter(({ paused }) => !paused)
      .map(({ coordinate }) => coordinate);
    const trail: UserTrail = {
      ...input,
      geometry,
      private: true,
      provenance: 'user-recorded',
      revision: 1,
    };
    this.repository.saveUserTrail(trail);
    this.repository.saveAssociation({
      id: `association-${activity.id}-${trail.id}`,
      activityId: activity.id,
      userTrailId: trail.id,
      catalogTrailId: null,
      state: 'resolved',
    });
    return trail;
  }
}

export class DestructiveConfirmation {
  private pending: string | null = null;

  request(actionId: string): string {
    this.pending = actionId;
    return `confirm:${actionId}`;
  }

  confirm(token: string): string {
    const expected = this.pending === null ? null : `confirm:${this.pending}`;
    if (token !== expected || this.pending === null)
      throw new Error('confirmation token is invalid');
    const action = this.pending;
    this.pending = null;
    return action;
  }

  cancel(): void {
    this.pending = null;
  }
}

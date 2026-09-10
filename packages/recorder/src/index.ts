import {
  type PrivateDatabaseSnapshot,
  type PrivateRepository,
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
  readonly elevationConfidence: 'barometer-fused' | 'gps' | 'insufficient';
}

function activityId(sessionId: string): string {
  return `activity-${sessionId}`;
}
export interface RecorderPersistence {
  readonly commit: (
    snapshot: PrivateDatabaseSnapshot,
    checkpoint?: { readonly sessionId: string; readonly highestSequence: number },
  ) => Promise<void>;
}

export class RecorderCoordinator {
  readonly stateMachine = new RecorderStateMachine();
  private operations: Promise<void> = Promise.resolve();
  private synchronizationDirty = false;
  private pendingAcknowledgement: number | null = null;
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation);
    this.operations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  start(
    ...args: Parameters<RecorderCoordinator['startUnlocked']>
  ): ReturnType<RecorderCoordinator['startUnlocked']> {
    return this.serialize(() => this.startUnlocked(...args));
  }
  pause(
    ...args: Parameters<RecorderCoordinator['pauseUnlocked']>
  ): ReturnType<RecorderCoordinator['pauseUnlocked']> {
    return this.serialize(() => this.pauseUnlocked(...args));
  }
  resume(
    ...args: Parameters<RecorderCoordinator['resumeUnlocked']>
  ): ReturnType<RecorderCoordinator['resumeUnlocked']> {
    return this.serialize(() => this.resumeUnlocked(...args));
  }
  recover(
    ...args: Parameters<RecorderCoordinator['recoverUnlocked']>
  ): ReturnType<RecorderCoordinator['recoverUnlocked']> {
    return this.serialize(() => this.recoverUnlocked(...args));
  }
  synchronize(
    ...args: Parameters<RecorderCoordinator['synchronizeUnlocked']>
  ): ReturnType<RecorderCoordinator['synchronizeUnlocked']> {
    return this.serialize(() => this.synchronizeUnlocked(...args));
  }
  finish(
    ...args: Parameters<RecorderCoordinator['finishUnlocked']>
  ): ReturnType<RecorderCoordinator['finishUnlocked']> {
    return this.serialize(() => this.finishUnlocked(...args));
  }

  constructor(
    readonly tracker: ProductionTrackerAdapter,
    readonly repository: PrivateRepository,
    readonly persistence?: RecorderPersistence,
  ) {}

  private async persist(sessionId?: string, highestSequence?: number): Promise<void> {
    await this.persistence?.commit(
      this.repository.exportSnapshot(),
      sessionId === undefined || highestSequence === undefined
        ? undefined
        : { sessionId, highestSequence },
    );
  }

  private async startUnlocked(
    mode: TrackingMode,
    name = 'Recorded hike',
    startedAt = new Date().toISOString(),
  ): Promise<RecordedActivity> {
    const { sessionId } = await this.tracker.start(mode);
    this.stateMachine.start(sessionId, mode, startedAt);
    const activity = this.repository.createActivity({
      id: activityId(sessionId),
      name,
      mode,
      lifecycle: 'recording',
      startedAt,
      finishedAt: null,
    });
    await this.persist(sessionId, 0);
    return activity;
  }

  private async pauseUnlocked(recordedAt = new Date().toISOString()): Promise<void> {
    await this.tracker.pause();
    this.stateMachine.pause(recordedAt);
    this.repository.updateActivityLifecycle(activityId(this.activeSessionId()), 'paused');
    await this.persist(
      this.activeSessionId(),
      this.stateMachine.state.kind === 'paused'
        ? this.stateMachine.state.highestCommittedSequence
        : 0,
    );
  }

  private async resumeUnlocked(recordedAt = new Date().toISOString()): Promise<void> {
    await this.tracker.resume();
    this.stateMachine.resume(recordedAt);
    this.repository.updateActivityLifecycle(activityId(this.activeSessionId()), 'recording');
    await this.persist(
      this.activeSessionId(),
      this.stateMachine.state.kind === 'recording'
        ? this.stateMachine.state.highestCommittedSequence
        : 0,
    );
  }

  private async recoverUnlocked(
    recordedAt = new Date().toISOString(),
    reason: 'process-termination' | 'permission-loss' | 'native-error' = 'process-termination',
  ): Promise<RecordedActivity | null> {
    const priorState = this.stateMachine.state;
    if (priorState.kind === 'recording' || priorState.kind === 'paused') {
      this.stateMachine.interrupt(reason);
    }
    const checkpoint = await this.tracker.recover();
    if (checkpoint === null) return null;
    const id = activityId(checkpoint.sessionId);
    const existing = this.repository.listActivities().find((activity) => activity.id === id);
    const interruptedState = this.stateMachine.state;
    const continuingInProcess =
      interruptedState.kind === 'recoverable' &&
      interruptedState.sessionId === checkpoint.sessionId;
    if (continuingInProcess) {
      this.stateMachine.recover(recordedAt);
    } else {
      this.stateMachine.start(checkpoint.sessionId, checkpoint.mode, recordedAt);
    }
    if (existing !== undefined) {
      if (!continuingInProcess) {
        this.stateMachine.commit(
          existing.samples.map((sample) => ({
            segment: sample.segment,
            sequence: sample.sequence,
            coordinate: sample.coordinate,
            recordedAt: sample.recordedAt,
            horizontalAccuracyM: sample.horizontalAccuracyM,
            ...(sample.verticalAccuracyM === null
              ? {}
              : { verticalAccuracyM: sample.verticalAccuracyM }),
            ...(sample.altitudeM === null ? {} : { altitudeM: sample.altitudeM }),
            ...(sample.pressureKPa === null ? {} : { pressureKPa: sample.pressureKPa }),
            paused: sample.paused,
          })),
          recordedAt,
        );
      }
      this.repository.updateActivityLifecycle(id, 'recovered');
    } else {
      this.repository.createActivity({
        id,
        name: 'Recovered hike',
        mode: checkpoint.mode,
        lifecycle: 'recovered',
        startedAt: recordedAt,
        finishedAt: null,
      });
    }
    this.synchronizationDirty = true;
    await this.synchronizeUnlocked(recordedAt);
    return this.repository.listActivities().find((activity) => activity.id === id) ?? null;
  }
  private activeSessionId(): string {
    const state = this.stateMachine.state;
    if (state.kind !== 'recording' && state.kind !== 'paused' && state.kind !== 'recoverable') {
      throw new Error('recorder has no active session');
    }
    return state.sessionId;
  }

  private async synchronizeUnlocked(recordedAt = new Date().toISOString()): Promise<number> {
    const state = this.stateMachine.state;
    if (state.kind !== 'recording' && state.kind !== 'paused') {
      throw new Error('recorder is not synchronizable');
    }
    const replay = replayTrackingBatches(
      await this.tracker.readPendingBatches(),
      state.highestCommittedSequence,
    );
    if (replay.gaps.length > 0) return state.highestCommittedSequence;
    if (replay.observations.length === 0 && !this.synchronizationDirty) {
      if (this.pendingAcknowledgement !== null) {
        await this.tracker.acknowledge(this.pendingAcknowledgement);
        this.pendingAcknowledgement = null;
      }
      return state.highestCommittedSequence;
    }
    this.synchronizationDirty = true;
    this.stateMachine.commit(replay.observations, recordedAt);
    this.repository.appendSamples(
      activityId(state.sessionId),
      replay.observations.map((observation) => ({
        activityId: activityId(state.sessionId),
        segment: observation.segment ?? 1,
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
    await this.persist(state.sessionId, replay.highestCommittedSequence);
    this.synchronizationDirty = false;
    this.pendingAcknowledgement = replay.highestCommittedSequence;
    await this.tracker.acknowledge(replay.highestCommittedSequence);
    this.pendingAcknowledgement = null;
    return replay.highestCommittedSequence;
  }

  private async finishUnlocked(
    finishedAt = new Date().toISOString(),
  ): Promise<FinishedActivitySummary> {
    for (let batch = 0; batch < 10_000; batch += 1) {
      const state = this.stateMachine.state;
      const before =
        state.kind === 'recording' || state.kind === 'paused' ? state.highestCommittedSequence : 0;
      const after = await this.synchronizeUnlocked(finishedAt);
      if (after === before) break;
      if (batch === 9_999) throw new Error('tracking spool exceeded the bounded drain limit');
    }
    const sessionId = this.activeSessionId();
    const stopped = await this.tracker.finish();
    for (let batch = 0; batch < 10_000; batch += 1) {
      const state = this.stateMachine.state;
      const committed =
        state.kind === 'recording' || state.kind === 'paused' ? state.highestCommittedSequence : 0;
      if (committed === stopped.finalSequence) break;
      const after = await this.synchronizeUnlocked(finishedAt);
      if (after === committed || batch === 9_999) {
        throw new Error('final native tracking sequence was not durably imported');
      }
    }
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
      elevationSource: elevation.source,
      calibrationAnchors: elevation.calibrationAnchors,
      filterParameters: elevation.filterParameters,
      elevationProfile: elevation.elevationProfile,
      inputFingerprint: `${sessionId}:${observations.length}:${observations.at(-1)?.sequence ?? 0}`,
    });
    const finalSequence =
      this.stateMachine.state.kind === 'finished' ? this.stateMachine.state.finalSequence : 0;
    await this.persist(sessionId, finalSequence);
    await this.tracker.finalize?.(sessionId, finalSequence);
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
  constructor(readonly repository: PrivateRepository) {}

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

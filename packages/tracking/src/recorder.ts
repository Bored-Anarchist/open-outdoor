import type { TrackObservation, TrackingBatch, TrackingMode } from './index';

export type RecorderState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'recording' | 'paused';
      readonly sessionId: string;
      readonly mode: TrackingMode;
      readonly highestCommittedSequence: number;
      readonly checkpointAt: string;
    }
  | {
      readonly kind: 'recoverable';
      readonly sessionId: string;
      readonly mode: TrackingMode;
      readonly highestCommittedSequence: number;
      readonly reason: 'process-termination' | 'permission-loss' | 'native-error';
    }
  | {
      readonly kind: 'finished';
      readonly sessionId: string;
      readonly finalSequence: number;
      readonly finishedAt: string;
    };

export interface TrackerCheckpoint {
  readonly sessionId: string;
  readonly mode: TrackingMode;
  readonly state: 'recording' | 'paused';
  readonly highestCommittedSequence: number;
  readonly recordedAt: string;
}

export interface ProductionTrackerAdapter {
  readonly capability: 'native-tracker' | 'fixture-tracker';
  readonly requestPermission: () => Promise<void>;
  readonly start: (mode: TrackingMode) => Promise<{ readonly sessionId: string }>;
  readonly pause: () => Promise<TrackerCheckpoint>;
  readonly resume: () => Promise<TrackerCheckpoint>;
  readonly finish: () => Promise<{ readonly sessionId: string; readonly finalSequence: number }>;
  readonly recover: () => Promise<TrackerCheckpoint | null>;
  readonly readPendingBatches: () => Promise<readonly TrackingBatch[]>;
  readonly acknowledge: (highestSequence: number) => Promise<void>;
  readonly finalize?: (sessionId: string, highestSequence: number) => Promise<void>;
}

export class RecorderTransitionError extends Error {
  constructor(
    readonly from: RecorderState['kind'],
    readonly event: string,
  ) {
    super(`cannot ${event} while recorder is ${from}`);
    this.name = 'RecorderTransitionError';
  }
}

export class RecorderStateMachine {
  private current: RecorderState = { kind: 'idle' };
  private observations = new Map<number, TrackObservation>();

  get state(): RecorderState {
    return { ...this.current };
  }

  get committedObservations(): readonly TrackObservation[] {
    return structuredClone(
      [...this.observations.values()].sort((left, right) => left.sequence - right.sequence),
    );
  }

  start(sessionId: string, mode: TrackingMode, checkpointAt: string): RecorderState {
    if (this.current.kind !== 'idle' && this.current.kind !== 'finished') {
      throw new RecorderTransitionError(this.current.kind, 'start');
    }
    this.observations = new Map();
    this.current = {
      kind: 'recording',
      sessionId,
      mode,
      highestCommittedSequence: 0,
      checkpointAt,
    };
    return this.state;
  }

  pause(checkpointAt: string): RecorderState {
    if (this.current.kind !== 'recording') {
      throw new RecorderTransitionError(this.current.kind, 'pause');
    }
    this.current = { ...this.current, kind: 'paused', checkpointAt };
    return this.state;
  }

  resume(checkpointAt: string): RecorderState {
    if (this.current.kind !== 'paused') {
      throw new RecorderTransitionError(this.current.kind, 'resume');
    }
    this.current = { ...this.current, kind: 'recording', checkpointAt };
    return this.state;
  }

  commit(observations: readonly TrackObservation[], checkpointAt: string): RecorderState {
    if (this.current.kind !== 'recording' && this.current.kind !== 'paused') {
      throw new RecorderTransitionError(this.current.kind, 'commit');
    }
    // Validate the entire batch before changing committed state, including duplicate
    // sequences within this batch. A rejected batch must be safe to retry.
    const staged = new Map<number, TrackObservation>();
    let highest = this.current.highestCommittedSequence;
    for (const observation of observations) {
      if (!Number.isSafeInteger(observation.sequence) || observation.sequence < 1)
        throw new RangeError('observation sequence must be a positive safe integer');
      const prior = staged.get(observation.sequence) ?? this.observations.get(observation.sequence);
      if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(observation)) {
        throw new Error(`conflicting observation ${observation.sequence}`);
      }
      staged.set(observation.sequence, structuredClone(observation));
      highest = Math.max(highest, observation.sequence);
    }
    for (const [sequence, observation] of staged) this.observations.set(sequence, observation);
    this.current = {
      ...this.current,
      highestCommittedSequence: highest,
      checkpointAt,
    };
    return this.state;
  }

  interrupt(reason: Extract<RecorderState, { kind: 'recoverable' }>['reason']): RecorderState {
    if (this.current.kind !== 'recording' && this.current.kind !== 'paused') {
      throw new RecorderTransitionError(this.current.kind, 'interrupt');
    }
    this.current = {
      kind: 'recoverable',
      sessionId: this.current.sessionId,
      mode: this.current.mode,
      highestCommittedSequence: this.current.highestCommittedSequence,
      reason,
    };
    return this.state;
  }

  recover(checkpointAt: string): RecorderState {
    if (this.current.kind !== 'recoverable') {
      throw new RecorderTransitionError(this.current.kind, 'recover');
    }
    this.current = {
      kind: 'recording',
      sessionId: this.current.sessionId,
      mode: this.current.mode,
      highestCommittedSequence: this.current.highestCommittedSequence,
      checkpointAt,
    };
    return this.state;
  }

  finish(finishedAt: string): RecorderState {
    if (this.current.kind !== 'recording' && this.current.kind !== 'paused') {
      throw new RecorderTransitionError(this.current.kind, 'finish');
    }
    this.current = {
      kind: 'finished',
      sessionId: this.current.sessionId,
      finalSequence: this.current.highestCommittedSequence,
      finishedAt,
    };
    return this.state;
  }
}

export class FixtureTrackerAdapter implements ProductionTrackerAdapter {
  readonly capability = 'fixture-tracker';
  private sessionId: string | null = null;
  private mode: TrackingMode = 'balanced';
  private paused = false;
  private batches: TrackingBatch[] = [];
  private acknowledged = 0;

  async requestPermission(): Promise<void> {}

  async start(mode: TrackingMode): Promise<{ readonly sessionId: string }> {
    if (this.sessionId !== null) throw new Error('fixture tracker is already active');
    this.mode = mode;
    this.sessionId = 'fixture-session';
    this.paused = false;
    this.batches = [];
    this.acknowledged = 0;
    return { sessionId: this.sessionId };
  }

  private checkpoint(): TrackerCheckpoint {
    if (this.sessionId === null) throw new Error('fixture tracker is not active');
    return {
      sessionId: this.sessionId,
      mode: this.mode,
      state: this.paused ? 'paused' : 'recording',
      highestCommittedSequence: this.acknowledged,
      recordedAt: new Date().toISOString(),
    };
  }

  async pause(): Promise<TrackerCheckpoint> {
    this.paused = true;
    return this.checkpoint();
  }

  async resume(): Promise<TrackerCheckpoint> {
    this.paused = false;
    return this.checkpoint();
  }

  async finish(): Promise<{ readonly sessionId: string; readonly finalSequence: number }> {
    const checkpoint = this.checkpoint();
    const finalSequence = this.batches.reduce(
      (highest, batch) => Math.max(highest, batch.observations.at(-1)?.sequence ?? 0),
      checkpoint.highestCommittedSequence,
    );
    this.sessionId = null;
    return { sessionId: checkpoint.sessionId, finalSequence };
  }

  async recover(): Promise<TrackerCheckpoint | null> {
    return this.sessionId === null ? null : this.checkpoint();
  }

  async readPendingBatches(): Promise<readonly TrackingBatch[]> {
    return this.batches.filter(
      (batch) =>
        batch.observations.at(-1)?.sequence !== undefined &&
        (batch.observations.at(-1)?.sequence ?? 0) > this.acknowledged,
    );
  }

  async acknowledge(highestSequence: number): Promise<void> {
    if (!Number.isSafeInteger(highestSequence) || highestSequence < this.acknowledged) {
      throw new RangeError('tracking acknowledgement cannot move backward');
    }
    this.acknowledged = highestSequence;
  }

  async finalize(): Promise<void> {}

  inject(batch: TrackingBatch): void {
    this.batches.push(batch);
  }
}

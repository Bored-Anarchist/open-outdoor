import {
  ActivityLibrary,
  RecorderCoordinator,
  type RecorderPersistence,
} from '@open-outdoor/recorder';
import { FixtureMapAdapter } from '@open-outdoor/map';
import {
  InMemoryPrivateRepository,
  migratePrivateSnapshot,
  type PrivateDatabaseSnapshot,
} from '@open-outdoor/storage';
import type {
  ProductionTrackerAdapter,
  TrackerCheckpoint,
  TrackingBatch,
  TrackingMode,
} from '@open-outdoor/tracking';
import { nativeSpikes, type NativeTrackingInspection } from './nativeSpikes';

function checkpoint(
  inspection: NativeTrackingInspection,
  highestCommittedSequence: number,
): TrackerCheckpoint {
  return {
    sessionId: inspection.sessionId,
    mode: inspection.mode,
    state: 'recording',
    highestCommittedSequence,
    recordedAt: new Date().toISOString(),
  };
}

export class NativeTrackerAdapter implements ProductionTrackerAdapter {
  readonly capability = 'native-tracker';
  private sessionId: string | null = null;
  private mode: TrackingMode = 'balanced';
  private acknowledged = 0;
  private paused = false;

  async requestPermission(): Promise<void> {
    await nativeSpikes.requestAlwaysAuthorization();
  }

  async start(mode: TrackingMode): Promise<{ readonly sessionId: string }> {
    this.sessionId = await nativeSpikes.startTracking(mode);
    this.mode = mode;
    this.acknowledged = 0;
    this.paused = false;
    return { sessionId: this.sessionId };
  }

  private currentCheckpoint(): TrackerCheckpoint {
    if (this.sessionId === null) throw new Error('native tracker has no active session');
    return {
      sessionId: this.sessionId,
      mode: this.mode,
      state: this.paused ? 'paused' : 'recording',
      highestCommittedSequence: this.acknowledged,
      recordedAt: new Date().toISOString(),
    };
  }

  async pause(): Promise<TrackerCheckpoint> {
    await nativeSpikes.pauseTracking();
    this.paused = true;
    return this.currentCheckpoint();
  }

  async resume(): Promise<TrackerCheckpoint> {
    await nativeSpikes.resumeTracking();
    this.paused = false;
    return this.currentCheckpoint();
  }

  async finish(): Promise<{ readonly sessionId: string; readonly finalSequence: number }> {
    const sessionId = this.currentCheckpoint().sessionId;
    const finalSequence = await nativeSpikes.stopTracking();
    this.paused = false;
    return { sessionId, finalSequence };
  }

  async recover(): Promise<TrackerCheckpoint | null> {
    const inspection = await nativeSpikes.recoverTrackingSession();
    this.sessionId = inspection.sessionId;
    this.mode = inspection.mode;
    this.paused = false;
    this.acknowledged = await nativeSpikes.trackingCheckpoint(inspection.sessionId);
    return checkpoint(inspection, this.acknowledged);
  }

  async readPendingBatches(): Promise<readonly TrackingBatch[]> {
    const batch = await nativeSpikes.readTrackingBatch(this.acknowledged);
    if (batch === null) return [];
    if (batch.observations.length > 256) {
      throw new Error('native tracking batch exceeded the 256-observation contract');
    }
    return [
      {
        sessionId: batch.sessionId,
        mode: batch.mode,
        firstSequence: batch.firstSequence,
        createdAt: batch.createdAt,
        observations: batch.observations.map((observation) => ({
          sequence: observation.sequence,
          coordinate: observation.coordinate,
          recordedAt: observation.recordedAt,
          horizontalAccuracyM: observation.horizontalAccuracyM,
          ...(observation.verticalAccuracyM === null
            ? {}
            : { verticalAccuracyM: observation.verticalAccuracyM }),
          altitudeM: observation.altitudeM,
          ...(observation.pressureKPa === null ? {} : { pressureKPa: observation.pressureKPa }),
          segment: observation.segment,
          paused: observation.paused,
        })),
      },
    ];
  }

  async acknowledge(highestSequence: number): Promise<void> {
    if (highestSequence < this.acknowledged) {
      throw new Error('native tracking acknowledgement cannot move backward');
    }
    this.acknowledged = highestSequence;
  }

  async finalize(sessionId: string, highestSequence: number): Promise<void> {
    await nativeSpikes.sealTrackingSession(sessionId, highestSequence);
    this.sessionId = null;
    this.acknowledged = 0;
  }
}

export interface MobileApplication {
  readonly repository: InMemoryPrivateRepository;
  readonly recorder: RecorderCoordinator;
  readonly library: ActivityLibrary;
  readonly map: FixtureMapAdapter;
}

export async function createMobileApplication(): Promise<MobileApplication> {
  const stored = await nativeSpikes.loadPrivateSnapshot();
  const snapshot =
    stored === null
      ? undefined
      : migratePrivateSnapshot(JSON.parse(stored) as PrivateDatabaseSnapshot);
  const repository = new InMemoryPrivateRepository(snapshot);
  const persistence: RecorderPersistence = {
    commit: async (nextSnapshot, tracking) => {
      const json = JSON.stringify(nextSnapshot);
      if (tracking === undefined) {
        await nativeSpikes.commitPrivateSnapshot(json);
      } else {
        await nativeSpikes.commitTrackingSnapshot(
          json,
          tracking.sessionId,
          tracking.highestSequence,
        );
      }
    },
  };
  const recorder = new RecorderCoordinator(new NativeTrackerAdapter(), repository, persistence);
  const map = new FixtureMapAdapter();
  return { repository, recorder, library: new ActivityLibrary(repository), map };
}

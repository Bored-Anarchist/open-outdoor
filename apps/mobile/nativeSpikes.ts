import { requireNativeModule } from 'expo';

export type NativeTrackingMode = 'balanced' | 'endurance' | 'high-accuracy';

export interface NativeTrackingInspection {
  readonly sessionId: string;
  readonly mode: NativeTrackingMode;
  readonly highestSequence: number;
  readonly validObservationCount: number;
  readonly tornFinalLineIgnored: boolean;
  readonly spoolFileName: string;
  readonly recording: boolean;
}

export interface Phase0DiagnosticReport {
  readonly schemaVersion: 1;
  readonly syntheticOnly: true;
  readonly fixtureStage: 'A' | 'B';
  readonly activeCatalogId: string;
  readonly interruptedAt: string | null;
  readonly rolledBack: boolean;
  readonly recordCounts: Readonly<Record<string, number>>;
  readonly recordHashes: Readonly<Record<string, string>>;
  readonly artifacts: readonly {
    readonly relativePath: string;
    readonly exists: boolean;
    readonly protection: string | null;
    readonly excludedFromBackup: boolean | null;
    readonly sizeBytes: number;
  }[];
}

interface OpenOutdoorNativeSpikesModule {
  readonly policyVersion: number;
  readonly phase0DiagnosticsEnabled: boolean;
  readonly requestAlwaysAuthorization: () => Promise<void>;
  readonly startTracking: (mode: NativeTrackingMode) => Promise<string>;
  readonly stopTracking: () => Promise<number>;
  readonly inspectTrackingSession: () => Promise<string | null>;
  readonly recoverTrackingSession: () => Promise<string>;
  readonly discardRecoverableTrackingSession: () => Promise<string>;
  readonly isTracking: () => Promise<boolean>;
  readonly currentSessionId: () => Promise<string | null>;
  readonly lastTrackingError: () => Promise<string | null>;
  readonly seedPhase0FixtureA: () => Promise<string>;
  readonly applyPhase0FixtureB: (checkpoint: string | null) => Promise<string>;
  readonly inspectPhase0Fixture: () => Promise<string>;
  readonly sharePhase0DiagnosticReport: () => Promise<string>;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

const module = requireNativeModule<OpenOutdoorNativeSpikesModule>('OpenOutdoorNativeSpikes');

export const nativeSpikes = {
  policyVersion: module.policyVersion,
  phase0DiagnosticsEnabled: module.phase0DiagnosticsEnabled,
  requestAlwaysAuthorization: (): Promise<void> => module.requestAlwaysAuthorization(),
  startTracking: (mode: NativeTrackingMode): Promise<string> => module.startTracking(mode),
  stopTracking: (): Promise<number> => module.stopTracking(),
  isTracking: (): Promise<boolean> => module.isTracking(),
  currentSessionId: (): Promise<string | null> => module.currentSessionId(),
  lastTrackingError: (): Promise<string | null> => module.lastTrackingError(),
  inspectTrackingSession: async (): Promise<NativeTrackingInspection | null> => {
    const value = await module.inspectTrackingSession();
    return value === null ? null : parseJson<NativeTrackingInspection>(value);
  },
  recoverTrackingSession: async (): Promise<NativeTrackingInspection> =>
    parseJson<NativeTrackingInspection>(await module.recoverTrackingSession()),
  discardRecoverableTrackingSession: async (): Promise<NativeTrackingInspection> =>
    parseJson<NativeTrackingInspection>(await module.discardRecoverableTrackingSession()),
  seedPhase0FixtureA: async (): Promise<Phase0DiagnosticReport> =>
    parseJson<Phase0DiagnosticReport>(await module.seedPhase0FixtureA()),
  applyPhase0FixtureB: async (checkpoint: string | null): Promise<Phase0DiagnosticReport> =>
    parseJson<Phase0DiagnosticReport>(await module.applyPhase0FixtureB(checkpoint)),
  inspectPhase0Fixture: async (): Promise<Phase0DiagnosticReport> =>
    parseJson<Phase0DiagnosticReport>(await module.inspectPhase0Fixture()),
  sharePhase0DiagnosticReport: (): Promise<string> => module.sharePhase0DiagnosticReport(),
};

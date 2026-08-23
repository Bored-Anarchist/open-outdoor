import { requireOptionalNativeModule } from 'expo';

export type NativeTrackingMode = 'balanced' | 'endurance' | 'high-accuracy';

export interface NativeTrackingBatch {
  readonly sessionId: string;
  readonly mode: NativeTrackingMode;
  readonly firstSequence: number;
  readonly createdAt: string;
  readonly observations: readonly {
    readonly sequence: number;
    readonly coordinate: readonly [number, number];
    readonly recordedAt: string;
    readonly horizontalAccuracyM: number;
    readonly verticalAccuracyM: number | null;
    readonly altitudeM: number;
    readonly pressureKPa: number | null;
    readonly segment: number;
    readonly paused: boolean;
  }[];
}

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

export interface Phase0PhysicalDiagnosticReport {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly generatedAt: string;
  readonly deviceClass: string;
  readonly systemName: string;
  readonly systemVersion: string;
  readonly memoryProfileActive: boolean;
  readonly acknowledgement: {
    readonly mode: string;
    readonly sampleCount: number;
    readonly startDurationsMs: readonly number[];
    readonly stopDurationsMs: readonly number[];
    readonly startP95Ms: number;
    readonly stopP95Ms: number;
    readonly startMaxMs: number;
    readonly stopMaxMs: number;
    readonly thresholdMs: number;
    readonly passed: boolean;
  } | null;
  readonly memory: {
    readonly elapsedSeconds: number;
    readonly sampleCount: number;
    readonly samplesBytes: readonly number[];
    readonly p95ResidentBytes: number;
    readonly maxResidentBytes: number;
    readonly thresholdBytes: number;
    readonly passed: boolean;
  } | null;
  readonly trackingProtection: {
    readonly expectedProtection: string;
    readonly expectedExcludedFromBackup: boolean;
    readonly artifacts: readonly {
      readonly relativePath: string;
      readonly exists: boolean;
      readonly protection: string | null;
      readonly excludedFromBackup: boolean | null;
      readonly sizeBytes: number;
    }[];
    readonly passed: boolean;
  } | null;
}

interface OpenOutdoorNativeSpikesModule {
  readonly policyVersion: number;
  readonly phase0DiagnosticsEnabled: boolean;
  readonly requestAlwaysAuthorization: () => Promise<void>;
  readonly startTracking: (mode: NativeTrackingMode) => Promise<string>;
  readonly pauseTracking: () => Promise<number>;
  readonly resumeTracking: () => Promise<number>;
  readonly stopTracking: () => Promise<number>;
  readonly readTrackingBatch: (afterSequence: number) => Promise<string | null>;
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
  readonly recordAcknowledgementBenchmark: (inputJson: string) => Promise<string>;
  readonly beginMemoryProfile: () => Promise<string>;
  readonly finishMemoryProfile: () => Promise<string>;
  readonly inspectTrackingProtection: () => Promise<string>;
  readonly sharePhysicalDiagnosticReport: () => Promise<string>;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

const module =
  requireOptionalNativeModule<OpenOutdoorNativeSpikesModule>('OpenOutdoorNativeSpikes');

const unavailableMessage =
  'OpenOutdoorNativeSpikes is not registered in this build. Reinstall the Phase 0 IPA and share this message.';

function requiredModule(): OpenOutdoorNativeSpikesModule {
  if (module === null) throw new Error(unavailableMessage);
  return module;
}

export const nativeSpikes = {
  available: module !== null,
  loadError: module === null ? unavailableMessage : null,
  policyVersion: module?.policyVersion ?? null,
  phase0DiagnosticsEnabled: module?.phase0DiagnosticsEnabled ?? false,
  requestAlwaysAuthorization: (): Promise<void> => requiredModule().requestAlwaysAuthorization(),
  startTracking: (mode: NativeTrackingMode): Promise<string> =>
    requiredModule().startTracking(mode),
  pauseTracking: (): Promise<number> => requiredModule().pauseTracking(),
  resumeTracking: (): Promise<number> => requiredModule().resumeTracking(),
  stopTracking: (): Promise<number> => requiredModule().stopTracking(),
  isTracking: (): Promise<boolean> => requiredModule().isTracking(),
  currentSessionId: (): Promise<string | null> => requiredModule().currentSessionId(),
  lastTrackingError: (): Promise<string | null> => requiredModule().lastTrackingError(),
  readTrackingBatch: async (afterSequence: number): Promise<NativeTrackingBatch | null> => {
    const value = await requiredModule().readTrackingBatch(afterSequence);
    return value === null ? null : parseJson<NativeTrackingBatch>(value);
  },
  inspectTrackingSession: async (): Promise<NativeTrackingInspection | null> => {
    const value = await requiredModule().inspectTrackingSession();
    return value === null ? null : parseJson<NativeTrackingInspection>(value);
  },
  recoverTrackingSession: async (): Promise<NativeTrackingInspection> =>
    parseJson<NativeTrackingInspection>(await requiredModule().recoverTrackingSession()),
  discardRecoverableTrackingSession: async (): Promise<NativeTrackingInspection> =>
    parseJson<NativeTrackingInspection>(await requiredModule().discardRecoverableTrackingSession()),
  seedPhase0FixtureA: async (): Promise<Phase0DiagnosticReport> =>
    parseJson<Phase0DiagnosticReport>(await requiredModule().seedPhase0FixtureA()),
  applyPhase0FixtureB: async (checkpoint: string | null): Promise<Phase0DiagnosticReport> =>
    parseJson<Phase0DiagnosticReport>(await requiredModule().applyPhase0FixtureB(checkpoint)),
  inspectPhase0Fixture: async (): Promise<Phase0DiagnosticReport> =>
    parseJson<Phase0DiagnosticReport>(await requiredModule().inspectPhase0Fixture()),
  sharePhase0DiagnosticReport: (): Promise<string> =>
    requiredModule().sharePhase0DiagnosticReport(),
  recordAcknowledgementBenchmark: async (
    inputJson: string,
  ): Promise<Phase0PhysicalDiagnosticReport> =>
    parseJson<Phase0PhysicalDiagnosticReport>(
      await requiredModule().recordAcknowledgementBenchmark(inputJson),
    ),
  beginMemoryProfile: async (): Promise<Phase0PhysicalDiagnosticReport> =>
    parseJson<Phase0PhysicalDiagnosticReport>(await requiredModule().beginMemoryProfile()),
  finishMemoryProfile: async (): Promise<Phase0PhysicalDiagnosticReport> =>
    parseJson<Phase0PhysicalDiagnosticReport>(await requiredModule().finishMemoryProfile()),
  inspectTrackingProtection: async (): Promise<Phase0PhysicalDiagnosticReport> =>
    parseJson<Phase0PhysicalDiagnosticReport>(await requiredModule().inspectTrackingProtection()),
  sharePhysicalDiagnosticReport: (): Promise<string> =>
    requiredModule().sharePhysicalDiagnosticReport(),
};

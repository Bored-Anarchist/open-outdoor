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
    readonly relativeAltitudeM: number | null;
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
  readonly highestSegment: number;
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

export interface Phase1AcceptanceReport {
  readonly schemaVersion: 1;
  readonly profileId: 'iphone14-ios26.6-phase1-v1';
  readonly generatedAt: string;
  readonly status: 'not-started' | 'in-progress' | 'failed' | 'passed';
  readonly stage:
    'idle' | 'crash' | 'permission' | 'field' | 'elevation' | 'accessibility' | 'complete';
  readonly deviceClass: string;
  readonly deviceModelIdentifier: string;
  readonly sourceCommit: string;
  readonly systemName: string;
  readonly systemVersion: string;
  readonly bundleIdentifier: string;
  readonly appVersion: string;
  readonly buildNumber: string;
  readonly startedAt: string | null;
  readonly referenceClimbM: number | null;
  readonly measuredAscentM: number | null;
  readonly elevationAllowedErrorM: number | null;
  readonly authorizationStatuses: readonly string[];
  readonly maximumBackgroundSeconds: number;
  readonly networkTransitions: number;
  readonly accessibility: {
    readonly voiceOverRunning: boolean;
    readonly preferredContentSizeCategory: string;
    readonly largestAccessibilitySize: boolean;
    readonly boldTextEnabled: boolean;
    readonly increasedContrastEnabled: boolean;
    readonly differentiateWithoutColorEnabled: boolean;
    readonly reduceMotionEnabled: boolean;
    readonly darkModeEnabled: boolean;
  };
  readonly memory: {
    readonly elapsedSeconds: number;
    readonly sampleCount: number;
    readonly samplesBytes: readonly number[];
    readonly p95ResidentBytes: number;
    readonly maxResidentBytes: number;
    readonly thresholdBytes: number;
    readonly passed: boolean;
  } | null;
  readonly results: Readonly<
    Record<
      'trackerCorrectness' | 'memorySmoke' | 'voiceOver' | 'dynamicType' | 'elevation',
      { readonly passed: boolean; readonly checks: Readonly<Record<string, boolean>> }
    >
  >;
  readonly events: readonly {
    readonly kind: string;
    readonly recordedAt: string;
    readonly detail?: string | null;
  }[];
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
  readonly sealTrackingSession: (sessionId: string, highestSequence: number) => Promise<void>;
  readonly loadPrivateSnapshot: () => Promise<string | null>;
  readonly commitPrivateSnapshot: (snapshotJson: string) => Promise<void>;
  readonly commitTrackingSnapshot: (
    snapshotJson: string,
    sessionId: string,
    highestSequence: number,
  ) => Promise<void>;
  readonly trackingCheckpoint: (sessionId: string) => Promise<number>;
  readonly seedPhase0FixtureA: () => Promise<string>;
  readonly applyPhase0FixtureB: (checkpoint: string | null) => Promise<string>;
  readonly inspectPhase0Fixture: () => Promise<string>;
  readonly sharePhase0DiagnosticReport: () => Promise<string>;
  readonly recordAcknowledgementBenchmark: (inputJson: string) => Promise<string>;
  readonly beginMemoryProfile: () => Promise<string>;
  readonly isMemoryProfileActive: () => Promise<boolean>;
  readonly finishMemoryProfile: () => Promise<string>;
  readonly inspectTrackingProtection: () => Promise<string>;
  readonly sharePhysicalDiagnosticReport: () => Promise<string>;
  readonly beginPhase1Acceptance: (referenceClimbM: number) => Promise<string>;
  readonly currentPhase1Acceptance: () => Promise<string>;
  readonly armPhase1CrashRecovery: () => Promise<string>;
  readonly beginPhase1FieldRun: () => Promise<string>;
  readonly recordPhase1FieldResult: (
    memoryReportJson: string,
    measuredAscentM: number,
  ) => Promise<string>;
  readonly beginPhase1ElevationRetry: () => Promise<string>;
  readonly recordPhase1ElevationRetry: (measuredAscentM: number) => Promise<string>;
  readonly retryPhase1Accessibility: () => Promise<string>;
  readonly recordPhase1AccessibilityControl: (action: string) => Promise<string>;
  readonly confirmPhase1Accessibility: (usable: boolean) => Promise<string>;
  readonly resetPhase1Acceptance: () => Promise<string>;
  readonly sharePhase1AcceptanceReport: () => Promise<string>;
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
  sealTrackingSession: (sessionId: string, highestSequence: number): Promise<void> =>
    requiredModule().sealTrackingSession(sessionId, highestSequence),
  loadPrivateSnapshot: (): Promise<string | null> => requiredModule().loadPrivateSnapshot(),
  commitPrivateSnapshot: (snapshotJson: string): Promise<void> =>
    requiredModule().commitPrivateSnapshot(snapshotJson),
  commitTrackingSnapshot: (
    snapshotJson: string,
    sessionId: string,
    highestSequence: number,
  ): Promise<void> =>
    requiredModule().commitTrackingSnapshot(snapshotJson, sessionId, highestSequence),
  trackingCheckpoint: (sessionId: string): Promise<number> =>
    requiredModule().trackingCheckpoint(sessionId),
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
  isMemoryProfileActive: (): Promise<boolean> => requiredModule().isMemoryProfileActive(),
  finishMemoryProfile: async (): Promise<Phase0PhysicalDiagnosticReport> =>
    parseJson<Phase0PhysicalDiagnosticReport>(await requiredModule().finishMemoryProfile()),
  inspectTrackingProtection: async (): Promise<Phase0PhysicalDiagnosticReport> =>
    parseJson<Phase0PhysicalDiagnosticReport>(await requiredModule().inspectTrackingProtection()),
  sharePhysicalDiagnosticReport: (): Promise<string> =>
    requiredModule().sharePhysicalDiagnosticReport(),
  beginPhase1Acceptance: async (referenceClimbM: number): Promise<Phase1AcceptanceReport> =>
    parseJson<Phase1AcceptanceReport>(
      await requiredModule().beginPhase1Acceptance(referenceClimbM),
    ),
  currentPhase1Acceptance: async (): Promise<Phase1AcceptanceReport> =>
    parseJson<Phase1AcceptanceReport>(await requiredModule().currentPhase1Acceptance()),
  armPhase1CrashRecovery: async (): Promise<Phase1AcceptanceReport> =>
    parseJson<Phase1AcceptanceReport>(await requiredModule().armPhase1CrashRecovery()),
  beginPhase1FieldRun: async (): Promise<Phase1AcceptanceReport> =>
    parseJson<Phase1AcceptanceReport>(await requiredModule().beginPhase1FieldRun()),
  recordPhase1FieldResult: async (
    memoryReport: Phase0PhysicalDiagnosticReport,
    measuredAscentM: number,
  ): Promise<Phase1AcceptanceReport> =>
    parseJson<Phase1AcceptanceReport>(
      await requiredModule().recordPhase1FieldResult(JSON.stringify(memoryReport), measuredAscentM),
    ),
  beginPhase1ElevationRetry: async (): Promise<Phase1AcceptanceReport> =>
    parseJson<Phase1AcceptanceReport>(await requiredModule().beginPhase1ElevationRetry()),
  recordPhase1ElevationRetry: async (measuredAscentM: number): Promise<Phase1AcceptanceReport> =>
    parseJson<Phase1AcceptanceReport>(
      await requiredModule().recordPhase1ElevationRetry(measuredAscentM),
    ),
  retryPhase1Accessibility: async (): Promise<Phase1AcceptanceReport> =>
    parseJson<Phase1AcceptanceReport>(await requiredModule().retryPhase1Accessibility()),
  recordPhase1AccessibilityControl: async (action: string): Promise<Phase1AcceptanceReport> =>
    parseJson<Phase1AcceptanceReport>(
      await requiredModule().recordPhase1AccessibilityControl(action),
    ),
  confirmPhase1Accessibility: async (usable: boolean): Promise<Phase1AcceptanceReport> =>
    parseJson<Phase1AcceptanceReport>(await requiredModule().confirmPhase1Accessibility(usable)),
  resetPhase1Acceptance: async (): Promise<Phase1AcceptanceReport> =>
    parseJson<Phase1AcceptanceReport>(await requiredModule().resetPhase1Acceptance()),
  sharePhase1AcceptanceReport: (): Promise<string> =>
    requiredModule().sharePhase1AcceptanceReport(),
};

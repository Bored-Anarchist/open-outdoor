import { requireOptionalNativeModule } from 'expo';

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
  stopTracking: (): Promise<number> => requiredModule().stopTracking(),
  isTracking: (): Promise<boolean> => requiredModule().isTracking(),
  currentSessionId: (): Promise<string | null> => requiredModule().currentSessionId(),
  lastTrackingError: (): Promise<string | null> => requiredModule().lastTrackingError(),
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
};

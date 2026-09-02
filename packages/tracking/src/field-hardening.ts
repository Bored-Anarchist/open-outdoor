import type { TrackingMode } from './index.js';

export const PHASE3_FIELD_PROFILE = {
  id: 'iphone14-ios26.6-phase3-v1',
  referenceDevice: 'iPhone 14',
  referenceOs: 'iOS 26.6',
  requiredRunsPerMode: 3,
  requiredModes: ['balanced', 'endurance'] as const,
  minimumDurationMinutes: 180,
  maximumBatteryPercentPerHour: { balanced: 6, endurance: 4 },
  maximumSeriousThermalSeconds: 0,
  maximumCriticalThermalSeconds: 0,
  maximumCheckpointGapSeconds: 30,
  maximumStorageGrowthMiBPerHour: 64,
  phase3Disposition: 'conditionally-approved',
  blockingPhase: 'Phase 5',
  blockingWorkPackage: 'WP-503',
} as const;

export interface FieldRunEvidence {
  readonly environment: 'physical-iphone' | 'simulator' | 'replay';
  readonly profileId: typeof PHASE3_FIELD_PROFILE.id;
  readonly runId: string;
  readonly sourceCommit: string;
  readonly deviceModel: string;
  readonly systemVersion: string;
  readonly mode: TrackingMode;
  readonly durationMinutes: number;
  readonly batteryStartPercent: number;
  readonly batteryEndPercent: number;
  readonly seriousThermalSeconds: number;
  readonly criticalThermalSeconds: number;
  readonly maximumCheckpointGapSeconds: number;
  readonly storageGrowthBytes: number;
  readonly sensorsActiveWhileStoppedSeconds: number;
  readonly offlineBrowsePassed: boolean;
  readonly offlineSearchPassed: boolean;
  readonly crashRecoveryPassed: boolean;
  readonly degradedGpsStatePassed: boolean;
  readonly accessibilityPassed: boolean;
}

export interface FieldAcceptanceResult {
  readonly status: 'pending' | 'failed' | 'passed';
  readonly acceptedRunIds: readonly string[];
  readonly failures: readonly string[];
  readonly missing: readonly string[];
}

function finiteRange(value: number, minimum: number, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function evaluatePhase3FieldEvidence(
  evidence: readonly FieldRunEvidence[],
): FieldAcceptanceResult {
  const failures: string[] = [];
  const accepted = new Set<string>();
  const physical = evidence.filter(({ environment }) => environment === 'physical-iphone');
  for (const run of physical) {
    if (accepted.has(run.runId)) {
      failures.push(`${run.runId}: duplicate run identifier`);
      continue;
    }
    accepted.add(run.runId);
    const hours = run.durationMinutes / 60;
    const batteryRate = (run.batteryStartPercent - run.batteryEndPercent) / hours;
    const storageRate = run.storageGrowthBytes / 1024 ** 2 / hours;
    const modeBudget =
      run.mode === 'endurance'
        ? PHASE3_FIELD_PROFILE.maximumBatteryPercentPerHour.endurance
        : PHASE3_FIELD_PROFILE.maximumBatteryPercentPerHour.balanced;
    const valid =
      run.profileId === PHASE3_FIELD_PROFILE.id &&
      run.deviceModel === PHASE3_FIELD_PROFILE.referenceDevice &&
      run.systemVersion === PHASE3_FIELD_PROFILE.referenceOs &&
      run.sourceCommit.length >= 7 &&
      PHASE3_FIELD_PROFILE.requiredModes.some((mode) => mode === run.mode) &&
      finiteRange(run.durationMinutes, PHASE3_FIELD_PROFILE.minimumDurationMinutes) &&
      finiteRange(run.batteryStartPercent, 0, 100) &&
      finiteRange(run.batteryEndPercent, 0, run.batteryStartPercent) &&
      batteryRate <= modeBudget &&
      run.seriousThermalSeconds <= PHASE3_FIELD_PROFILE.maximumSeriousThermalSeconds &&
      run.criticalThermalSeconds <= PHASE3_FIELD_PROFILE.maximumCriticalThermalSeconds &&
      run.maximumCheckpointGapSeconds <= PHASE3_FIELD_PROFILE.maximumCheckpointGapSeconds &&
      storageRate <= PHASE3_FIELD_PROFILE.maximumStorageGrowthMiBPerHour &&
      run.sensorsActiveWhileStoppedSeconds === 0 &&
      run.offlineBrowsePassed &&
      run.offlineSearchPassed &&
      run.crashRecoveryPassed &&
      run.degradedGpsStatePassed &&
      run.accessibilityPassed;
    if (!valid) failures.push(`${run.runId}: one or more field thresholds failed`);
  }

  const missing = PHASE3_FIELD_PROFILE.requiredModes.flatMap((mode) => {
    const count = physical.filter((run) => run.mode === mode).length;
    const remaining = PHASE3_FIELD_PROFILE.requiredRunsPerMode - count;
    return remaining > 0 ? [`${mode}: ${remaining} physical run(s)`] : [];
  });
  return {
    status: failures.length > 0 ? 'failed' : missing.length > 0 ? 'pending' : 'passed',
    acceptedRunIds: [...accepted],
    failures,
    missing,
  };
}

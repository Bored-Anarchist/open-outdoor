import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PHASE3_FIELD_PROFILE,
  evaluatePhase3FieldEvidence,
  type FieldRunEvidence,
} from '../src/index.js';

function run(mode: 'balanced' | 'endurance', index: number): FieldRunEvidence {
  return {
    environment: 'physical-iphone',
    profileId: PHASE3_FIELD_PROFILE.id,
    runId: `${mode}-${index}`,
    sourceCommit: 'abcdef123456',
    deviceModel: 'iPhone 14',
    systemVersion: 'iOS 26.6',
    mode,
    durationMinutes: 180,
    batteryStartPercent: 90,
    batteryEndPercent: mode === 'balanced' ? 74 : 78,
    seriousThermalSeconds: 0,
    criticalThermalSeconds: 0,
    maximumCheckpointGapSeconds: 30,
    storageGrowthBytes: 100 * 1024 ** 2,
    sensorsActiveWhileStoppedSeconds: 0,
    offlineBrowsePassed: true,
    offlineSearchPassed: true,
    crashRecoveryPassed: true,
    degradedGpsStatePassed: true,
    accessibilityPassed: true,
  };
}

describe('WP-307/WP-503 endurance evidence protocol', () => {
  it('matches the binding machine-readable release profile', () => {
    const release = JSON.parse(
      readFileSync(new URL('../../../config/release.json', import.meta.url), 'utf8'),
    ) as { phase3: Record<string, unknown> };
    expect(release.phase3).toEqual({
      fieldProfileId: PHASE3_FIELD_PROFILE.id,
      referenceDevice: {
        model: PHASE3_FIELD_PROFILE.referenceDevice,
        os: PHASE3_FIELD_PROFILE.referenceOs,
      },
      requiredRunsPerMode: PHASE3_FIELD_PROFILE.requiredRunsPerMode,
      requiredModes: PHASE3_FIELD_PROFILE.requiredModes,
      minimumDurationMinutes: PHASE3_FIELD_PROFILE.minimumDurationMinutes,
      maximumBatteryPercentPerHour: PHASE3_FIELD_PROFILE.maximumBatteryPercentPerHour,
      maximumSeriousThermalSeconds: PHASE3_FIELD_PROFILE.maximumSeriousThermalSeconds,
      maximumCriticalThermalSeconds: PHASE3_FIELD_PROFILE.maximumCriticalThermalSeconds,
      maximumCheckpointGapSeconds: PHASE3_FIELD_PROFILE.maximumCheckpointGapSeconds,
      maximumStorageGrowthMiBPerHour: PHASE3_FIELD_PROFILE.maximumStorageGrowthMiBPerHour,
      enduranceDisposition: {
        phase3: PHASE3_FIELD_PROFILE.phase3Disposition,
        blockingPhase: PHASE3_FIELD_PROFILE.blockingPhase,
        blockingWorkPackage: PHASE3_FIELD_PROFILE.blockingWorkPackage,
        enduranceClaimsAllowed: false,
      },
    });
  });

  it('refuses replay evidence as a substitute for physical iPhone runs', () => {
    expect(
      evaluatePhase3FieldEvidence([{ ...run('balanced', 1), environment: 'replay' }]),
    ).toMatchObject({ status: 'pending', acceptedRunIds: [] });
  });

  it('passes only after three compliant physical runs in each required mode', () => {
    const evidence = [1, 2, 3].flatMap((index) => [
      run('balanced', index),
      run('endurance', index),
    ]);
    expect(evaluatePhase3FieldEvidence(evidence)).toEqual({
      status: 'passed',
      acceptedRunIds: [
        'balanced-1',
        'endurance-1',
        'balanced-2',
        'endurance-2',
        'balanced-3',
        'endurance-3',
      ],
      failures: [],
      missing: [],
    });
  });

  it('fails over-budget battery, thermal, storage, or reliability measurements', () => {
    const result = evaluatePhase3FieldEvidence([
      { ...run('endurance', 1), batteryEndPercent: 60, seriousThermalSeconds: 1 },
    ]);
    expect(result.status).toBe('failed');
    expect(result.failures[0]).toContain('endurance-1');
  });
});

import { describe, expect, it } from 'vitest';
import {
  accessibilityCaseIds,
  distribution,
  evaluateProductionQuality,
  productionProfile,
  productionTemplate,
} from '../../../tools/production-quality-lib.mjs';
const candidate = { sourceCommit: 'a'.repeat(40), binarySha256: 'b'.repeat(64) };
function physical() {
  const report = productionTemplate(candidate.sourceCommit);
  report.binarySha256 = candidate.binarySha256;
  report.accessibility = accessibilityCaseIds.map((id: string) => ({
    id,
    status: 'passed',
    evidenceSha256: 'c'.repeat(64),
  }));
  for (const [id, policy] of Object.entries(productionProfile.measurements) as [
    string,
    { minimumSamples: number; minimumDurationSeconds: number },
  ][])
    report.performance[id] = {
      samples: Array(policy.minimumSamples).fill(id.includes('Memory') ? 100 : 16),
      durationSeconds: policy.minimumDurationSeconds,
      fixtureSha256: 'd'.repeat(64),
      evidenceSha256: 'e'.repeat(64),
    };
  report.fieldRuns = Array.from({ length: 6 }, (_, i) => ({
    runId: `run-${i}`,
    ...candidate,
    evidenceSha256: String(i + 1).repeat(64),
    mode: i < 3 ? 'balanced' : 'endurance',
    startedAt: new Date(Date.UTC(2026, 8, 10, i * 3)).toISOString(),
    endedAt: new Date(Date.UTC(2026, 8, 10, (i + 1) * 3)).toISOString(),
    durationMinutes: 180,
    batteryStartPercent: 90,
    batteryEndPercent: 80,
    chargingDuringRun: false,
    seriousThermalSeconds: 0,
    criticalThermalSeconds: 0,
    maximumCheckpointGapSeconds: 30,
    storageGrowthBytes: 1048576,
    sensorsActiveWhileStoppedSeconds: 0,
    offlineBrowsePassed: true,
    offlineSearchPassed: true,
    crashRecoveryPassed: true,
    degradedGpsStatePassed: true,
    accessibilityPassed: true,
  }));
  report.attestation = {
    completed: true,
    reviewer: 'fixture-reviewer',
    evidenceSha256: 'f'.repeat(64),
  };
  return report;
}
describe('WP-502/WP-503 deferred physical acceptance', () => {
  it('retains the approved physical timing and normative limits', () => {
    expect(productionProfile.physicalAcceptance).toEqual({
      decision: 'ADR-049',
      when: 'end-of-phase5',
      blockingWorkPackage: 'WP-506',
      claimsAllowedBeforeAcceptance: false,
    });
    expect(accessibilityCaseIds).toHaveLength(99);
    expect(productionProfile.measurements.coldLaunchMs).toMatchObject({
      p50Maximum: 2500,
      p95Maximum: 4000,
    });
    expect(productionProfile.measurements.mapMemoryMiB.p95Maximum).toBe(500);
    expect(productionProfile.measurements.trackerMemoryMiB.p95Maximum).toBe(150);
    expect(productionProfile.measurements.mapFrameMs.maximum).toBe(250);
  });
  it('uses nearest-rank distributions without mutating samples', () => {
    const input = [4, 1, 2, 3];
    expect(distribution(input)).toEqual({ count: 4, p50: 2, p95: 4, maximum: 4 });
    expect(input).toEqual([4, 1, 2, 3]);
    expect(() => distribution([NaN])).toThrow();
  });
  it('cannot pass absent or unexecuted evidence', () => {
    expect(evaluateProductionQuality(null, candidate).status).toBe('blocked');
    expect(
      evaluateProductionQuality(productionTemplate(candidate.sourceCommit), candidate).status,
    ).toBe('blocked');
  });
  it('accepts a complete synthetic validator fixture, not a real device claim', () => {
    expect(evaluateProductionQuality(physical(), candidate)).toMatchObject({
      status: 'passed',
      blockers: [],
    });
  });
  it.each(['browser', 'simulator'])('rejects %s substitution', (environment) => {
    const report = physical();
    report.environment = environment;
    expect(evaluateProductionQuality(report, candidate).blockers).toContain(
      'PHYSICAL_PROFILE_MISMATCH',
    );
  });
  it('rejects wrong commits, zero binary identities and unknown/private fields', () => {
    const report = physical();
    report.sourceCommit = 'c'.repeat(40);
    expect(evaluateProductionQuality(report, candidate).blockers).toContain('CANDIDATE_MISMATCH');
    expect(
      evaluateProductionQuality(physical(), { ...candidate, binarySha256: '0'.repeat(64) }).status,
    ).toBe('blocked');
    expect(
      evaluateProductionQuality({ ...physical(), coordinates: [0, 0] }, candidate).blockers,
    ).toContain('INVALID_REPORT_SCHEMA');
  });
  it('blocks a missing setting/flow, duplicate case, unresolved defect and absent reviewer', () => {
    const report = physical();
    report.accessibility.pop();
    report.accessibility.push(report.accessibility[0]);
    report.defects = [{ id: 'A11Y-1', severity: 'critical', status: 'open' }];
    report.attestation.completed = false;
    const result = evaluateProductionQuality(report, candidate);
    expect(result.status).toBe('blocked');
    expect(result.blockers).toContain('OPEN_BLOCKING_DEFECT');
    expect(result.blockers).toContain('INVALID_ACCESSIBILITY_CASE');
    expect(result.blockers).toContain('REVIEW_REQUIRED');
  });
  it('blocks over-budget latency, frame stalls and memory', () => {
    const report = physical();
    report.performance.coldLaunchMs.samples.fill(4001);
    report.performance.mapFrameMs.samples[0] = 251;
    report.performance.mapMemoryMiB.samples.fill(501);
    const result = evaluateProductionQuality(report, candidate);
    expect(result.blockers).toContain('BUDGET:coldLaunchMs');
    expect(result.blockers).toContain('BUDGET:mapFrameMs');
    expect(result.blockers).toContain('BUDGET:mapMemoryMiB');
  });
  it('blocks negative telemetry, charged runs, reused or overlapping runs and excessive energy', () => {
    const report = physical();
    report.fieldRuns[0].maximumCheckpointGapSeconds = -1;
    expect(evaluateProductionQuality(report, candidate).blockers).toContain(
      'INVALID_REPORT_SCHEMA',
    );
    const reused = physical();
    reused.fieldRuns[1] = { ...reused.fieldRuns[0] };
    expect(evaluateProductionQuality(reused, candidate).blockers).toContain('REUSED_FIELD_RUN');
    expect(evaluateProductionQuality(reused, candidate).blockers).toContain(
      'OVERLAPPING_FIELD_RUNS',
    );
    const energy = physical();
    energy.fieldRuns[4].chargingDuringRun = true;
    energy.fieldRuns[4].batteryEndPercent = 10;
    expect(evaluateProductionQuality(energy, candidate).blockers).toContain('FIELD_BUDGET_OR_FLOW');
  });
});

import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  PHASE3_PROFILE_ID,
  REQUIRED_PHASE3_ACCEPTANCE,
  REQUIRED_PHASE3_COMMANDS,
  REQUIRED_PHASE3_TEST_FILES,
  createPhase3EvidenceProposal,
  evaluatePhase3GuidedReport,
  evaluatePhase3PhysicalReport,
} from '../../../tools/phase3-guided-lib.mjs';

const commit = 'a'.repeat(40);

function fieldRun(mode: 'balanced' | 'endurance', index: number) {
  return {
    environment: 'physical-iphone',
    profileId: PHASE3_PROFILE_ID,
    runId: `${mode}-${index}`,
    sourceCommit: commit,
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

function physicalReport() {
  const trueChecks = (keys: readonly string[]) =>
    Object.fromEntries(keys.map((key) => [key, true]));
  return {
    schemaVersion: 1,
    profileId: PHASE3_PROFILE_ID,
    generatedAt: '2026-09-02T12:00:00.000Z',
    sourceCommit: commit,
    binarySha256: 'b'.repeat(64),
    deviceModel: 'iPhone 14',
    systemVersion: 'iOS 26.6',
    installationPassed: true,
    coordinateFree: true,
    containsPersonalData: false,
    performance: {
      coldLaunchP50Ms: 2000,
      coldLaunchP95Ms: 3500,
      searchP50Ms: 100,
      searchP95Ms: 400,
      searchMaxMs: 800,
      mapFrameRateP95: 35,
      mainThreadStallMaxMs: 200,
      catalogActivationSeconds: 240,
      firstLaunchAfterSwitchSeconds: 8,
      mapMemoryP95MiB: 450,
    },
    deviceFlows: trueChecks([
      'offlineExplore',
      'catalogActivationAndRollback',
      'composedOrigins',
      'privateCatalogRemovalPreservedUserData',
      'backupReinstallRestore',
      'degradedAndErrorStates',
    ]),
    accessibility: trueChecks([
      'voiceOver',
      'dynamicType',
      'boldText',
      'increasedContrast',
      'differentiateWithoutColor',
      'reduceMotion',
      'darkMode',
      'touchTargets',
      'oneHandedUse',
    ]),
    fieldRuns: [1, 2, 3].flatMap((index) => [
      fieldRun('balanced', index),
      fieldRun('endurance', index),
    ]),
    attestation: { completed: true, tester: 'project-owner', notes: 'coordinate-free run' },
  };
}

function guidedReport() {
  return {
    schemaVersion: 1,
    profileId: PHASE3_PROFILE_ID,
    generatedAt: '2026-09-02T12:10:00.000Z',
    startedAt: '2026-09-02T12:00:00.000Z',
    completedAt: '2026-09-02T12:10:00.000Z',
    sourceCommit: commit,
    workingTreeClean: true,
    nodeVersion: 'v24.19.0',
    platform: 'win32',
    status: 'passed',
    physicalReport: { path: 'phase3-physical.json', sha256: 'c'.repeat(64) },
    commands: REQUIRED_PHASE3_COMMANDS.map((id) => ({
      id,
      passed: true,
      exitCode: 0,
      durationMilliseconds: 10,
      outputSha256: 'd'.repeat(64),
      failureExcerpt: null,
    })),
    passedTestFiles: REQUIRED_PHASE3_TEST_FILES,
    physicalEvaluation: { status: 'passed', blockers: [] },
    acceptance: Object.fromEntries(
      REQUIRED_PHASE3_ACCEPTANCE.map((id) => [id, { passed: true, evidence: id }]),
    ),
    blockers: [],
  };
}

describe('Phase 3 guided acceptance evidence', () => {
  it('accepts only a complete coordinate-free physical report at the pinned thresholds', () => {
    const report = physicalReport();
    expect(evaluatePhase3PhysicalReport(report, { sourceCommit: commit })).toEqual({
      status: 'passed',
      blockers: [],
    });
    const schema = JSON.parse(readFileSync('config/phase3-physical-report.schema.json', 'utf8'));
    expect(new Ajv2020({ allErrors: true, strict: true }).compile(schema)(report)).toBe(true);
  });

  it('keeps the runner profile synchronized with the binding release configuration', () => {
    const release = JSON.parse(readFileSync('config/release.json', 'utf8')) as {
      phase3: {
        fieldProfileId: string;
        referenceDevice: { model: string; os: string };
        requiredRunsPerMode: number;
        requiredModes: string[];
        minimumDurationMinutes: number;
        maximumBatteryPercentPerHour: { balanced: number; endurance: number };
        maximumSeriousThermalSeconds: number;
        maximumCriticalThermalSeconds: number;
        maximumCheckpointGapSeconds: number;
        maximumStorageGrowthMiBPerHour: number;
      };
    };
    expect(release.phase3).toMatchObject({
      fieldProfileId: PHASE3_PROFILE_ID,
      referenceDevice: { model: 'iPhone 14', os: 'iOS 26.6' },
      requiredRunsPerMode: 3,
      requiredModes: ['balanced', 'endurance'],
      minimumDurationMinutes: 180,
      maximumBatteryPercentPerHour: { balanced: 6, endurance: 4 },
      maximumSeriousThermalSeconds: 0,
      maximumCriticalThermalSeconds: 0,
      maximumCheckpointGapSeconds: 30,
      maximumStorageGrowthMiBPerHour: 64,
    });
  });

  it('blocks replay, over-budget metrics, unsafe privacy, and commit mismatch', () => {
    const report = physicalReport();
    report.coordinateFree = false;
    report.performance.searchP95Ms = 501;
    report.fieldRuns[0]!.environment = 'replay';
    const result = evaluatePhase3PhysicalReport(report, { sourceCommit: 'e'.repeat(40) });
    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'physical report source commit does not match the candidate',
        'physical report privacy classification is unsafe',
        'search p95: physical budget did not pass',
        'balanced-1: replay/simulator cannot satisfy physical acceptance',
      ]),
    );
  });

  it('accepts a complete clean guided report and validates its public schema', () => {
    const report = guidedReport();
    expect(evaluatePhase3GuidedReport(report, { sourceCommit: commit })).toEqual({
      status: 'passed',
      blockers: [],
    });
    const schema = JSON.parse(readFileSync('config/phase3-guided-report.schema.json', 'utf8'));
    expect(new Ajv2020({ allErrors: true, strict: true }).compile(schema)(report)).toBe(true);
  });

  it('blocks dirty candidates, missing test files, failed commands, and absent physical evidence', () => {
    const report = guidedReport();
    report.workingTreeClean = false;
    report.commands[0]!.passed = false;
    report.passedTestFiles = report.passedTestFiles.slice(1);
    report.physicalEvaluation = { status: 'blocked', blockers: ['physical report is required'] };
    report.acceptance.fieldHardening.passed = false;
    expect(evaluatePhase3GuidedReport(report).blockers).toEqual(
      expect.arrayContaining([
        'candidate working tree was not clean',
        'phase3Types: command did not pass',
        `${REQUIRED_PHASE3_TEST_FILES[0]}: test file did not pass`,
        'physical report is required',
        'fieldHardening: acceptance criterion did not pass',
      ]),
    );
  });

  it('creates a reviewer-controlled proposal without self-accepting the milestone', () => {
    expect(
      createPhase3EvidenceProposal(guidedReport(), {
        generatedAt: '2026-09-02T12:11:00.000Z',
        sourceCommit: commit,
        reportSha256: 'f'.repeat(64),
        reportPath: 'dist/phase3-guided-report.json',
      }),
    ).toMatchObject({
      gateStatusRecommendation: 'blocked-pending-reviewer',
      reviewerActionRequired: true,
      packageRecommendations: {
        'WP-301': 'accepted-after-review',
        'WP-307': 'accepted-after-review',
      },
    });
  });
});

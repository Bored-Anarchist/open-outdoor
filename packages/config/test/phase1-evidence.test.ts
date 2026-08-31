import { describe, expect, it } from 'vitest';
import {
  createPhase1EvidenceProposal,
  evaluatePhase1PhysicalReport,
} from '../../../tools/phase1-evidence-lib.mjs';

const allTrue = (names: readonly string[]) => Object.fromEntries(names.map((name) => [name, true]));

function passingReport() {
  return {
    schemaVersion: 1,
    profileId: 'iphone14-ios26.6-phase1-v1',
    generatedAt: '2026-08-25T12:00:00Z',
    status: 'passed',
    stage: 'complete',
    deviceClass: 'iPhone',
    deviceModelIdentifier: 'iPhone14,7',
    sourceCommit: 'b'.repeat(40),
    systemName: 'iOS',
    systemVersion: '26.6',
    bundleIdentifier: 'org.openoutdoor.local',
    appVersion: '0.1.0',
    buildNumber: '1',
    startedAt: '2026-08-25T11:00:00Z',
    referenceClimbM: 30,
    measuredAscentM: 31,
    elevationAllowedErrorM: 15,
    authorizationStatuses: ['authorized-always', 'denied', 'authorized-always'],
    maximumBackgroundSeconds: 1810,
    networkTransitions: 2,
    accessibility: {
      voiceOverRunning: true,
      preferredContentSizeCategory: 'UICTContentSizeCategoryAccessibilityXXXL',
      largestAccessibilitySize: true,
      boldTextEnabled: true,
      increasedContrastEnabled: true,
      differentiateWithoutColorEnabled: true,
      reduceMotionEnabled: true,
      darkModeEnabled: true,
    },
    memory: {
      elapsedSeconds: 1810,
      sampleCount: 360,
      samplesBytes: [40_000_000, 41_000_000],
      p95ResidentBytes: 41_000_000,
      maxResidentBytes: 41_000_000,
      thresholdBytes: 157_286_400,
      passed: true,
    },
    results: {
      trackerCorrectness: {
        passed: true,
        checks: allTrue([
          'crashRelaunched',
          'trackerRecovered',
          'permissionLossObserved',
          'permissionSafeStopObserved',
          'permissionRestored',
          'screenOffDuration',
          'networkTransition',
          'weakGPSObserved',
          'explicitStopObserved',
        ]),
      },
      memorySmoke: {
        passed: true,
        checks: allTrue(['duration', 'sampleCount', 'residentMemoryP95', 'nativeResult']),
      },
      voiceOver: {
        passed: true,
        checks: allTrue(['voiceOverRunning', 'controlsExercised', 'usabilityConfirmed']),
      },
      dynamicType: {
        passed: true,
        checks: allTrue([
          'largestAccessibilitySize',
          'boldText',
          'increasedContrast',
          'controlsExercised',
          'differentiateWithoutColor',
          'reduceMotion',
          'darkMode',
          'usabilityConfirmed',
        ]),
      },
      elevation: { passed: true, checks: allTrue(['measured', 'withinThreshold']) },
    },
    events: [{ kind: 'acceptance-started', recordedAt: '2026-08-25T11:00:00Z', detail: null }],
  };
}

describe('WP-109 guided physical evidence ingestion', () => {
  it('independently accepts a complete threshold-passing redacted report', () => {
    expect(evaluatePhase1PhysicalReport(passingReport())).toEqual({
      status: 'passed',
      blockers: [],
    });
  });

  it('accepts the sanctioned AltServer team suffix but rejects unrelated bundle identifiers', () => {
    const signed = passingReport();
    signed.bundleIdentifier = 'org.openoutdoor.local.24NWAUKHG4';
    expect(evaluatePhase1PhysicalReport(signed)).toEqual({ status: 'passed', blockers: [] });

    const unrelated = passingReport();
    unrelated.bundleIdentifier = 'org.openoutdoor.local.attacker';
    expect(evaluatePhase1PhysicalReport(unrelated).blockers).toContain(
      'bundle identifier does not match the local acceptance build',
    );
  });

  it('rejects a self-declared pass when the binding memory threshold fails', () => {
    const report = passingReport();
    report.memory.p95ResidentBytes = 157_286_401;
    expect(evaluatePhase1PhysicalReport(report)).toMatchObject({ status: 'blocked' });
  });

  it('rejects coordinate-bearing evidence even if all checks claim to pass', () => {
    const report = { ...passingReport(), coordinate: [-74, 41] };
    expect(evaluatePhase1PhysicalReport(report).blockers).toContain(
      'privacy: sensitive field $.coordinate',
    );
  });

  it('rejects the wrong device model or a report from another candidate commit', () => {
    const wrongDevice = passingReport();
    wrongDevice.deviceModelIdentifier = 'iPhone14,8';
    expect(evaluatePhase1PhysicalReport(wrongDevice).status).toBe('blocked');
    expect(
      evaluatePhase1PhysicalReport(passingReport(), { sourceCommit: 'c'.repeat(40) }).status,
    ).toBe('blocked');
  });

  it('prepares evidence statuses but preserves mandatory reviewer acceptance', () => {
    const proposal = createPhase1EvidenceProposal(passingReport(), {
      evidencePath: 'docs/evidence/artifacts/report.json',
      generatedAt: '2026-08-25T12:01:00Z',
      reportSha256: 'a'.repeat(64),
      sourceCommit: 'b'.repeat(40),
    });
    expect(proposal).toMatchObject({
      gateStatusRecommendation: 'blocked-pending-reviewer',
      reviewerActionRequired: true,
      acceptance: { trackerCorrectness: { status: 'passed' } },
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  PHASE4_PROFILE_ID,
  PHASE4_COMMANDS,
  PHASE4_INPUTS,
  PHASE4_PACKAGES,
  evaluatePhase4Report,
  createPhase4Proposal,
  phase4Environment,
} from '../../../tools/phase4-guided-lib.mjs';

const commit = 'a'.repeat(40);
function passingReport() {
  return {
    schemaVersion: 1,
    profileId: PHASE4_PROFILE_ID,
    sourceCommit: commit,
    completedCommit: commit,
    cleanBefore: true,
    cleanAfter: true,
    nodeVersion: 'v24.19.0',
    inputHashes: Object.fromEntries(PHASE4_INPUTS.map((path: string) => [path, 'b'.repeat(64)])),
    commands: PHASE4_COMMANDS.map((id: string) => ({ id, passed: true, exitCode: 0 })),
    passedTestFiles: Object.values(PHASE4_PACKAGES).map((entry) => entry[1]),
    testsPassed: 270,
    testsFailed: 0,
    testsPending: 0,
  };
}
describe('Phase 4 acceptance evidence', () => {
  it('proposes all six packages but leaves acceptance to a reviewer', () => {
    const report = passingReport();
    expect(evaluatePhase4Report(report, commit).status).toBe('passed');
    const proposal = createPhase4Proposal(report, 'c'.repeat(64));
    expect(Object.keys(proposal.packageRecommendations)).toEqual(Object.keys(PHASE4_PACKAGES));
    expect(proposal.review.accepted).toBe(false);
    expect(proposal.gateStatusRecommendation).toBe('blocked-pending-reviewer');
  });
  it.each(PHASE4_COMMANDS)('blocks missing or failed %s checks', (id) => {
    const report = passingReport();
    report.commands = report.commands.filter((command) => command.id !== id);
    expect(evaluatePhase4Report(report, commit).status).toBe('blocked');
    report.commands.push({ id, passed: true, exitCode: 1 });
    expect(evaluatePhase4Report(report, commit).status).toBe('blocked');
  });
  it('rejects duplicate command records and missing suite evidence', () => {
    const report = passingReport();
    report.commands.push(report.commands[0]);
    report.passedTestFiles = [];
    expect(evaluatePhase4Report(report, commit).blockers).toHaveLength(7);
    expect(createPhase4Proposal(report, 'c'.repeat(64)).gateStatusRecommendation).toBe('blocked');
  });
  it.each([
    { cleanBefore: false },
    { cleanAfter: false },
    { completedCommit: 'd'.repeat(40) },
    { sourceCommit: 'd'.repeat(40) },
    { nodeVersion: 'v22.0.0' },
    { inputHashes: {} },
    { testsPassed: 0 },
    { testsFailed: 1 },
    { testsPending: 1 },
    { profileId: 'other' },
  ])('rejects invalid evidence %j', (change) => {
    expect(evaluatePhase4Report({ ...passingReport(), ...change }, commit).status).toBe('blocked');
  });
  it('removes private roots, credentials and injected runtime/git settings', () => {
    expect(
      phase4Environment({
        PATH: 'tools',
        OUTDOOR_PRIVATE_ROOT: 'private',
        API_TOKEN: 'secret',
        GIT_DIR: 'elsewhere',
        NODE_OPTIONS: '--import=unsafe',
      }),
    ).toEqual({ PATH: 'tools' });
  });
});

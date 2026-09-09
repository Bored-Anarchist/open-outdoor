export const PHASE4_PROFILE_ID = 'connector-ecosystem-phase4-v1';
export const PHASE4_PACKAGES = {
  'WP-401': ['T-INT-003-C10', 'packages/data/test/source-scaffold.test.ts'],
  'WP-402': ['T-INT-003-C11', 'packages/data/test/acquisition.test.ts'],
  'WP-403': ['T-INT-004-C01', 'packages/import-export/test/selected-import.test.ts'],
  'WP-404': ['T-INT-003-C12', 'packages/data/test/permission-shells.test.ts'],
  'WP-405': ['T-E2E-003-C01', 'packages/data/test/private-extension.test.ts'],
  'WP-406': ['T-INT-003-C13', 'packages/data/test/connector-operations.test.ts'],
};
export const PHASE4_COMMANDS = [
  'types',
  'tests',
  'format',
  'release',
  'workflows',
  'nativeContract',
  'privatePolicy',
  'privateDownstream',
  'publicBuild',
  'publicBoundary',
];
export const PHASE4_INPUTS = [
  'package.json',
  'pnpm-lock.yaml',
  'config/release.json',
  'config/extension-api.json',
];

export function phase4Environment(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key]) =>
        !/(?:KEY|TOKEN|SECRET|PASSWORD|PASSPHRASE)$/i.test(key) &&
        !/^(?:OUTDOOR_PRIVATE|GIT_|NODE_OPTIONS$)/i.test(key),
    ),
  );
}

export function evaluatePhase4Report(report, sourceCommit) {
  const blockers = [];
  if (report.schemaVersion !== 1 || report.profileId !== PHASE4_PROFILE_ID)
    blockers.push('profile mismatch');
  if (
    !/^[a-f0-9]{40}$/.test(report.sourceCommit ?? '') ||
    report.sourceCommit !== sourceCommit ||
    report.completedCommit !== sourceCommit
  )
    blockers.push('candidate mismatch');
  if (report.cleanBefore !== true || report.cleanAfter !== true)
    blockers.push('candidate must be clean before and after checks');
  if (report.nodeVersion !== 'v24.19.0') blockers.push('pinned Node version required');
  for (const path of PHASE4_INPUTS) {
    if (!/^[a-f0-9]{64}$/.test(report.inputHashes?.[path] ?? ''))
      blockers.push(`missing input hash: ${path}`);
  }
  for (const id of PHASE4_COMMANDS) {
    const matches = (report.commands ?? []).filter((command) => command.id === id);
    if (matches.length !== 1 || matches[0].passed !== true || matches[0].exitCode !== 0)
      blockers.push(`check failed or missing: ${id}`);
  }
  for (const [wp, [, path]] of Object.entries(PHASE4_PACKAGES)) {
    if (!report.passedTestFiles?.includes(path)) blockers.push(`required suite missing: ${wp}`);
  }
  if (!(report.testsPassed > 0) || report.testsFailed !== 0 || report.testsPending !== 0)
    blockers.push('tests failed, skipped, or missing');
  return { status: blockers.length ? 'blocked' : 'passed', blockers };
}

export function createPhase4Proposal(report, reportSha256) {
  const evaluation = evaluatePhase4Report(report, report.sourceCommit);
  return {
    schemaVersion: 1,
    profileId: PHASE4_PROFILE_ID,
    sourceCommit: report.sourceCommit,
    reportSha256,
    evaluation,
    packageRecommendations: Object.fromEntries(
      Object.entries(PHASE4_PACKAGES).map(([wp, [testId]]) => [
        wp,
        { testId, status: evaluation.status === 'passed' ? 'accepted-after-review' : 'blocked' },
      ]),
    ),
    gateStatusRecommendation:
      evaluation.status === 'passed' ? 'blocked-pending-reviewer' : 'blocked',
    reviewerActionRequired: true,
    review: { accepted: false, reviewer: '', date: '', notes: '' },
    scope:
      'Synthetic shared API and laptop-worker evidence; no service authorization or physical-device claims.',
  };
}

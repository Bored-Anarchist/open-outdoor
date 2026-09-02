export const PHASE3_PROFILE_ID = 'iphone14-ios26.6-phase3-v1';

export const REQUIRED_PHASE3_COMMANDS = [
  'phase3Types',
  'phase3Tests',
  'phase3Format',
  'releaseVerify',
  'workflowVerify',
  'nativeContract',
  'publicBoundary',
];

export const REQUIRED_PHASE3_TEST_FILES = [
  'packages/data/test/public-pack.test.ts',
  'packages/data/test/production-pack.test.ts',
  'packages/map/test/basemap.test.ts',
  'packages/map/test/offline-explore.test.ts',
  'packages/map/test/field-readiness.test.ts',
  'packages/storage/test/catalog-activation.test.ts',
  'packages/storage/test/composition.test.ts',
  'packages/backup/test/backup.test.ts',
  'packages/tracking/test/field-hardening.test.ts',
];

export const REQUIRED_PHASE3_ACCEPTANCE = [
  'productionArtifacts',
  'catalogSafety',
  'offlineProduct',
  'privateComposition',
  'backupRestore',
  'fieldReadiness',
  'accessibility',
  'installableIos',
  'privacyRights',
];

const requiredDeviceFlows = [
  'offlineExplore',
  'catalogActivationAndRollback',
  'composedOrigins',
  'privateCatalogRemovalPreservedUserData',
  'backupReinstallRestore',
  'degradedAndErrorStates',
];

const requiredAccessibility = [
  'voiceOver',
  'dynamicType',
  'boldText',
  'increasedContrast',
  'differentiateWithoutColor',
  'reduceMotion',
  'darkMode',
  'touchTargets',
  'oneHandedUse',
];

export function evaluatePhase3PhysicalReport(report, options = {}) {
  const blockers = [];
  if (report?.schemaVersion !== 1) blockers.push('physical report schemaVersion must be 1');
  if (report?.profileId !== PHASE3_PROFILE_ID)
    blockers.push('physical report profileId is invalid');
  if (!/^[0-9a-f]{40}$/i.test(report?.sourceCommit ?? '')) {
    blockers.push('physical report source commit is missing or invalid');
  }
  if (options.sourceCommit && report?.sourceCommit !== options.sourceCommit) {
    blockers.push('physical report source commit does not match the candidate');
  }
  if (!/^[0-9a-f]{64}$/i.test(report?.binarySha256 ?? '')) {
    blockers.push('physical report binary checksum is missing or invalid');
  }
  if (report?.deviceModel !== 'iPhone 14' || report?.systemVersion !== 'iOS 26.6') {
    blockers.push('physical report device/profile does not match iPhone 14/iOS 26.6');
  }
  if (report?.installationPassed !== true) blockers.push('installable iOS candidate did not pass');
  if (report?.coordinateFree !== true || report?.containsPersonalData !== false) {
    blockers.push('physical report privacy classification is unsafe');
  }

  const performance = report?.performance ?? {};
  const budgets = [
    ['cold launch p50', performance.coldLaunchP50Ms, 2500, 'maximum'],
    ['cold launch p95', performance.coldLaunchP95Ms, 4000, 'maximum'],
    ['search p50', performance.searchP50Ms, 150, 'maximum'],
    ['search p95', performance.searchP95Ms, 500, 'maximum'],
    ['search max', performance.searchMaxMs, 1000, 'maximum'],
    ['map frame rate p95', performance.mapFrameRateP95, 30, 'minimum'],
    ['main-thread stall max', performance.mainThreadStallMaxMs, 250, 'maximum'],
    ['catalog activation', performance.catalogActivationSeconds, 300, 'maximum'],
    ['first launch after switch', performance.firstLaunchAfterSwitchSeconds, 10, 'maximum'],
    ['map memory p95', performance.mapMemoryP95MiB, 500, 'maximum'],
  ];
  for (const [label, value, threshold, direction] of budgets) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (direction === 'maximum' ? value > threshold : value < threshold)
    ) {
      blockers.push(`${label}: physical budget did not pass`);
    }
  }

  for (const id of requiredDeviceFlows) {
    if (report?.deviceFlows?.[id] !== true) blockers.push(`${id}: device flow did not pass`);
  }
  for (const id of requiredAccessibility) {
    if (report?.accessibility?.[id] !== true)
      blockers.push(`${id}: accessibility check did not pass`);
  }

  if (report?.attestation?.completed !== true || !report?.attestation?.tester) {
    blockers.push('physical tester attestation is incomplete');
  }
  return { status: blockers.length === 0 ? 'passed' : 'blocked', blockers };
}

export function evaluatePhase3EnduranceEvidence(report) {
  const findings = [];
  const runs = Array.isArray(report?.fieldRuns) ? report.fieldRuns : [];
  const runIds = new Set();
  for (const run of runs) {
    if (runIds.has(run.runId)) findings.push(`${run.runId}: duplicate field run identifier`);
    runIds.add(run.runId);
    if (run.environment !== 'physical-iphone') {
      findings.push(`${run.runId}: replay/simulator is supplemental only`);
      continue;
    }
    if (run.sourceCommit !== report.sourceCommit) {
      findings.push(`${run.runId}: source commit does not match the physical report`);
    }
    const hours = run.durationMinutes / 60;
    const batteryRate = (run.batteryStartPercent - run.batteryEndPercent) / hours;
    const storageRate = run.storageGrowthBytes / 1024 ** 2 / hours;
    const maximumBatteryRate = run.mode === 'endurance' ? 4 : 6;
    const passed =
      run.profileId === PHASE3_PROFILE_ID &&
      run.deviceModel === 'iPhone 14' &&
      run.systemVersion === 'iOS 26.6' &&
      ['balanced', 'endurance'].includes(run.mode) &&
      Number.isFinite(hours) &&
      hours >= 3 &&
      Number.isFinite(batteryRate) &&
      batteryRate >= 0 &&
      batteryRate <= maximumBatteryRate &&
      run.seriousThermalSeconds === 0 &&
      run.criticalThermalSeconds === 0 &&
      run.maximumCheckpointGapSeconds <= 30 &&
      storageRate >= 0 &&
      storageRate <= 64 &&
      run.sensorsActiveWhileStoppedSeconds === 0 &&
      run.offlineBrowsePassed === true &&
      run.offlineSearchPassed === true &&
      run.crashRecoveryPassed === true &&
      run.degradedGpsStatePassed === true &&
      run.accessibilityPassed === true;
    if (!passed) findings.push(`${run.runId}: one or more field thresholds failed`);
  }
  for (const mode of ['balanced', 'endurance']) {
    const count = runs.filter(
      (run) => run.environment === 'physical-iphone' && run.mode === mode,
    ).length;
    if (count < 3) findings.push(`${mode}: ${3 - count} physical run(s) deferred`);
  }
  return {
    status: findings.length === 0 ? 'passed' : 'conditionally-approved',
    blockingPhase: 'Phase 5',
    workPackage: 'WP-503',
    findings,
  };
}

export function evaluatePhase3GuidedReport(report, options = {}) {
  const blockers = [];
  if (report?.schemaVersion !== 1) blockers.push('schemaVersion must be 1');
  if (report?.profileId !== PHASE3_PROFILE_ID) blockers.push('profileId does not match Phase 3');
  if (!/^[0-9a-f]{40}$/i.test(report?.sourceCommit ?? '')) {
    blockers.push('source commit is missing or invalid');
  }
  if (options.sourceCommit && report?.sourceCommit !== options.sourceCommit) {
    blockers.push('report source commit does not match the evaluated candidate');
  }
  if (report?.workingTreeClean !== true) blockers.push('candidate working tree was not clean');
  if (report?.nodeVersion !== 'v24.19.0') blockers.push('runner did not use pinned Node v24.19.0');
  const commands = new Map(
    (Array.isArray(report?.commands) ? report.commands : []).map((command) => [
      command.id,
      command,
    ]),
  );
  for (const id of REQUIRED_PHASE3_COMMANDS) {
    if (commands.get(id)?.passed !== true) blockers.push(`${id}: command did not pass`);
  }
  const passedFiles = new Set(Array.isArray(report?.passedTestFiles) ? report.passedTestFiles : []);
  for (const file of REQUIRED_PHASE3_TEST_FILES) {
    if (!passedFiles.has(file)) blockers.push(`${file}: test file did not pass`);
  }
  if (report?.physicalEvaluation?.status !== 'passed') {
    blockers.push(...(report?.physicalEvaluation?.blockers ?? ['physical report is required']));
  }
  for (const id of REQUIRED_PHASE3_ACCEPTANCE) {
    if (report?.acceptance?.[id]?.passed !== true) {
      blockers.push(`${id}: acceptance criterion did not pass`);
    }
  }
  return { status: blockers.length === 0 ? 'passed' : 'blocked', blockers: [...new Set(blockers)] };
}

export function createPhase3EvidenceProposal(report, options) {
  const evaluation = evaluatePhase3GuidedReport(report, { sourceCommit: options.sourceCommit });
  const accepted = evaluation.status === 'passed';
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt,
    profileId: PHASE3_PROFILE_ID,
    sourceCommit: options.sourceCommit,
    reportSha256: options.reportSha256,
    reportPath: options.reportPath,
    evaluation,
    conditionalApprovals: {
      fieldEndurance: report.enduranceDisposition,
    },
    packageRecommendations: accepted
      ? Object.fromEntries(
          Array.from({ length: 7 }, (_, index) => [`WP-${301 + index}`, 'accepted-after-review']),
        )
      : {},
    gateStatusRecommendation: accepted ? 'blocked-pending-reviewer' : 'blocked',
    reviewerActionRequired: true,
  };
}

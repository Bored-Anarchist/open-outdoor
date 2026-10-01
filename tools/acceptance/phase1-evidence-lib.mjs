const REQUIRED_RESULTS = [
  'trackerCorrectness',
  'memorySmoke',
  'voiceOver',
  'dynamicType',
  'elevation',
];

const REQUIRED_TRACKER_CHECKS = [
  'crashRelaunched',
  'trackerRecovered',
  'permissionLossObserved',
  'permissionSafeStopObserved',
  'permissionRestored',
  'screenOffDuration',
  'networkTransition',
  'weakGPSObserved',
  'explicitStopObserved',
];
const LOCAL_ACCEPTANCE_BUNDLE = /^org\.openoutdoor\.local(?:\.[A-Z0-9]{10})?$/;

const SENSITIVE_KEYS = new Set([
  'coordinate',
  'coordinates',
  'latitude',
  'longitude',
  'routegeometry',
  'rawlocation',
]);

function sensitivePaths(value, path = '$', found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => sensitivePaths(item, `${path}[${index}]`, found));
    return found;
  }
  if (typeof value !== 'object' || value === null) return found;
  for (const [key, item] of Object.entries(value)) {
    const next = `${path}.${key}`;
    if (SENSITIVE_KEYS.has(key.toLowerCase())) found.push(next);
    sensitivePaths(item, next, found);
  }
  return found;
}

function requireTrueChecks(blockers, report, resultName, checkNames) {
  const result = report?.results?.[resultName];
  if (result?.passed !== true) blockers.push(`${resultName}: native result did not pass`);
  for (const checkName of checkNames) {
    if (result?.checks?.[checkName] !== true) {
      blockers.push(`${resultName}.${checkName}: required check did not pass`);
    }
  }
}

export function evaluatePhase1PhysicalReport(report, options = {}) {
  const blockers = [];
  if (report?.schemaVersion !== 1) blockers.push('schemaVersion must be 1');
  if (report?.profileId !== 'iphone14-ios26.6-phase1-v1') {
    blockers.push('profileId does not match the pinned Phase 1 profile');
  }
  if (report?.systemName !== 'iOS' || report?.systemVersion !== '26.6') {
    blockers.push('report was not captured on the pinned iOS 26.6 environment');
  }
  if (!LOCAL_ACCEPTANCE_BUNDLE.test(report?.bundleIdentifier ?? '')) {
    blockers.push('bundle identifier does not match the local acceptance build');
  }
  if (report?.deviceModelIdentifier !== 'iPhone14,7') {
    blockers.push('device model does not match the pinned iPhone 14');
  }
  if (!/^[0-9a-f]{40}$/i.test(report?.sourceCommit ?? '')) {
    blockers.push('source commit is missing or invalid');
  }
  if (options.sourceCommit !== undefined && report?.sourceCommit !== options.sourceCommit) {
    blockers.push('report source commit does not match the evaluated candidate');
  }
  if (report?.stage !== 'complete') blockers.push('guided acceptance is not complete');

  requireTrueChecks(blockers, report, 'trackerCorrectness', REQUIRED_TRACKER_CHECKS);

  const memory = report?.memory;
  const memoryChecks = {
    duration: (memory?.elapsedSeconds ?? 0) >= 1800,
    sampleCount: (memory?.sampleCount ?? 0) >= 20,
    residentMemoryP95: (memory?.p95ResidentBytes ?? Number.MAX_SAFE_INTEGER) <= 157286400,
    threshold: memory?.thresholdBytes === 157286400,
    nativeResult: memory?.passed === true,
  };
  for (const [name, passed] of Object.entries(memoryChecks)) {
    if (!passed) blockers.push(`memorySmoke.${name}: independently evaluated check failed`);
  }
  requireTrueChecks(blockers, report, 'memorySmoke', [
    'duration',
    'sampleCount',
    'residentMemoryP95',
    'nativeResult',
  ]);

  const accessibility = report?.accessibility;
  if (accessibility?.voiceOverRunning !== true) {
    blockers.push('voiceOver.voiceOverRunning: VoiceOver was not detected');
  }
  requireTrueChecks(blockers, report, 'voiceOver', [
    'voiceOverRunning',
    'controlsExercised',
    'usabilityConfirmed',
  ]);

  const dynamicChecks = {
    largestAccessibilitySize: accessibility?.largestAccessibilitySize === true,
    boldText: accessibility?.boldTextEnabled === true,
    increasedContrast: accessibility?.increasedContrastEnabled === true,
    differentiateWithoutColor: accessibility?.differentiateWithoutColorEnabled === true,
    reduceMotion: accessibility?.reduceMotionEnabled === true,
    darkMode: accessibility?.darkModeEnabled === true,
  };
  for (const [name, passed] of Object.entries(dynamicChecks)) {
    if (!passed) blockers.push(`dynamicType.${name}: required setting was not detected`);
  }
  requireTrueChecks(blockers, report, 'dynamicType', [
    'largestAccessibilitySize',
    'boldText',
    'increasedContrast',
    'differentiateWithoutColor',
    'reduceMotion',
    'darkMode',
    'controlsExercised',
    'usabilityConfirmed',
  ]);

  const reference = report?.referenceClimbM;
  const measured = report?.measuredAscentM;
  if (!(
    Number.isFinite(reference) &&
    reference > 0 &&
    Number.isFinite(measured) &&
    measured >= 0
  )) {
    blockers.push('elevation: reference or measured ascent is invalid');
  } else {
    const allowed = Math.max(15, reference * 0.1);
    if (report.elevationAllowedErrorM !== allowed) {
      blockers.push('elevation: declared allowed error does not match the binding threshold');
    }
    if (Math.abs(measured - reference) > allowed) {
      blockers.push('elevation: controlled climb exceeded the binding threshold');
    }
  }
  requireTrueChecks(blockers, report, 'elevation', ['measured', 'withinThreshold']);

  for (const resultName of REQUIRED_RESULTS) {
    if (report?.results?.[resultName] === undefined) blockers.push(`${resultName}: missing result`);
  }
  for (const path of sensitivePaths(report)) blockers.push(`privacy: sensitive field ${path}`);

  if (blockers.length === 0 && report?.status !== 'passed') {
    blockers.push('report status is inconsistent with independently evaluated results');
  }
  return { status: blockers.length === 0 ? 'passed' : 'blocked', blockers };
}

export function createPhase1EvidenceProposal(report, options) {
  const evaluation = evaluatePhase1PhysicalReport(report, { sourceCommit: options.sourceCommit });
  const evidencePath = options.evidencePath;
  const accepted = evaluation.status === 'passed';
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt,
    sourceCommit: options.sourceCommit,
    reportSha256: options.reportSha256,
    evidencePath,
    evaluation,
    acceptance: Object.fromEntries(
      REQUIRED_RESULTS.map((name) => [
        name,
        { status: accepted ? 'passed' : 'blocked', evidence: evidencePath },
      ]),
    ),
    packageRecommendations: accepted
      ? {
          'WP-103': 'accepted',
          'WP-104': 'accepted',
          'WP-105': 'accepted',
          'WP-109': 'accepted-after-review',
        }
      : {},
    gateStatusRecommendation: accepted ? 'blocked-pending-reviewer' : 'blocked',
    reviewerActionRequired: true,
  };
}

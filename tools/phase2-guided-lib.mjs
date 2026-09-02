export const PHASE2_PROFILE_ID = 'new-york-data-alpha-phase2-v1';

export const API_DATA_GOV_DEMO_KEY = 'DEMO_KEY';

export function resolveProbeCredential(source, environment = process.env) {
  if (!source.secretName) return undefined;
  if (source.secretName === 'NPS_API_KEY') {
    return environment.NPS_API_KEY || API_DATA_GOV_DEMO_KEY;
  }
  return environment[source.secretName];
}

export const EXPECTED_PHASE2_CASE_IDS = [
  ...Array.from({ length: 6 }, (_, index) => `T-UNIT-001-C${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 9 }, (_, index) => `T-INT-003-C${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 3 }, (_, index) => `T-REL-002-C${String(index + 1).padStart(2, '0')}`),
];

export const REQUIRED_PHASE2_COMMANDS = [
  'dataTypes',
  'dataTests',
  'phase2Format',
  'publicBoundary',
];

export const REQUIRED_PHASE2_TEST_FILES = [
  'packages/data/test/camping.test.ts',
  'packages/data/test/canonical.test.ts',
  'packages/data/test/catalog.test.ts',
  'packages/data/test/connector.test.ts',
  'packages/data/test/entity-resolution.test.ts',
  'packages/data/test/ingestion-security.test.ts',
  'packages/data/test/new-york.test.ts',
  'packages/data/test/public-pack.test.ts',
  'packages/data/test/secondary.test.ts',
];

export const REQUIRED_PHASE2_SOURCE_IDS = [
  'nys-its-state-boundary',
  'usgs-padus-ny',
  'nys-dec-lands',
  'usfs-surface-ownership-ny',
  'nys-dec-roads',
  'nys-dec-trails',
  'nys-dec-poi',
  'usfs-mvum-roads-ny',
  'nys-dec-statewide-camping-rules',
  'nys-dec-unit-rules',
  'usfs-gmfl-restrictions',
  'ridb-facilities-ny',
  'nps-parks-ny',
  'nps-campgrounds-ny',
  'nps-alerts-ny',
  'osm-geofabrik-ny',
  'usgs-3dep-ny',
];

export const REQUIRED_PHASE2_ACCEPTANCE = [
  'canonicalContracts',
  'campingSafety',
  'connectorContracts',
  'entityResolution',
  'hostileIngestion',
  'liveSourceAvailability',
  'publicPackReproducibility',
  'publicationBoundary',
  'rightsAndAttribution',
  'coverageAndExclusions',
];

export function evaluatePhase2GuidedReport(report, options = {}) {
  const blockers = [];
  if (report?.schemaVersion !== 1) blockers.push('schemaVersion must be 1');
  if (report?.profileId !== PHASE2_PROFILE_ID) blockers.push('profileId does not match Phase 2');
  if (report?.mode !== 'live') blockers.push('live source probes are required for acceptance');
  if (!/^[0-9a-f]{40}$/i.test(report?.sourceCommit ?? '')) {
    blockers.push('source commit is missing or invalid');
  }
  if (options.sourceCommit !== undefined && report?.sourceCommit !== options.sourceCommit) {
    blockers.push('report source commit does not match the evaluated candidate');
  }
  if (report?.workingTreeClean !== true) blockers.push('candidate working tree was not clean');
  if (report?.nodeVersion !== 'v24.19.0') blockers.push('runner did not use pinned Node v24.19.0');

  const commands = new Map((report?.commands ?? []).map((command) => [command.id, command]));
  for (const id of REQUIRED_PHASE2_COMMANDS) {
    if (commands.get(id)?.passed !== true) blockers.push(`${id}: command did not pass`);
  }

  const observedCases = new Set(report?.observedCaseIds ?? []);
  for (const caseId of EXPECTED_PHASE2_CASE_IDS) {
    if (!observedCases.has(caseId)) blockers.push(`${caseId}: acceptance case was not observed`);
  }
  const passedTestFiles = new Set(report?.passedTestFiles ?? []);
  for (const file of REQUIRED_PHASE2_TEST_FILES) {
    if (!passedTestFiles.has(file)) blockers.push(`${file}: test file did not pass`);
  }

  const requiredSources = new Set(report?.requiredSourceIds ?? []);
  for (const sourceId of REQUIRED_PHASE2_SOURCE_IDS) {
    if (!requiredSources.has(sourceId)) blockers.push(`${sourceId}: required source was omitted`);
  }
  for (const sourceId of requiredSources) {
    if (!REQUIRED_PHASE2_SOURCE_IDS.includes(sourceId)) {
      blockers.push(`${sourceId}: unexpected required source`);
    }
  }
  const probes = new Map((report?.sourceProbes ?? []).map((probe) => [probe.sourceId, probe]));
  for (const sourceId of REQUIRED_PHASE2_SOURCE_IDS) {
    if (probes.get(sourceId)?.passed !== true)
      blockers.push(`${sourceId}: live probe did not pass`);
  }
  for (const probe of report?.sourceProbes ?? []) {
    if (!requiredSources.has(probe.sourceId))
      blockers.push(`${probe.sourceId}: undeclared source probe`);
  }

  const acceptance = report?.acceptance ?? {};
  for (const id of REQUIRED_PHASE2_ACCEPTANCE) {
    if (acceptance[id]?.passed !== true) blockers.push(`${id}: acceptance criterion did not pass`);
  }

  return { status: blockers.length === 0 ? 'passed' : 'blocked', blockers };
}

export function createPhase2EvidenceProposal(report, options) {
  const evaluation = evaluatePhase2GuidedReport(report, { sourceCommit: options.sourceCommit });
  const accepted = evaluation.status === 'passed';
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt,
    profileId: PHASE2_PROFILE_ID,
    sourceCommit: options.sourceCommit,
    reportSha256: options.reportSha256,
    reportPath: options.reportPath,
    evaluation,
    acceptance: Object.fromEntries(
      REQUIRED_PHASE2_ACCEPTANCE.map((id) => [
        id,
        { status: accepted ? 'passed' : 'blocked', evidence: options.reportPath },
      ]),
    ),
    packageRecommendations: accepted
      ? Object.fromEntries(
          Array.from({ length: 10 }, (_, index) => [`WP-${201 + index}`, 'accepted-after-review']),
        )
      : {},
    gateStatusRecommendation: accepted ? 'blocked-pending-reviewer' : 'blocked',
    reviewerActionRequired: true,
  };
}

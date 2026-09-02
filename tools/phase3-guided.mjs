import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  PHASE3_PROFILE_ID,
  REQUIRED_PHASE3_TEST_FILES,
  createPhase3EvidenceProposal,
  evaluatePhase3GuidedReport,
  evaluatePhase3PhysicalReport,
} from './phase3-guided-lib.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const node = process.execPath;
const safeRoot = root.replaceAll('\\', '/').replace(/\/$/, '');
const gitArguments = (...args) => ['-c', `safe.directory=${safeRoot}`, ...args];

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sanitizedExcerpt(value) {
  return value
    .replace(/(?:api[_-]?key|token|secret|authorization|passphrase)\s*[:=]\s*\S+/gi, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, '[REDACTED]')
    .slice(-2000);
}

function runCommand(id, args) {
  const started = performance.now();
  const environment = { ...process.env, NO_COLOR: '1' };
  for (const key of Object.keys(environment)) {
    if (/(?:KEY|TOKEN|SECRET|PASSWORD|PASSPHRASE)$/i.test(key)) delete environment[key];
  }
  const result = spawnSync(node, args, {
    cwd: root,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 30 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return {
    id,
    passed: result.status === 0,
    exitCode: result.status ?? 1,
    durationMilliseconds: Math.round(performance.now() - started),
    outputSha256: sha256(output),
    failureExcerpt: result.status === 0 ? null : sanitizedExcerpt(output),
  };
}

function safeOutputPath(value) {
  const path = resolve(value);
  const fromRoot = relative(root, path);
  if (fromRoot.startsWith('..') || resolve(root, fromRoot) !== path) {
    throw new Error('Phase 3 generated files must remain inside the repository output tree');
  }
  return path;
}

function draftFieldRun(mode, index, sourceCommit) {
  return {
    environment: 'physical-iphone',
    profileId: PHASE3_PROFILE_ID,
    runId: `${mode}-${index}`,
    sourceCommit,
    deviceModel: 'iPhone 14',
    systemVersion: 'iOS 26.6',
    mode,
    durationMinutes: 0,
    batteryStartPercent: 0,
    batteryEndPercent: 0,
    seriousThermalSeconds: 0,
    criticalThermalSeconds: 0,
    maximumCheckpointGapSeconds: 0,
    storageGrowthBytes: 0,
    sensorsActiveWhileStoppedSeconds: 0,
    offlineBrowsePassed: false,
    offlineSearchPassed: false,
    crashRecoveryPassed: false,
    degradedGpsStatePassed: false,
    accessibilityPassed: false,
  };
}

function physicalTemplate(sourceCommit) {
  const falseChecks = (keys) => Object.fromEntries(keys.map((key) => [key, false]));
  return {
    schemaVersion: 1,
    profileId: PHASE3_PROFILE_ID,
    generatedAt: new Date().toISOString(),
    sourceCommit,
    binarySha256: '0'.repeat(64),
    deviceModel: 'iPhone 14',
    systemVersion: 'iOS 26.6',
    installationPassed: false,
    coordinateFree: true,
    containsPersonalData: false,
    performance: {
      coldLaunchP50Ms: 0,
      coldLaunchP95Ms: 0,
      searchP50Ms: 0,
      searchP95Ms: 0,
      searchMaxMs: 0,
      mapFrameRateP95: 0,
      mainThreadStallMaxMs: 0,
      catalogActivationSeconds: 0,
      firstLaunchAfterSwitchSeconds: 0,
      mapMemoryP95MiB: 0,
    },
    deviceFlows: falseChecks([
      'offlineExplore',
      'catalogActivationAndRollback',
      'composedOrigins',
      'privateCatalogRemovalPreservedUserData',
      'backupReinstallRestore',
      'degradedAndErrorStates',
    ]),
    accessibility: falseChecks([
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
      draftFieldRun('balanced', index, sourceCommit),
      draftFieldRun('endurance', index, sourceCommit),
    ]),
    attestation: { completed: false, tester: '', notes: '' },
  };
}

const outputPath = safeOutputPath(argument('--output') ?? 'dist/phase3-guided-report.json');
const proposalPath = safeOutputPath(argument('--proposal') ?? 'dist/phase3-evidence-proposal.json');
const templatePath = safeOutputPath(
  argument('--template') ?? 'dist/phase3-physical-report-template.json',
);
const physicalPathArgument = argument('--physical-report');
const startedAt = new Date().toISOString();
const sourceCommit = execFileSync('git', gitArguments('rev-parse', 'HEAD'), {
  cwd: root,
  encoding: 'utf8',
}).trim();
const workingTreeClean =
  execFileSync('git', gitArguments('status', '--porcelain', '--untracked-files=all'), {
    cwd: root,
    encoding: 'utf8',
  }).trim() === '';

console.log('Phase 3 guided acceptance');
console.log('Running local Product MVP checks...');
const vitestJson = safeOutputPath('dist/phase3-vitest.json');
await mkdir(dirname(vitestJson), { recursive: true });
const commands = [
  runCommand('phase3Types', [
    './node_modules/typescript/bin/tsc',
    '-b',
    'packages/shared',
    'packages/data',
    'packages/config',
    'packages/tracking',
    'packages/storage',
    'packages/map',
    'packages/import-export',
    'packages/backup',
    'packages/recorder',
    'apps/mobile',
  ]),
  runCommand('phase3Tests', [
    './node_modules/vitest/vitest.mjs',
    'run',
    ...REQUIRED_PHASE3_TEST_FILES,
    '--reporter=json',
    `--outputFile=${vitestJson}`,
  ]),
  runCommand('phase3Format', [
    './node_modules/prettier/bin/prettier.cjs',
    '--check',
    'packages/data',
    'packages/map',
    'packages/storage',
    'packages/backup',
    'packages/tracking',
    'tools/phase3-guided.mjs',
    'tools/phase3-guided-lib.mjs',
    'config/phase3-physical-report.schema.json',
    'config/phase3-guided-report.schema.json',
    'docs/PHASE_3_GUIDED_ACCEPTANCE.md',
    'docs/PHASE_3_ACCEPTANCE_CHECKLIST.md',
  ]),
  runCommand('releaseVerify', ['./tools/validate-release-config.mjs']),
  runCommand('workflowVerify', ['./tools/validate-workflows.mjs']),
  runCommand('nativeContract', ['./tools/validate-native-spikes.mjs']),
  runCommand('publicBoundary', ['./tools/public-boundary.mjs', '--scan', '.']),
];

let passedTestFiles = [];
try {
  const parsed = JSON.parse(await readFile(vitestJson, 'utf8'));
  passedTestFiles = (parsed.testResults ?? [])
    .filter((result) => result.status === 'passed')
    .map((result) => relative(root, result.name).replaceAll('\\', '/'))
    .sort();
} catch {
  // The failed command record is sufficient evidence when Vitest produced no report.
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const physicalSchema = JSON.parse(
  await readFile(new URL('../config/phase3-physical-report.schema.json', import.meta.url), 'utf8'),
);
const validatePhysical = ajv.compile(physicalSchema);
let physicalReport = null;
let physicalReference = null;
let physicalEvaluation = { status: 'blocked', blockers: ['physical report is required'] };

if (physicalPathArgument) {
  const physicalPath = resolve(physicalPathArgument);
  try {
    const bytes = await readFile(physicalPath);
    physicalReference = { path: basename(physicalPath), sha256: sha256(bytes) };
    try {
      physicalReport = JSON.parse(bytes.toString('utf8'));
    } catch {
      physicalEvaluation = { status: 'blocked', blockers: ['physical report is malformed JSON'] };
    }
  } catch {
    physicalEvaluation = { status: 'blocked', blockers: ['physical report could not be read'] };
  }
  if (physicalReport !== null) {
    if (!validatePhysical(physicalReport)) {
      physicalEvaluation = {
        status: 'blocked',
        blockers: ['physical report does not match its schema'],
      };
    } else {
      physicalEvaluation = evaluatePhase3PhysicalReport(physicalReport, { sourceCommit });
    }
  }
} else {
  await mkdir(dirname(templatePath), { recursive: true });
  await writeFile(templatePath, JSON.stringify(physicalTemplate(sourceCommit), null, 2) + '\n');
  console.log(`Physical report template: ${templatePath}`);
}

const commandPassed = (id) => commands.find((command) => command.id === id)?.passed === true;
const filePassed = (file) => passedTestFiles.includes(file);
const physicalPassed = physicalEvaluation.status === 'passed';
const localTestsPassed = commandPassed('phase3Types') && commandPassed('phase3Tests');
const acceptance = {
  productionArtifacts: {
    passed:
      localTestsPassed &&
      filePassed('packages/data/test/public-pack.test.ts') &&
      filePassed('packages/data/test/production-pack.test.ts') &&
      filePassed('packages/map/test/basemap.test.ts'),
    evidence: 'public/production pack and basemap suites',
  },
  catalogSafety: {
    passed: localTestsPassed && filePassed('packages/storage/test/catalog-activation.test.ts'),
    evidence: 'packages/storage/test/catalog-activation.test.ts',
  },
  offlineProduct: {
    passed:
      localTestsPassed &&
      filePassed('packages/map/test/offline-explore.test.ts') &&
      filePassed('packages/map/test/field-readiness.test.ts'),
    evidence: 'offline explore and field-readiness suites',
  },
  privateComposition: {
    passed: localTestsPassed && filePassed('packages/storage/test/composition.test.ts'),
    evidence: 'packages/storage/test/composition.test.ts',
  },
  backupRestore: {
    passed: localTestsPassed && filePassed('packages/backup/test/backup.test.ts'),
    evidence: 'packages/backup/test/backup.test.ts',
  },
  fieldHardening: {
    passed: physicalPassed && filePassed('packages/tracking/test/field-hardening.test.ts'),
    evidence: physicalReference?.path ?? 'physical report required',
  },
  accessibility: {
    passed: physicalPassed && physicalReport?.accessibility !== undefined,
    evidence: physicalReference?.path ?? 'physical report required',
  },
  installableIos: {
    passed: physicalPassed && physicalReport?.installationPassed === true,
    evidence: physicalReference?.path ?? 'physical report required',
  },
  privacyRights: {
    passed:
      commandPassed('publicBoundary') &&
      commandPassed('releaseVerify') &&
      commandPassed('workflowVerify') &&
      commandPassed('nativeContract'),
    evidence: 'release, workflow, native-contract, and public-boundary verification',
  },
};

const baseReport = {
  schemaVersion: 1,
  profileId: PHASE3_PROFILE_ID,
  generatedAt: new Date().toISOString(),
  startedAt,
  completedAt: new Date().toISOString(),
  sourceCommit,
  workingTreeClean,
  nodeVersion: process.version,
  platform: process.platform,
  physicalReport: physicalReference,
  commands,
  passedTestFiles,
  physicalEvaluation,
  acceptance,
};
const evaluation = evaluatePhase3GuidedReport(baseReport, { sourceCommit });
const report = { ...baseReport, status: evaluation.status, blockers: evaluation.blockers };
const reportSchema = JSON.parse(
  await readFile(new URL('../config/phase3-guided-report.schema.json', import.meta.url), 'utf8'),
);
const validateReport = ajv.compile(reportSchema);
if (!validateReport(report)) {
  console.error('Generated Phase 3 report does not match its schema');
  console.error(JSON.stringify(validateReport.errors, null, 2));
  process.exit(2);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
const reportBytes = await readFile(outputPath);
const proposal = createPhase3EvidenceProposal(report, {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  reportSha256: sha256(reportBytes),
  reportPath: relative(root, outputPath).replaceAll('\\', '/'),
});
await mkdir(dirname(proposalPath), { recursive: true });
await writeFile(proposalPath, JSON.stringify(proposal, null, 2) + '\n');

console.log(`Phase 3 guided acceptance: ${report.status}`);
for (const blocker of report.blockers) console.log(`- ${blocker}`);
console.log(`Report: ${outputPath}`);
console.log(`Reviewer proposal: ${proposalPath}`);
console.log('Reviewer acceptance is required; this runner never changes a gate record.');
if (report.status !== 'passed') process.exitCode = 1;

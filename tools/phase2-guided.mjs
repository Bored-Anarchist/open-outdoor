import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  PHASE2_PROFILE_ID,
  REQUIRED_PHASE2_TEST_FILES,
  createPhase2EvidenceProposal,
  evaluatePhase2GuidedReport,
} from './phase2-guided-lib.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const node = process.execPath;
const safeRoot = root.replaceAll('\\', '/').replace(/\/$/, '');
const gitArguments = (...args) => ['-c', `safe.directory=${safeRoot}`, ...args];

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function hasArgument(name) {
  return process.argv.includes(name);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sanitizedExcerpt(value) {
  return value
    .replace(/(?:api[_-]?key|token|secret|authorization)\s*[:=]\s*\S+/gi, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, '[REDACTED]')
    .slice(-2000);
}

function runCommand(id, args) {
  const started = performance.now();
  const environment = { ...process.env, NO_COLOR: '1' };
  delete environment.RIDB_API_KEY;
  delete environment.NPS_API_KEY;
  const result = spawnSync(node, args, {
    cwd: root,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 20 * 1024 * 1024,
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

async function readResponseSample(response, maximumBytes) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let length = 0;
  while (length < maximumBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const accepted = value.subarray(0, Math.min(value.byteLength, maximumBytes - length));
    chunks.push(accepted);
    length += accepted.byteLength;
    if (accepted.byteLength < value.byteLength) break;
  }
  await reader.cancel().catch(() => undefined);
  const sample = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    sample.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return sample;
}

function validateObservation(source, text, contentType) {
  if (source.family === 'document') {
    return contentType.includes('text/html') || contentType.includes('application/pdf')
      ? 'document content type accepted'
      : null;
  }
  if (source.family === 'checksum') {
    return /^[0-9a-f]{32}\s+/i.test(text.trim()) ? 'published MD5 observed' : null;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (source.family === 'arcgis') {
    return Number.isSafeInteger(parsed?.count) && parsed?.error === undefined
      ? `record count observed: ${parsed.count}`
      : null;
  }
  if (source.family === 'socrata') {
    return Array.isArray(parsed) ? `sample rows observed: ${parsed.length}` : null;
  }
  if (source.family === 'ridb') {
    const count = Number(parsed?.METADATA?.RESULTS?.TOTAL_COUNT);
    return Number.isSafeInteger(count) && count >= 0 ? `record count observed: ${count}` : null;
  }
  if (source.family === 'nps') {
    const count = Number(parsed?.total);
    return Number.isSafeInteger(count) && count >= 0 && Array.isArray(parsed?.data)
      ? `record count observed: ${count}`
      : null;
  }
  if (source.family === 'tnm') {
    const count = Number(parsed?.total);
    return Number.isSafeInteger(count) && count >= 0 && Array.isArray(parsed?.items)
      ? `record count observed: ${count}`
      : null;
  }
  return null;
}

async function probeSource(source, profile, mode) {
  const started = performance.now();
  const hostname = new URL(source.url).hostname;
  if (mode !== 'live') {
    return {
      sourceId: source.sourceId,
      family: source.family,
      hostname,
      passed: false,
      statusCode: null,
      contentType: null,
      sampledBytes: 0,
      durationMilliseconds: 0,
      observation: 'live probe disabled by --offline',
    };
  }
  const headers = {
    Accept: source.family === 'document' ? 'text/html,application/pdf' : 'application/json,*/*',
    Range: `bytes=0-${profile.maximumSampleBytes - 1}`,
    'User-Agent': 'OpenOutdoor-Phase2-Acceptance/1.0',
  };
  if (source.secretName) {
    const secret = process.env[source.secretName];
    if (!secret) {
      return {
        sourceId: source.sourceId,
        family: source.family,
        hostname,
        passed: false,
        statusCode: null,
        contentType: null,
        sampledBytes: 0,
        durationMilliseconds: 0,
        observation: `missing environment credential ${source.secretName}`,
      };
    }
    headers[source.secretHeader] = secret;
  }
  try {
    const response = await fetch(source.url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(profile.timeoutMilliseconds),
    });
    const sample = await readResponseSample(response, profile.maximumSampleBytes);
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    const observation = validateObservation(
      source,
      new TextDecoder().decode(sample),
      contentType.toLowerCase(),
    );
    return {
      sourceId: source.sourceId,
      family: source.family,
      hostname,
      passed: response.ok && observation !== null,
      statusCode: response.status,
      contentType,
      sampledBytes: sample.byteLength,
      durationMilliseconds: Math.round(performance.now() - started),
      observation: observation ?? 'response did not match the source contract',
    };
  } catch (error) {
    const causeCode =
      error && typeof error === 'object' && error.cause && typeof error.cause === 'object'
        ? error.cause.code
        : null;
    return {
      sourceId: source.sourceId,
      family: source.family,
      hostname,
      passed: false,
      statusCode: null,
      contentType: null,
      sampledBytes: 0,
      durationMilliseconds: Math.round(performance.now() - started),
      observation: sanitizedExcerpt(
        `${error instanceof Error ? error.message : 'live probe failed'}${causeCode ? ` (${causeCode})` : ''}`,
      ),
    };
  }
}

const outputPath = resolve(argument('--output') ?? 'dist/phase2-guided-report.json');
const proposalPath = resolve(argument('--proposal') ?? 'dist/phase2-evidence-proposal.json');
for (const path of [outputPath, proposalPath]) {
  const fromRoot = relative(root, path);
  if (fromRoot.startsWith('..') || resolve(root, fromRoot) !== path) {
    console.error('Phase 2 generated files must remain inside the repository output tree');
    process.exit(2);
  }
}
const mode = hasArgument('--offline') ? 'offline' : 'live';
const profile = JSON.parse(
  await readFile(new URL('../config/phase2-acceptance-profile.json', import.meta.url), 'utf8'),
);
if (profile.schemaVersion !== 1 || profile.profileId !== PHASE2_PROFILE_ID) {
  console.error('Phase 2 acceptance profile is invalid');
  process.exit(2);
}

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
const temporary = await mkdtemp(join(tmpdir(), 'open-outdoor-phase2-'));
const vitestJson = join(temporary, 'vitest.json');

console.log(`Phase 2 guided acceptance (${mode})`);
console.log('Running local acceptance checks...');
const commands = [
  runCommand('dataTypes', [
    './node_modules/typescript/bin/tsc',
    '-b',
    'packages/shared',
    'packages/data',
  ]),
  runCommand('dataTests', [
    './node_modules/vitest/vitest.mjs',
    'run',
    'packages/data',
    '--reporter=json',
    `--outputFile=${vitestJson}`,
  ]),
  runCommand('phase2Format', [
    './node_modules/prettier/bin/prettier.cjs',
    '--check',
    'packages/data',
    'tools/phase2-guided.mjs',
    'tools/phase2-guided-lib.mjs',
    'config/phase2-acceptance-profile.json',
    'config/phase2-guided-report.schema.json',
    'docs/PHASE_2_GUIDED_ACCEPTANCE.md',
  ]),
  runCommand('publicBoundary', ['./tools/public-boundary.mjs', '--scan', '.']),
];

let observedCaseIds = [];
let passedTestFiles = [];
try {
  const vitest = await readFile(vitestJson, 'utf8');
  observedCaseIds = [...new Set(vitest.match(/T-[A-Z]+-[0-9]+-C[0-9]+/g) ?? [])].sort();
  const parsed = JSON.parse(vitest);
  passedTestFiles = (parsed.testResults ?? [])
    .filter((result) => result.status === 'passed')
    .map((result) => relative(root, result.name).replaceAll('\\', '/'))
    .sort();
} catch {
  // The command result already records the failed or missing Vitest report.
}

console.log(`Probing ${profile.sources.length} official source registrations...`);
const sourceProbes = await Promise.all(
  profile.sources.map((source) => probeSource(source, profile, mode)),
);
await rm(temporary, { recursive: true, force: true });

const passedCases = new Set(observedCaseIds);
const commandPassed = (id) => commands.find((command) => command.id === id)?.passed === true;
const casesPassed = (prefix, count) =>
  Array.from(
    { length: count },
    (_, index) => `${prefix}${String(index + 1).padStart(2, '0')}`,
  ).every((id) => passedCases.has(id));
const allDataChecks = commandPassed('dataTypes') && commandPassed('dataTests');
const requiredTestFilesPassed = REQUIRED_PHASE2_TEST_FILES.every((file) =>
  passedTestFiles.includes(file),
);
const acceptance = {
  canonicalContracts: {
    passed: allDataChecks && requiredTestFilesPassed,
    evidence: 'packages/data/test/canonical.test.ts',
  },
  campingSafety: {
    passed: allDataChecks && casesPassed('T-UNIT-001-C', 6),
    evidence: 'T-UNIT-001-C01 through C06',
  },
  connectorContracts: {
    passed: allDataChecks && casesPassed('T-INT-003-C', 9),
    evidence: 'T-INT-003-C01 through C09',
  },
  entityResolution: {
    passed:
      allDataChecks && passedTestFiles.includes('packages/data/test/entity-resolution.test.ts'),
    evidence: 'packages/data/test/entity-resolution.test.ts',
  },
  hostileIngestion: {
    passed:
      allDataChecks && passedTestFiles.includes('packages/data/test/ingestion-security.test.ts'),
    evidence: 'packages/data/test/ingestion-security.test.ts',
  },
  liveSourceAvailability: {
    passed: mode === 'live' && sourceProbes.every((probe) => probe.passed),
    evidence: `${sourceProbes.filter((probe) => probe.passed).length}/${sourceProbes.length} official probes`,
  },
  publicPackReproducibility: {
    passed: allDataChecks && casesPassed('T-REL-002-C', 3),
    evidence: 'T-REL-002-C01 through C03',
  },
  publicationBoundary: {
    passed: commandPassed('publicBoundary'),
    evidence: 'tools/public-boundary.mjs --scan .',
  },
  rightsAndAttribution: {
    passed: allDataChecks && casesPassed('T-INT-003-C', 9),
    evidence: 'connector manifests, rights gates, source inventories, and attribution assertions',
  },
  coverageAndExclusions: {
    passed: allDataChecks && casesPassed('T-REL-002-C', 3),
    evidence: 'coverage, exclusion, freshness, geometry, and elevation assertions',
  },
};

const baseReport = {
  schemaVersion: 1,
  profileId: PHASE2_PROFILE_ID,
  generatedAt: new Date().toISOString(),
  startedAt,
  completedAt: new Date().toISOString(),
  sourceCommit,
  workingTreeClean,
  nodeVersion: process.version,
  platform: process.platform,
  mode,
  requiredSourceIds: profile.sources.map((source) => source.sourceId),
  observedCaseIds,
  passedTestFiles,
  commands,
  sourceProbes,
  acceptance,
};
const evaluation = evaluatePhase2GuidedReport(baseReport, { sourceCommit });
const report = { ...baseReport, status: evaluation.status, blockers: evaluation.blockers };
const schema = JSON.parse(
  await readFile(new URL('../config/phase2-guided-report.schema.json', import.meta.url), 'utf8'),
);
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
if (!validate(report)) {
  console.error('Generated Phase 2 report does not match its schema');
  console.error(JSON.stringify(validate.errors, null, 2));
  process.exit(2);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
const reportBytes = await readFile(outputPath);
const proposal = createPhase2EvidenceProposal(report, {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  reportSha256: sha256(reportBytes),
  reportPath: relative(root, outputPath).replaceAll('\\', '/'),
});
await mkdir(dirname(proposalPath), { recursive: true });
await writeFile(proposalPath, JSON.stringify(proposal, null, 2) + '\n', 'utf8');

console.log(`Phase 2 guided acceptance: ${report.status}`);
for (const blocker of report.blockers) console.log(`- ${blocker}`);
console.log(`Report: ${outputPath}`);
console.log(`Reviewer proposal: ${proposalPath}`);
console.log('Reviewer acceptance is required; this runner never changes the gate record.');
if (report.status !== 'passed') process.exitCode = 1;

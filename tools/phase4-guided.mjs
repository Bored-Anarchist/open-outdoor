import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PHASE4_PROFILE_ID,
  PHASE4_INPUTS,
  phase4Environment,
  evaluatePhase4Report,
  createPhase4Proposal,
} from './phase4-guided-lib.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) =>
  execFileSync(
    'git',
    ['-c', `safe.directory=${root.replaceAll('\\', '/').replace(/\/$/, '')}`, ...args],
    { cwd: root, encoding: 'utf8' },
  ).trim();
const clean = () => git('status', '--porcelain', '--untracked-files=all') === '';

async function main() {
  if (process.argv.length > 2) {
    if (process.argv.length === 3 && process.argv[2] === '--help') {
      console.log(
        'Usage: pnpm phase4:acceptance\nRuns every Phase 4 check. Reports go to a new dist/phase4-acceptance-* directory. Commit changes first for acceptance evidence.',
      );
      return;
    }
    throw new Error('unsupported arguments');
  }
  const startedAt = new Date().toISOString();
  const sourceCommit = git('rev-parse', 'HEAD');
  const cleanBefore = clean();
  const dist = join(root, 'dist');
  await mkdir(dist, { recursive: true });
  if ((await lstat(dist)).isSymbolicLink()) throw new Error('output directory is a link');
  const output = await mkdtemp(join(dist, 'phase4-acceptance-'));
  const vitestPath = join(output, 'vitest.json');
  const environment = { ...phase4Environment(process.env), NO_COLOR: '1' };
  const inputHashes = Object.fromEntries(
    await Promise.all(
      PHASE4_INPUTS.map(async (path) => [path, sha256(await readFile(join(root, path)))]),
    ),
  );
  function run(id, executable, args, cwd = root) {
    console.log(`Running ${id}...`);
    const start = performance.now();
    const result = spawnSync(executable, args, {
      cwd,
      env: environment,
      encoding: 'utf8',
      timeout: 600000,
      maxBuffer: 30 * 1024 * 1024,
      windowsHide: true,
    });
    const passed = !result.error && result.status === 0;
    console.log(`${id}: ${passed ? 'passed' : 'FAILED'}`);
    return {
      id,
      passed,
      exitCode: result.status ?? -1,
      durationMilliseconds: Math.round(performance.now() - start),
      outputSha256: sha256(`${result.stdout ?? ''}\n${result.stderr ?? ''}`),
    };
  }
  const node = (id, args, cwd) => run(id, process.execPath, args, cwd);
  const commands = [
    node('types', [
      'node_modules/typescript/bin/tsc',
      '-b',
      'packages/shared',
      'packages/data',
      'packages/privacy',
      'packages/config',
      'packages/tracking',
      'packages/storage',
      'packages/map',
      'packages/import-export',
      'packages/backup',
      'packages/recorder',
      'apps/browser-fixture',
      'apps/mobile',
    ]),
    node('tests', [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--reporter=json',
      `--outputFile=${vitestPath}`,
    ]),
    node('format', ['node_modules/prettier/bin/prettier.cjs', '--check', '.']),
    node('release', ['tools/validate-release-config.mjs']),
    node('workflows', ['tools/validate-workflows.mjs']),
    node('nativeContract', ['tools/validate-native-spikes.mjs']),
    node('privatePolicy', ['tools/private-ci-policy.mjs']),
    run('privateDownstream', process.platform === 'win32' ? 'powershell' : 'pwsh', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(root, 'scripts/Test-PrivateDownstream.ps1'),
    ]),
    node(
      'publicBuild',
      [join(root, 'node_modules/vite/bin/vite.js'), 'build'],
      join(root, 'apps/browser-fixture'),
    ),
    node('publicBoundary', ['tools/public-boundary.mjs', '--scan', '.']),
  ];
  let tests = {};
  try {
    tests = JSON.parse(await readFile(vitestPath, 'utf8'));
  } catch {
    /* Missing output blocks acceptance below. */
  }
  const report = {
    schemaVersion: 1,
    profileId: PHASE4_PROFILE_ID,
    sourceCommit,
    completedCommit: git('rev-parse', 'HEAD'),
    cleanBefore,
    cleanAfter: clean(),
    startedAt,
    completedAt: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    inputHashes,
    commands,
    testsPassed: tests.numPassedTests ?? 0,
    testsFailed: tests.numFailedTests ?? -1,
    testsPending: (tests.numPendingTests ?? 0) + (tests.numTodoTests ?? 0),
    passedTestFiles: (tests.testResults ?? [])
      .filter(
        (suite) =>
          suite.status === 'passed' &&
          suite.assertionResults?.length > 0 &&
          suite.assertionResults.every((test) => test.status === 'passed'),
      )
      .map((suite) => relative(root, suite.name).replaceAll('\\', '/'))
      .sort(),
  };
  Object.assign(report, evaluatePhase4Report(report, sourceCommit));
  const bytes = JSON.stringify(report, null, 2) + '\n';
  await writeFile(join(output, 'report.json'), bytes);
  await writeFile(
    join(output, 'review-proposal.json'),
    JSON.stringify(createPhase4Proposal(report, sha256(bytes)), null, 2) + '\n',
  );
  console.log(`Phase 4 automated acceptance: ${report.status}\nEvidence: ${output}`);
  for (const blocker of report.blockers) console.log(`- ${blocker}`);
  console.log('Review the proposal to accept WP-401 through WP-406. No gate record was changed.');
  if (report.status !== 'passed') process.exitCode = 1;
}
main().catch(() => {
  console.error(
    'Phase 4 runner could not complete. Check prerequisites and output permissions; use --help for usage.',
  );
  process.exitCode = 2;
});

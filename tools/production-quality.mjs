import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateProductionQuality, productionTemplate } from './production-quality-lib.mjs';
const args = process.argv.slice(2);
function argument(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith('--'))
    throw new Error(`Value required for ${name}`);
  return args[index + 1];
}
for (let index = 0; index < args.length; index++) {
  if (['--physical-report', '--binary-sha256'].includes(args[index])) index++;
  else if (args[index] !== '--verify-physical')
    throw new Error('Unknown production-quality argument');
}
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const clean = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() === '';
const output = resolve('dist/production-quality');
await mkdir(output, { recursive: true });
const physicalPath = argument('--physical-report');
if (!physicalPath)
  await writeFile(
    resolve(output, 'physical-template.json'),
    JSON.stringify(productionTemplate(sourceCommit), null, 2) + '\n',
  );
let physical = null;
if (physicalPath) {
  if ((await stat(physicalPath)).size > 16 * 1024 * 1024)
    throw new Error('Physical report exceeds the 16 MiB limit');
  try {
    physical = JSON.parse(await readFile(physicalPath, 'utf8'));
  } catch {
    throw new Error('Physical report must be readable, valid JSON');
  }
}
const release = evaluateProductionQuality(physical, {
  sourceCommit,
  binarySha256: argument('--binary-sha256'),
});
if (!clean) {
  release.status = 'blocked';
  release.blockers.push('CANDIDATE_WORKTREE_DIRTY');
}
const commands = [];
if (!args.includes('--verify-physical')) {
  for (const [id, command] of [
    [
      'regressions',
      [
        'node_modules/vitest/vitest.mjs',
        'run',
        'packages/shared/test/production-runtime.test.ts',
        'packages/shared/test/native-accessibility.test.ts',
        'packages/recorder/test/production-hardening.test.ts',
        'packages/config/test/production-quality.test.ts',
      ],
    ],
    ['browser-accessibility', ['tools/design-browser-qa.mjs']],
    ['desktop-performance', ['tools/production-benchmark.mjs']],
  ]) {
    const result = spawnSync(process.execPath, command, {
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 8 * 1024 * 1024,
    });
    commands.push({
      id,
      passed: result.status === 0,
      outputSha256: createHash('sha256')
        .update((result.stdout ?? '') + (result.stderr ?? ''))
        .digest('hex'),
    });
    if (result.status !== 0) {
      console.error(`${id} failed; run its command directly for diagnostics.`);
      break;
    }
  }
}
const automatedPassed = commands.length === 3 && commands.every((command) => command.passed);
const report = {
  schemaVersion: 1,
  sourceCommit,
  workingTreeClean: clean,
  generatedAt: new Date().toISOString(),
  classification: 'SYNTHETIC_OR_REDACTED',
  commands,
  implementationStatus: args.includes('--verify-physical')
    ? 'not-run'
    : automatedPassed
      ? 'passed'
      : 'failed',
  physicalDisposition: 'deferred-to-phase5-end-ADR-049',
  releaseAcceptance: release,
};
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
  `Implementation: ${report.implementationStatus}; end-of-Phase-5 physical gate: ${release.status}. See dist/production-quality/report.json.`,
);
process.exitCode = args.includes('--verify-physical')
  ? release.status === 'passed'
    ? 0
    : 1
  : automatedPassed
    ? 0
    : 1;

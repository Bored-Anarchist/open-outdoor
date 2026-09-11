import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, stat, lstat } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  productionGuidedSteps,
  parseGuidedSession,
} from '../packages/shared/src/production-guided.ts';
import { productionTemplate, evaluateProductionQuality } from './production-quality-lib.mjs';
import { auditTemplate, acceptanceCriteria } from './release-audit-lib.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (Object.hasOwn(flags, flag)) throw new Error('Duplicate argument');
  if (['--prepare-only', '--import-only', '--require-physical'].includes(flag)) flags[flag] = true;
  else if (
    ['--ios-report', '--physical-report', '--binary-sha256'].includes(flag) &&
    args[i + 1] &&
    !args[i + 1].startsWith('--')
  )
    flags[flag] = args[++i];
  else
    throw new Error(
      'Usage: pnpm phase5:acceptance [--prepare-only|--import-only] [--ios-report FILE] [--physical-report FILE] [--binary-sha256 SHA256] [--require-physical]',
    );
}
if (flags['--prepare-only'] && flags['--import-only']) throw new Error('Choose one execution mode');
const binarySha256 = flags['--binary-sha256'];
if (
  (flags['--ios-report'] || flags['--physical-report']) &&
  (!/^[a-f0-9]{64}$/.test(binarySha256 ?? '') || /^0+$/.test(binarySha256))
)
  throw new Error('An independently verified installed executable --binary-sha256 is required');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const sourceCommit = git('rev-parse', 'HEAD');
const cleanBefore = git('status', '--porcelain') === '';
const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
if ((await lstat(dist)).isSymbolicLink()) throw new Error('Output directory must not be a link');
const output = await mkdtemp(resolve(dist, 'phase5-guided-'));
const commands = [];
const blockers = [];
let observations = null,
  physical = null,
  importedSha256 = null;
async function readBounded(path) {
  if ((await stat(path)).size > 16 * 1024 * 1024) throw new Error('Report too large');
  return readFile(path, 'utf8');
}
try {
  if (flags['--ios-report']) {
    const bytes = await readBounded(flags['--ios-report']);
    const parsed = parseGuidedSession(bytes);
    if (
      parsed.identity.sourceCommit !== sourceCommit ||
      parsed.identity.binarySha256 !== binarySha256
    )
      throw new Error('Candidate mismatch');
    observations = parsed;
    importedSha256 = hash(bytes);
    await writeFile(
      resolve(output, 'ios-observations.json'),
      JSON.stringify(observations, null, 2) + '\n',
    );
  }
  if (flags['--physical-report'])
    physical = JSON.parse(await readBounded(flags['--physical-report']));
} catch {
  blockers.push('INVALID_OR_WRONG_CANDIDATE_REPORT');
}
const template = productionTemplate(sourceCommit);
if (binarySha256) template.binarySha256 = binarySha256;
// Observation imports remain separate: no taps or preflight snapshot become measured acceptance.
await writeFile(
  resolve(output, 'physical-template.json'),
  JSON.stringify(template, null, 2) + '\n',
);
await writeFile(
  resolve(output, 'audit-template.json'),
  JSON.stringify(auditTemplate(sourceCommit), null, 2) + '\n',
);
const checklist = productionGuidedSteps.map((s) => ({
  ...s,
  observation: observations?.steps.find((o) => o.id === s.id)?.status ?? 'pending',
}));
await writeFile(
  resolve(output, 'checklist.json'),
  JSON.stringify(
    {
      sourceCommit,
      binarySha256: binarySha256 ?? null,
      steps: checklist,
      criteria: acceptanceCriteria,
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  resolve(output, 'GUIDE.md'),
  `# Guided production acceptance\n\nCandidate: ${sourceCommit}\n\n1. Install this commit's diagnostic iOS build. Open Track → Physical acceptance evidence → Guided production acceptance.\n2. Begin/resume the guide. Perform the requested flows and export the redacted observations using Share.\n3. Transfer the JSON to Windows and run pnpm phase5:acceptance --import-only --ios-report FILE --binary-sha256 SHA256. Obtain the installed executable digest independently.\n4. Complete physical-template.json from actual profiler/device reports; observations and a memory snapshot do not satisfy measured tests. Retain raw evidence privately and review redactions.\n5. Run pnpm phase5:acceptance --import-only --physical-report FILE --binary-sha256 SHA256 --require-physical.\n6. Obtain independent reviews and two native reproductions, assemble the WP-504 signed public bundle and run pnpm phase5:audit as documented in docs/PRODUCTION_RELEASE_AUDIT.md.\n\nTests occur after WP-506 under ADR-050. All 26 criteria remain mandatory.\n\n## Device steps\n\n${checklist.map((s) => `- **${s.title}** (${s.observation}): ${s.instruction}`).join('\n')}\n\n## Independent acceptance criteria\n\n${acceptanceCriteria.map((c) => `- ${c.id}: ${c.requirement}`).join('\n')}\n`,
);
if (!flags['--prepare-only'] && !flags['--import-only'] && !blockers.length) {
  const pnpm = process.env.npm_execpath;
  if (!pnpm || !/^pnpm\.(c?js)$/.test(basename(pnpm))) blockers.push('RUN_THROUGH_PINNED_PNPM');
  else {
    for (const [id, script] of [
      ['quality', 'quality'],
      ['privacy', 'test:privacy'],
      ['production-automation', 'phase5:quality'],
      ['ios-javascript', 'build:ios:bundle'],
    ]) {
      console.log(`Running ${id}…`);
      const started = performance.now();
      const environment = { ...process.env };
      for (const key of Object.keys(environment))
        if (/(?:TOKEN|SECRET|PASSWORD|PASSPHRASE|KEY_FILE)$/i.test(key)) delete environment[key];
      const r = spawnSync(process.execPath, [pnpm, script], {
        cwd: root,
        env: environment,
        encoding: 'utf8',
        timeout: 600000,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
      });
      const passed = r.status === 0 && !r.error;
      commands.push({
        id,
        passed,
        durationMilliseconds: Math.round(performance.now() - started),
        outputSha256: hash((r.stdout ?? '') + (r.stderr ?? '')),
      });
      console.log(`${id}: ${passed ? 'passed' : 'FAILED'}`);
      if (!passed) {
        blockers.push(`AUTOMATION:${id}`);
        break;
      }
    }
  }
}
const physicalResult = evaluateProductionQuality(physical, { sourceCommit, binarySha256 });
const cleanAfter = git('status', '--porcelain') === '';
if (!cleanBefore || !cleanAfter) blockers.push('CANDIDATE_WORKTREE_DIRTY');
const skipped = Boolean(flags['--prepare-only'] || flags['--import-only']);
const report = {
  schemaVersion: 1,
  sourceCommit,
  binarySha256: binarySha256 ?? null,
  classification: 'SYNTHETIC_OR_REDACTED',
  testingDisposition: 'post-WP506-ADR-050',
  automaticStatus: skipped
    ? 'not-run'
    : commands.length === 4 && commands.every((c) => c.passed)
      ? 'passed'
      : 'failed',
  commands,
  importedObservationsSha256: importedSha256,
  observationsRecorded: observations?.steps.filter((s) => s.status !== 'pending').length ?? 0,
  physicalAcceptance: physicalResult,
  productionAcceptance: 'requires-signed-audit-and-independent-review',
  blockers,
};
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
  `Automatic checks: ${report.automaticStatus}; physical gate: ${physicalResult.status}; production release: not approved.\nGuide and reports: ${output}`,
);
process.exitCode =
  blockers.length ||
  (!skipped && report.automaticStatus !== 'passed') ||
  (flags['--require-physical'] && physicalResult.status !== 'passed')
    ? 1
    : 0;

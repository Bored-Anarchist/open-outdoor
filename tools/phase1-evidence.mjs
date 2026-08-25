import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  createPhase1EvidenceProposal,
  evaluatePhase1PhysicalReport,
} from './phase1-evidence-lib.mjs';

const root = new URL('../', import.meta.url);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const reportArgument = argument('--report');
if (reportArgument === undefined) {
  console.error(
    'usage: pnpm phase1:evidence --report <phase1-physical-report.json> [--output <proposal.json>] [--commit <sha>]',
  );
  process.exit(2);
}

const reportPath = resolve(reportArgument);
const outputPath = resolve(argument('--output') ?? 'dist/phase1-evidence-proposal.json');
const bytes = await readFile(reportPath);
let report;
try {
  report = JSON.parse(bytes.toString('utf8'));
} catch {
  console.error('Phase 1 physical report is not valid JSON');
  process.exit(2);
}

const schema = JSON.parse(
  await readFile(new URL('config/phase1-physical-report.schema.json', root), 'utf8'),
);
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
if (!validate(report)) {
  console.error('Phase 1 physical report does not match its schema');
  console.error(JSON.stringify(validate.errors, null, 2));
  process.exit(2);
}

const evaluation = evaluatePhase1PhysicalReport(report);
const sourceCommit =
  argument('--commit') ??
  execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: new URL('.', root),
    encoding: 'utf8',
  }).trim();
if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) {
  console.error('source commit must be a full 40-character Git SHA');
  process.exit(2);
}

const date = report.generatedAt.slice(0, 10);
const evidencePath = `docs/evidence/artifacts/WP-109-phase1-${date}-redacted.json`;
const proposal = createPhase1EvidenceProposal(report, {
  evidencePath,
  generatedAt: new Date().toISOString(),
  reportSha256: createHash('sha256').update(bytes).digest('hex'),
  sourceCommit,
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(proposal, null, 2) + '\n', 'utf8');
console.log(`Phase 1 physical report: ${evaluation.status}`);
for (const blocker of evaluation.blockers) console.log(`- ${blocker}`);
console.log(`Evidence proposal written to ${outputPath}`);
console.log('Reviewer acceptance is still required; this command never marks the gate accepted.');
if (evaluation.status !== 'passed') process.exitCode = 1;

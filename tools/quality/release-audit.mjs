import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { auditTemplate, acceptanceCriteria, evaluateReleaseAudit } from './release-audit-lib.mjs';
import { verifyRelease } from './release-artifacts-lib.mjs';
async function jsonFile(path) {
  if ((await stat(path)).size > 16 * 1024 * 1024) throw new Error('Audit metadata too large');
  return JSON.parse(await readFile(path, 'utf8'));
}
const args = process.argv.slice(2);
const output = resolve('dist/release-audit');
await mkdir(output, { recursive: true });
let result;
try {
  if (args.length === 0) {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    await writeFile(
      resolve(output, 'audit-template.json'),
      JSON.stringify(auditTemplate(commit), null, 2) + '\n',
    );
    result = {
      status: 'blocked',
      sourceCommit: commit,
      blockers: [
        'SIGNED_CANDIDATE_AND_REVIEW_EVIDENCE_REQUIRED',
        'PHYSICAL_EVIDENCE_REQUIRED_AT_PHASE5_END',
      ],
      criteria: acceptanceCriteria,
    };
  } else {
    if (args.length !== 5)
      throw new Error(
        'Arguments: BUNDLE RELEASE_POLICY.json AUDIT_POLICY.json AUDIT_FILENAME BINARY_FILENAME',
      );
    const [bundle, releasePolicyPath, auditPolicyPath, auditName, binaryName] = args;
    const releasePolicy = await jsonFile(releasePolicyPath);
    const auditPolicy = await jsonFile(auditPolicyPath);
    await verifyRelease(bundle, releasePolicy);
    const manifest = JSON.parse(await readFile(resolve(bundle, 'release.json'), 'utf8'));
    const evidence = Object.fromEntries(manifest.files.map((f) => [f.name, f.sha256]));
    const file = (name) => {
      if (!Object.hasOwn(evidence, name)) throw new Error('Evidence absent from signed inventory');
      return resolve(bundle, name);
    };
    if (
      manifest.channel !== 'public' ||
      auditPolicy.sourceCommit !== manifest.provenance.commit ||
      !manifest.files.some(
        (f) =>
          f.name === binaryName && f.role === 'artifact' && f.sha256 === auditPolicy.binarySha256,
      )
    )
      throw new Error('Candidate identity mismatch');
    const audit = await jsonFile(file(auditName));
    const physical = audit.physicalReport ? await jsonFile(file(audit.physicalReport)) : null;
    result = {
      ...evaluateReleaseAudit(audit, auditPolicy, evidence, physical),
      sourceCommit: manifest.provenance.commit,
      binarySha256: auditPolicy.binarySha256,
    };
  }
} catch {
  result = { status: 'blocked', blockers: ['INVALID_OR_UNVERIFIED_AUDIT_INPUT'] };
}
await writeFile(resolve(output, 'report.json'), JSON.stringify(result, null, 2) + '\n');
await writeFile(
  resolve(output, 'report.md'),
  `# WP-506 release acceptance\n\nStatus: **${result.status}**\n\n${result.blockers.map((b) => `- ${b}`).join('\n')}\n`,
);
console.log(`WP-506: ${result.status}. See dist/release-audit/report.json and report.md.`);
process.exitCode = result.status === 'passed' ? 0 : 1;

import { readFileSync } from 'node:fs';
import { evaluateProductionQuality } from './production-quality-lib.mjs';
export const acceptanceCriteria = readFileSync(
  new URL('../PROJECT_SCOPE.md', import.meta.url),
  'utf8',
)
  .split('## 23. Project-level acceptance criteria')[1]
  .split('## 24.')[0]
  .split(/\r?\n/)
  .filter((line) => /^\d+\. /.test(line))
  .map((line, index) => ({
    id: `AC-${String(index + 1).padStart(2, '0')}`,
    requirement: line.replace(/^\d+\. /, ''),
  }));
const digest = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && !/^0+$/.test(value);
const handle = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(value);
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
export function auditTemplate(sourceCommit) {
  return {
    schemaVersion: 1,
    sourceCommit,
    binarySha256: null,
    classification: 'APPROVED_REDACTED',
    criteria: acceptanceCriteria.map(({ id }) => ({ id, status: 'unexecuted', evidence: [] })),
    reviews: [],
    cleanRoom: [],
    physicalReport: null,
  };
}
// Evidence values are decoded only after the CLI verifies their signed inventory bytes.
export function evaluateReleaseAudit(audit, policy, evidence, physical) {
  const blockers = [];
  const block = (id) => blockers.push(id);
  if (
    !exact(audit, [
      'schemaVersion',
      'sourceCommit',
      'binarySha256',
      'classification',
      'criteria',
      'reviews',
      'cleanRoom',
      'physicalReport',
    ]) ||
    audit.schemaVersion !== 1 ||
    audit.classification !== 'APPROVED_REDACTED' ||
    !Array.isArray(audit.criteria) ||
    !Array.isArray(audit.reviews) ||
    !Array.isArray(audit.cleanRoom)
  )
    return { status: 'blocked', blockers: ['INVALID_AUDIT_SCHEMA'] };
  if (
    !exact(policy, ['sourceCommit', 'binarySha256', 'authors', 'reviewers']) ||
    !/^[a-f0-9]{40}$/.test(policy.sourceCommit ?? '') ||
    /^0+$/.test(policy.sourceCommit) ||
    !digest(policy.binarySha256) ||
    !Array.isArray(policy.authors) ||
    !policy.authors.length ||
    !policy.authors.every(handle) ||
    !Array.isArray(policy.reviewers) ||
    !policy.reviewers.length ||
    policy.reviewers.some(
      (r) =>
        !exact(r, ['handle', 'roles']) ||
        !handle(r.handle) ||
        !Array.isArray(r.roles) ||
        !r.roles.every((role) =>
          ['release', 'privacy', 'rights', 'reproduction', 'physical'].includes(role),
        ),
    ) ||
    new Set(policy.reviewers.map((r) => r.handle)).size !== policy.reviewers.length
  )
    return { status: 'blocked', blockers: ['INVALID_EXTERNAL_AUDIT_POLICY'] };
  if (audit.sourceCommit !== policy.sourceCommit || audit.binarySha256 !== policy.binarySha256)
    block('CANDIDATE_MISMATCH');
  const validEvidence = (name) =>
    typeof name === 'string' && Object.hasOwn(evidence, name) && digest(evidence[name]);
  const ids = new Set();
  for (const c of audit.criteria) {
    if (
      !exact(c, ['id', 'status', 'evidence']) ||
      !acceptanceCriteria.some((a) => a.id === c.id) ||
      ids.has(c.id)
    ) {
      block('INVALID_CRITERION');
      continue;
    }
    ids.add(c.id);
    if (
      c.status !== 'passed' ||
      !Array.isArray(c.evidence) ||
      !c.evidence.length ||
      !c.evidence.every(validEvidence)
    )
      block(`CRITERION:${c.id}`);
  }
  for (const c of acceptanceCriteria) if (!ids.has(c.id)) block(`MISSING:${c.id}`);
  for (const role of ['release', 'privacy', 'rights', 'reproduction']) {
    const matches = audit.reviews.filter((r) => r?.role === role);
    if (matches.length !== 1) {
      block(`REVIEW:${role}`);
      continue;
    }
    const r = matches[0];
    const authorized = policy.reviewers.find(
      (person) => person.handle === r.reviewer && person.roles.includes(role),
    );
    if (
      !exact(r, ['role', 'reviewer', 'approved', 'evidence']) ||
      !authorized ||
      r.approved !== true ||
      !validEvidence(r.evidence) ||
      (role !== 'release' && policy.authors.includes(r.reviewer))
    )
      block(`REVIEW:${role}`);
  }
  if (audit.reviews.length !== 4) block('UNEXPECTED_REVIEW');
  if (audit.cleanRoom.length !== 2) block('TWO_CLEAN_ROOM_BUILDS_REQUIRED');
  const runs = new Set();
  const builders = new Set();
  const buildEvidence = new Set();
  for (const build of audit.cleanRoom) {
    if (
      !exact(build, [
        'runId',
        'builder',
        'sourceCommit',
        'environmentSha256',
        'artifactSha256',
        'publicOnly',
        'freshCheckout',
        'checksPassed',
        'evidence',
      ]) ||
      !handle(build.runId) ||
      !handle(build.builder) ||
      build.sourceCommit !== policy.sourceCommit ||
      !digest(build.environmentSha256) ||
      build.artifactSha256 !== policy.binarySha256 ||
      build.publicOnly !== true ||
      build.freshCheckout !== true ||
      build.checksPassed !== true ||
      !validEvidence(build.evidence)
    )
      block('INVALID_CLEAN_ROOM_BUILD');
    if (runs.has(build?.runId) || buildEvidence.has(evidence[build?.evidence]))
      block('REUSED_BUILD');
    buildEvidence.add(evidence[build?.evidence]);
    runs.add(build?.runId);
    builders.add(build?.builder);
  }
  if (
    builders.size !== 2 ||
    !audit.cleanRoom.some(
      (b) =>
        policy.reviewers.some((r) => r.handle === b?.builder && r.roles.includes('reproduction')) &&
        !policy.authors.includes(b?.builder),
    )
  )
    block('INDEPENDENT_REPRODUCTION_REQUIRED');
  if (
    audit.cleanRoom.length === 2 &&
    audit.cleanRoom[0]?.environmentSha256 !== audit.cleanRoom[1]?.environmentSha256
  )
    block('BUILD_ENVIRONMENT_MISMATCH');
  if (!validEvidence(audit.physicalReport)) block('PHYSICAL_REPORT_REQUIRED');
  if (
    physical &&
    (!policy.reviewers.some(
      (r) => r.handle === physical.attestation?.reviewer && r.roles.includes('physical'),
    ) ||
      policy.authors.includes(physical.attestation?.reviewer))
  )
    block('INDEPENDENT_PHYSICAL_REVIEW_REQUIRED');
  const physicalResult = evaluateProductionQuality(physical, policy);
  for (const reason of physicalResult.blockers) block(`PHYSICAL:${reason}`);
  return { status: blockers.length ? 'blocked' : 'passed', blockers: [...new Set(blockers)] };
}

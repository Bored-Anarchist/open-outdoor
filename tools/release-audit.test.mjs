import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditTemplate, acceptanceCriteria, evaluateReleaseAudit } from './release-audit-lib.mjs';
import {
  productionTemplate,
  productionProfile,
  accessibilityCaseIds,
} from './production-quality-lib.mjs';
const commit = 'a'.repeat(40),
  binary = 'b'.repeat(64),
  hash = 'c'.repeat(64);
function fixture() {
  const policy = {
    sourceCommit: commit,
    binarySha256: binary,
    authors: ['author'],
    reviewers: [
      { handle: 'author', roles: ['release'] },
      { handle: 'reviewer', roles: ['privacy', 'rights', 'reproduction', 'physical'] },
    ],
  };
  const audit = auditTemplate(commit);
  audit.binarySha256 = binary;
  audit.criteria.forEach((c) => {
    c.status = 'passed';
    c.evidence = ['evidence.json'];
  });
  audit.reviews = ['release', 'privacy', 'rights', 'reproduction'].map((role) => ({
    role,
    reviewer: role === 'release' ? 'author' : 'reviewer',
    approved: true,
    evidence: 'evidence.json',
  }));
  audit.cleanRoom = ['author', 'reviewer'].map((builder, i) => ({
    runId: `run-${i}`,
    builder,
    sourceCommit: commit,
    environmentSha256: hash,
    artifactSha256: binary,
    publicOnly: true,
    freshCheckout: true,
    checksPassed: true,
    evidence: `build-${i}.json`,
  }));
  audit.physicalReport = 'physical.json';
  const physical = productionTemplate(commit);
  physical.binarySha256 = binary;
  physical.accessibility = accessibilityCaseIds.map((id) => ({
    id,
    status: 'passed',
    evidenceSha256: hash,
  }));
  for (const [id, p] of Object.entries(productionProfile.measurements))
    physical.performance[id] = {
      samples: Array(p.minimumSamples).fill(id.includes('Memory') ? 100 : 16),
      durationSeconds: p.minimumDurationSeconds,
      fixtureSha256: hash,
      evidenceSha256: hash,
    };
  physical.fieldRuns = Array.from({ length: 6 }, (_, i) => ({
    runId: `field-${i}`,
    sourceCommit: commit,
    binarySha256: binary,
    evidenceSha256: String(i + 1).repeat(64),
    mode: i < 3 ? 'balanced' : 'endurance',
    startedAt: new Date(Date.UTC(2026, 8, 10, i * 3)).toISOString(),
    endedAt: new Date(Date.UTC(2026, 8, 10, (i + 1) * 3)).toISOString(),
    durationMinutes: 180,
    batteryStartPercent: 90,
    batteryEndPercent: 80,
    chargingDuringRun: false,
    seriousThermalSeconds: 0,
    criticalThermalSeconds: 0,
    maximumCheckpointGapSeconds: 30,
    storageGrowthBytes: 1048576,
    sensorsActiveWhileStoppedSeconds: 0,
    offlineBrowsePassed: true,
    offlineSearchPassed: true,
    crashRecoveryPassed: true,
    degradedGpsStatePassed: true,
    accessibilityPassed: true,
  }));
  physical.attestation = { completed: true, reviewer: 'reviewer', evidenceSha256: hash };
  return {
    audit,
    policy,
    evidence: {
      'evidence.json': hash,
      'physical.json': hash,
      'build-0.json': 'd'.repeat(64),
      'build-1.json': 'e'.repeat(64),
    },
    physical,
  };
}
const evaluate = (f) => evaluateReleaseAudit(f.audit, f.policy, f.evidence, f.physical);
test('all 26 scope criteria are represented', () => assert.equal(acceptanceCriteria.length, 26));
test('complete synthetic fixture validates without claiming real acceptance', () =>
  assert.deepEqual(evaluate(fixture()), { status: 'passed', blockers: [] }));
test('template fails closed', () => {
  const f = fixture();
  f.audit = auditTemplate(commit);
  assert.equal(evaluate(f).status, 'blocked');
});
for (const id of acceptanceCriteria.map((c) => c.id))
  test(`missing ${id} blocks release`, () => {
    const f = fixture();
    f.audit.criteria = f.audit.criteria.filter((c) => c.id !== id);
    assert.equal(evaluate(f).status, 'blocked');
  });
const attacks = {
  'duplicate criterion': (f) => f.audit.criteria.push(f.audit.criteria[0]),
  'unexecuted criterion': (f) => (f.audit.criteria[0].status = 'deferred'),
  'unlisted evidence': (f) => (f.audit.criteria[0].evidence = ['private.json']),
  'wrong candidate': (f) => (f.audit.sourceCommit = 'd'.repeat(40)),
  'missing device evidence': (f) => (f.physical = null),
  'simulator substitution': (f) => (f.physical.environment = 'simulator'),
  'failed energy budget': (f) => (f.physical.fieldRuns[0].batteryEndPercent = 20),
  'false review': (f) => (f.audit.reviews[0].approved = false),
  'unauthorized reviewer': (f) => (f.audit.reviews[1].reviewer = 'stranger'),
  'self review': (f) => f.policy.authors.push('reviewer'),
  'absent review': (f) => f.audit.reviews.pop(),
  'duplicate review': (f) => f.audit.reviews.push(f.audit.reviews[0]),
  'failed build': (f) => (f.audit.cleanRoom[0].checksPassed = false),
  'private build': (f) => (f.audit.cleanRoom[0].publicOnly = false),
  'reused build': (f) => (f.audit.cleanRoom[1].runId = 'run-0'),
  'same builder': (f) => (f.audit.cleanRoom[1].builder = 'author'),
  'different artifact': (f) => (f.audit.cleanRoom[1].artifactSha256 = hash),
  'different toolchain': (f) => (f.audit.cleanRoom[1].environmentSha256 = 'd'.repeat(64)),
  'private freeform field': (f) => (f.audit.privatePath = 'not-allowed'),
  'malformed policy': (f) => (f.policy.reviewers = null),
};
for (const [name, attack] of Object.entries(attacks))
  test(`rejects ${name}`, () => {
    const f = fixture();
    attack(f);
    assert.equal(evaluate(f).status, 'blocked');
  });

test('CLI verifies a signed synthetic audit and fails after tampering', async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const { createHash, generateKeyPairSync } = await import('node:crypto');
  const { spawnSync } = await import('node:child_process');
  const { sealRelease } = await import('./release-artifacts-lib.mjs');
  const root = await mkdtemp(join(tmpdir(), 'wp506-synthetic-'));
  try {
    const bundle = join(root, 'bundle');
    await mkdir(bundle);
    const f = fixture();
    const binaryBytes = Buffer.from('synthetic binary, not a release');
    const sha = createHash('sha256').update(binaryBytes).digest('hex');
    f.audit.binarySha256 = f.policy.binarySha256 = f.physical.binarySha256 = sha;
    f.audit.cleanRoom.forEach((b) => (b.artifactSha256 = sha));
    f.physical.fieldRuns.forEach((r) => (r.binarySha256 = sha));
    const values = {
      'app.ipa': binaryBytes,
      'audit.json': JSON.stringify(f.audit),
      'physical.json': JSON.stringify(f.physical),
      'evidence.json': '{}',
      'build-0.json': '{"synthetic":0}',
      'build-1.json': '{"synthetic":1}',
      'sbom.json': '{}',
      'dbom.json': '{}',
      'rights.json': '{}',
      'notices.txt': 'synthetic',
    };
    for (const [name, value] of Object.entries(values)) await writeFile(join(bundle, name), value);
    const provenance = {
      repository: 'https://github.com/Bored-Anarchist/open-outdoor',
      commit,
      builder: 'synthetic',
      materials: ['pnpm-lock.yaml', 'uv.lock', 'release.json'].map((name) => ({
        name,
        sha256: hash,
      })),
    };
    const descriptor = {
      schemaVersion: 1,
      releaseId: 'synthetic',
      channel: 'public',
      sequence: 1,
      keyId: 'synthetic',
      provenance,
      files: Object.keys(values).map((name) => ({
        name,
        role:
          {
            'sbom.json': 'sbom',
            'dbom.json': 'dbom',
            'rights.json': 'rights',
            'notices.txt': 'notices',
          }[name] ?? 'artifact',
      })),
    };
    const keys = generateKeyPairSync('ed25519');
    await sealRelease(bundle, descriptor, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    await writeFile(
      join(root, 'release-policy.json'),
      JSON.stringify({
        releaseId: 'synthetic',
        channel: 'public',
        sequence: 1,
        provenance,
        keys: [
          {
            keyId: 'synthetic',
            status: 'active',
            publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }),
          },
        ],
      }),
    );
    await writeFile(join(root, 'audit-policy.json'), JSON.stringify(f.policy));
    const args = [
      resolve('tools/release-audit.mjs'),
      bundle,
      join(root, 'release-policy.json'),
      join(root, 'audit-policy.json'),
      'audit.json',
      'app.ipa',
    ];
    assert.equal(spawnSync(process.execPath, args, { cwd: root }).status, 0);
    await writeFile(join(bundle, 'audit.json'), '{"tampered":true}');
    assert.equal(spawnSync(process.execPath, args, { cwd: root }).status, 1);
    const report = JSON.parse(await readFile(join(root, 'dist/release-audit/report.json'), 'utf8'));
    assert.deepEqual(report.blockers, ['INVALID_OR_UNVERIFIED_AUDIT_INPUT']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

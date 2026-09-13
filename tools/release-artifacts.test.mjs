import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sealRelease, verifyRelease } from './release-artifacts-lib.mjs';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'open-outdoor-release-'));
  const descriptor = {
    schemaVersion: 1,
    releaseId: 'synthetic-1',
    channel: 'public',
    sequence: 1,
    keyId: 'test',
    provenance: {
      repository: 'https://github.com/Bored-Anarchist/open-outdoor',
      commit: 'a'.repeat(40),
      builder: 'synthetic-test',
      materials: ['pnpm-lock.yaml', 'uv.lock', 'release.json'].map((name) => ({
        name,
        sha256: 'b'.repeat(64),
      })),
    },
    files: ['artifact', 'sbom', 'dbom', 'rights', 'notices'].map((role) => ({
      name: `${role}.txt`,
      role,
    })),
  };
  for (const f of descriptor.files) await writeFile(join(root, f.name), `synthetic ${f.role}`);
  const policy = {
    releaseId: descriptor.releaseId,
    channel: descriptor.channel,
    sequence: descriptor.sequence,
    provenance: descriptor.provenance,
    keys: [
      {
        keyId: 'test',
        status: 'active',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
      },
    ],
  };
  try {
    await run(root, descriptor, policy);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('independent verifier process verifies exact signed bytes without signing key', () =>
  fixture(async (root, descriptor, policy) => {
    await sealRelease(root, descriptor, pem);
    const policyPath = join(tmpdir(), `policy-${Date.now()}.json`);
    try {
      await writeFile(policyPath, JSON.stringify(policy));
      const result = execFileSync(
        process.execPath,
        ['tools/release-artifacts.mjs', 'verify', root, policyPath],
        { encoding: 'utf8', env: { ...process.env, OPEN_OUTDOOR_RELEASE_KEY_FILE: '' } },
      );
      assert.equal(JSON.parse(result).status, 'verified');
    } finally {
      await rm(policyPath, { force: true });
    }
  }));
for (const scenario of [
  'bytes',
  'signature',
  'index',
  'extra',
  'channel',
  'replay',
  'commit',
  'revoked',
  'unknown',
  'wrong-key',
  'manifest',
]) {
  test(`rejects ${scenario}`, () =>
    fixture(async (root, descriptor, policy) => {
      await sealRelease(root, descriptor, pem);
      if (scenario === 'bytes') await writeFile(join(root, 'artifact.txt'), 'tampered');
      if (scenario === 'signature')
        await writeFile(join(root, 'release.sig'), Buffer.alloc(64).toString('base64'));
      if (scenario === 'index') await writeFile(join(root, 'SHA256SUMS'), 'tampered');
      if (scenario === 'extra') await writeFile(join(root, 'unlisted.txt'), 'unlisted');
      if (scenario === 'channel') policy.channel = 'private';
      if (scenario === 'replay') policy.sequence = 2;
      if (scenario === 'commit')
        policy.provenance = { ...policy.provenance, commit: 'c'.repeat(40) };
      if (scenario === 'revoked') policy.keys[0].status = 'revoked';
      if (scenario === 'unknown') policy.keys = [];
      if (scenario === 'wrong-key')
        policy.keys[0].publicKeyPem = generateKeyPairSync('ed25519').publicKey.export({
          type: 'spki',
          format: 'pem',
        });
      if (scenario === 'manifest') {
        const m = JSON.parse(await readFile(join(root, 'release.json'), 'utf8'));
        m.files[0].bytes += 1;
        await writeFile(join(root, 'release.json'), JSON.stringify(m) + '\n');
      }
      await assert.rejects(verifyRelease(root, policy));
    }));
}
for (const scenario of [
  'missing-bom',
  'traversal',
  'duplicate',
  'unsigned-local',
  'missing-lock',
]) {
  test(`refuses sealing ${scenario}`, () =>
    fixture(async (root, descriptor) => {
      if (scenario === 'missing-bom')
        descriptor.files = descriptor.files.filter((f) => f.role !== 'dbom');
      if (scenario === 'traversal') descriptor.files[0].name = '../artifact.txt';
      if (scenario === 'duplicate') descriptor.files.push(descriptor.files[0]);
      if (scenario === 'unsigned-local') descriptor.channel = 'local';
      if (scenario === 'missing-lock') descriptor.provenance.materials.pop();
      await assert.rejects(sealRelease(root, descriptor, pem));
    }));
}

test('trust policy object field order does not affect identity', () =>
  fixture(async (root, descriptor, policy) => {
    await sealRelease(root, descriptor, pem);
    policy.provenance = Object.fromEntries(Object.entries(policy.provenance).reverse());
    assert.equal((await verifyRelease(root, policy)).status, 'verified');
  }));
test('rejects missing artifact', () =>
  fixture(async (root, descriptor, policy) => {
    await sealRelease(root, descriptor, pem);
    await rm(join(root, 'artifact.txt'));
    await assert.rejects(verifyRelease(root, policy));
  }));
test('rejects duplicate trusted key identity', () =>
  fixture(async (root, descriptor, policy) => {
    await sealRelease(root, descriptor, pem);
    policy.keys.push(policy.keys[0]);
    await assert.rejects(verifyRelease(root, policy));
  }));
test('rejects pinned material disagreement', () =>
  fixture(async (root, descriptor, policy) => {
    await sealRelease(root, descriptor, pem);
    policy.provenance = {
      ...policy.provenance,
      materials: policy.provenance.materials.map((m) => ({ ...m, sha256: 'c'.repeat(64) })),
    };
    await assert.rejects(verifyRelease(root, policy));
  }));
test('rejects directories as artifacts', () =>
  fixture(async (root, descriptor, policy) => {
    await sealRelease(root, descriptor, pem);
    await rm(join(root, 'artifact.txt'));
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(root, 'artifact.txt'));
    await assert.rejects(verifyRelease(root, policy));
  }));

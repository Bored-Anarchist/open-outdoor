import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createUpdateSigner,
  loadLaptopUpdateSigner,
  signaturePayload,
} from './laptop-update-signing.mjs';
import { createLaptopPackageServer } from './laptop-package-server.mjs';
import { once } from 'node:events';

const bytes = Buffer.from('Synthetic public catalog bytes for signed transport tests.');
const pin = {
  schemaVersion: 1,
  state: 'NY',
  name: 'Synthetic New York',
  file: 'NY/state.sqlite',
  channel: 'public',
  classification: 'SOURCE_REDISTRIBUTABLE',
  sha256: createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length,
  tilesBytes: 128,
  installedBytes: bytes.length + 128,
  tilesSha256: 'a'.repeat(64),
  generatedAt: '2026-09-01T00:00:00.000Z',
};
function signer() {
  const key = generateKeyPairSync('ed25519');
  return { ...createUpdateSigner(key.privateKey.export({ type: 'pkcs8', format: 'pem' })), key };
}

test('signature binds exact manifest, public channel, independent paired-laptop root and revision', async () => {
  const service = signer();
  const [ticket] = await service.seal([pin]);
  const manifest = Buffer.from(ticket.manifestBase64, 'base64');
  assert.equal(createHash('sha256').update(manifest).digest('hex'), ticket.envelope.manifestSha256);
  assert.equal(ticket.envelope.channel, 'public');
  assert.equal(ticket.envelope.trustRoot, 'paired-laptop-v1');
  assert.equal(JSON.parse(manifest).revision, ticket.envelope.antiReplayVersion);
  assert.equal(
    verify(
      null,
      Buffer.from(signaturePayload(ticket.envelope)),
      service.key.publicKey,
      Buffer.from(ticket.envelope.signature, 'base64'),
    ),
    true,
  );
  for (const field of ['channel', 'trustRoot', 'keyId', 'manifestSha256']) {
    assert.equal(
      verify(
        null,
        Buffer.from(signaturePayload({ ...ticket.envelope, [field]: 'tampered' })),
        service.key.publicKey,
        Buffer.from(ticket.envelope.signature, 'base64'),
      ),
      false,
    );
  }
});

test('unchanged snapshots retain revisions; changed snapshots advance per state before signing', async () => {
  const service = signer();
  const [first] = await service.seal([pin]);
  const [same, other] = await service.seal([pin, { ...pin, state: 'CA' }]);
  assert.equal(first.manifestBase64, same.manifestBase64);
  const [changed, unchangedOther] = await service.seal([
    { ...pin, sha256: 'b'.repeat(64) },
    { ...pin, state: 'CA' },
  ]);
  assert.ok(changed.envelope.antiReplayVersion > first.envelope.antiReplayVersion);
  assert.equal(other.manifestBase64, unchangedOther.manifestBase64);
  let attempted = false;
  const failing = createUpdateSigner(
    service.key.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    {},
    async () => {
      attempted = true;
      throw new Error('Synthetic durable write failure');
    },
  );
  await assert.rejects(() => failing.seal([pin]), /durable write failure/);
  assert.equal(attempted, true);
});

test('private, corrupt-size, unsupported and malformed metadata cannot be signed', async () => {
  const service = signer();
  for (const patch of [
    { schemaVersion: 2 },
    { channel: 'private' },
    { classification: 'PERMISSION_HELD' },
    { installedBytes: -1 },
    { tilesBytes: 1 },
    { sha256: 'bad' },
    { generatedAt: '2026-02-31T00:00:00.000Z' },
    { name: 'Unsafe\nname' },
  ])
    await assert.rejects(() => service.seal([{ ...pin, ...patch }]), /Invalid public/);
});

test('persisted identity and counters survive restart and concurrent servers cannot share the writer', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'open-outdoor-signer-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = await loadLaptopUpdateSigner(root);
  const [snapshot] = await first.seal([pin]);
  await assert.rejects(() => loadLaptopUpdateSigner(root), /already in use/);
  await first.close();
  await first.close();
  const second = await loadLaptopUpdateSigner(root);
  try {
    const [same] = await second.seal([pin]);
    assert.deepEqual(first.identity, second.identity);
    assert.equal(snapshot.manifestBase64, same.manifestBase64);
    const record = JSON.parse(await readFile(join(root, 'identity.json'), 'utf8'));
    assert.equal(record.versions.NY.revision, snapshot.envelope.antiReplayVersion);
  } finally {
    await second.close();
  }
});

test('signed server publishes only public verification data and laptop QR pins its fingerprint', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'open-outdoor-signed-server-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'NY'));
  await writeFile(join(root, 'NY', 'state.sqlite'), bytes);
  await writeFile(
    join(root, 'loader-inventory.json'),
    JSON.stringify({ schemaVersion: 1, states: [pin] }),
  );
  const signing = signer();
  const token = 'a'.repeat(32);
  const { server } = await createLaptopPackageServer({ root, token, signer: signing });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/v1/catalog', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const catalog = await response.json();
  assert.equal(catalog.schemaVersion, 2);
  assert.deepEqual(catalog.signingKey, signing.identity);
  assert.equal(catalog.packages.length, 1);
  assert.doesNotMatch(JSON.stringify(catalog), /PRIVATE KEY|privateKey|Bearer/);
  assert.equal(JSON.stringify(catalog).includes(token), false);
  const der = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    Buffer.from(catalog.signingKey.publicKey, 'base64'),
  ]);
  const publicKey = createPublicKey({ format: 'der', type: 'spki', key: der });
  assert.equal(
    verify(
      null,
      Buffer.from(signaturePayload(catalog.packages[0].envelope)),
      publicKey,
      Buffer.from(catalog.packages[0].envelope.signature, 'base64'),
    ),
    true,
  );
  const page = await (await fetch(base + '/pair')).text();
  assert.equal(page.includes(signing.identity.keyId), true);
  assert.doesNotMatch(page, /PRIVATE KEY/);
});

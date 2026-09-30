import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { createUpdateSigner, signaturePayload } from './laptop-update-signing.mjs';

// Runtime-generated synthetic keys. Only public verification material is printed.
const { privateKey } = generateKeyPairSync('ed25519');
const signer = createUpdateSigner(privateKey.export({ type: 'pkcs8', format: 'pem' }));
const pin = {
  schemaVersion: 1,
  state: 'NY',
  name: 'Synthetic New York',
  channel: 'public',
  classification: 'SOURCE_REDISTRIBUTABLE',
  sha256: 'a'.repeat(64),
  bytes: 512,
  tilesBytes: 128,
  installedBytes: 640,
  tilesSha256: 'b'.repeat(64),
  generatedAt: '2026-09-01T00:00:00.000Z',
};
const [first] = await signer.seal([pin]);
const [second, otherState] = await signer.seal([
  { ...pin, sha256: 'c'.repeat(64), generatedAt: '2026-09-02T00:00:00.000Z' },
  { ...pin, state: 'CA' },
]);
const [oldDate] = await signer.seal([
  { ...pin, sha256: 'd'.repeat(64), generatedAt: '2026-08-01T00:00:00.000Z' },
]);
const manifest = JSON.parse(Buffer.from(second.manifestBase64, 'base64'));
const incompatibleBytes = Buffer.from(
  JSON.stringify({ ...manifest, minAppMajor: 2, maxAppMajor: 2 }),
);
const envelope = {
  ...second.envelope,
  manifestSha256: createHash('sha256').update(incompatibleBytes).digest('hex'),
};
envelope.signature = sign(null, Buffer.from(signaturePayload(envelope)), privateKey).toString(
  'base64',
);
function modifiedTicket(patch) {
  const bytes = Buffer.from(JSON.stringify({ ...manifest, ...patch }));
  const next = {
    ...second.envelope,
    manifestSha256: createHash('sha256').update(bytes).digest('hex'),
  };
  next.signature = sign(null, Buffer.from(signaturePayload(next)), privateKey).toString('base64');
  return { manifestBase64: bytes.toString('base64'), envelope: next };
}
console.log(
  JSON.stringify({
    publicKey: signer.identity.publicKey,
    fingerprint: signer.identity.keyId,
    first,
    second,
    otherState,
    oldDate,
    incompatible: { manifestBase64: incompatibleBytes.toString('base64'), envelope },
    conflicting: modifiedTicket({ sha256: 'e'.repeat(64) }),
    oversized: modifiedTicket({ bytes: 4 * 1024 ** 3, installedBytes: 4 * 1024 ** 3 + 128 }),
    privateManifest: modifiedTicket({ classification: 'PERMISSION_HELD' }),
  }),
);

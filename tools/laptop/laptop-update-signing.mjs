import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto';
import { mkdir, open, readFile, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

const digest = (value) => createHash('sha256').update(value).digest('hex');
export const laptopUpdateTrustRoot = 'paired-laptop-v1';

export function signaturePayload(envelope) {
  return JSON.stringify([
    'open-outdoor-catalog-signature-v1',
    envelope.schemaVersion,
    envelope.algorithm,
    envelope.channel,
    envelope.trustRoot,
    envelope.keyId,
    envelope.antiReplayVersion,
    envelope.manifestSha256,
    envelope.signedAt,
  ]);
}

export function updateManifest(pin, revision) {
  if (
    pin.schemaVersion !== 1 ||
    pin.channel !== 'public' ||
    pin.classification !== 'SOURCE_REDISTRIBUTABLE' ||
    !/^[A-Z]{2}$/.test(pin.state) ||
    typeof pin.name !== 'string' ||
    pin.name.length > 80 ||
    /[\u0000-\u001f\u007f]/.test(pin.name) ||
    !/^[a-f0-9]{64}$/.test(pin.sha256) ||
    !/^[a-f0-9]{64}$/.test(pin.tilesSha256) ||
    !Number.isSafeInteger(pin.bytes) ||
    pin.bytes <= 0 ||
    !Number.isSafeInteger(pin.tilesBytes) ||
    pin.tilesBytes <= 127 ||
    pin.installedBytes !== pin.bytes + pin.tilesBytes ||
    pin.installedBytes > 3 * 1024 ** 3 ||
    typeof pin.generatedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(pin.generatedAt) ||
    !Number.isFinite(Date.parse(pin.generatedAt)) ||
    new Date(pin.generatedAt).toISOString().slice(0, 19) !== pin.generatedAt.slice(0, 19) ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    throw new Error('Invalid public state update manifest.');
  return {
    schemaVersion: 1,
    channel: 'public',
    classification: 'SOURCE_REDISTRIBUTABLE',
    state: pin.state,
    name: pin.name,
    sha256: pin.sha256,
    bytes: pin.bytes,
    installedBytes: pin.installedBytes,
    tilesBytes: pin.tilesBytes,
    tilesSha256: pin.tilesSha256,
    generatedAt: pin.generatedAt,
    packageSchema: 1,
    minAppMajor: 1,
    maxAppMajor: 1,
    revision,
  };
}

export function createUpdateSigner(privateKeyPem, versions = {}, persist = async () => {}) {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Ed25519 laptop key required.');
  const publicKey = createPublicKey(key);
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  const keyId = digest(raw);
  const identity = { keyId, publicKey: raw.toString('base64') };
  return {
    identity,
    async seal(pins) {
      const next = { ...versions };
      const manifests = pins.map((pin) => {
        const basis = updateManifest(pin, 1);
        const basisSha256 = digest(JSON.stringify(basis));
        const old = versions[pin.state];
        if (
          old &&
          (!Number.isSafeInteger(old.revision) ||
            old.revision < 1 ||
            !/^[a-f0-9]{64}$/.test(old.basisSha256))
        )
          throw new Error('Laptop update counter is invalid.');
        const revision =
          old?.basisSha256 === basisSha256
            ? old.revision
            : Math.max(Date.now(), (old?.revision ?? 0) + 1);
        next[pin.state] = { revision, basisSha256 };
        return updateManifest(pin, revision);
      });
      // Reserve revisions durably before publishing signatures; unchanged snapshots retain their version.
      await persist(next);
      versions = next;
      return manifests.map((manifest) => {
        const bytes = Buffer.from(JSON.stringify(manifest));
        const envelope = {
          schemaVersion: 1,
          algorithm: 'Ed25519',
          channel: 'public',
          trustRoot: laptopUpdateTrustRoot,
          keyId,
          antiReplayVersion: manifest.revision,
          manifestSha256: digest(bytes),
          signedAt: new Date().toISOString(),
        };
        const signature = sign(null, Buffer.from(signaturePayload(envelope)), key);
        if (!verify(null, Buffer.from(signaturePayload(envelope)), publicKey, signature))
          throw new Error('Laptop signature verification failed.');
        return {
          manifestBase64: bytes.toString('base64'),
          envelope: { ...envelope, signature: signature.toString('base64') },
        };
      });
    },
  };
}

export async function loadLaptopUpdateSigner(
  directory = join(
    process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share'),
    'OpenOutdoor',
    'laptop-signing',
  ),
) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    const account = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const sid = account.match(/S-1-5-(?:\d+-)*\d+/)?.[0];
    if (!sid) throw new Error('Cannot protect laptop signing key.');
    execFileSync(
      'icacls',
      [
        directory,
        '/inheritance:r',
        '/grant:r',
        `*${sid}:(OI)(CI)F`,
        '*S-1-5-18:(OI)(CI)F',
        '*S-1-5-32-544:(OI)(CI)F',
      ],
      { stdio: 'ignore', windowsHide: true },
    );
  } else await chmod(directory, 0o700);
  // One writer across laptop server processes prevents counter/key races.
  const lockPath = join(directory, 'identity.lock');
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const oldLock = JSON.parse(await readFile(lockPath, 'utf8'));
    if (!Number.isSafeInteger(oldLock.pid) || oldLock.pid <= 0)
      throw new Error('Invalid laptop signing lock.');
    try {
      process.kill(oldLock.pid, 0);
      throw new Error('Laptop signing identity is already in use.');
    } catch (liveError) {
      if (liveError.code !== 'ESRCH') throw liveError;
    }
    const { unlink } = await import('node:fs/promises');
    await unlink(lockPath);
    lock = await open(lockPath, 'wx', 0o600);
  }
  let source;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }));
    try {
      const bytes = await readFile(join(directory, 'identity.json'));
      if (bytes.length > 128 * 1024) throw new Error('Laptop signing identity is too large.');
      source = JSON.parse(bytes.toString('utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      source = {
        schemaVersion: 1,
        privateKeyPem: generateKeyPairSync('ed25519').privateKey.export({
          format: 'pem',
          type: 'pkcs8',
        }),
        versions: {},
      };
    }
    if (
      source.schemaVersion !== 1 ||
      typeof source.privateKeyPem !== 'string' ||
      !source.versions ||
      typeof source.versions !== 'object' ||
      Array.isArray(source.versions) ||
      Object.keys(source.versions).length > 50
    )
      throw new Error('Invalid laptop signing identity.');
    const signer = createUpdateSigner(source.privateKeyPem, source.versions, async (versions) => {
      const temporary = join(directory, 'identity.json.staging');
      const handle = await open(temporary, 'w', 0o600);
      try {
        await handle.writeFile(JSON.stringify({ ...source, versions }));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, join(directory, 'identity.json'));
    });
    await signer.seal([]); // Persist a new key before returning its public identity.
    let closed = false;
    return {
      ...signer,
      async close() {
        if (closed) return;
        closed = true;
        await lock.close();
        const { unlink } = await import('node:fs/promises');
        await unlink(lockPath);
      },
    };
  } catch (error) {
    await lock.close();
    const { unlink } = await import('node:fs/promises');
    await unlink(lockPath);
    throw error;
  }
}

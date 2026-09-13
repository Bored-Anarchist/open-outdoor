import { createReadStream } from 'node:fs';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { lstat, readFile, realpath, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const fail = (message) => {
  throw new Error(message);
};
const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
const namePattern =
  /^(?!(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$))[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,158}[a-zA-Z0-9_-])?$/i;
const validName = (value) => typeof value === 'string' && namePattern.test(value);
const roles = ['artifact', 'sbom', 'dbom', 'rights', 'notices'];
function exact(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    fail('Unexpected fields');
}
function validate(manifest) {
  exact(manifest, [
    'schemaVersion',
    'releaseId',
    'channel',
    'sequence',
    'keyId',
    'provenance',
    'files',
  ]);
  if (
    manifest.schemaVersion !== 1 ||
    !validName(manifest.releaseId) ||
    !['public', 'private'].includes(manifest.channel) ||
    !validName(manifest.keyId) ||
    !Number.isSafeInteger(manifest.sequence) ||
    manifest.sequence < 1
  )
    fail('Invalid release identity');
  const p = manifest.provenance;
  exact(p, ['repository', 'commit', 'builder', 'materials']);
  if (
    !/^https:\/\//.test(p.repository) ||
    !/^[0-9a-f]{40}$/.test(p.commit) ||
    typeof p.builder !== 'string' ||
    !p.builder.trim() ||
    !Array.isArray(p.materials) ||
    !p.materials.length
  )
    fail('Invalid provenance');
  const materialNames = new Set();
  for (const m of p.materials) {
    exact(m, ['name', 'sha256']);
    if (!validName(m.name) || !/^[0-9a-f]{64}$/.test(m.sha256) || materialNames.has(m.name))
      fail('Invalid material');
    materialNames.add(m.name);
  }
  for (const required of ['pnpm-lock.yaml', 'uv.lock', 'release.json'])
    if (!materialNames.has(required)) fail(`Missing pinned material: ${required}`);
  if (!Array.isArray(manifest.files) || !manifest.files.length) fail('Missing files');
  const names = new Set(['release.json', 'release.sig', 'sha256sums']);
  for (const f of manifest.files) {
    exact(f, ['name', 'role', 'sha256', 'bytes']);
    if (
      !validName(f.name) ||
      names.has(f.name.toLowerCase()) ||
      !roles.includes(f.role) ||
      !/^[0-9a-f]{64}$/.test(f.sha256) ||
      !Number.isSafeInteger(f.bytes) ||
      f.bytes < 1
    )
      fail('Invalid artifact');
    names.add(f.name.toLowerCase());
  }
  for (const role of roles)
    if (!manifest.files.some((f) => f.role === role)) fail(`Missing ${role}`);
}
async function safePath(root, name) {
  if (!validName(name)) fail('Unsafe filename');
  const path = resolve(root, name);
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    dirname(await realpath(path)) !== (await realpath(root))
  )
    fail('Unsafe file');
  return path;
}
async function safeRead(root, name) {
  const path = await safePath(root, name);
  if ((await lstat(path)).size > 4 * 1024 * 1024) fail('Metadata too large');
  return readFile(path);
}
async function digestFile(root, name) {
  const path = await safePath(root, name);
  const digest = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    digest.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: digest.digest('hex'), bytes };
}
function sums(manifest) {
  return manifest.files.map((f) => `${f.sha256}  ${f.name}\n`).join('');
}
async function checkFiles(root, manifest) {
  for (const f of manifest.files) {
    const actual = await digestFile(root, f.name);
    if (actual.bytes !== f.bytes || actual.sha256 !== f.sha256)
      fail(`Checksum mismatch: ${f.name}`);
  }
}
const payload = (bytes) => Buffer.concat([Buffer.from('open-outdoor-release-v1\0'), bytes]);

// The descriptor and policy are operator inputs. Neither is evidence of branch protection.
export async function sealRelease(root, descriptor, privateKeyPem) {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== 'ed25519') fail('Ed25519 key required');
  const files = [];
  for (const item of descriptor.files) {
    exact(item, ['name', 'role']);
    files.push({ ...item, ...(await digestFile(root, item.name)) });
  }
  files.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const manifest = { ...descriptor, files };
  validate(manifest);
  const bytes = Buffer.from(canonical(manifest) + '\n');
  await writeFile(resolve(root, 'release.json'), bytes, { flag: 'wx' });
  await writeFile(
    resolve(root, 'release.sig'),
    sign(null, payload(bytes), key).toString('base64') + '\n',
    { flag: 'wx' },
  );
  await writeFile(resolve(root, 'SHA256SUMS'), sums(manifest), { flag: 'wx' });
  return manifest;
}

export async function verifyRelease(root, policy) {
  exact(policy, ['releaseId', 'channel', 'sequence', 'provenance', 'keys']);
  const bytes = await safeRead(root, 'release.json');
  if (bytes.length > 4 * 1024 * 1024) fail('Manifest too large');
  const manifest = JSON.parse(bytes.toString('utf8'));
  validate(manifest);
  if (canonical(manifest) + '\n' !== bytes.toString('utf8')) fail('Noncanonical manifest');
  for (const field of ['releaseId', 'channel', 'sequence', 'provenance'])
    if (canonical(policy[field]) !== canonical(manifest[field])) fail(`Policy mismatch: ${field}`);
  if (!Array.isArray(policy.keys)) fail('External keyring required');
  const matches = policy.keys.filter((k) => k.keyId === manifest.keyId);
  if (matches.length !== 1 || matches[0].status !== 'active') fail('Untrusted or revoked key');
  const key = createPublicKey(matches[0].publicKeyPem);
  if (key.asymmetricKeyType !== 'ed25519') fail('Ed25519 key required');
  const signature = (await safeRead(root, 'release.sig')).toString('utf8').trim();
  if (
    !/^[A-Za-z0-9+/]{86}==$/.test(signature) ||
    !verify(null, payload(bytes), key, Buffer.from(signature, 'base64'))
  )
    fail('Invalid signature');
  await checkFiles(root, manifest);
  if ((await safeRead(root, 'SHA256SUMS')).toString('utf8') !== sums(manifest))
    fail('Checksum index mismatch');
  const expected = [
    ...manifest.files.map((f) => f.name),
    'release.json',
    'release.sig',
    'SHA256SUMS',
  ].sort();
  if (canonical((await readdir(root)).sort()) !== canonical(expected))
    fail('Unlisted distribution files');
  return {
    status: 'verified',
    releaseId: manifest.releaseId,
    commit: manifest.provenance.commit,
    files: manifest.files.length,
  };
}

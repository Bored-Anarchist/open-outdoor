import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  verifyPrivateExtension,
  verifyUpstreamCompatibility,
  negotiateExtension,
  type PrivateExtensionManifest,
  type PrivatePackageLock,
  type CoreExtensionContract,
} from '../src/private-extension.js';

const core: CoreExtensionContract = {
  schemaVersion: 1,
  coreVersion: '0.1.0',
  connectorSdkVersion: '1.0.0',
  canonicalVersions: ['1.0.0', '0.9.0'],
  capabilities: ['connector'],
};
const manifest: PrivateExtensionManifest = {
  schemaVersion: 2,
  extensionId: 'synthetic-extension',
  extensionVersion: '1.0.0',
  classification: 'PRIVATE_USER',
  core: { minimum: '0.1.0', before: '0.2.0' },
  connectorSdk: { minimum: '1.0.0', before: '2.0.0' },
  canonicalVersion: '1.0.0',
  capabilities: ['connector'],
  secretNames: [],
  packages: [{ id: 'synthetic-connector', version: '1.0.0', entry: 'index.mjs' }],
  lockFile: 'private-packages.lock.json',
};
const code =
  'export const normalize = value => ({name:value.name.trim(),classification:"PRIVATE_USER"});';
const lock: PrivatePackageLock = {
  schemaVersion: 1,
  extensionId: manifest.extensionId,
  extensionVersion: manifest.extensionVersion,
  classification: 'PRIVATE_USER',
  packages: [
    {
      id: 'synthetic-connector',
      version: '1.0.0',
      root: 'packages/synthetic',
      files: { 'index.mjs': createHash('sha256').update(code).digest('hex') },
      provenance: {
        origin: 'https://example.invalid/synthetic-private-code',
        revision: 'a'.repeat(40),
        licenseOrPermission: 'Apache-2.0 synthetic test',
      },
    },
  ],
};
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'outdoor-extension-'));
  roots.push(root);
  await mkdir(join(root, 'packages/synthetic'), { recursive: true });
  await writeFile(join(root, 'packages/synthetic/index.mjs'), code);
  await writeFile(join(root, 'open-outdoor.private.json'), JSON.stringify(manifest));
  await writeFile(join(root, manifest.lockFile), JSON.stringify(lock));
  return root;
}

describe('WP-405 private extension compatibility', () => {
  it('ships a contract aligned with the public package and SDK', async () => {
    const actual = JSON.parse(
      await readFile('config/extension-api.json', 'utf8'),
    ) as CoreExtensionContract;
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
    expect(actual.coreVersion).toBe(pkg.version);
    expect(actual).toEqual(core);
  });
  it('verifies every package byte, retains private provenance and never executes during verification', async () => {
    const root = await fixture();
    const value = await verifyPrivateExtension(root, process.cwd(), core);
    expect(value.classification).toBe('PRIVATE_USER');
    expect(value.lockSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(new TextDecoder().decode(value.packages[0]!.files['index.mjs'])).toBe(code);
    expect(value.packages[0]!.provenance).toEqual(lock.packages[0]!.provenance);
    expect(await readFile(join(root, 'packages/synthetic/index.mjs'), 'utf8')).toBe(code);
  });
  it('keeps a pinned private connector functional after a declared compatible public-core upgrade', async () => {
    const root = await fixture();
    const next = { ...core, coreVersion: '0.1.1', connectorSdkVersion: '1.1.0' };
    expect(await verifyUpstreamCompatibility(root, process.cwd(), core, next)).toMatchObject({
      compatible: true,
      from: '0.1.0',
      to: '0.1.1',
      classification: 'PRIVATE_USER',
    });
    for (const contract of [core, next]) {
      const checked = await verifyPrivateExtension(root, process.cwd(), contract);
      const module = `data:text/javascript;base64,${Buffer.from(checked.packages[0]!.files['index.mjs']!).toString('base64')}`;
      const result = await promisify(execFile)(process.execPath, [
        '--input-type=module',
        '-e',
        `const m = await import(${JSON.stringify(module)}); console.log(JSON.stringify(m.normalize({name:' Synthetic '})));`,
      ]);
      expect(JSON.parse(result.stdout)).toEqual({
        name: 'Synthetic',
        classification: 'PRIVATE_USER',
      });
    }
    await expect(
      verifyUpstreamCompatibility(root, process.cwd(), core, { ...core, coreVersion: '0.2.0' }),
    ).rejects.toThrow(/outside declared range/);
  });
  it.each([
    { coreVersion: '0.0.9' },
    { coreVersion: '0.2.0' },
    { connectorSdkVersion: '2.0.0' },
    { canonicalVersions: ['2.0.0'] },
    { capabilities: [] },
  ])('rejects incompatible core contracts %j', (override) => {
    expect(() => negotiateExtension(manifest, { ...core, ...override })).toThrow();
  });
  it('rejects arbitrary hooks, nonstable versions, public classification, and duplicate packages', () => {
    for (const value of [
      { ...manifest, hooks: ['shell'] },
      { ...manifest, extensionVersion: '1.0.0-beta' },
      { ...manifest, classification: 'PUBLIC_SYNTHETIC' },
      { ...manifest, packages: [...manifest.packages, ...manifest.packages] },
      { ...manifest, secretNames: ['actual-secret-value'] },
      { ...manifest, core: { minimum: '0.2.0', before: '0.1.0' } },
    ]) {
      expect(() => negotiateExtension(value, core)).toThrow();
    }
  });
  it('rejects modified, missing, extra, or version-mismatched package files', async () => {
    const root = await fixture();
    await writeFile(join(root, 'packages/synthetic/index.mjs'), `${code}\n// changed`);
    await expect(verifyPrivateExtension(root, process.cwd(), core)).rejects.toThrow(/checksum/);
    await writeFile(join(root, 'packages/synthetic/index.mjs'), code);
    await writeFile(join(root, 'packages/synthetic/extra.mjs'), 'synthetic');
    await expect(verifyPrivateExtension(root, process.cwd(), core)).rejects.toThrow(/unlocked/);
    await rm(join(root, 'packages/synthetic/extra.mjs'));
    await writeFile(
      join(root, manifest.lockFile),
      JSON.stringify({ ...lock, packages: [{ ...lock.packages[0], version: '1.0.1' }] }),
    );
    await expect(verifyPrivateExtension(root, process.cwd(), core)).rejects.toThrow(
      /version not locked/,
    );
  });
  it('rejects path traversal and junction escapes before reading external content', async () => {
    const root = await fixture();
    const outside = await mkdtemp(join(tmpdir(), 'outdoor-outside-'));
    roots.push(outside);
    await writeFile(
      join(root, 'open-outdoor.private.json'),
      JSON.stringify({ ...manifest, lockFile: '../outside.json' }),
    );
    await expect(verifyPrivateExtension(root, process.cwd(), core)).rejects.toThrow(
      /unsafe relative path/,
    );
    await writeFile(join(root, 'open-outdoor.private.json'), JSON.stringify(manifest));
    await symlink(outside, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await writeFile(
      join(root, manifest.lockFile),
      JSON.stringify({ ...lock, packages: [{ ...lock.packages[0], root: 'escape' }] }),
    );
    await expect(verifyPrivateExtension(root, process.cwd(), core)).rejects.toThrow(/links/);
    await expect(
      verifyPrivateExtension(resolve('fixtures/private-root-template'), process.cwd(), core),
    ).rejects.toThrow(/disjoint/);
  });
  it('runs the explicit private CLI with no private paths in public diagnostics', async () => {
    const root = await fixture();
    const result = await promisify(execFile)(
      process.execPath,
      ['tools/private-compatibility.mjs'],
      { env: { ...process.env, OUTDOOR_PRIVATE_ROOT: root } },
    );
    expect(result.stdout).toContain('passed');
    expect(result.stdout).not.toContain(root);
    await writeFile(join(root, 'open-outdoor.private.json'), '{malformed synthetic');
    const failure = await promisify(execFile)(
      process.execPath,
      ['tools/private-compatibility.mjs'],
      { env: { ...process.env, OUTDOOR_PRIVATE_ROOT: root } },
    ).catch((error) => error as { stderr: string });
    expect(failure.stderr).not.toContain(root);
    expect(failure.stderr).not.toContain('malformed synthetic');
  });
});

it('verifies the shipped synthetic extension example after copying outside public Git', async () => {
  const root = await mkdtemp(join(tmpdir(), 'outdoor-example-'));
  roots.push(root);
  const { cp, rename } = await import('node:fs/promises');
  await cp('fixtures/private-root-template/v2', root, { recursive: true });
  await rename(
    join(root, 'open-outdoor.private.example.json'),
    join(root, 'open-outdoor.private.json'),
  );
  await rename(
    join(root, 'private-packages.lock.example.json'),
    join(root, 'private-packages.lock.json'),
  );
  expect((await verifyPrivateExtension(root, process.cwd(), core)).packages).toHaveLength(1);
});

import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export interface VersionRange {
  readonly minimum: string;
  readonly before: string;
}
export interface CoreExtensionContract {
  readonly schemaVersion: 1;
  readonly coreVersion: string;
  readonly connectorSdkVersion: string;
  readonly canonicalVersions: readonly string[];
  readonly capabilities: readonly string[];
}
export interface PrivateExtensionManifest {
  readonly schemaVersion: 2;
  readonly extensionId: string;
  readonly extensionVersion: string;
  readonly classification: 'PRIVATE_USER' | 'PRIVATE_ORGANIZATION';
  readonly core: VersionRange;
  readonly connectorSdk: VersionRange;
  readonly canonicalVersion: string;
  readonly capabilities: readonly string[];
  readonly secretNames: readonly string[];
  readonly packages: readonly {
    readonly id: string;
    readonly version: string;
    readonly entry: string;
  }[];
  readonly lockFile: string;
}
export interface PrivatePackageLock {
  readonly schemaVersion: 1;
  readonly extensionId: string;
  readonly extensionVersion: string;
  readonly classification: 'PRIVATE_USER' | 'PRIVATE_ORGANIZATION';
  readonly packages: readonly {
    readonly id: string;
    readonly version: string;
    readonly root: string;
    readonly files: Readonly<Record<string, string>>;
    readonly provenance: {
      readonly origin: string;
      readonly revision: string;
      readonly licenseOrPermission: string;
    };
  }[];
}
function invalid(reason: string): never {
  throw new Error(`private extension rejected: ${reason}`);
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    invalid('unexpected or missing manifest field');
  return value as Record<string, unknown>;
}
function version(value: unknown): number[] {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))
    invalid('version must be stable semantic version');
  const parts = value.split('.').map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) invalid('version number too large');
  return parts;
}
function compare(a: string, b: string): number {
  const left = version(a);
  const right = version(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i]! < right[i]! ? -1 : 1;
  return 0;
}
function range(value: unknown): VersionRange {
  const record = object(value, ['minimum', 'before']);
  version(record.minimum);
  version(record.before);
  const result = record as unknown as VersionRange;
  if (compare(result.minimum, result.before) >= 0) invalid('empty compatibility range');
  return result;
}
function strings(value: unknown, pattern: RegExp): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((item) => typeof item !== 'string' || !pattern.test(item)) ||
    new Set(value).size !== value.length
  )
    invalid('invalid capability or identifier list');
}
function identifier(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 100)
    invalid('invalid identifier');
}
function safePath(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length > 500 ||
    isAbsolute(value) ||
    value
      .split('/')
      .some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          /[\\:\x00-\x1f]/.test(part) ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part),
      )
  )
    invalid('unsafe relative path');
}
function classification(value: unknown): void {
  if (value !== 'PRIVATE_USER' && value !== 'PRIVATE_ORGANIZATION')
    invalid('private classification required');
}
export function validateExtensionManifest(value: unknown): PrivateExtensionManifest {
  const result = object(value, [
    'schemaVersion',
    'extensionId',
    'extensionVersion',
    'classification',
    'core',
    'connectorSdk',
    'canonicalVersion',
    'capabilities',
    'secretNames',
    'packages',
    'lockFile',
  ]);
  if (result.schemaVersion !== 2) invalid('unsupported extension manifest version');
  identifier(result.extensionId);
  version(result.extensionVersion);
  classification(result.classification);
  range(result.core);
  range(result.connectorSdk);
  version(result.canonicalVersion);
  strings(result.capabilities, /^[a-z][a-z-]*$/);
  strings(result.secretNames, /^[A-Z][A-Z0-9_]*$/);
  safePath(result.lockFile);
  if (!Array.isArray(result.packages) || !result.packages.length || result.packages.length > 100)
    invalid('packages required');
  const ids = new Set<string>();
  for (const item of result.packages) {
    const entry = object(item, ['id', 'version', 'entry']);
    identifier(entry.id);
    version(entry.version);
    safePath(entry.entry);
    if (ids.has(entry.id)) invalid('duplicate package');
    ids.add(entry.id);
  }
  return structuredClone(result) as unknown as PrivateExtensionManifest;
}
export function negotiateExtension(
  value: unknown,
  core: CoreExtensionContract,
): PrivateExtensionManifest {
  object(core, [
    'schemaVersion',
    'coreVersion',
    'connectorSdkVersion',
    'canonicalVersions',
    'capabilities',
  ]);
  if (core.schemaVersion !== 1) invalid('unsupported core contract');
  version(core.coreVersion);
  version(core.connectorSdkVersion);
  strings(core.canonicalVersions, /^\d+\.\d+\.\d+$/);
  core.canonicalVersions.forEach(version);
  strings(core.capabilities, /^[a-z][a-z-]*$/);
  const manifest = validateExtensionManifest(value);
  for (const [candidate, supported, name] of [
    [core.coreVersion, manifest.core, 'core'],
    [core.connectorSdkVersion, manifest.connectorSdk, 'connector SDK'],
  ] as const) {
    if (compare(candidate, supported.minimum) < 0 || compare(candidate, supported.before) >= 0)
      invalid(
        `${name} version outside declared range ${supported.minimum} <= version < ${supported.before}`,
      );
  }
  if (!core.canonicalVersions.includes(manifest.canonicalVersion))
    invalid('canonical schema not supported');
  if (manifest.capabilities.some((capability) => !core.capabilities.includes(capability)))
    invalid('capability not supported');
  return manifest;
}
function within(root: string, path: string): boolean {
  const part = relative(root, path);
  return part === '' || (part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part));
}
/** Reject links in every component before following a manifest-controlled path. */
async function confined(root: string, path: string): Promise<string> {
  safePath(path);
  let current = root;
  for (const part of path.split('/')) {
    current = resolve(current, part);
    if ((await lstat(current)).isSymbolicLink())
      invalid('links are not allowed in extension paths');
  }
  const resolved = await realpath(current);
  if (!within(root, resolved)) invalid('path escaped private root');
  return resolved;
}
async function document(path: string): Promise<unknown> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > 1024 * 1024) invalid('manifest size or type invalid');
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

export interface VerifiedPrivateExtension {
  readonly classification: 'PRIVATE_USER' | 'PRIVATE_ORGANIZATION';
  readonly manifest: PrivateExtensionManifest;
  readonly core: CoreExtensionContract;
  readonly lockSha256: string;
  readonly packages: readonly {
    readonly id: string;
    readonly version: string;
    readonly entry: string;
    readonly files: Readonly<Record<string, Uint8Array>>;
    readonly provenance: PrivatePackageLock['packages'][number]['provenance'];
  }[];
}

/** Explicit private command only. Verification returns pinned bytes and never executes package code. */
export async function verifyPrivateExtension(
  candidate: string,
  publicCheckout: string,
  core: CoreExtensionContract,
): Promise<VerifiedPrivateExtension> {
  if (!isAbsolute(candidate)) invalid('private root must be absolute');
  const [root, checkout] = await Promise.all([realpath(candidate), realpath(publicCheckout)]).catch(
    () => invalid('selected root unavailable'),
  );
  if (within(root, checkout) || within(checkout, root))
    invalid('private root and public checkout must be disjoint');
  try {
    const manifest = negotiateExtension(
      await document(await confined(root, 'open-outdoor.private.json')),
      core,
    );
    const lockValue = await document(await confined(root, manifest.lockFile));
    const lockRecord = object(lockValue, [
      'schemaVersion',
      'extensionId',
      'extensionVersion',
      'classification',
      'packages',
    ]);
    if (
      lockRecord.schemaVersion !== 1 ||
      lockRecord.extensionId !== manifest.extensionId ||
      lockRecord.extensionVersion !== manifest.extensionVersion ||
      lockRecord.classification !== manifest.classification ||
      !Array.isArray(lockRecord.packages) ||
      lockRecord.packages.length !== manifest.packages.length
    )
      invalid('lock does not match extension');
    const lock = lockRecord as unknown as PrivatePackageLock;
    const verified: VerifiedPrivateExtension['packages'][number][] = [];
    const packageIds = new Set<string>();
    const packageRoots: string[] = [];
    let totalBytes = 0;
    let totalFiles = 0;
    let totalEntries = 0;
    for (const locked of lock.packages) {
      object(locked, ['id', 'version', 'root', 'files', 'provenance']);
      identifier(locked.id);
      version(locked.version);
      safePath(locked.root);
      if (packageIds.has(locked.id)) invalid('duplicate locked package');
      packageIds.add(locked.id);
      const declared = manifest.packages.find(
        (item) => item.id === locked.id && item.version === locked.version,
      );
      if (!declared) invalid('package version not locked');
      object(locked.provenance, ['origin', 'revision', 'licenseOrPermission']);
      const origin = new URL(locked.provenance.origin);
      if (
        origin.protocol !== 'https:' ||
        origin.username ||
        origin.password ||
        origin.search ||
        origin.hash ||
        !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(locked.provenance.revision) ||
        typeof locked.provenance.licenseOrPermission !== 'string' ||
        !locked.provenance.licenseOrPermission.trim() ||
        locked.provenance.licenseOrPermission.length > 200
      )
        invalid('invalid private package provenance');
      if (
        !locked.files ||
        typeof locked.files !== 'object' ||
        Array.isArray(locked.files) ||
        !Object.keys(locked.files).length
      )
        invalid('package file lock required');
      const packageRoot = await confined(root, locked.root);
      if (
        !(await lstat(packageRoot)).isDirectory() ||
        packageRoots.some((prior) => within(prior, packageRoot) || within(packageRoot, prior))
      )
        invalid('overlapping package roots');
      packageRoots.push(packageRoot);
      const files: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
      const pending = [''];
      while (pending.length) {
        const directory = pending.pop()!;
        for (const entry of await readdir(resolve(packageRoot, directory), {
          withFileTypes: true,
        })) {
          if (++totalEntries > 2000) invalid('package directory limit');
          const path = directory ? `${directory}/${entry.name}` : entry.name;
          safePath(path);
          if (path.split('/').length > 16 || entry.isSymbolicLink())
            invalid('package link or nesting limit');
          if (entry.isDirectory()) {
            pending.push(path);
            continue;
          }
          if (!entry.isFile() || ++totalFiles > 1000) invalid('package file limit or type');
          const digest = Object.hasOwn(locked.files, path) ? locked.files[path] : null;
          if (!digest || !/^[a-f0-9]{64}$/.test(digest)) invalid('unlocked package file');
          const filePath = await confined(packageRoot, path);
          const stat = await lstat(filePath);
          totalBytes += stat.size;
          if (totalBytes > 50 * 1024 * 1024) invalid('package byte limit');
          const bytes = await readFile(filePath);
          if (
            bytes.length !== stat.size ||
            createHash('sha256').update(bytes).digest('hex') !== digest
          )
            invalid('package checksum mismatch');
          files[path] = new Uint8Array(bytes);
        }
      }
      if (
        Object.keys(files).length !== Object.keys(locked.files).length ||
        !Object.hasOwn(files, declared.entry)
      )
        invalid('missing locked file or entry point');
      verified.push({
        id: locked.id,
        version: locked.version,
        entry: declared.entry,
        files,
        provenance: structuredClone(locked.provenance),
      });
    }
    return {
      classification: manifest.classification,
      manifest,
      core: structuredClone(core),
      lockSha256: createHash('sha256').update(JSON.stringify(lockValue)).digest('hex'),
      packages: verified,
    };
  } catch (error) {
    // OS/JSON errors can include private paths or document fragments; expose only our reason codes.
    if (error instanceof Error && error.message.startsWith('private extension rejected:'))
      throw error;
    return invalid('private manifest or package could not be read');
  }
}

export async function verifyUpstreamCompatibility(
  candidate: string,
  checkout: string,
  current: CoreExtensionContract,
  proposed: CoreExtensionContract,
) {
  const before = await verifyPrivateExtension(candidate, checkout, current);
  const after = await verifyPrivateExtension(candidate, checkout, proposed);
  if (before.lockSha256 !== after.lockSha256) invalid('lock changed during compatibility check');
  return {
    classification: before.classification,
    compatible: true as const,
    from: current.coreVersion,
    to: proposed.coreVersion,
    lockSha256: before.lockSha256,
  };
}

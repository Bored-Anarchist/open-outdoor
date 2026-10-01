import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type {
  Connector,
  ConnectorContext,
  ConnectorManifest,
  DataClassification,
  FetchedAsset,
  StoredRawAsset,
} from './connector.js';
import { evaluateSourceRights, validateConnectorManifest } from './connector.js';

export type QuarantineReason =
  | 'rights-denied'
  | 'payload-limit'
  | 'archive-entry-limit'
  | 'archive-expanded-limit'
  | 'compression-ratio-limit'
  | 'archive-path-traversal'
  | 'archive-link'
  | 'parser-timeout'
  | 'parser-failure'
  | 'validation-failure'
  | 'boundary-violation';

export interface QuarantineRecord {
  readonly runId: string;
  readonly sourceId: string;
  readonly externalId: string | null;
  readonly reason: QuarantineReason;
  readonly detail: string;
  readonly recordedAt: string;
}

export class IngestionSecurityError extends Error {
  constructor(
    readonly reason: QuarantineReason,
    message: string,
  ) {
    super(message);
    this.name = 'IngestionSecurityError';
  }
}

const secretKey =
  /(?:authorization|cookie|credential|pass(?:word|phrase)?|private.?key|secret|session|token)/i;
const secretTextPatterns = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
] as const;

export type Redactable =
  boolean | number | string | null | readonly Redactable[] | { readonly [key: string]: Redactable };

export function redactIngestionSecrets(value: Redactable): Redactable {
  if (Array.isArray(value)) return value.map(redactIngestionSecrets);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        secretKey.test(key) ? '[REDACTED]' : redactIngestionSecrets(item),
      ]),
    );
  }
  if (typeof value !== 'string') return value;
  return secretTextPatterns.reduce(
    (redacted, pattern) => redacted.replace(pattern, '[REDACTED]'),
    value,
  );
}

function canonicalPath(path: string): string {
  return resolve(path).replaceAll('\\', '/').toLocaleLowerCase('en-US');
}

function containsPath(parent: string, candidate: string): boolean {
  const pathFromParent = relative(resolve(parent), resolve(candidate));
  return pathFromParent === '' || (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent));
}

export function assertProcessingRootIsolation(
  publicRoot: string,
  privateRoot: string,
  publicCheckout?: string,
): void {
  const publicPath = canonicalPath(publicRoot);
  const privatePath = canonicalPath(privateRoot);
  if (
    publicPath === privatePath ||
    containsPath(publicRoot, privateRoot) ||
    containsPath(privateRoot, publicRoot)
  ) {
    throw new IngestionSecurityError(
      'boundary-violation',
      'public and private processing roots must be disjoint',
    );
  }
  if (publicCheckout && containsPath(publicCheckout, privateRoot)) {
    throw new IngestionSecurityError(
      'boundary-violation',
      'the private processing root must resolve outside the public checkout',
    );
  }
}

export interface ArchiveEntryMetadata {
  readonly path: string;
  readonly compressedBytes: number;
  readonly expandedBytes: number;
  readonly kind: 'file' | 'directory' | 'symbolic-link' | 'hard-link';
}

export interface ArchiveLimits {
  readonly maxEntries: number;
  readonly maxExpandedBytes: number;
  readonly maxCompressionRatio: number;
}

function isUnsafeArchivePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return (
    normalized === '' ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized
      .split('/')
      .some(
        (part) =>
          part === '.' ||
          part === '..' ||
          part === '' ||
          /[:\u0000-\u001f<>"|?*]/.test(part) ||
          /[. ]$/.test(part) ||
          /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part),
      )
  );
}

export function inspectArchiveEntries(
  entries: readonly ArchiveEntryMetadata[],
  limits: ArchiveLimits,
): void {
  if (
    !Number.isSafeInteger(limits.maxEntries) ||
    limits.maxEntries <= 0 ||
    !Number.isSafeInteger(limits.maxExpandedBytes) ||
    limits.maxExpandedBytes <= 0 ||
    !Number.isFinite(limits.maxCompressionRatio) ||
    limits.maxCompressionRatio <= 0
  )
    throw new IngestionSecurityError('archive-expanded-limit', 'archive limits are invalid');
  if (entries.length > limits.maxEntries) {
    throw new IngestionSecurityError('archive-entry-limit', 'archive contains too many entries');
  }
  let totalExpandedBytes = 0;
  const paths = new Map<string, ArchiveEntryMetadata['kind']>();
  for (const entry of entries) {
    if (isUnsafeArchivePath(entry.path)) {
      throw new IngestionSecurityError('archive-path-traversal', 'archive path is unsafe');
    }
    if (entry.kind === 'symbolic-link' || entry.kind === 'hard-link') {
      throw new IngestionSecurityError('archive-link', 'archive links are not accepted');
    }
    if (entry.kind !== 'file' && entry.kind !== 'directory')
      throw new IngestionSecurityError('archive-link', 'archive member type is invalid');
    const normalized = entry.path.replaceAll('\\', '/').toLowerCase();
    if (paths.has(normalized))
      throw new IngestionSecurityError('archive-path-traversal', 'archive paths collide');
    paths.set(normalized, entry.kind);
    if (
      !Number.isSafeInteger(entry.compressedBytes) ||
      entry.compressedBytes < 0 ||
      !Number.isSafeInteger(entry.expandedBytes) ||
      entry.expandedBytes < 0
    ) {
      throw new IngestionSecurityError('archive-expanded-limit', 'archive sizes are invalid');
    }
    totalExpandedBytes += entry.expandedBytes;
    if (!Number.isSafeInteger(totalExpandedBytes) || totalExpandedBytes > limits.maxExpandedBytes) {
      throw new IngestionSecurityError(
        'archive-expanded-limit',
        'archive expands beyond the configured byte limit',
      );
    }
    const ratio = entry.expandedBytes / Math.max(1, entry.compressedBytes);
    if (ratio > limits.maxCompressionRatio) {
      throw new IngestionSecurityError(
        'compression-ratio-limit',
        'archive entry exceeds the configured compression ratio',
      );
    }
  }
  // A file cannot also be the parent of another member, regardless of entry order.
  for (const name of paths.keys()) {
    const parts = name.split('/');
    for (let count = 1; count < parts.length; count++) {
      if (paths.get(parts.slice(0, count).join('/')) === 'file')
        throw new IngestionSecurityError('archive-path-traversal', 'archive parent is a file');
    }
  }
}

export interface RawArtifactMetadata {
  readonly sourceId: string;
  readonly externalId: string;
  readonly sourcePartition: string;
  readonly retrievedAt: string;
  readonly contentType: string;
  readonly classification: DataClassification;
  readonly retention: string;
}

export interface RawArtifactStoreOptions {
  readonly root: string;
  readonly boundary: 'public' | 'private';
}

const publicClassifications: readonly DataClassification[] = [
  'PUBLIC_SYNTHETIC',
  'SOURCE_REDISTRIBUTABLE',
];

export class RawArtifactStore {
  readonly root: string;

  constructor(readonly options: RawArtifactStoreOptions) {
    if (!isAbsolute(options.root)) {
      throw new IngestionSecurityError('boundary-violation', 'raw root must be absolute');
    }
    this.root = resolve(options.root);
  }

  async put(payload: Uint8Array, metadata: RawArtifactMetadata): Promise<StoredRawAsset> {
    if (
      this.options.boundary === 'public' &&
      !publicClassifications.includes(metadata.classification)
    ) {
      throw new IngestionSecurityError(
        'boundary-violation',
        'private or restricted material cannot enter the public raw root',
      );
    }
    if (metadata.retention === '') {
      throw new IngestionSecurityError('rights-denied', 'raw retention must be explicit');
    }
    const checksum = createHash('sha256').update(payload).digest('hex');
    await mkdir(this.root, { recursive: true });
    const canonicalRoot = await realpath(this.root);
    const directory = resolve(this.root, checksum.slice(0, 2));
    const payloadPath = resolve(directory, `${checksum}.raw`);
    const metadataPath = resolve(directory, `${checksum}.json`);
    if (!containsPath(this.root, payloadPath) || !containsPath(this.root, metadataPath)) {
      throw new IngestionSecurityError('boundary-violation', 'artifact escaped the raw root');
    }
    await mkdir(directory, { recursive: true });
    if (
      (await lstat(directory)).isSymbolicLink() ||
      !containsPath(canonicalRoot, await realpath(directory))
    ) {
      throw new IngestionSecurityError(
        'boundary-violation',
        'artifact directory escaped the raw root',
      );
    }
    for (const path of [payloadPath, metadataPath]) {
      const stat = await lstat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
      if (stat && (!stat.isFile() || stat.isSymbolicLink())) {
        throw new IngestionSecurityError(
          'boundary-violation',
          'artifact path is not a regular file',
        );
      }
    }
    try {
      await writeFile(payloadPath, payload, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await readFile(payloadPath);
      if (createHash('sha256').update(existing).digest('hex') !== checksum) throw error;
    }
    // A payload alone is not a successful acquisition. Retry an orphaned metadata write,
    // and never hide permission/disk errors just because the payload already exists.
    try {
      await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = JSON.parse(await readFile(metadataPath, 'utf8'));
      if (
        !existing ||
        typeof existing !== 'object' ||
        Array.isArray(existing) ||
        Object.keys(existing).length !== Object.keys(metadata).length ||
        Object.entries(metadata).some(
          ([key, value]) => key !== 'retrievedAt' && existing[key] !== value,
        )
      ) {
        throw new IngestionSecurityError(
          'validation-failure',
          'raw artifact metadata conflicts with its retained provenance',
        );
      }
    }
    return {
      externalId: metadata.externalId,
      sourcePartition: metadata.sourcePartition,
      locator: payloadPath,
      checksum,
      byteLength: payload.byteLength,
      storageKey: relative(this.root, payloadPath).replaceAll('\\', '/'),
      contentType: metadata.contentType,
      retrievedAt: metadata.retrievedAt,
    };
  }
}

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new IngestionSecurityError('parser-timeout', 'isolated task timed out'));
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface ConnectorRunResult<T> {
  readonly emitted: readonly T[];
  readonly quarantine: readonly QuarantineRecord[];
}

function quarantineDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown ingestion failure';
  return String(redactIngestionSecrets(message)).slice(0, 500);
}

function quarantineReason(error: unknown, fallback: QuarantineReason): QuarantineReason {
  return error instanceof IngestionSecurityError ? error.reason : fallback;
}

function assertAssetLocator(
  asset: { readonly locator: string },
  manifest: ConnectorManifest,
): void {
  let locator: URL;
  try {
    locator = new URL(asset.locator);
  } catch {
    throw new IngestionSecurityError('boundary-violation', 'asset locator must be an absolute URI');
  }
  const transport = locator.protocol.replace(':', '');
  if (!manifest.allowedTransports.includes(transport as 'https' | 'file')) {
    throw new IngestionSecurityError('boundary-violation', 'asset transport is not allowed');
  }
  if (
    transport === 'https' &&
    !manifest.allowedHosts.some((host) => host.toLocaleLowerCase('en-US') === locator.hostname)
  ) {
    throw new IngestionSecurityError('boundary-violation', 'asset host is not allowed');
  }
}

export async function runConnector<TParsed, TNormalized, TEmitted>(
  connector: Connector<TParsed, TNormalized, TEmitted>,
  runId: string,
  now: string,
): Promise<ConnectorRunResult<TEmitted>> {
  const manifest = validateConnectorManifest(connector.manifest);
  const quarantine: QuarantineRecord[] = [];
  const emitted: TEmitted[] = [];
  const acquisition = evaluateSourceRights(manifest, {
    operation: 'acquire',
    acquisitionMode: manifest.acquisitionMode,
    now,
  });
  if (!acquisition.allowed) {
    quarantine.push({
      runId,
      sourceId: manifest.sourceId,
      externalId: null,
      reason: 'rights-denied',
      detail: acquisition.reasons.join(','),
      recordedAt: now,
    });
    return { emitted, quarantine };
  }

  let assets: readonly Awaited<ReturnType<typeof connector.discover>>[number][];
  try {
    assets = await withTimeout(
      (signal) => connector.discover({ runId, signal }),
      manifest.limits.maxParserMilliseconds,
    );
  } catch (error) {
    quarantine.push({
      runId,
      sourceId: manifest.sourceId,
      externalId: null,
      reason: quarantineReason(error, 'parser-failure'),
      detail: quarantineDetail(error),
      recordedAt: now,
    });
    return { emitted, quarantine };
  }
  for (const asset of assets) {
    try {
      const output = await withTimeout(async (signal) => {
        const context: ConnectorContext = { runId, signal };
        assertAssetLocator(asset, manifest);
        const fetched = await connector.fetch(asset, context);
        signal.throwIfAborted();
        assertFetchedAsset(fetched, manifest.limits.maxPayloadBytes, manifest.limits.maxRedirects);
        const retained = evaluateSourceRights(manifest, { operation: 'retain-raw', now });
        if (!retained.allowed) {
          throw new IngestionSecurityError('rights-denied', retained.reasons.join(','));
        }
        const stored = await connector.storeRaw(fetched, context);
        signal.throwIfAborted();
        const parsed = await connector.parse(fetched, context);
        signal.throwIfAborted();
        const normalized = await connector.normalize(parsed, context);
        signal.throwIfAborted();
        await connector.validate(normalized, context);
        signal.throwIfAborted();
        await connector.checkpoint(stored, context);
        signal.throwIfAborted();
        return connector.emit(normalized, context);
      }, manifest.limits.maxParserMilliseconds);
      emitted.push(await output);
    } catch (error) {
      quarantine.push({
        runId,
        sourceId: manifest.sourceId,
        externalId: asset.externalId,
        reason: quarantineReason(error, 'parser-failure'),
        detail: quarantineDetail(error),
        recordedAt: now,
      });
    }
  }
  return { emitted, quarantine };
}

export function assertFetchedAsset(
  asset: FetchedAsset,
  maximumBytes: number,
  maximumRedirects = 0,
): void {
  if (asset.payload.byteLength > maximumBytes) {
    throw new IngestionSecurityError('payload-limit', 'payload exceeds configured byte limit');
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(asset.retrievedAt)) {
    throw new IngestionSecurityError('validation-failure', 'retrieval time must be UTC');
  }
  if (
    !Number.isSafeInteger(asset.redirectCount ?? 0) ||
    (asset.redirectCount ?? 0) < 0 ||
    (asset.redirectCount ?? 0) > maximumRedirects
  ) {
    throw new IngestionSecurityError('boundary-violation', 'redirect limit exceeded');
  }
}

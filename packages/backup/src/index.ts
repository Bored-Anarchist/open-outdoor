import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import {
  PRIVATE_SCHEMA_PREVIOUS_VERSION,
  PRIVATE_SCHEMA_VERSION,
  migratePrivateSnapshot,
  type PrivateDatabaseSnapshot,
} from '@open-outdoor/storage';

export const BACKUP_FORMAT_VERSION = 1;
const MAGIC = 'OPEN-OUTDOOR-BACKUP';
const MAXIMUM_CONTAINER_BYTES = 512 * 1024 * 1024;
const MAXIMUM_ATTACHMENT_BYTES = 256 * 1024 * 1024;
const MAXIMUM_ATTACHMENTS = 10_000;
const RESTORE_RESERVE_BYTES = 64 * 1024 * 1024;

function validAttachmentName(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 255 &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !/[\u0000-\u001f]/.test(value)
  );
}

export interface BackupAttachment {
  readonly id: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

export interface BackupHeader {
  readonly magic: typeof MAGIC;
  readonly formatVersion: typeof BACKUP_FORMAT_VERSION;
  readonly cipher: 'AES-256-GCM';
  readonly kdf: 'scrypt';
  readonly kdfParameters: {
    readonly N: 16384;
    readonly r: 8;
    readonly p: 1;
  };
  readonly salt: string;
  readonly nonce: string;
}

interface BackupManifest {
  readonly privateSchemaVersion: number;
  readonly activityCount: number;
  readonly userTrailCount: number;
  readonly overlayCount: number;
  readonly attachmentCount: number;
  readonly attachmentHashes: Readonly<Record<string, string>>;
}

interface EncryptedPayload {
  readonly createdAt: string;
  readonly manifest: BackupManifest;
  readonly snapshot: PrivateDatabaseSnapshot;
  readonly attachments: readonly {
    readonly id: string;
    readonly fileName: string;
    readonly bytes: string;
  }[];
}

interface SerializedContainer {
  readonly header: BackupHeader;
  readonly ciphertext: string;
  readonly authenticationTag: string;
}

export interface RestoredPrivateData {
  readonly snapshot: PrivateDatabaseSnapshot;
  readonly attachments: readonly BackupAttachment[];
  readonly createdAt: string;
}

export class BackupError extends Error {
  constructor(
    readonly code:
      | 'AUTHENTICATION_FAILED'
      | 'FORMAT_UNSUPPORTED'
      | 'INPUT_INVALID'
      | 'INTEGRITY_FAILED'
      | 'PASSPHRASE_WEAK'
      | 'SCHEMA_INCOMPATIBLE'
      | 'SPACE_INSUFFICIENT',
    message: string,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

function canonicalHeader(header: BackupHeader): string {
  return JSON.stringify({
    magic: header.magic,
    formatVersion: header.formatVersion,
    cipher: header.cipher,
    kdf: header.kdf,
    kdfParameters: header.kdfParameters,
    salt: header.salt,
    nonce: header.nonce,
  });
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  if (passphrase.length < 12) {
    throw new BackupError(
      'PASSPHRASE_WEAK',
      'backup passphrase must contain at least 12 characters',
    );
  }
  return scryptSync(passphrase, salt, 32, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function createManifest(
  snapshot: PrivateDatabaseSnapshot,
  attachments: readonly BackupAttachment[],
): BackupManifest {
  return {
    privateSchemaVersion: snapshot.schemaVersion,
    activityCount: snapshot.activities.length,
    userTrailCount: snapshot.userTrails.length,
    overlayCount: snapshot.overlays.length,
    attachmentCount: attachments.length,
    attachmentHashes: Object.fromEntries(
      attachments.map((attachment) => [attachment.id, digest(attachment.bytes)]),
    ),
  };
}

export function createEncryptedBackup(
  snapshot: PrivateDatabaseSnapshot,
  attachments: readonly BackupAttachment[],
  passphrase: string,
  createdAt = new Date().toISOString(),
): Uint8Array {
  const migrated = migratePrivateSnapshot(snapshot);
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new BackupError('INPUT_INVALID', 'backup creation timestamp is invalid');
  }
  if (attachments.length > MAXIMUM_ATTACHMENTS) {
    throw new BackupError('INPUT_INVALID', 'backup contains too many attachments');
  }
  const ids = new Set<string>();
  for (const attachment of attachments) {
    if (
      !validAttachmentName(attachment.fileName) ||
      attachment.bytes.byteLength > MAXIMUM_ATTACHMENT_BYTES
    ) {
      throw new BackupError('INPUT_INVALID', 'attachment name or size is unsafe');
    }
    if (attachment.id.length === 0 || ids.has(attachment.id)) {
      throw new BackupError('INPUT_INVALID', 'attachment identifiers must be unique');
    }
    ids.add(attachment.id);
  }

  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const header: BackupHeader = {
    magic: MAGIC,
    formatVersion: BACKUP_FORMAT_VERSION,
    cipher: 'AES-256-GCM',
    kdf: 'scrypt',
    kdfParameters: { N: 16_384, r: 8, p: 1 },
    salt: salt.toString('base64'),
    nonce: nonce.toString('base64'),
  };
  const payload: EncryptedPayload = {
    createdAt,
    manifest: createManifest(migrated, attachments),
    snapshot: migrated,
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      bytes: Buffer.from(attachment.bytes).toString('base64'),
    })),
  };
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(canonicalHeader(header)));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload))),
    cipher.final(),
  ]);
  const container: SerializedContainer = {
    header,
    ciphertext: ciphertext.toString('base64'),
    authenticationTag: cipher.getAuthTag().toString('base64'),
  };
  key.fill(0);
  return Buffer.from(JSON.stringify(container));
}

function parseContainer(container: Uint8Array): SerializedContainer {
  if (container.byteLength === 0 || container.byteLength > MAXIMUM_CONTAINER_BYTES) {
    throw new BackupError('INPUT_INVALID', 'backup container exceeds the configured size limit');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(container).toString('utf8'));
  } catch {
    throw new BackupError('INPUT_INVALID', 'backup container is truncated or malformed');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new BackupError('INPUT_INVALID', 'backup container root is invalid');
  }
  const candidate = parsed as Partial<SerializedContainer>;
  const header = candidate.header;
  if (
    header?.magic !== MAGIC ||
    header.formatVersion !== BACKUP_FORMAT_VERSION ||
    header.cipher !== 'AES-256-GCM' ||
    header.kdf !== 'scrypt' ||
    header.kdfParameters?.N !== 16_384 ||
    header.kdfParameters.r !== 8 ||
    header.kdfParameters.p !== 1
  ) {
    throw new BackupError('FORMAT_UNSUPPORTED', 'backup algorithms or version are unsupported');
  }
  if (typeof candidate.ciphertext !== 'string' || typeof candidate.authenticationTag !== 'string') {
    throw new BackupError('INPUT_INVALID', 'backup cryptographic fields are missing');
  }
  return candidate as SerializedContainer;
}

function decryptPayload(container: SerializedContainer, passphrase: string): EncryptedPayload {
  const salt = Buffer.from(container.header.salt, 'base64');
  const nonce = Buffer.from(container.header.nonce, 'base64');
  const tag = Buffer.from(container.authenticationTag, 'base64');
  if (salt.length !== 16 || nonce.length !== 12 || tag.length !== 16) {
    throw new BackupError('INPUT_INVALID', 'backup cryptographic field lengths are invalid');
  }
  const key = deriveKey(passphrase, salt);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(canonicalHeader(container.header)));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(container.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8')) as EncryptedPayload;
  } catch {
    throw new BackupError(
      'AUTHENTICATION_FAILED',
      'backup passphrase is wrong or the container was changed',
    );
  } finally {
    key.fill(0);
  }
}

function validatePayload(payload: EncryptedPayload): RestoredPrivateData {
  const { snapshot, manifest } = payload;
  if (
    snapshot.schemaVersion < PRIVATE_SCHEMA_PREVIOUS_VERSION ||
    snapshot.schemaVersion > PRIVATE_SCHEMA_VERSION
  ) {
    throw new BackupError('SCHEMA_INCOMPATIBLE', 'backup private schema is unsupported');
  }
  if (
    manifest.privateSchemaVersion !== snapshot.schemaVersion ||
    manifest.activityCount !== snapshot.activities.length ||
    manifest.userTrailCount !== snapshot.userTrails.length ||
    manifest.overlayCount !== snapshot.overlays.length ||
    manifest.attachmentCount !== payload.attachments.length
  ) {
    throw new BackupError('INTEGRITY_FAILED', 'backup manifest counts do not match its data');
  }
  if (payload.attachments.length > MAXIMUM_ATTACHMENTS) {
    throw new BackupError('INTEGRITY_FAILED', 'backup contains too many attachments');
  }
  const restoredIds = new Set<string>();
  for (const attachment of payload.attachments) {
    if (
      restoredIds.has(attachment.id) ||
      !validAttachmentName(attachment.fileName) ||
      Buffer.from(attachment.bytes, 'base64').byteLength > MAXIMUM_ATTACHMENT_BYTES
    ) {
      throw new BackupError('INTEGRITY_FAILED', 'backup attachment manifest is unsafe');
    }
    restoredIds.add(attachment.id);
  }
  const attachments = payload.attachments.map((attachment) => ({
    id: attachment.id,
    fileName: attachment.fileName,
    bytes: new Uint8Array(Buffer.from(attachment.bytes, 'base64')),
  }));
  for (const attachment of attachments) {
    const expected = manifest.attachmentHashes[attachment.id];
    const actual = digest(attachment.bytes);
    if (
      expected === undefined ||
      expected.length !== actual.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
    ) {
      throw new BackupError('INTEGRITY_FAILED', 'backup attachment hash is invalid');
    }
  }
  return {
    snapshot: migratePrivateSnapshot(snapshot),
    attachments,
    createdAt: payload.createdAt,
  };
}

export function stageEncryptedRestore(
  bytes: Uint8Array,
  passphrase: string,
  availableSpaceBytes = Number.MAX_SAFE_INTEGER,
): RestoredPrivateData {
  if (!Number.isSafeInteger(availableSpaceBytes) || availableSpaceBytes < 0) {
    throw new BackupError('INPUT_INVALID', 'available space is invalid');
  }
  const parsed = parseContainer(bytes);
  const payload = decryptPayload(parsed, passphrase);
  const staged = validatePayload(payload);
  const stagedPayloadBytes =
    Buffer.byteLength(JSON.stringify(staged.snapshot)) +
    staged.attachments.reduce((total, attachment) => total + attachment.bytes.byteLength, 0);
  const requiredBytes = bytes.byteLength + stagedPayloadBytes * 2 + RESTORE_RESERVE_BYTES;
  if (availableSpaceBytes < requiredBytes) {
    throw new BackupError('SPACE_INSUFFICIENT', 'restore staging space is insufficient');
  }
  return staged;
}

export function transactionalRestore(
  bytes: Uint8Array,
  passphrase: string,
  commit: (restored: RestoredPrivateData) => void,
  availableSpaceBytes = Number.MAX_SAFE_INTEGER,
): RestoredPrivateData {
  const staged = stageEncryptedRestore(bytes, passphrase, availableSpaceBytes);
  commit(staged);
  return staged;
}
export interface AtomicRestoreTarget<TStaged> {
  readonly stage: (restored: RestoredPrivateData) => TStaged;
  readonly commit: (staged: TStaged) => void;
  readonly rollback: (staged: TStaged) => void;
}

export function restoreToAtomicTarget<TStaged>(
  bytes: Uint8Array,
  passphrase: string,
  target: AtomicRestoreTarget<TStaged>,
  availableSpaceBytes = Number.MAX_SAFE_INTEGER,
): RestoredPrivateData {
  const restored = stageEncryptedRestore(bytes, passphrase, availableSpaceBytes);
  const staged = target.stage(restored);
  try {
    target.commit(staged);
  } catch (error) {
    target.rollback(staged);
    throw error;
  }
  return restored;
}

import { createHash, createPublicKey, verify } from 'node:crypto';

export const UNSIGNED_DEVELOPMENT_LABEL = 'UNSIGNED DEVELOPMENT CATALOG — NOT FOR PRODUCTION';

export type CatalogChannel = 'public' | 'local' | 'private';
export type TrustedKeyStatus = 'active' | 'revoked';

export interface CatalogSignatureEnvelope {
  readonly schemaVersion: number;
  readonly algorithm: string;
  readonly channel: CatalogChannel;
  readonly trustRoot: string;
  readonly keyId: string;
  readonly antiReplayVersion: number;
  readonly manifestSha256: string;
  readonly signedAt: string;
  readonly signature: string;
}

export interface TrustedCatalogKey {
  readonly keyId: string;
  readonly algorithm: 'Ed25519';
  readonly publicKeyPem: string;
  readonly status: TrustedKeyStatus;
}

export interface CatalogTrustPolicy {
  readonly channel: CatalogChannel;
  readonly trustRoot: string;
  readonly allowUnsignedDevelopment: boolean;
  readonly keys: readonly TrustedCatalogKey[];
}

export interface CatalogCandidate {
  readonly manifestBytes: Uint8Array;
  readonly envelope?: unknown;
  readonly developmentLabel?: string;
}

export type CatalogTrustErrorCode =
  | 'ALGORITHM_UNSUPPORTED'
  | 'CHANNEL_MISMATCH'
  | 'ENVELOPE_INVALID'
  | 'KEY_REVOKED'
  | 'KEY_UNTRUSTED'
  | 'MANIFEST_DIGEST_MISMATCH'
  | 'REPLAYED_VERSION'
  | 'SIGNATURE_INVALID'
  | 'SIGNATURE_MISSING'
  | 'TRUST_ROOT_MISMATCH'
  | 'UNSIGNED_DEVELOPMENT_LABEL_REQUIRED';

export class CatalogTrustError extends Error {
  constructor(
    readonly code: CatalogTrustErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CatalogTrustError';
  }
}

export type CatalogVerification =
  | {
      readonly mode: 'signed';
      readonly channel: CatalogChannel;
      readonly keyId: string;
      readonly antiReplayVersion: number;
      readonly manifestSha256: string;
    }
  | {
      readonly mode: 'unsigned-development';
      readonly channel: 'local';
      readonly label: typeof UNSIGNED_DEVELOPMENT_LABEL;
      readonly manifestSha256: string;
    };

function fail(code: CatalogTrustErrorCode, message: string): never {
  throw new CatalogTrustError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEnvelope(value: unknown): CatalogSignatureEnvelope {
  if (!isRecord(value)) fail('ENVELOPE_INVALID', 'catalog signature envelope must be an object');

  const channel = value.channel;
  if (channel !== 'public' && channel !== 'local' && channel !== 'private') {
    fail('ENVELOPE_INVALID', 'catalog signature channel is invalid');
  }

  if (
    value.schemaVersion !== 1 ||
    typeof value.algorithm !== 'string' ||
    typeof value.trustRoot !== 'string' ||
    value.trustRoot.length === 0 ||
    typeof value.keyId !== 'string' ||
    value.keyId.length === 0 ||
    !Number.isSafeInteger(value.antiReplayVersion) ||
    (value.antiReplayVersion as number) < 1 ||
    typeof value.manifestSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.manifestSha256) ||
    typeof value.signedAt !== 'string' ||
    Number.isNaN(Date.parse(value.signedAt)) ||
    typeof value.signature !== 'string' ||
    value.signature.length === 0
  ) {
    fail('ENVELOPE_INVALID', 'catalog signature envelope has invalid or missing fields');
  }

  return {
    schemaVersion: 1,
    algorithm: value.algorithm,
    channel,
    trustRoot: value.trustRoot,
    keyId: value.keyId,
    antiReplayVersion: value.antiReplayVersion as number,
    manifestSha256: value.manifestSha256,
    signedAt: value.signedAt,
    signature: value.signature,
  };
}

export function catalogManifestSha256(manifestBytes: Uint8Array): string {
  return createHash('sha256').update(manifestBytes).digest('hex');
}

export function catalogSignaturePayload(
  envelope: Omit<CatalogSignatureEnvelope, 'signature'>,
): Uint8Array {
  return Buffer.from(
    JSON.stringify([
      'open-outdoor-catalog-signature-v1',
      envelope.schemaVersion,
      envelope.algorithm,
      envelope.channel,
      envelope.trustRoot,
      envelope.keyId,
      envelope.antiReplayVersion,
      envelope.manifestSha256,
      envelope.signedAt,
    ]),
    'utf8',
  );
}

function decodeBase64(value: string): Buffer | undefined {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return undefined;
  }
  const decoded = Buffer.from(value, 'base64');
  return decoded.toString('base64') === value ? decoded : undefined;
}

export function verifyCatalogCandidate(
  candidate: CatalogCandidate,
  policy: CatalogTrustPolicy,
  lastAcceptedVersion: number,
): CatalogVerification {
  const manifestSha256 = catalogManifestSha256(candidate.manifestBytes);

  if (candidate.envelope === undefined) {
    if (policy.channel !== 'local' || !policy.allowUnsignedDevelopment) {
      fail('SIGNATURE_MISSING', 'production catalogs require a signature envelope');
    }
    if (candidate.developmentLabel !== UNSIGNED_DEVELOPMENT_LABEL) {
      fail(
        'UNSIGNED_DEVELOPMENT_LABEL_REQUIRED',
        `unsigned local catalogs must display “${UNSIGNED_DEVELOPMENT_LABEL}”`,
      );
    }
    return {
      mode: 'unsigned-development',
      channel: 'local',
      label: UNSIGNED_DEVELOPMENT_LABEL,
      manifestSha256,
    };
  }

  const envelope = parseEnvelope(candidate.envelope);
  if (envelope.algorithm !== 'Ed25519') {
    fail('ALGORITHM_UNSUPPORTED', `unsupported catalog signature algorithm: ${envelope.algorithm}`);
  }
  if (envelope.channel !== policy.channel) {
    fail('CHANNEL_MISMATCH', 'catalog signature is bound to a different release channel');
  }
  if (envelope.trustRoot !== policy.trustRoot) {
    fail('TRUST_ROOT_MISMATCH', 'catalog signature is bound to a different trust root');
  }
  if (envelope.manifestSha256 !== manifestSha256) {
    fail('MANIFEST_DIGEST_MISMATCH', 'catalog manifest digest does not match its signature envelope');
  }
  if (envelope.antiReplayVersion <= lastAcceptedVersion) {
    fail('REPLAYED_VERSION', 'catalog anti-replay version must increase monotonically');
  }

  const key = policy.keys.find((candidateKey) => candidateKey.keyId === envelope.keyId);
  if (key === undefined || key.algorithm !== envelope.algorithm) {
    fail('KEY_UNTRUSTED', 'catalog signing key is not trusted by this channel');
  }
  if (key.status === 'revoked') {
    fail('KEY_REVOKED', 'catalog signing key has been revoked');
  }

  const signature = decodeBase64(envelope.signature);
  if (signature === undefined) fail('SIGNATURE_INVALID', 'catalog signature encoding is invalid');

  let valid = false;
  try {
    valid = verify(
      null,
      catalogSignaturePayload(envelope),
      createPublicKey(key.publicKeyPem),
      signature,
    );
  } catch {
    fail('SIGNATURE_INVALID', 'catalog signing key or signature is invalid');
  }
  if (!valid) fail('SIGNATURE_INVALID', 'catalog signature verification failed');

  return {
    mode: 'signed',
    channel: envelope.channel,
    keyId: envelope.keyId,
    antiReplayVersion: envelope.antiReplayVersion,
    manifestSha256,
  };
}

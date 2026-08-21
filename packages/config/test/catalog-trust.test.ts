import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CatalogTrustError,
  UNSIGNED_DEVELOPMENT_LABEL,
  catalogManifestSha256,
  catalogSignaturePayload,
  verifyCatalogCandidate,
  type CatalogChannel,
  type CatalogSignatureEnvelope,
  type CatalogTrustErrorCode,
  type CatalogTrustPolicy,
} from '../src/index.js';

interface FixtureCases {
  readonly wrongChannel: {
    readonly channel: CatalogChannel;
    readonly trustRoot: string;
    readonly expectedError: CatalogTrustErrorCode;
  };
  readonly replay: {
    readonly antiReplayVersion: number;
    readonly lastAcceptedVersion: number;
    readonly expectedError: CatalogTrustErrorCode;
  };
}

const fixtureCases = JSON.parse(
  readFileSync(resolve('fixtures/public/catalog-signature-cases.json'), 'utf8'),
) as { readonly cases: FixtureCases };
const manifest = Buffer.from('{"schemaVersion":1,"classification":"public"}', 'utf8');
const primary = generateKeyPairSync('ed25519');
const rotated = generateKeyPairSync('ed25519');

function publicKeyPem(key: KeyObject): string {
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

function policy(
  keys: CatalogTrustPolicy['keys'] = [
    {
      keyId: 'public-test-primary',
      algorithm: 'Ed25519',
      publicKeyPem: publicKeyPem(primary.publicKey),
      status: 'active',
    },
  ],
): CatalogTrustPolicy {
  return {
    channel: 'public',
    trustRoot: 'public-v1',
    allowUnsignedDevelopment: false,
    keys,
  };
}

function signedEnvelope(
  privateKey: KeyObject,
  overrides: Partial<Omit<CatalogSignatureEnvelope, 'signature'>> = {},
): CatalogSignatureEnvelope {
  const fields = {
    schemaVersion: 1,
    algorithm: 'Ed25519',
    channel: 'public' as CatalogChannel,
    trustRoot: 'public-v1',
    keyId: 'public-test-primary',
    antiReplayVersion: 2,
    manifestSha256: catalogManifestSha256(manifest),
    signedAt: '2026-08-21T12:00:00.000Z',
    ...overrides,
  };
  return {
    ...fields,
    signature: sign(null, catalogSignaturePayload(fields), privateKey).toString('base64'),
  };
}

function expectTrustError(operation: () => unknown, code: CatalogTrustErrorCode): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(CatalogTrustError);
    expect((error as CatalogTrustError).code).toBe(code);
    return;
  }
  throw new Error(`expected catalog trust error ${code}`);
}

describe('T-REL-003 catalog trust and channel', () => {
  it('T-REL-003-C01 accepts a valid channel-bound signature from a trusted key', () => {
    expect(
      verifyCatalogCandidate({ manifestBytes: manifest, envelope: signedEnvelope(primary.privateKey) }, policy(), 1),
    ).toMatchObject({
      mode: 'signed',
      channel: 'public',
      keyId: 'public-test-primary',
      antiReplayVersion: 2,
    });
  });

  it('T-REL-003-C02 rejects a production catalog with no signature envelope', () => {
    expectTrustError(
      () => verifyCatalogCandidate({ manifestBytes: manifest }, policy(), 1),
      'SIGNATURE_MISSING',
    );
  });

  it('T-REL-003-C03 rejects altered content and an invalid signature', () => {
    const envelope = signedEnvelope(primary.privateKey);
    expectTrustError(
      () =>
        verifyCatalogCandidate(
          { manifestBytes: Buffer.from('altered'), envelope },
          policy(),
          1,
        ),
      'MANIFEST_DIGEST_MISMATCH',
    );
    expectTrustError(
      () =>
        verifyCatalogCandidate(
          { manifestBytes: manifest, envelope: { ...envelope, signature: 'AAAA' } },
          policy(),
          1,
        ),
      'SIGNATURE_INVALID',
    );
  });

  it('T-REL-003-C04 rejects the committed wrong-channel fixture', () => {
    const fixture = fixtureCases.cases.wrongChannel;
    const envelope = signedEnvelope(primary.privateKey, {
      channel: fixture.channel,
      trustRoot: fixture.trustRoot,
    });
    expectTrustError(
      () => verifyCatalogCandidate({ manifestBytes: manifest, envelope }, policy(), 1),
      fixture.expectedError,
    );
  });

  it('T-REL-003-C05 rejects the committed replay fixture', () => {
    const fixture = fixtureCases.cases.replay;
    const envelope = signedEnvelope(primary.privateKey, {
      antiReplayVersion: fixture.antiReplayVersion,
    });
    expectTrustError(
      () =>
        verifyCatalogCandidate(
          { manifestBytes: manifest, envelope },
          policy(),
          fixture.lastAcceptedVersion,
        ),
      fixture.expectedError,
    );
  });

  it('T-REL-003-C06 rejects untrusted and revoked signing keys', () => {
    const untrusted = signedEnvelope(primary.privateKey, { keyId: 'unknown-key' });
    expectTrustError(
      () => verifyCatalogCandidate({ manifestBytes: manifest, envelope: untrusted }, policy(), 1),
      'KEY_UNTRUSTED',
    );

    const revokedPolicy = policy([
      {
        keyId: 'public-test-primary',
        algorithm: 'Ed25519',
        publicKeyPem: publicKeyPem(primary.publicKey),
        status: 'revoked',
      },
    ]);
    expectTrustError(
      () =>
        verifyCatalogCandidate(
          { manifestBytes: manifest, envelope: signedEnvelope(primary.privateKey) },
          revokedPolicy,
          1,
        ),
      'KEY_REVOKED',
    );
  });

  it('T-REL-003-C07 accepts a rotated key and rejects the revoked predecessor', () => {
    const rotationPolicy = policy([
      {
        keyId: 'public-test-primary',
        algorithm: 'Ed25519',
        publicKeyPem: publicKeyPem(primary.publicKey),
        status: 'revoked',
      },
      {
        keyId: 'public-test-rotated',
        algorithm: 'Ed25519',
        publicKeyPem: publicKeyPem(rotated.publicKey),
        status: 'active',
      },
    ]);
    const rotatedEnvelope = signedEnvelope(rotated.privateKey, { keyId: 'public-test-rotated' });
    expect(
      verifyCatalogCandidate(
        { manifestBytes: manifest, envelope: rotatedEnvelope },
        rotationPolicy,
        1,
      ),
    ).toMatchObject({ mode: 'signed', keyId: 'public-test-rotated' });
    expectTrustError(
      () =>
        verifyCatalogCandidate(
          { manifestBytes: manifest, envelope: signedEnvelope(primary.privateKey) },
          rotationPolicy,
          1,
        ),
      'KEY_REVOKED',
    );
  });

  it('T-REL-003-C08 labels unsigned development and leaves production state unchanged', () => {
    const localPolicy: CatalogTrustPolicy = {
      channel: 'local',
      trustRoot: 'local-development',
      allowUnsignedDevelopment: true,
      keys: [],
    };
    expect(
      verifyCatalogCandidate(
        { manifestBytes: manifest, developmentLabel: UNSIGNED_DEVELOPMENT_LABEL },
        localPolicy,
        0,
      ),
    ).toMatchObject({ mode: 'unsigned-development', label: UNSIGNED_DEVELOPMENT_LABEL });
    expectTrustError(
      () => verifyCatalogCandidate({ manifestBytes: manifest }, localPolicy, 0),
      'UNSIGNED_DEVELOPMENT_LABEL_REQUIRED',
    );

    const activeProductionVersion = 7;
    expectTrustError(
      () =>
        verifyCatalogCandidate(
          { manifestBytes: manifest, developmentLabel: UNSIGNED_DEVELOPMENT_LABEL },
          policy(),
          activeProductionVersion,
        ),
      'SIGNATURE_MISSING',
    );
    expect(activeProductionVersion).toBe(7);
  });
});

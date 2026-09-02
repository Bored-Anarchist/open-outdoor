import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CatalogActivationCoordinator,
  InMemoryCatalogActivationRepository,
  StorageBoundaryError,
  type ActivationCheckpoint,
  type CatalogActivationCandidate,
  type CatalogActivationEnvironment,
  type CatalogTrustVerifier,
} from '../src/index.js';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const bytes = new TextEncoder().encode('verified catalog bytes');

function candidate(
  overrides: Partial<CatalogActivationCandidate> = {},
): CatalogActivationCandidate {
  return {
    catalogId: 'catalog-v2',
    catalogBytes: bytes,
    manifestBytes: new TextEncoder().encode('{"contentVersion":2}'),
    signatureEnvelope: { signature: 'fixture' },
    catalogChecksum: sha256(bytes),
    contentVersion: 2,
    channel: 'public',
    versions: { app: 2, catalog: 2 },
    incomingCombinedBytes: bytes.byteLength,
    remaps: [{ from: 'retired-trail', to: 'canonical-trail' }],
    promotionLinks: [{ privateId: 'private-user-trail', canonicalReferenceId: 'canonical-trail' }],
    ...overrides,
  };
}

const environment: CatalogActivationEnvironment = {
  supportedVersions: {
    app: { current: 2, previous: 1 },
    catalog: { current: 2, previous: 1 },
  },
  currentActiveCombinedBytes: bytes.byteLength,
  availableFreeBytes: 4 * 1024 ** 3,
  expectedChannel: 'public',
  firstLaunchSucceeds: true,
};

const trust: CatalogTrustVerifier = {
  verify: (value, lastAcceptedVersion) => {
    if (value.signatureEnvelope === null) throw new Error('signature missing');
    if (lastAcceptedVersion >= 2) throw new Error('replayed version');
    return { contentVersion: 2, channel: 'public' };
  },
};

function coordinator(repository: InMemoryCatalogActivationRepository, verifier = trust) {
  return new CatalogActivationCoordinator(repository, verifier, sha256, 5);
}

describe('WP-303 catalog staging, activation, and rollback', () => {
  const checkpoints: readonly ActivationCheckpoint[] = [
    'before-copy',
    'after-copy',
    'after-checksum',
    'after-compatibility',
    'after-remap-validation',
    'before-pointer-switch',
  ];

  it.each(checkpoints)(
    '%s retains the last known-good pointer and resumes staged bytes without private mutation',
    (checkpoint) => {
      const repository = new InMemoryCatalogActivationRepository('catalog-v1', 1, 'private-digest');
      const first = coordinator(repository).activate(candidate(), environment, checkpoint);
      expect(first).toMatchObject({
        status: 'interrupted',
        activeCatalogId: 'catalog-v1',
        checkpoint,
      });
      expect(repository.protectedPrivateDigest()).toBe('private-digest');
      const resumed = coordinator(repository).activate(candidate(), environment);
      expect(resumed).toMatchObject({
        status: 'activated',
        activeCatalogId: 'catalog-v2',
        checkpoint: 'after-first-launch',
        resumed: true,
      });
      expect(repository.lastAcceptedVersion()).toBe(2);
      expect(repository.protectedPrivateDigest()).toBe('private-digest');
    },
  );

  it('T-INT-002-C07 atomically rolls back an interrupted first launch and can retry safely', () => {
    const repository = new InMemoryCatalogActivationRepository('catalog-v1', 1, 'private-digest');
    expect(
      coordinator(repository).activate(candidate(), environment, 'after-pointer-switch'),
    ).toMatchObject({
      status: 'rolled-back',
      activeCatalogId: 'catalog-v1',
      checkpoint: 'after-pointer-switch',
    });
    expect(coordinator(repository).activate(candidate(), environment)).toMatchObject({
      status: 'activated',
      activeCatalogId: 'catalog-v2',
      resumed: true,
    });
  });

  it('T-INT-002-C08 verifies checksum, signature result, channel, replay state, and exact space before switch', () => {
    const cases: readonly {
      readonly candidate?: CatalogActivationCandidate;
      readonly environment?: CatalogActivationEnvironment;
      readonly verifier?: CatalogTrustVerifier;
      readonly expected: string;
    }[] = [
      {
        candidate: candidate({ catalogChecksum: '0'.repeat(64) }),
        expected: 'CHECKSUM_INVALID',
      },
      {
        candidate: candidate({ signatureEnvelope: null }),
        expected: 'signature missing',
      },
      {
        verifier: { verify: () => ({ contentVersion: 2, channel: 'private' }) },
        expected: 'TRUST_REJECTED',
      },
      {
        environment: { ...environment, availableFreeBytes: 1 },
        expected: 'FREE_SPACE_INSUFFICIENT',
      },
    ];
    for (const testCase of cases) {
      const repository = new InMemoryCatalogActivationRepository('catalog-v1', 1, 'private-digest');
      try {
        coordinator(repository, testCase.verifier).activate(
          testCase.candidate ?? candidate(),
          testCase.environment ?? environment,
        );
        throw new Error('expected activation to fail');
      } catch (error) {
        if (error instanceof StorageBoundaryError) expect(error.code).toBe(testCase.expected);
        else expect((error as Error).message).toContain(testCase.expected);
      }
      expect(repository.activeCatalogId()).toBe('catalog-v1');
      expect(repository.lastAcceptedVersion()).toBe(1);
      expect(repository.protectedPrivateDigest()).toBe('private-digest');
    }
  });

  it('detects protected private-data mutation during resumable staging', () => {
    const repository = new InMemoryCatalogActivationRepository('catalog-v1', 1, 'private-digest');
    coordinator(repository).activate(candidate(), environment, 'after-copy');
    repository.replaceProtectedPrivateDigestForTest('changed-private-digest');
    expect(() => coordinator(repository).activate(candidate(), environment)).toThrow(
      /private data changed/,
    );
    expect(repository.activeCatalogId()).toBe('catalog-v1');
  });

  it('binds resumable staging to the exact checksum, version, channel, and byte length', () => {
    const repository = new InMemoryCatalogActivationRepository('catalog-v1', 1, 'private-digest');
    coordinator(repository).activate(candidate(), environment, 'after-copy');
    expect(() =>
      coordinator(repository).activate(candidate({ catalogChecksum: '0'.repeat(64) }), environment),
    ).toThrow(/resume candidate/);
    expect(repository.activeCatalogId()).toBe('catalog-v1');
    expect(repository.lastAcceptedVersion()).toBe(1);
  });

  it('rolls the pointer back if a storage adapter crosses the private-data boundary during switch', () => {
    class MutatingRepository extends InMemoryCatalogActivationRepository {
      override atomicSwitch(expectedCurrentId: string, incomingId: string): void {
        super.atomicSwitch(expectedCurrentId, incomingId);
        this.replaceProtectedPrivateDigestForTest('mutated-during-switch');
      }
    }
    const repository = new MutatingRepository('catalog-v1', 1, 'private-digest');
    expect(() => coordinator(repository).activate(candidate(), environment)).toThrow(
      /attempted to change protected private data/,
    );
    expect(repository.activeCatalogId()).toBe('catalog-v1');
    expect(repository.lastAcceptedVersion()).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import {
  StorageBoundaryError,
  assertCatalogMutationDenied,
  capabilityForStore,
  generatePhase0Fixture,
  preflightVersionCompatibility,
  phase0FixtureCounts,
  phase0FixtureHashes,
  requiredCatalogFreeBytes,
  simulateCatalogActivation,
  storageLayout,
  type ActivationCheckpoint,
  type CatalogActivationPlan,
  type SupportedVersions,
} from '../src/index.js';

const GIB = 1024 ** 3;
const supported: SupportedVersions = {
  app: { current: 2, previous: 1 },
  catalog: { current: 2, previous: 1 },
};

function plan(overrides: Partial<CatalogActivationPlan> = {}): CatalogActivationPlan {
  return {
    incomingCatalogId: 'catalog-b',
    checksumValid: true,
    versions: { app: 2, catalog: 2 },
    supportedVersions: supported,
    currentActiveCombinedBytes: GIB,
    incomingCombinedBytes: GIB,
    availableFreeBytes: 5 * GIB,
    remapValid: true,
    firstLaunchSucceeds: true,
    ...overrides,
  };
}

const initial = {
  activeCatalogId: 'catalog-a',
  userRecordDigests: ['activity:abc', 'favorite:def', 'note:ghi'],
};

function expectStorageError(operation: () => unknown, code: StorageBoundaryError['code']): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(StorageBoundaryError);
    expect((error as StorageBoundaryError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

describe('T-INT-001 private and catalog storage separation', () => {
  it('T-INT-001-C01 assigns explicit protection and backup exclusion to every store', () => {
    expect(Object.values(storageLayout).every(({ backupExcluded }) => backupExcluded)).toBe(true);
    expect(storageLayout.user.fileProtection).toBe('complete');
    expect(storageLayout.activeSpool.fileProtection).toBe('completeUntilFirstUserAuthentication');
  });

  it('T-INT-001-C02 exposes no writable capability for catalog handles', () => {
    expect(capabilityForStore(storageLayout.publicCatalog)).toEqual({
      query: true,
      write: false,
      attachWritableDatabase: false,
    });
    expectStorageError(
      () => assertCatalogMutationDenied(storageLayout.publicCatalog),
      'CATALOG_WRITE_DENIED',
    );
  });
});

describe('T-INT-002 catalog lifecycle interruption matrix', () => {
  const checkpoints: readonly [string, ActivationCheckpoint][] = [
    ['T-INT-002-C01', 'before-copy'],
    ['T-INT-002-C02', 'after-copy'],
    ['T-INT-002-C03', 'after-checksum'],
    ['T-INT-002-C04', 'after-compatibility'],
    ['T-INT-002-C05', 'after-remap-validation'],
    ['T-INT-002-C06', 'before-pointer-switch'],
  ];

  it.each(checkpoints)(
    '%s retains the old catalog before pointer activation',
    (_caseId, checkpoint) => {
      expect(simulateCatalogActivation(initial, plan(), checkpoint)).toMatchObject({
        activeCatalogId: 'catalog-a',
        pointerSwitched: false,
        userRecordDigests: initial.userRecordDigests,
      });
    },
  );

  it('T-INT-002-C07 rolls back a switched pointer when first launch is interrupted', () => {
    expect(simulateCatalogActivation(initial, plan(), 'after-pointer-switch')).toMatchObject({
      activeCatalogId: 'catalog-a',
      pointerSwitched: true,
      rolledBack: true,
      userRecordDigests: initial.userRecordDigests,
    });
  });

  it('T-INT-002-C08 activates the validated catalog without changing private records', () => {
    expect(simulateCatalogActivation(initial, plan(), 'after-first-launch')).toMatchObject({
      activeCatalogId: 'catalog-b',
      rolledBack: false,
      userRecordDigests: initial.userRecordDigests,
    });
    expect(requiredCatalogFreeBytes(3 * GIB, 3 * GIB)).toBe(9 * GIB);
    expect(() => requiredCatalogFreeBytes(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
  });
});

describe('T-INT-006 current-plus-previous compatibility', () => {
  it('T-INT-006-C01 accepts current app and catalog versions', () => {
    expect(() => preflightVersionCompatibility({ app: 2, catalog: 2 }, supported)).not.toThrow();
  });

  it('T-INT-006-C02 accepts the previous compatible versions', () => {
    expect(() => preflightVersionCompatibility({ app: 1, catalog: 1 }, supported)).not.toThrow();
  });

  it.each([
    ['T-INT-006-C03', { app: 0, catalog: 2 }],
    ['T-INT-006-C04', { app: 2, catalog: 0 }],
  ])('%s rejects an unsupported version before mutation', (_caseId, versions) => {
    expectStorageError(
      () => preflightVersionCompatibility(versions, supported),
      'COMPATIBILITY_REJECTED',
    );
  });

  it('T-INT-006-C06 rejects malformed support state before mutation', () => {
    expectStorageError(
      () =>
        preflightVersionCompatibility(
          { app: 2, catalog: 2 },
          { ...supported, app: { current: 2, previous: 2 } },
        ),
      'VERSION_STATE_INVALID',
    );
  });
});
describe('Phase 0 deterministic A-to-B fixture', () => {
  it('T-INT-002-C09 generates stable synthetic A and B records', () => {
    const versionA = generatePhase0Fixture('A');
    const versionB = generatePhase0Fixture('B');
    expect(generatePhase0Fixture('A')).toEqual(versionA);
    expect(phase0FixtureCounts(versionA)).toEqual({
      activities: 1,
      userTrails: 1,
      associations: 1,
      overlays: 1,
      notes: 1,
      favorites: 1,
      promotions: 0,
      attachments: 1,
    });
    expect(phase0FixtureCounts(versionB).associations).toBe(2);
    expect(phase0FixtureCounts(versionB).promotions).toBe(1);
  });

  it('T-INT-002-C10 preserves private record hashes while remapping catalog links', () => {
    const versionA = phase0FixtureHashes(generatePhase0Fixture('A'));
    const versionB = phase0FixtureHashes(generatePhase0Fixture('B'));
    for (const key of ['activities', 'userTrails', 'notes', 'favorites', 'attachments']) {
      expect(versionB[key]).toBe(versionA[key]);
    }
    expect(versionB.associations).not.toBe(versionA.associations);
    expect(versionB.overlays).not.toBe(versionA.overlays);
  });
});

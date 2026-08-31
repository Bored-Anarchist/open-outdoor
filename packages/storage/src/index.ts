export type StoreKind = 'writable-user' | 'readonly-catalog';
export type IosFileProtection = 'complete' | 'completeUntilFirstUserAuthentication';

export interface StoreDescriptor {
  readonly id: string;
  readonly kind: StoreKind;
  readonly schemaVersion: number;
  readonly relativePath: string;
  readonly fileProtection: IosFileProtection;
  readonly backupExcluded: true;
}

export const storageLayout = {
  activeSpool: {
    id: 'active-spool',
    kind: 'writable-user',
    schemaVersion: 1,
    relativePath: 'Library/Application Support/Tracking/Active',
    fileProtection: 'completeUntilFirstUserAuthentication',
    backupExcluded: true,
  },
  user: {
    id: 'user-data',
    kind: 'writable-user',
    schemaVersion: 1,
    relativePath: 'Library/Application Support/UserData/user.sqlite',
    fileProtection: 'complete',
    backupExcluded: true,
  },
  publicCatalog: {
    id: 'public-catalog',
    kind: 'readonly-catalog',
    schemaVersion: 1,
    relativePath: 'Library/Application Support/Catalogs/Public/catalog.sqlite',
    fileProtection: 'completeUntilFirstUserAuthentication',
    backupExcluded: true,
  },
  privateCatalog: {
    id: 'private-catalog',
    kind: 'readonly-catalog',
    schemaVersion: 1,
    relativePath: 'Library/Application Support/Catalogs/Private/catalog.sqlite',
    fileProtection: 'completeUntilFirstUserAuthentication',
    backupExcluded: true,
  },
} as const satisfies Record<string, StoreDescriptor>;

export interface StoreCapability {
  readonly query: true;
  readonly write: boolean;
  readonly attachWritableDatabase: false;
}

export function capabilityForStore(descriptor: StoreDescriptor): StoreCapability {
  return {
    query: true,
    write: descriptor.kind === 'writable-user',
    attachWritableDatabase: false,
  };
}

export class StorageBoundaryError extends Error {
  constructor(
    readonly code:
      | 'CATALOG_WRITE_DENIED'
      | 'CHECKSUM_INVALID'
      | 'COMPATIBILITY_REJECTED'
      | 'FREE_SPACE_INSUFFICIENT'
      | 'VERSION_STATE_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'StorageBoundaryError';
  }
}

export function assertCatalogMutationDenied(descriptor: StoreDescriptor): void {
  if (descriptor.kind === 'readonly-catalog') {
    throw new StorageBoundaryError('CATALOG_WRITE_DENIED', 'catalog handles are query-only');
  }
}

export interface SupportedVersions {
  readonly app: { readonly current: number; readonly previous: number };
  readonly catalog: { readonly current: number; readonly previous: number };
}

export interface VersionCandidate {
  readonly app: number;
  readonly catalog: number;
}

function acceptsVersion(
  version: number,
  range: { readonly current: number; readonly previous: number },
): boolean {
  return Number.isSafeInteger(version) && (version === range.current || version === range.previous);
}

export function preflightVersionCompatibility(
  candidate: VersionCandidate,
  supported: SupportedVersions,
): void {
  const ranges = [supported.app, supported.catalog];
  if (
    ranges.some(
      ({ current, previous }) =>
        !Number.isSafeInteger(current) ||
        !Number.isSafeInteger(previous) ||
        current < 1 ||
        previous < 1 ||
        previous >= current,
    )
  ) {
    throw new StorageBoundaryError('VERSION_STATE_INVALID', 'supported version state is invalid');
  }
  if (
    !acceptsVersion(candidate.app, supported.app) ||
    !acceptsVersion(candidate.catalog, supported.catalog)
  ) {
    throw new StorageBoundaryError(
      'COMPATIBILITY_REJECTED',
      'app or catalog version is outside the current-plus-previous window',
    );
  }
}

const GIB = 1024 ** 3;

export function requiredCatalogFreeBytes(
  currentActiveCombinedBytes: number,
  incomingCombinedBytes: number,
): number {
  if (
    !Number.isSafeInteger(currentActiveCombinedBytes) ||
    !Number.isSafeInteger(incomingCombinedBytes) ||
    currentActiveCombinedBytes < 0 ||
    incomingCombinedBytes < 0
  ) {
    throw new RangeError('catalog byte counts must be non-negative safe integers');
  }
  const required =
    currentActiveCombinedBytes +
    incomingCombinedBytes +
    Math.max(GIB, Math.ceil(incomingCombinedBytes * 0.25)) +
    2 * GIB;
  if (!Number.isSafeInteger(required)) {
    throw new RangeError('catalog free-space result exceeds the safe integer range');
  }
  return required;
}

export type ActivationCheckpoint =
  | 'before-copy'
  | 'after-copy'
  | 'after-checksum'
  | 'after-compatibility'
  | 'after-remap-validation'
  | 'before-pointer-switch'
  | 'after-pointer-switch'
  | 'after-first-launch';

export interface CatalogActivationState {
  readonly activeCatalogId: string;
  readonly userRecordDigests: readonly string[];
}

export interface CatalogActivationPlan {
  readonly incomingCatalogId: string;
  readonly checksumValid: boolean;
  readonly versions: VersionCandidate;
  readonly supportedVersions: SupportedVersions;
  readonly currentActiveCombinedBytes: number;
  readonly incomingCombinedBytes: number;
  readonly availableFreeBytes: number;
  readonly remapValid: boolean;
  readonly firstLaunchSucceeds: boolean;
}

export interface CatalogActivationResult extends CatalogActivationState {
  readonly interruptedAt: ActivationCheckpoint | undefined;
  readonly rolledBack: boolean;
  readonly pointerSwitched: boolean;
}

const beforePointer = new Set<ActivationCheckpoint>([
  'before-copy',
  'after-copy',
  'after-checksum',
  'after-compatibility',
  'after-remap-validation',
  'before-pointer-switch',
]);

export function simulateCatalogActivation(
  state: CatalogActivationState,
  plan: CatalogActivationPlan,
  interruptAt?: ActivationCheckpoint,
): CatalogActivationResult {
  if (!plan.checksumValid) {
    throw new StorageBoundaryError('CHECKSUM_INVALID', 'incoming catalog checksum is invalid');
  }
  preflightVersionCompatibility(plan.versions, plan.supportedVersions);
  if (
    plan.availableFreeBytes <
    requiredCatalogFreeBytes(plan.currentActiveCombinedBytes, plan.incomingCombinedBytes)
  ) {
    throw new StorageBoundaryError(
      'FREE_SPACE_INSUFFICIENT',
      'catalog activation free-space preflight failed',
    );
  }
  if (!plan.remapValid) {
    throw new StorageBoundaryError('COMPATIBILITY_REJECTED', 'catalog remap validation failed');
  }

  if (interruptAt !== undefined && beforePointer.has(interruptAt)) {
    return { ...state, interruptedAt: interruptAt, rolledBack: false, pointerSwitched: false };
  }
  if (interruptAt === 'after-pointer-switch' || !plan.firstLaunchSucceeds) {
    return { ...state, interruptedAt: interruptAt, rolledBack: true, pointerSwitched: true };
  }
  return {
    activeCatalogId: plan.incomingCatalogId,
    userRecordDigests: state.userRecordDigests,
    interruptedAt: interruptAt,
    rolledBack: false,
    pointerSwitched: true,
  };
}

export interface Phase0ActivityFixture {
  readonly id: string;
  readonly name: string;
}

export interface Phase0AssociationFixture {
  readonly id: string;
  readonly trailId: string;
  readonly referenceId: string | null;
  readonly state: 'resolved' | 'review';
}

export interface Phase0Fixture {
  readonly stage: 'A' | 'B';
  readonly activities: readonly Phase0ActivityFixture[];
  readonly userTrails: readonly Phase0ActivityFixture[];
  readonly associations: readonly Phase0AssociationFixture[];
  readonly overlays: readonly {
    readonly id: string;
    readonly trailId: string;
    readonly catalogFeatureId: string;
  }[];
  readonly notes: readonly { readonly id: string; readonly body: string }[];
  readonly favorites: readonly { readonly id: string; readonly targetId: string }[];
  readonly promotions: readonly {
    readonly id: string;
    readonly privateTrailId: string;
    readonly canonicalReferenceId: string;
  }[];
  readonly attachments: readonly {
    readonly id: string;
    readonly ownerId: string;
    readonly fileName: string;
    readonly synthetic: true;
  }[];
}

export function generatePhase0Fixture(stage: 'A' | 'B'): Phase0Fixture {
  const catalogFeatureId = stage === 'A' ? 'catalog-a-feature' : 'catalog-b-feature';
  return {
    stage,
    activities: [{ id: 'activity-a', name: 'Synthetic activity' }],
    userTrails: [{ id: 'user-trail-a', name: 'Synthetic user trail' }],
    associations: [
      {
        id: 'association-a',
        trailId: 'user-trail-a',
        referenceId: catalogFeatureId,
        state: 'resolved',
      },
      ...(stage === 'B'
        ? [
            {
              id: 'association-unresolved',
              trailId: 'user-trail-a',
              referenceId: null,
              state: 'review' as const,
            },
          ]
        : []),
    ],
    overlays: [{ id: 'overlay-a', trailId: 'user-trail-a', catalogFeatureId }],
    notes: [{ id: 'note-a', body: 'Synthetic note' }],
    favorites: [{ id: 'favorite-a', targetId: 'user-trail-a' }],
    promotions:
      stage === 'B'
        ? [
            {
              id: 'promotion-a',
              privateTrailId: 'user-trail-a',
              canonicalReferenceId: 'catalog-b-feature',
            },
          ]
        : [],
    attachments: [
      {
        id: 'attachment-a',
        ownerId: 'activity-a',
        fileName: 'phase0-synthetic.txt',
        synthetic: true,
      },
    ],
  };
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

export function phase0FixtureCounts(fixture: Phase0Fixture): Readonly<Record<string, number>> {
  return {
    activities: fixture.activities.length,
    userTrails: fixture.userTrails.length,
    associations: fixture.associations.length,
    overlays: fixture.overlays.length,
    notes: fixture.notes.length,
    favorites: fixture.favorites.length,
    promotions: fixture.promotions.length,
    attachments: fixture.attachments.length,
  };
}

export function phase0FixtureHashes(fixture: Phase0Fixture): Readonly<Record<string, string>> {
  return {
    activities: fnv1a64(JSON.stringify(fixture.activities)),
    userTrails: fnv1a64(JSON.stringify(fixture.userTrails)),
    associations: fnv1a64(JSON.stringify(fixture.associations)),
    overlays: fnv1a64(JSON.stringify(fixture.overlays)),
    notes: fnv1a64(JSON.stringify(fixture.notes)),
    favorites: fnv1a64(JSON.stringify(fixture.favorites)),
    promotions: fnv1a64(JSON.stringify(fixture.promotions)),
    attachments: fnv1a64(JSON.stringify(fixture.attachments)),
  };
}
export * from './private';

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
  readonly backup: { readonly current: number; readonly previous: number };
}

export interface VersionCandidate {
  readonly app: number;
  readonly catalog: number;
  readonly backup: number;
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
  const ranges = [supported.app, supported.catalog, supported.backup];
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
    !acceptsVersion(candidate.catalog, supported.catalog) ||
    !acceptsVersion(candidate.backup, supported.backup)
  ) {
    throw new StorageBoundaryError(
      'COMPATIBILITY_REJECTED',
      'app, catalog, or backup version is outside the current-plus-previous window',
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

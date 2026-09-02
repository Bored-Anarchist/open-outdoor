import {
  StorageBoundaryError,
  preflightVersionCompatibility,
  requiredCatalogFreeBytes,
  type ActivationCheckpoint,
  type SupportedVersions,
  type VersionCandidate,
} from './index.js';

export interface CatalogActivationCandidate {
  readonly catalogId: string;
  readonly catalogBytes: Uint8Array;
  readonly manifestBytes: Uint8Array;
  readonly signatureEnvelope: unknown;
  readonly catalogChecksum: string;
  readonly contentVersion: number;
  readonly channel: 'public' | 'private' | 'local';
  readonly versions: VersionCandidate;
  readonly incomingCombinedBytes: number;
  readonly remaps: readonly { readonly from: string; readonly to: string }[];
  readonly promotionLinks: readonly {
    readonly privateId: string;
    readonly canonicalReferenceId: string;
  }[];
}

export interface CatalogTrustVerifier {
  readonly verify: (
    candidate: Pick<CatalogActivationCandidate, 'manifestBytes' | 'signatureEnvelope'>,
    lastAcceptedVersion: number,
  ) => { readonly contentVersion: number; readonly channel: 'public' | 'private' | 'local' };
}

export interface CatalogActivationEnvironment {
  readonly supportedVersions: SupportedVersions;
  readonly currentActiveCombinedBytes: number;
  readonly availableFreeBytes: number;
  readonly expectedChannel: CatalogActivationCandidate['channel'];
  readonly firstLaunchSucceeds: boolean;
}

export type CatalogStagingPhase =
  | 'copying'
  | 'copied'
  | 'checksum-verified'
  | 'compatible'
  | 'remaps-validated'
  | 'switched'
  | 'rolled-back';

export interface CatalogStagingState {
  readonly catalogId: string;
  readonly catalogChecksum: string;
  readonly contentVersion: number;
  readonly channel: CatalogActivationCandidate['channel'];
  readonly totalBytes: number;
  readonly previousCatalogId: string;
  readonly copiedBytes: number;
  readonly phase: CatalogStagingPhase;
  readonly protectedPrivateDigest: string;
}

export interface CatalogActivationRepository {
  readonly activeCatalogId: () => string;
  readonly lastAcceptedVersion: () => number;
  readonly protectedPrivateDigest: () => string;
  readonly readStaging: () => CatalogStagingState | null;
  readonly beginStaging: (state: CatalogStagingState) => void;
  readonly appendStaging: (catalogId: string, offset: number, bytes: Uint8Array) => void;
  readonly stagedBytes: (catalogId: string) => Uint8Array;
  readonly updateStaging: (state: CatalogStagingState) => void;
  readonly validateRemaps: (
    remaps: CatalogActivationCandidate['remaps'],
    promotionLinks: CatalogActivationCandidate['promotionLinks'],
  ) => void;
  readonly atomicSwitch: (expectedCurrentId: string, incomingId: string) => void;
  readonly rollbackSwitch: (expectedIncomingId: string, previousId: string) => void;
  readonly acceptVersion: (version: number) => void;
  readonly clearStaging: () => void;
}

export interface CatalogActivationOutcome {
  readonly status: 'interrupted' | 'activated' | 'rolled-back';
  readonly activeCatalogId: string;
  readonly checkpoint: ActivationCheckpoint;
  readonly copiedBytes: number;
  readonly resumed: boolean;
}

const SHA256 = /^[0-9a-f]{64}$/;

function checkpointOrder(checkpoint: ActivationCheckpoint): number {
  return [
    'before-copy',
    'after-copy',
    'after-checksum',
    'after-compatibility',
    'after-remap-validation',
    'before-pointer-switch',
    'after-pointer-switch',
    'after-first-launch',
  ].indexOf(checkpoint);
}

function reached(phase: CatalogStagingPhase, checkpoint: ActivationCheckpoint): boolean {
  const phases: Readonly<Record<CatalogStagingPhase, number>> = {
    copying: 0,
    copied: 1,
    'checksum-verified': 2,
    compatible: 3,
    'remaps-validated': 4,
    switched: 6,
    'rolled-back': 4,
  };
  return phases[phase] >= checkpointOrder(checkpoint);
}

export class CatalogActivationCoordinator {
  constructor(
    private readonly repository: CatalogActivationRepository,
    private readonly trust: CatalogTrustVerifier,
    private readonly sha256: (bytes: Uint8Array) => string,
    private readonly copyChunkBytes = 1024 * 1024,
  ) {
    if (!Number.isSafeInteger(copyChunkBytes) || copyChunkBytes < 1) {
      throw new RangeError('catalog copy chunk size must be a positive safe integer');
    }
  }

  activate(
    candidate: CatalogActivationCandidate,
    environment: CatalogActivationEnvironment,
    interruptAt?: ActivationCheckpoint,
  ): CatalogActivationOutcome {
    if (
      candidate.catalogId.trim() === '' ||
      candidate.catalogBytes.byteLength === 0 ||
      !SHA256.test(candidate.catalogChecksum) ||
      !Number.isSafeInteger(candidate.contentVersion) ||
      candidate.contentVersion < 1 ||
      candidate.incomingCombinedBytes !== candidate.catalogBytes.byteLength
    ) {
      throw new StorageBoundaryError('ACTIVATION_STATE_INVALID', 'catalog candidate is malformed');
    }
    preflightVersionCompatibility(candidate.versions, environment.supportedVersions);
    if (
      environment.availableFreeBytes <
      requiredCatalogFreeBytes(
        environment.currentActiveCombinedBytes,
        candidate.incomingCombinedBytes,
      )
    ) {
      throw new StorageBoundaryError(
        'FREE_SPACE_INSUFFICIENT',
        'catalog activation free-space preflight failed',
      );
    }

    const originalDigest = this.repository.protectedPrivateDigest();
    let staging = this.repository.readStaging();
    const resumed = staging !== null;
    if (
      staging !== null &&
      (staging.catalogId !== candidate.catalogId ||
        staging.catalogChecksum !== candidate.catalogChecksum ||
        staging.contentVersion !== candidate.contentVersion ||
        staging.channel !== candidate.channel ||
        staging.totalBytes !== candidate.catalogBytes.byteLength)
    ) {
      throw new StorageBoundaryError(
        'ACTIVATION_STATE_INVALID',
        'the staged catalog identity does not match the resume candidate',
      );
    }
    if (staging === null) {
      staging = {
        catalogId: candidate.catalogId,
        catalogChecksum: candidate.catalogChecksum,
        contentVersion: candidate.contentVersion,
        channel: candidate.channel,
        totalBytes: candidate.catalogBytes.byteLength,
        previousCatalogId: this.repository.activeCatalogId(),
        copiedBytes: 0,
        phase: 'copying',
        protectedPrivateDigest: originalDigest,
      };
      this.repository.beginStaging(staging);
    } else if (staging.protectedPrivateDigest !== originalDigest) {
      throw new StorageBoundaryError(
        'PRIVATE_DATA_CHANGED',
        'protected private data changed while a catalog was staged',
      );
    }

    if (interruptAt === 'before-copy' && staging.copiedBytes === 0) {
      return this.outcome('interrupted', 'before-copy', staging, resumed);
    }
    if (!reached(staging.phase, 'after-copy')) {
      while (staging.copiedBytes < candidate.catalogBytes.byteLength) {
        const end = Math.min(
          staging.copiedBytes + this.copyChunkBytes,
          candidate.catalogBytes.byteLength,
        );
        this.repository.appendStaging(
          candidate.catalogId,
          staging.copiedBytes,
          candidate.catalogBytes.slice(staging.copiedBytes, end),
        );
        staging = { ...staging, copiedBytes: end, phase: 'copying' };
        this.repository.updateStaging(staging);
      }
      staging = { ...staging, phase: 'copied' };
      this.repository.updateStaging(staging);
    }
    if (interruptAt === 'after-copy') {
      return this.outcome('interrupted', 'after-copy', staging, resumed);
    }

    const stagedChecksum = this.sha256(this.repository.stagedBytes(candidate.catalogId));
    if (stagedChecksum !== candidate.catalogChecksum) {
      throw new StorageBoundaryError('CHECKSUM_INVALID', 'staged catalog checksum is invalid');
    }
    if (!reached(staging.phase, 'after-checksum')) {
      staging = { ...staging, phase: 'checksum-verified' };
      this.repository.updateStaging(staging);
    }
    if (interruptAt === 'after-checksum') {
      return this.outcome('interrupted', 'after-checksum', staging, resumed);
    }

    const trust = this.trust.verify(candidate, this.repository.lastAcceptedVersion());
    if (
      trust.contentVersion !== candidate.contentVersion ||
      trust.channel !== candidate.channel ||
      trust.channel !== environment.expectedChannel
    ) {
      throw new StorageBoundaryError(
        'TRUST_REJECTED',
        'catalog trust result does not match its version or activation channel',
      );
    }
    if (!reached(staging.phase, 'after-compatibility')) {
      staging = { ...staging, phase: 'compatible' };
      this.repository.updateStaging(staging);
    }
    if (interruptAt === 'after-compatibility') {
      return this.outcome('interrupted', 'after-compatibility', staging, resumed);
    }

    this.repository.validateRemaps(candidate.remaps, candidate.promotionLinks);
    this.assertPrivateUnchanged(staging.protectedPrivateDigest);
    if (!reached(staging.phase, 'after-remap-validation')) {
      staging = { ...staging, phase: 'remaps-validated' };
      this.repository.updateStaging(staging);
    }
    if (interruptAt === 'after-remap-validation') {
      return this.outcome('interrupted', 'after-remap-validation', staging, resumed);
    }
    if (interruptAt === 'before-pointer-switch') {
      return this.outcome('interrupted', 'before-pointer-switch', staging, resumed);
    }

    if (!reached(staging.phase, 'after-pointer-switch')) {
      this.repository.atomicSwitch(staging.previousCatalogId, candidate.catalogId);
      staging = { ...staging, phase: 'switched' };
      this.repository.updateStaging(staging);
      try {
        this.assertPrivateUnchanged(staging.protectedPrivateDigest);
      } catch (error) {
        this.repository.rollbackSwitch(candidate.catalogId, staging.previousCatalogId);
        staging = { ...staging, phase: 'rolled-back' };
        this.repository.updateStaging(staging);
        throw error;
      }
    }
    if (interruptAt === 'after-pointer-switch' || !environment.firstLaunchSucceeds) {
      this.repository.rollbackSwitch(candidate.catalogId, staging.previousCatalogId);
      staging = { ...staging, phase: 'rolled-back' };
      this.repository.updateStaging(staging);
      this.assertPrivateUnchanged(staging.protectedPrivateDigest);
      return this.outcome('rolled-back', 'after-pointer-switch', staging, resumed);
    }

    this.assertPrivateUnchanged(staging.protectedPrivateDigest);
    this.repository.acceptVersion(candidate.contentVersion);
    const outcome = this.outcome('activated', 'after-first-launch', staging, resumed);
    this.repository.clearStaging();
    return outcome;
  }

  private assertPrivateUnchanged(expected: string): void {
    if (this.repository.protectedPrivateDigest() !== expected) {
      throw new StorageBoundaryError(
        'PRIVATE_DATA_CHANGED',
        'catalog activation attempted to change protected private data',
      );
    }
  }

  private outcome(
    status: CatalogActivationOutcome['status'],
    checkpoint: ActivationCheckpoint,
    staging: CatalogStagingState,
    resumed: boolean,
  ): CatalogActivationOutcome {
    return {
      status,
      activeCatalogId: this.repository.activeCatalogId(),
      checkpoint,
      copiedBytes: staging.copiedBytes,
      resumed,
    };
  }
}

export class InMemoryCatalogActivationRepository implements CatalogActivationRepository {
  private active: string;
  private acceptedVersion: number;
  private staging: CatalogStagingState | null = null;
  private staged = new Uint8Array();

  constructor(
    activeCatalogId: string,
    lastAcceptedVersion: number,
    private protectedDigest: string,
  ) {
    this.active = activeCatalogId;
    this.acceptedVersion = lastAcceptedVersion;
  }

  activeCatalogId(): string {
    return this.active;
  }

  lastAcceptedVersion(): number {
    return this.acceptedVersion;
  }

  protectedPrivateDigest(): string {
    return this.protectedDigest;
  }

  readStaging(): CatalogStagingState | null {
    return this.staging === null ? null : { ...this.staging };
  }

  beginStaging(state: CatalogStagingState): void {
    if (this.staging !== null) throw new Error('staging already exists');
    this.staging = { ...state };
    this.staged = new Uint8Array();
  }

  appendStaging(catalogId: string, offset: number, bytes: Uint8Array): void {
    if (this.staging?.catalogId !== catalogId || this.staged.byteLength !== offset) {
      throw new Error('staging append is not resumable at the requested offset');
    }
    const next = new Uint8Array(offset + bytes.byteLength);
    next.set(this.staged);
    next.set(bytes, offset);
    this.staged = next;
  }

  stagedBytes(catalogId: string): Uint8Array {
    if (this.staging?.catalogId !== catalogId) throw new Error('staged catalog is unavailable');
    return this.staged.slice();
  }

  updateStaging(state: CatalogStagingState): void {
    if (this.staging?.catalogId !== state.catalogId) throw new Error('staging state mismatch');
    this.staging = { ...state };
  }

  validateRemaps(
    remaps: CatalogActivationCandidate['remaps'],
    promotionLinks: CatalogActivationCandidate['promotionLinks'],
  ): void {
    const remapSources = new Set<string>();
    for (const remap of remaps) {
      if (
        remap.from.trim() === '' ||
        remap.to.trim() === '' ||
        remap.from === remap.to ||
        remapSources.has(remap.from)
      ) {
        throw new StorageBoundaryError('COMPATIBILITY_REJECTED', 'catalog remap is invalid');
      }
      remapSources.add(remap.from);
    }
    const privateIds = new Set<string>();
    for (const link of promotionLinks) {
      if (
        link.privateId.trim() === '' ||
        link.canonicalReferenceId.trim() === '' ||
        privateIds.has(link.privateId)
      ) {
        throw new StorageBoundaryError(
          'COMPATIBILITY_REJECTED',
          'catalog promotion link is invalid',
        );
      }
      privateIds.add(link.privateId);
    }
  }

  atomicSwitch(expectedCurrentId: string, incomingId: string): void {
    if (this.active !== expectedCurrentId || this.staging?.catalogId !== incomingId) {
      throw new StorageBoundaryError(
        'ACTIVATION_STATE_INVALID',
        'catalog pointer compare-and-swap failed',
      );
    }
    this.active = incomingId;
  }

  rollbackSwitch(expectedIncomingId: string, previousId: string): void {
    if (this.active !== expectedIncomingId) {
      throw new StorageBoundaryError(
        'ACTIVATION_STATE_INVALID',
        'catalog rollback pointer mismatch',
      );
    }
    this.active = previousId;
  }

  acceptVersion(version: number): void {
    this.acceptedVersion = version;
  }

  clearStaging(): void {
    this.staging = null;
    this.staged = new Uint8Array();
  }

  replaceProtectedPrivateDigestForTest(value: string): void {
    this.protectedDigest = value;
  }
}

/**
 * Pure domain types for importing an offline basemap. Filesystem access,
 * cryptographic signature verification, and PMTiles header inspection remain
 * responsibilities of the native adapter.
 */

export const BASEMAP_PACK_SCHEMA_VERSION = 1 as const;
export const SUPPORTED_PMTILES_SPEC_VERSION = 3 as const;

export type BasemapBounds = readonly [west: number, south: number, east: number, north: number];

export interface PinnedBasemapManifest {
  readonly schemaVersion: typeof BASEMAP_PACK_SCHEMA_VERSION;
  readonly kind: 'basemap';
  readonly packId: string;
  readonly version: string;
  readonly displayName: string;
  readonly fileName: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly format: Readonly<{
    type: 'pmtiles';
    specVersion: typeof SUPPORTED_PMTILES_SPEC_VERSION;
    minZoom: number;
    maxZoom: number;
  }>;
  readonly coverage: Readonly<{ bounds: BasemapBounds }>;
  readonly compatibility: Readonly<{
    minimumAppVersion: string;
    styleSchemaVersion: number;
  }>;
  readonly attribution: readonly string[];
}

export interface BasemapFileIdentity {
  readonly byteLength: number;
  readonly sha256: string;
}

export class BasemapManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BasemapManifestValidationError';
  }
}

const rootKeys = [
  'schemaVersion',
  'kind',
  'packId',
  'version',
  'displayName',
  'fileName',
  'byteLength',
  'sha256',
  'format',
  'coverage',
  'compatibility',
  'attribution',
] as const;

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BasemapManifestValidationError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new BasemapManifestValidationError(`${path} must contain exactly: ${wanted.join(', ')}`);
  }
}

function string(value: unknown, path: string, maximumLength = 256): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.trim() !== value
  ) {
    throw new BasemapManifestValidationError(`${path} must be a non-empty, trimmed string`);
  }
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new BasemapManifestValidationError(
      `${path} must be a safe integer greater than or equal to ${minimum}`,
    );
  }
  return value as number;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BasemapManifestValidationError(`${path} must be a finite number`);
  }
  return value;
}

/**
 * Decode an allow-listed basemap manifest. Unknown fields are rejected so a
 * signed manifest can never silently acquire semantics an older app ignores.
 */
export function parsePinnedBasemapManifest(value: unknown): PinnedBasemapManifest {
  const manifest = record(value, 'manifest');
  exactKeys(manifest, rootKeys, 'manifest');

  if (manifest.schemaVersion !== BASEMAP_PACK_SCHEMA_VERSION) {
    throw new BasemapManifestValidationError(
      `manifest.schemaVersion must be ${BASEMAP_PACK_SCHEMA_VERSION}`,
    );
  }
  if (manifest.kind !== 'basemap') {
    throw new BasemapManifestValidationError('manifest.kind must be "basemap"');
  }

  const packId = string(manifest.packId, 'manifest.packId', 96);
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(packId)) {
    throw new BasemapManifestValidationError(
      'manifest.packId must be a lowercase stable identifier',
    );
  }

  const fileName = string(manifest.fileName, 'manifest.fileName', 160);
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]*\.pmtiles$/.test(fileName) ||
    fileName === '.' ||
    fileName === '..'
  ) {
    throw new BasemapManifestValidationError(
      'manifest.fileName must be a basename ending in .pmtiles',
    );
  }

  const sha256 = string(manifest.sha256, 'manifest.sha256', 64);
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new BasemapManifestValidationError('manifest.sha256 must be a lowercase SHA-256 digest');
  }

  const format = record(manifest.format, 'manifest.format');
  exactKeys(format, ['type', 'specVersion', 'minZoom', 'maxZoom'], 'manifest.format');
  if (format.type !== 'pmtiles') {
    throw new BasemapManifestValidationError('manifest.format.type must be "pmtiles"');
  }
  if (format.specVersion !== SUPPORTED_PMTILES_SPEC_VERSION) {
    throw new BasemapManifestValidationError(
      `manifest.format.specVersion must be ${SUPPORTED_PMTILES_SPEC_VERSION}`,
    );
  }
  const minZoom = integer(format.minZoom, 'manifest.format.minZoom');
  const maxZoom = integer(format.maxZoom, 'manifest.format.maxZoom');
  if (maxZoom > 22 || minZoom > maxZoom) {
    throw new BasemapManifestValidationError(
      'manifest.format zoom range must be ordered and within 0...22',
    );
  }

  const coverage = record(manifest.coverage, 'manifest.coverage');
  exactKeys(coverage, ['bounds'], 'manifest.coverage');
  if (!Array.isArray(coverage.bounds) || coverage.bounds.length !== 4) {
    throw new BasemapManifestValidationError(
      'manifest.coverage.bounds must contain west, south, east, north',
    );
  }
  const west = finiteNumber(coverage.bounds[0], 'manifest.coverage.bounds[0]');
  const south = finiteNumber(coverage.bounds[1], 'manifest.coverage.bounds[1]');
  const east = finiteNumber(coverage.bounds[2], 'manifest.coverage.bounds[2]');
  const north = finiteNumber(coverage.bounds[3], 'manifest.coverage.bounds[3]');
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new BasemapManifestValidationError(
      'manifest.coverage.bounds must be ordered geographic coordinates',
    );
  }

  const compatibility = record(manifest.compatibility, 'manifest.compatibility');
  exactKeys(compatibility, ['minimumAppVersion', 'styleSchemaVersion'], 'manifest.compatibility');

  if (!Array.isArray(manifest.attribution) || manifest.attribution.length === 0) {
    throw new BasemapManifestValidationError(
      'manifest.attribution must contain at least one credit',
    );
  }
  const attribution = manifest.attribution.map((credit, index) =>
    string(credit, `manifest.attribution[${index}]`, 512),
  );

  return Object.freeze({
    schemaVersion: BASEMAP_PACK_SCHEMA_VERSION,
    kind: 'basemap' as const,
    packId,
    version: string(manifest.version, 'manifest.version', 96),
    displayName: string(manifest.displayName, 'manifest.displayName', 128),
    fileName,
    byteLength: integer(manifest.byteLength, 'manifest.byteLength', 1),
    sha256,
    format: Object.freeze({
      type: 'pmtiles' as const,
      specVersion: SUPPORTED_PMTILES_SPEC_VERSION,
      minZoom,
      maxZoom,
    }),
    coverage: Object.freeze({
      bounds: Object.freeze([west, south, east, north]) as BasemapBounds,
    }),
    compatibility: Object.freeze({
      minimumAppVersion: string(
        compatibility.minimumAppVersion,
        'manifest.compatibility.minimumAppVersion',
        48,
      ),
      styleSchemaVersion: integer(
        compatibility.styleSchemaVersion,
        'manifest.compatibility.styleSchemaVersion',
        1,
      ),
    }),
    attribution: Object.freeze(attribution),
  });
}

/** Match facts measured from the imported file against a trusted manifest. */
export function basemapFileMatchesPin(
  manifest: PinnedBasemapManifest,
  file: BasemapFileIdentity,
): boolean {
  return (
    Number.isSafeInteger(file.byteLength) &&
    file.byteLength === manifest.byteLength &&
    file.sha256 === manifest.sha256
  );
}

export interface BasemapStorageRequirement {
  readonly incomingBytes: number;
  readonly availableBytes: number;
  readonly reserveBytes?: number;
}

export type BasemapStorageDecision =
  | Readonly<{
      status: 'ready';
      requiredBytes: number;
      availableBytes: number;
      remainingBytes: number;
    }>
  | Readonly<{
      status: 'insufficient-space';
      requiredBytes: number;
      availableBytes: number;
      missingBytes: number;
    }>;

/**
 * The previous active pack is deliberately not subtracted: it must remain in
 * place until the candidate has committed successfully.
 */
export function evaluateBasemapStorage(
  requirement: BasemapStorageRequirement,
): BasemapStorageDecision {
  const incomingBytes = integer(requirement.incomingBytes, 'requirement.incomingBytes', 1);
  const availableBytes = integer(requirement.availableBytes, 'requirement.availableBytes');
  const reserveBytes = integer(requirement.reserveBytes ?? 0, 'requirement.reserveBytes');
  const requiredBytes = incomingBytes + reserveBytes;
  if (!Number.isSafeInteger(requiredBytes)) {
    throw new RangeError('required basemap storage exceeds a safe integer');
  }
  if (availableBytes >= requiredBytes) {
    return Object.freeze({
      status: 'ready' as const,
      requiredBytes,
      availableBytes,
      remainingBytes: availableBytes - requiredBytes,
    });
  }
  return Object.freeze({
    status: 'insufficient-space' as const,
    requiredBytes,
    availableBytes,
    missingBytes: requiredBytes - availableBytes,
  });
}

export interface ActiveBasemapPack {
  readonly packId: string;
  readonly version: string;
  readonly localUri: string;
  readonly sha256: string;
}

interface ActivationBase {
  readonly active: ActiveBasemapPack | null;
}

export type BasemapActivationState =
  | (ActivationBase & Readonly<{ phase: 'idle' }>)
  | (ActivationBase & Readonly<{ phase: 'staging'; candidate: PinnedBasemapManifest }>)
  | (ActivationBase & Readonly<{ phase: 'verified'; candidate: PinnedBasemapManifest }>)
  | (ActivationBase & Readonly<{ phase: 'committing'; candidate: PinnedBasemapManifest }>)
  | (ActivationBase &
      Readonly<{
        phase: 'failed';
        candidate: PinnedBasemapManifest;
        error: string;
      }>);

export type BasemapActivationEvent =
  | Readonly<{ type: 'begin'; candidate: PinnedBasemapManifest }>
  | Readonly<{ type: 'verified' }>
  | Readonly<{ type: 'begin-commit' }>
  | Readonly<{ type: 'commit'; installed: ActiveBasemapPack }>
  | Readonly<{ type: 'fail'; error: string }>
  | Readonly<{ type: 'reset' }>;

export function initialBasemapActivationState(
  active: ActiveBasemapPack | null = null,
): BasemapActivationState {
  return Object.freeze({ phase: 'idle' as const, active });
}

function transitionError(state: BasemapActivationState, event: BasemapActivationEvent): never {
  throw new Error(`Invalid basemap activation transition: ${state.phase} -> ${event.type}`);
}

/**
 * Pure activation state machine. `active` is carried unchanged through every
 * pre-commit phase and failure; only the atomic `commit` event replaces it.
 */
export function reduceBasemapActivation(
  state: BasemapActivationState,
  event: BasemapActivationEvent,
): BasemapActivationState {
  switch (event.type) {
    case 'begin':
      if (state.phase !== 'idle' && state.phase !== 'failed') {
        return transitionError(state, event);
      }
      return Object.freeze({
        phase: 'staging' as const,
        active: state.active,
        candidate: event.candidate,
      });
    case 'verified':
      if (state.phase !== 'staging') return transitionError(state, event);
      return Object.freeze({ ...state, phase: 'verified' as const });
    case 'begin-commit':
      if (state.phase !== 'verified') return transitionError(state, event);
      return Object.freeze({ ...state, phase: 'committing' as const });
    case 'commit':
      if (state.phase !== 'committing') return transitionError(state, event);
      if (
        event.installed.packId !== state.candidate.packId ||
        event.installed.version !== state.candidate.version ||
        event.installed.sha256 !== state.candidate.sha256 ||
        !event.installed.localUri.startsWith('file://')
      ) {
        throw new Error('Committed basemap does not match the verified candidate');
      }
      return Object.freeze({
        phase: 'idle' as const,
        active: Object.freeze({ ...event.installed }),
      });
    case 'fail':
      if (state.phase !== 'staging' && state.phase !== 'verified' && state.phase !== 'committing') {
        return transitionError(state, event);
      }
      return Object.freeze({
        phase: 'failed' as const,
        active: state.active,
        candidate: state.candidate,
        error: string(event.error, 'event.error', 512),
      });
    case 'reset':
      if (state.phase !== 'failed') return transitionError(state, event);
      return initialBasemapActivationState(state.active);
  }
}

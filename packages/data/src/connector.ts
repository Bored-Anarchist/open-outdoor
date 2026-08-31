export const CONNECTOR_SDK_VERSION = '1.0.0' as const;

export const SOURCE_LIFECYCLES = [
  'experimental',
  'active',
  'failing',
  'disabled',
  'retired',
] as const;
export const SOURCE_AUTHORIZATIONS = [
  'authorized',
  'permission-required',
  'expired',
  'revoked',
] as const;
export const ACQUISITION_MODES = [
  'automated',
  'manual-import',
  'user-export',
  'overlay',
  'deep-link-only',
] as const;
export const SOURCE_CLASSES = ['current', 'legacy'] as const;
export const DISTRIBUTION_SCOPES = ['public', 'private-user', 'private-organization'] as const;
export const DATA_CLASSIFICATIONS = [
  'PUBLIC_SYNTHETIC',
  'SOURCE_REDISTRIBUTABLE',
  'PRIVATE_USER',
  'PRIVATE_ORGANIZATION',
  'SOURCE_RESTRICTED',
] as const;
export const CONNECTOR_STAGES = [
  'discover',
  'fetch',
  'store_raw',
  'parse',
  'normalize',
  'validate',
  'checkpoint',
  'emit',
] as const;

export type SourceLifecycle = (typeof SOURCE_LIFECYCLES)[number];
export type SourceAuthorization = (typeof SOURCE_AUTHORIZATIONS)[number];
export type AcquisitionMode = (typeof ACQUISITION_MODES)[number];
export type SourceClass = (typeof SOURCE_CLASSES)[number];
export type DistributionScope = (typeof DISTRIBUTION_SCOPES)[number];
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];
export type ConnectorStage = (typeof CONNECTOR_STAGES)[number];

export interface SourceRights {
  readonly rawRetention: string | null;
  readonly parsedFields: readonly string[];
  readonly media: boolean;
  readonly derivedData: boolean;
  readonly offlineStorage: boolean;
  readonly distribution: Readonly<Record<DistributionScope, boolean>>;
  readonly attribution: readonly string[];
  readonly termsUrl: string;
  readonly evidenceReviewedAt: string;
  readonly reviewExpiresAt: string | null;
}

export interface ConnectorLimits {
  readonly maxPayloadBytes: number;
  readonly maxArchiveEntries: number;
  readonly maxExpandedBytes: number;
  readonly maxCompressionRatio: number;
  readonly maxParserMilliseconds: number;
  readonly maxRedirects: number;
  readonly maxConcurrency: number;
}

export interface ConnectorManifest {
  readonly schemaVersion: '1.0.0';
  readonly connectorVersion: string;
  readonly sourceId: string;
  readonly lifecycle: SourceLifecycle;
  readonly authorization: SourceAuthorization;
  readonly acquisitionMode: AcquisitionMode;
  readonly sourceClass: SourceClass;
  readonly classification: DataClassification;
  readonly allowedTransports: readonly ('https' | 'file')[];
  readonly allowedHosts: readonly string[];
  readonly secretNames: readonly string[];
  readonly rights: SourceRights;
  readonly limits: ConnectorLimits;
  readonly requiredFreshnessSeconds: number | null;
}

export type RightsOperation =
  'acquire' | 'retain-raw' | 'parse-field' | 'derive' | 'store-offline' | 'distribute';

export interface RightsRequest {
  readonly operation: RightsOperation;
  readonly now: string;
  readonly field?: string;
  readonly distribution?: DistributionScope;
  readonly acquisitionMode?: AcquisitionMode;
}

export interface RightsDecision {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
}

export class ConnectorManifestError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`invalid connector manifest: ${problems.join('; ')}`);
    this.name = 'ConnectorManifestError';
  }
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isUtcInstant(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item !== '');
}

export function validateConnectorManifest(value: unknown): ConnectorManifest {
  const problems: string[] = [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConnectorManifestError(['manifest must be an object']);
  }
  const manifest = value as Partial<ConnectorManifest>;
  if (manifest.schemaVersion !== CONNECTOR_SDK_VERSION) problems.push('unsupported schemaVersion');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.connectorVersion ?? '')) {
    problems.push('connectorVersion must be semantic');
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.sourceId ?? '')) {
    problems.push('sourceId must be lowercase kebab-case');
  }
  if (!isOneOf(manifest.lifecycle, SOURCE_LIFECYCLES)) problems.push('invalid lifecycle');
  if (!isOneOf(manifest.authorization, SOURCE_AUTHORIZATIONS)) {
    problems.push('invalid authorization');
  }
  if (!isOneOf(manifest.acquisitionMode, ACQUISITION_MODES)) {
    problems.push('invalid acquisitionMode');
  }
  if (!isOneOf(manifest.sourceClass, SOURCE_CLASSES)) problems.push('invalid sourceClass');
  if (!isOneOf(manifest.classification, DATA_CLASSIFICATIONS)) {
    problems.push('invalid classification');
  }
  if (
    !Array.isArray(manifest.allowedTransports) ||
    manifest.allowedTransports.length === 0 ||
    !manifest.allowedTransports.every((item) => item === 'https' || item === 'file')
  ) {
    problems.push('allowedTransports must contain https and/or file');
  }
  if (!isStringArray(manifest.allowedHosts)) problems.push('allowedHosts must be strings');
  if (!isStringArray(manifest.secretNames)) problems.push('secretNames must be strings');
  if (manifest.secretNames?.some((name) => !/^[A-Z][A-Z0-9_]*$/.test(name))) {
    problems.push('secretNames must be environment-style identifiers');
  }
  if (manifest.allowedTransports?.includes('https') && manifest.allowedHosts?.length === 0) {
    problems.push('https transport requires an allowed host');
  }

  const rights = manifest.rights as Partial<SourceRights> | undefined;
  if (!rights || typeof rights !== 'object') {
    problems.push('rights are required');
  } else {
    if (
      rights.rawRetention !== null &&
      (typeof rights.rawRetention !== 'string' || !/^P(?:\d+D|T\d+H)$/.test(rights.rawRetention))
    ) {
      problems.push('rawRetention must be null or a bounded ISO 8601 duration');
    }
    if (!isStringArray(rights.parsedFields)) problems.push('parsedFields must be strings');
    if (typeof rights.media !== 'boolean') problems.push('media right is required');
    if (typeof rights.derivedData !== 'boolean') problems.push('derivedData right is required');
    if (typeof rights.offlineStorage !== 'boolean') {
      problems.push('offlineStorage right is required');
    }
    if (
      !rights.distribution ||
      DISTRIBUTION_SCOPES.some((scope) => typeof rights.distribution?.[scope] !== 'boolean')
    ) {
      problems.push('every distribution scope is required');
    }
    if (!isStringArray(rights.attribution)) problems.push('attribution must be strings');
    if (typeof rights.termsUrl !== 'string' || !/^https:\/\//.test(rights.termsUrl)) {
      problems.push('termsUrl must use https');
    }
    if (!isUtcInstant(rights.evidenceReviewedAt)) problems.push('invalid evidenceReviewedAt');
    if (rights.reviewExpiresAt !== null && !isUtcInstant(rights.reviewExpiresAt)) {
      problems.push('invalid reviewExpiresAt');
    }
  }

  const limits = manifest.limits as Partial<ConnectorLimits> | undefined;
  if (!limits || typeof limits !== 'object') {
    problems.push('limits are required');
  } else {
    for (const key of [
      'maxPayloadBytes',
      'maxArchiveEntries',
      'maxExpandedBytes',
      'maxCompressionRatio',
      'maxParserMilliseconds',
      'maxConcurrency',
    ] as const) {
      if (!isPositiveInteger(limits[key])) problems.push(`${key} must be a positive integer`);
    }
    if (
      typeof limits.maxRedirects !== 'number' ||
      !Number.isSafeInteger(limits.maxRedirects) ||
      limits.maxRedirects < 0
    ) {
      problems.push('maxRedirects must be a non-negative integer');
    }
    if (
      typeof limits.maxPayloadBytes === 'number' &&
      typeof limits.maxExpandedBytes === 'number' &&
      limits.maxExpandedBytes < limits.maxPayloadBytes
    ) {
      problems.push('maxExpandedBytes cannot be smaller than maxPayloadBytes');
    }
  }

  if (
    manifest.requiredFreshnessSeconds !== null &&
    !isPositiveInteger(manifest.requiredFreshnessSeconds)
  ) {
    problems.push('requiredFreshnessSeconds must be null or a positive integer');
  }
  if (problems.length > 0) throw new ConnectorManifestError(problems);
  return structuredClone(value) as ConnectorManifest;
}

export function evaluateSourceRights(
  manifestValue: ConnectorManifest,
  request: RightsRequest,
): RightsDecision {
  const manifest = validateConnectorManifest(manifestValue);
  const reasons: string[] = [];
  const now = Date.parse(request.now);
  if (!isUtcInstant(request.now)) reasons.push('invalid-decision-time');
  if (manifest.lifecycle !== 'active' && manifest.lifecycle !== 'experimental') {
    reasons.push(`lifecycle-${manifest.lifecycle}`);
  }
  if (manifest.authorization !== 'authorized') {
    reasons.push(`authorization-${manifest.authorization}`);
  }
  if (
    manifest.rights.reviewExpiresAt !== null &&
    Number.isFinite(now) &&
    now >= Date.parse(manifest.rights.reviewExpiresAt)
  ) {
    reasons.push('rights-review-expired');
  }

  switch (request.operation) {
    case 'acquire':
      if ((request.acquisitionMode ?? manifest.acquisitionMode) !== manifest.acquisitionMode) {
        reasons.push('acquisition-mode-not-authorized');
      }
      if (manifest.acquisitionMode === 'deep-link-only') reasons.push('deep-link-only');
      break;
    case 'retain-raw':
      if (manifest.rights.rawRetention === null) reasons.push('raw-retention-prohibited');
      break;
    case 'parse-field':
      if (!request.field || !manifest.rights.parsedFields.includes(request.field)) {
        reasons.push('field-not-authorized');
      }
      break;
    case 'derive':
      if (!manifest.rights.derivedData) reasons.push('derivation-prohibited');
      break;
    case 'store-offline':
      if (!manifest.rights.offlineStorage) reasons.push('offline-storage-prohibited');
      break;
    case 'distribute':
      if (!request.distribution || !manifest.rights.distribution[request.distribution]) {
        reasons.push('distribution-prohibited');
      }
      break;
  }
  return { allowed: reasons.length === 0, reasons };
}

export interface DiscoveredAsset {
  readonly externalId: string;
  readonly sourcePartition: string;
  readonly locator: string;
}

export interface FetchedAsset extends DiscoveredAsset {
  readonly payload: Uint8Array;
  readonly contentType: string;
  readonly retrievedAt: string;
  readonly redirectCount?: number;
}

export interface StoredRawAsset extends Omit<FetchedAsset, 'payload'> {
  readonly checksum: string;
  readonly byteLength: number;
  readonly storageKey: string;
}

export interface ConnectorContext {
  readonly runId: string;
  readonly signal: AbortSignal;
}

export interface Connector<TParsed, TNormalized, TEmitted> {
  readonly manifest: ConnectorManifest;
  readonly discover: (context: ConnectorContext) => Promise<readonly DiscoveredAsset[]>;
  readonly fetch: (asset: DiscoveredAsset, context: ConnectorContext) => Promise<FetchedAsset>;
  readonly storeRaw: (asset: FetchedAsset, context: ConnectorContext) => Promise<StoredRawAsset>;
  readonly parse: (asset: FetchedAsset, context: ConnectorContext) => Promise<TParsed>;
  readonly normalize: (value: TParsed, context: ConnectorContext) => Promise<TNormalized>;
  readonly validate: (value: TNormalized, context: ConnectorContext) => Promise<void>;
  readonly checkpoint: (asset: StoredRawAsset, context: ConnectorContext) => Promise<void>;
  readonly emit: (value: TNormalized, context: ConnectorContext) => Promise<TEmitted>;
}

export interface ConnectorFixture<TParsed, TNormalized, TEmitted> {
  readonly name: string;
  readonly classification: 'PUBLIC_SYNTHETIC';
  readonly connector: Connector<TParsed, TNormalized, TEmitted>;
  readonly expectedAssetCount: number;
  readonly expectedEmitted: readonly TEmitted[];
}

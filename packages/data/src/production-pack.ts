import { createHash } from 'node:crypto';
import { stableJson } from './public-pack.js';

export type PackDistribution = 'public' | 'private';
export type PackComponentKind = 'basemap' | 'catalog-search-elevation' | 'media';

export interface ProductionPackRights {
  readonly offlineStorage: boolean;
  readonly derivation: boolean;
  readonly redistribution: 'public' | 'private' | 'none';
  readonly licenseId: string;
  readonly attribution: readonly string[];
  readonly termsReviewedAt: string;
  readonly expiresAt: string | null;
}

export interface ProductionPackComponent {
  readonly artifactId: string;
  readonly kind: PackComponentKind;
  readonly regionId: string;
  readonly detailAreaId: string | null;
  readonly sourceId: string;
  readonly entityClass: string;
  readonly mediaClass: string | null;
  readonly minimumZoom: number | null;
  readonly maximumZoom: number | null;
  readonly byteLength: number;
  readonly contentChecksum: string;
  readonly distribution: PackDistribution;
  readonly rights: ProductionPackRights;
}

export interface ProductionPackTool {
  readonly name: string;
  readonly version: string;
  readonly checksum: string;
  readonly licenseId: string;
}

export interface ProductionPackProfile {
  readonly bundleId: string;
  readonly generatedAt: string;
  readonly distribution: PackDistribution;
  readonly regionIds: readonly string[];
  readonly highDetailAreaIds: readonly string[];
  readonly entityClasses: readonly string[];
  readonly mediaClasses: readonly string[];
  readonly requiredKinds: readonly PackComponentKind[];
}

export type ProductionPackExclusionReason =
  | 'region-not-selected'
  | 'detail-not-selected'
  | 'entity-not-selected'
  | 'media-not-selected'
  | 'distribution-mismatch';

export interface ProductionPackExclusion {
  readonly artifactId: string;
  readonly reason: ProductionPackExclusionReason;
}

export interface ProductionPackSizeRow {
  readonly regionId: string;
  readonly sourceId: string;
  readonly entityClass: string;
  readonly mediaClass: string | null;
  readonly zoom: string;
  readonly distribution: PackDistribution;
  readonly artifactId: string;
  readonly kind: PackComponentKind;
  readonly byteLength: number;
}

export interface ProductionPackResult {
  readonly manifest: {
    readonly formatVersion: '1.0.0';
    readonly bundleId: string;
    readonly generatedAt: string;
    readonly distribution: PackDistribution;
    readonly regionIds: readonly string[];
    readonly highDetailAreaIds: readonly string[];
    readonly entityClasses: readonly string[];
    readonly mediaClasses: readonly string[];
    readonly installedBytes: number;
    readonly componentChecksums: readonly string[];
    readonly attribution: readonly string[];
    readonly sbomChecksum: string;
    readonly dbomChecksum: string;
    readonly sizeReportChecksum: string;
  };
  readonly sbom: {
    readonly schemaVersion: 1;
    readonly tools: readonly ProductionPackTool[];
  };
  readonly dbom: {
    readonly schemaVersion: 1;
    readonly components: readonly {
      readonly artifactId: string;
      readonly sourceId: string;
      readonly regionId: string;
      readonly entityClass: string;
      readonly mediaClass: string | null;
      readonly licenseId: string;
      readonly contentChecksum: string;
    }[];
  };
  readonly sizeReport: {
    readonly rows: readonly ProductionPackSizeRow[];
    readonly totals: Readonly<Record<PackComponentKind | 'combined', number>>;
  };
  readonly included: readonly ProductionPackComponent[];
  readonly exclusions: readonly ProductionPackExclusion[];
  readonly manifestChecksum: string;
}

export class ProductionPackBuildError extends Error {
  constructor(
    readonly code: 'INPUT_INVALID' | 'RIGHTS_INCOMPLETE' | 'COVERAGE_INCOMPLETE' | 'OVERSIZE',
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ProductionPackBuildError';
  }
}

const SHA256 = /^[0-9a-f]{64}$/;
const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const LIMITS: Readonly<Record<PackComponentKind | 'combined', number>> = {
  basemap: 1.5 * GIB,
  'catalog-search-elevation': 1 * GIB,
  media: 512 * MIB,
  combined: 3 * GIB,
};

function checksum(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function validUtc(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function assertProfile(profile: ProductionPackProfile): void {
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile.bundleId) ||
    !validUtc(profile.generatedAt) ||
    profile.regionIds.length === 0 ||
    profile.requiredKinds.length === 0 ||
    [
      ...profile.regionIds,
      ...profile.highDetailAreaIds,
      ...profile.entityClasses,
      ...profile.mediaClasses,
    ].some((item) => item.trim() === '')
  ) {
    throw new ProductionPackBuildError('INPUT_INVALID', 'production pack profile is invalid');
  }
}

function rightsProblems(
  component: ProductionPackComponent,
  profile: ProductionPackProfile,
): readonly string[] {
  const rights = component.rights;
  const problems: string[] = [];
  if (!rights.offlineStorage) problems.push('offline-storage-denied');
  if (!rights.derivation) problems.push('derivation-denied');
  if (rights.redistribution !== profile.distribution) problems.push('redistribution-denied');
  if (rights.licenseId.trim() === '') problems.push('license-missing');
  if (rights.attribution.length === 0 || rights.attribution.some((item) => item.trim() === '')) {
    problems.push('attribution-missing');
  }
  if (!validUtc(rights.termsReviewedAt)) problems.push('terms-review-invalid');
  if (
    rights.expiresAt !== null &&
    (!validUtc(rights.expiresAt) || Date.parse(rights.expiresAt) <= Date.parse(profile.generatedAt))
  ) {
    problems.push('rights-expired');
  }
  return problems;
}

function inputProblems(component: ProductionPackComponent): readonly string[] {
  const problems: string[] = [];
  if (
    component.artifactId.trim() === '' ||
    component.regionId.trim() === '' ||
    component.sourceId.trim() === '' ||
    component.entityClass.trim() === ''
  ) {
    problems.push('identity-incomplete');
  }
  if (!Number.isSafeInteger(component.byteLength) || component.byteLength < 0) {
    problems.push('byte-length-invalid');
  }
  if (!SHA256.test(component.contentChecksum)) problems.push('checksum-invalid');
  if (
    (component.minimumZoom === null) !== (component.maximumZoom === null) ||
    (component.minimumZoom !== null &&
      component.maximumZoom !== null &&
      (!Number.isSafeInteger(component.minimumZoom) ||
        !Number.isSafeInteger(component.maximumZoom) ||
        component.minimumZoom < 0 ||
        component.minimumZoom > component.maximumZoom))
  ) {
    problems.push('zoom-invalid');
  }
  if (component.kind === 'media' && component.mediaClass === null) {
    problems.push('media-class-missing');
  }
  return problems;
}

function selectionReason(
  component: ProductionPackComponent,
  profile: ProductionPackProfile,
): ProductionPackExclusionReason | null {
  if (!profile.regionIds.includes(component.regionId)) return 'region-not-selected';
  if (
    component.detailAreaId !== null &&
    !profile.highDetailAreaIds.includes(component.detailAreaId)
  ) {
    return 'detail-not-selected';
  }
  if (!profile.entityClasses.includes(component.entityClass)) return 'entity-not-selected';
  if (
    component.kind === 'media' &&
    (component.mediaClass === null || !profile.mediaClasses.includes(component.mediaClass))
  ) {
    return 'media-not-selected';
  }
  if (component.distribution !== profile.distribution) return 'distribution-mismatch';
  return null;
}

function zoomLabel(component: ProductionPackComponent): string {
  return component.minimumZoom === null
    ? 'not-applicable'
    : `${component.minimumZoom}-${component.maximumZoom}`;
}

export function buildProductionPack(input: {
  readonly profile: ProductionPackProfile;
  readonly components: readonly ProductionPackComponent[];
  readonly tools: readonly ProductionPackTool[];
}): ProductionPackResult {
  assertProfile(input.profile);
  const artifactIds = new Set<string>();
  const invalid: string[] = [];
  for (const component of input.components) {
    if (artifactIds.has(component.artifactId)) invalid.push(`${component.artifactId}:duplicate`);
    artifactIds.add(component.artifactId);
    invalid.push(
      ...inputProblems(component).map((problem) => `${component.artifactId}:${problem}`),
    );
  }
  for (const tool of input.tools) {
    if (
      tool.name.trim() === '' ||
      tool.version.trim() === '' ||
      tool.licenseId.trim() === '' ||
      !SHA256.test(tool.checksum)
    ) {
      invalid.push(`${tool.name || 'unnamed-tool'}:sbom-incomplete`);
    }
  }
  if (input.tools.length === 0) invalid.push('sbom:tool-inventory-empty');
  if (invalid.length > 0) {
    throw new ProductionPackBuildError(
      'INPUT_INVALID',
      'production pack inputs are incomplete',
      invalid.sort(),
    );
  }

  const included: ProductionPackComponent[] = [];
  const exclusions: ProductionPackExclusion[] = [];
  for (const component of [...input.components].sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId),
  )) {
    const reason = selectionReason(component, input.profile);
    if (reason) exclusions.push({ artifactId: component.artifactId, reason });
    else included.push(component);
  }
  const denied = included.flatMap((component) =>
    rightsProblems(component, input.profile).map((problem) => `${component.artifactId}:${problem}`),
  );
  if (denied.length > 0) {
    throw new ProductionPackBuildError(
      'RIGHTS_INCOMPLETE',
      'selected production pack content failed closed at the rights gate',
      denied.sort(),
    );
  }

  const coverageProblems: string[] = [];
  for (const regionId of input.profile.regionIds) {
    for (const kind of input.profile.requiredKinds) {
      if (
        !included.some((component) => component.regionId === regionId && component.kind === kind)
      ) {
        coverageProblems.push(`${regionId}:${kind}`);
      }
    }
    for (const entityClass of input.profile.entityClasses) {
      if (
        !included.some(
          (component) => component.regionId === regionId && component.entityClass === entityClass,
        )
      ) {
        coverageProblems.push(`${regionId}:entity:${entityClass}`);
      }
    }
  }
  for (const mediaClass of input.profile.mediaClasses) {
    if (!included.some((component) => component.mediaClass === mediaClass)) {
      coverageProblems.push(`media:${mediaClass}`);
    }
  }
  if (coverageProblems.length > 0) {
    throw new ProductionPackBuildError(
      'COVERAGE_INCOMPLETE',
      'requested production pack coverage is incomplete',
      coverageProblems.sort(),
    );
  }

  const rows: ProductionPackSizeRow[] = included.map((component) => ({
    regionId: component.regionId,
    sourceId: component.sourceId,
    entityClass: component.entityClass,
    mediaClass: component.mediaClass,
    zoom: zoomLabel(component),
    distribution: component.distribution,
    artifactId: component.artifactId,
    kind: component.kind,
    byteLength: component.byteLength,
  }));
  const totals: Record<PackComponentKind | 'combined', number> = {
    basemap: 0,
    'catalog-search-elevation': 0,
    media: 0,
    combined: 0,
  };
  for (const component of included) {
    totals[component.kind] += component.byteLength;
    totals.combined += component.byteLength;
  }
  const oversize = (Object.keys(LIMITS) as (keyof typeof LIMITS)[])
    .filter((kind) => totals[kind] > LIMITS[kind])
    .map((kind) => `${kind}:${totals[kind]}>${LIMITS[kind]}`);
  if (oversize.length > 0) {
    throw new ProductionPackBuildError(
      'OVERSIZE',
      'production pack exceeds a binding component or combined size ceiling',
      oversize,
    );
  }

  const tools = [...input.tools].sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
  );
  const sbom = { schemaVersion: 1 as const, tools };
  const dbom = {
    schemaVersion: 1 as const,
    components: included.map((component) => ({
      artifactId: component.artifactId,
      sourceId: component.sourceId,
      regionId: component.regionId,
      entityClass: component.entityClass,
      mediaClass: component.mediaClass,
      licenseId: component.rights.licenseId,
      contentChecksum: component.contentChecksum,
    })),
  };
  const sizeReport = { rows, totals };
  const manifest = {
    formatVersion: '1.0.0' as const,
    bundleId: input.profile.bundleId,
    generatedAt: input.profile.generatedAt,
    distribution: input.profile.distribution,
    regionIds: [...input.profile.regionIds].sort(),
    highDetailAreaIds: [...input.profile.highDetailAreaIds].sort(),
    entityClasses: [...input.profile.entityClasses].sort(),
    mediaClasses: [...input.profile.mediaClasses].sort(),
    installedBytes: totals.combined,
    componentChecksums: included.map(({ contentChecksum }) => contentChecksum),
    attribution: [...new Set(included.flatMap(({ rights }) => rights.attribution))].sort(),
    sbomChecksum: checksum(sbom),
    dbomChecksum: checksum(dbom),
    sizeReportChecksum: checksum(sizeReport),
  };
  return {
    manifest,
    sbom,
    dbom,
    sizeReport,
    included,
    exclusions,
    manifestChecksum: checksum(manifest),
  };
}

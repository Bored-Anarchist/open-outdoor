import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CanonicalGeometry, CanonicalRecord, Position } from './canonical.js';
import { validateCanonicalRecord } from './canonical.js';
import type { ConnectorManifest, DataClassification } from './connector.js';
import { evaluateSourceRights, validateConnectorManifest } from './connector.js';

export const PUBLIC_PACK_FORMAT_VERSION = '1.0.0' as const;

export interface PublicPackSourceRegistration {
  readonly sourceId: string;
  readonly displayName: string;
  readonly owner: string;
  readonly canonicalUrl: string;
  readonly licenseId: string;
  readonly disclaimer: string;
  readonly manifest: ConnectorManifest;
  readonly allowedRecordTypes: readonly CanonicalRecord['recordType'][];
}

export interface PublicPackArtifact {
  readonly id: string;
  readonly sourceId: string;
  readonly kind: 'elevation-tile' | 'basemap-extract' | 'other';
  readonly locator: string;
  readonly contentChecksum: string;
  readonly byteLength: number;
  readonly classification: Extract<
    DataClassification,
    'PUBLIC_SYNTHETIC' | 'SOURCE_REDISTRIBUTABLE'
  >;
  readonly sourceUpdatedAt: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PublicPackProfile {
  readonly bundleId: string;
  readonly contentVersion: number;
  readonly catalogSchemaVersion: number;
  readonly generatedAt: string;
  readonly dataAsOf: string;
  readonly region: {
    readonly id: string;
    readonly name: string;
    readonly bounds: readonly [west: number, south: number, east: number, north: number];
  };
  readonly compatibleApp: { readonly minimum: number; readonly maximum: number };
  readonly offlineFeatures: readonly string[];
  readonly maximumCatalogBytes: number;
}

export type PublicPackExclusionReason =
  | 'source-unregistered'
  | 'source-rights-denied'
  | 'record-not-public'
  | 'record-type-not-approved'
  | 'record-invalid'
  | 'record-tombstoned'
  | 'attribution-incomplete'
  | 'artifact-invalid';

export interface PublicPackExclusion {
  readonly sourceId: string;
  readonly subjectId: string;
  readonly subjectKind: string;
  readonly reason: PublicPackExclusionReason;
  readonly detail: string;
}

export interface PublicPackSourceInventory {
  readonly sourceId: string;
  readonly displayName: string;
  readonly owner: string;
  readonly canonicalUrl: string;
  readonly licenseId: string;
  readonly termsUrl: string;
  readonly attribution: readonly string[];
  readonly disclaimer: string;
  readonly rightsPolicyChecksum: string;
  readonly recordCount: number;
  readonly artifactCount: number;
  readonly dataAsOf: string | null;
  readonly staleAfterSeconds: number | null;
}

export interface PublicPackManifest {
  readonly formatVersion: typeof PUBLIC_PACK_FORMAT_VERSION;
  readonly bundleId: string;
  readonly contentVersion: number;
  readonly catalogSchemaVersion: number;
  readonly generatedAt: string;
  readonly dataAsOf: string;
  readonly region: PublicPackProfile['region'];
  readonly compatibleApp: PublicPackProfile['compatibleApp'];
  readonly offlineFeatures: readonly string[];
  readonly classification: 'SOURCE_REDISTRIBUTABLE';
  readonly sources: readonly PublicPackSourceInventory[];
  readonly attribution: readonly string[];
  readonly rightsPolicySnapshotChecksum: string;
  readonly coverageChecksum: string;
  readonly exclusionChecksum: string;
  readonly dbomChecksum: string;
  readonly catalogChecksum: string;
  readonly installedBytes: number;
  readonly compressedBytes: number;
  readonly recordCount: number;
  readonly artifactCount: number;
  readonly exclusionCount: number;
}

export interface BuildPublicPackInput {
  readonly catalogPath: string;
  readonly manifestPath: string;
  readonly profile: PublicPackProfile;
  readonly sources: readonly PublicPackSourceRegistration[];
  readonly records: readonly CanonicalRecord[];
  readonly artifacts?: readonly PublicPackArtifact[];
  readonly coverage: Readonly<Record<string, unknown>>;
}

export interface BuildPublicPackResult {
  readonly manifest: PublicPackManifest;
  readonly exclusions: readonly PublicPackExclusion[];
  readonly catalogChecksum: string;
  readonly manifestChecksum: string;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function checksum(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function validUtc(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function assertProfile(profile: PublicPackProfile): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile.bundleId)) {
    throw new Error('bundleId must be lowercase kebab-case');
  }
  if (!validUtc(profile.generatedAt) || !validUtc(profile.dataAsOf)) {
    throw new Error('pack times must be UTC');
  }
  if (
    !Number.isSafeInteger(profile.contentVersion) ||
    !Number.isSafeInteger(profile.catalogSchemaVersion) ||
    profile.contentVersion < 1 ||
    profile.catalogSchemaVersion < 1
  ) {
    throw new Error('pack versions must be positive integers');
  }
  if (
    !Number.isSafeInteger(profile.compatibleApp.minimum) ||
    !Number.isSafeInteger(profile.compatibleApp.maximum) ||
    profile.compatibleApp.minimum < 1 ||
    profile.compatibleApp.maximum < profile.compatibleApp.minimum
  ) {
    throw new Error('invalid compatible app interval');
  }
  if (!Number.isSafeInteger(profile.maximumCatalogBytes) || profile.maximumCatalogBytes < 1) {
    throw new Error('maximumCatalogBytes must be a positive safe integer');
  }
  const [west, south, east, north] = profile.region.bounds;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new Error('invalid pack region bounds');
  }
}

function sourceRightsProblems(
  registration: PublicPackSourceRegistration,
  generatedAt: string,
): readonly string[] {
  const manifest = validateConnectorManifest(registration.manifest);
  if (manifest.sourceId !== registration.sourceId) return ['source-id-mismatch'];
  const decisions = [
    evaluateSourceRights(manifest, { operation: 'derive', now: generatedAt }),
    evaluateSourceRights(manifest, { operation: 'store-offline', now: generatedAt }),
    evaluateSourceRights(manifest, {
      operation: 'distribute',
      distribution: 'public',
      now: generatedAt,
    }),
  ];
  const problems = decisions.flatMap((decision) => decision.reasons);
  if (!['PUBLIC_SYNTHETIC', 'SOURCE_REDISTRIBUTABLE'].includes(manifest.classification)) {
    problems.push(`classification-${manifest.classification}`);
  }
  if (registration.licenseId.trim() === '') problems.push('license-missing');
  if (registration.disclaimer.trim() === '') problems.push('disclaimer-missing');
  if (manifest.rights.attribution.length === 0) problems.push('attribution-missing');
  return [...new Set(problems)].sort();
}

function geometryBounds(
  geometry: CanonicalGeometry | null,
): readonly [number, number, number, number] | null {
  if (!geometry) return null;
  let positions: readonly Position[];
  switch (geometry.type) {
    case 'Point':
      positions = [geometry.coordinates];
      break;
    case 'LineString':
      positions = geometry.coordinates;
      break;
    case 'MultiLineString':
    case 'Polygon':
      positions = geometry.coordinates.flat();
      break;
    case 'MultiPolygon':
      positions = geometry.coordinates.flat(2);
      break;
  }
  return positions.reduce<readonly [number, number, number, number] | null>(
    (bounds, [longitude, latitude]) =>
      bounds
        ? [
            Math.min(bounds[0], longitude),
            Math.min(bounds[1], latitude),
            Math.max(bounds[2], longitude),
            Math.max(bounds[3], latitude),
          ]
        : [longitude, latitude, longitude, latitude],
    null,
  );
}

function recordSearchDocument(record: CanonicalRecord): {
  readonly name: string;
  readonly keywords: string;
} {
  switch (record.recordType) {
    case 'land-unit':
      return {
        name: record.properties.name,
        keywords: [
          record.properties.ownership,
          record.properties.manager,
          record.properties.baseRule,
        ].join(' '),
      };
    case 'trail':
      return {
        name: record.properties.name,
        keywords: [record.properties.trailKind, record.properties.rawTrailKind ?? ''].join(' '),
      };
    case 'place':
      return {
        name: record.properties.name,
        keywords: [record.properties.category, record.properties.rawCategory ?? ''].join(' '),
      };
    case 'condition':
    case 'restriction':
      return {
        name: record.properties.name,
        keywords: [record.properties.authority, record.properties.scope].join(' '),
      };
    case 'observation':
      return {
        name: record.properties.field,
        keywords: [record.properties.assertion, record.properties.rawValue ?? ''].join(' '),
      };
    case 'review':
      return { name: '', keywords: record.properties.body ?? '' };
    case 'check-in':
      return { name: '', keywords: record.properties.occurredAt };
    case 'media-asset':
      return { name: '', keywords: record.properties.mediaType };
  }
}

function sourceDataAsOf(
  records: readonly CanonicalRecord[],
  artifacts: readonly PublicPackArtifact[],
  sourceId: string,
): string | null {
  return (
    [
      ...records
        .filter((record) => record.source.sourceId === sourceId)
        .map((record) => record.sourceUpdatedAt ?? record.retrievedAt),
      ...artifacts
        .filter((artifact) => artifact.sourceId === sourceId)
        .flatMap((artifact) => (artifact.sourceUpdatedAt ? [artifact.sourceUpdatedAt] : [])),
    ].sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null
  );
}

function createCatalog(path: string): DatabaseSync {
  if (!isAbsolute(path)) throw new Error('catalogPath must be absolute');
  if (existsSync(path)) throw new Error('catalogPath already exists');
  const database = new DatabaseSync(path, {
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
    allowExtension: false,
  });
  database.exec(`
    PRAGMA page_size = 4096;
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = FULL;
    PRAGMA auto_vacuum = NONE;
    PRAGMA user_version = 1;
    CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE sources(
      source_id TEXT PRIMARY KEY,
      inventory_json TEXT NOT NULL,
      rights_checksum TEXT NOT NULL
    ) STRICT;
    CREATE TABLE records(
      id TEXT PRIMARY KEY,
      record_type TEXT NOT NULL,
      source_id TEXT NOT NULL REFERENCES sources(source_id),
      source_external_id TEXT NOT NULL,
      source_partition TEXT NOT NULL,
      retrieved_at TEXT NOT NULL,
      source_updated_at TEXT,
      content_checksum TEXT NOT NULL,
      record_json TEXT NOT NULL
    ) STRICT;
    CREATE VIRTUAL TABLE record_bounds USING rtree(rowid, west, east, south, north);
    CREATE VIRTUAL TABLE record_search USING fts5(
      id UNINDEXED,
      name,
      keywords,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TABLE artifacts(
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(source_id),
      kind TEXT NOT NULL,
      locator TEXT NOT NULL,
      content_checksum TEXT NOT NULL,
      byte_length INTEGER NOT NULL,
      artifact_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE coverage(id INTEGER PRIMARY KEY CHECK(id = 1), report_json TEXT NOT NULL) STRICT;
    CREATE TABLE exclusions(
      ordinal INTEGER PRIMARY KEY,
      source_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      subject_kind TEXT NOT NULL,
      reason TEXT NOT NULL,
      detail TEXT NOT NULL
    ) STRICT;
    CREATE TABLE dbom(id INTEGER PRIMARY KEY CHECK(id = 1), document_json TEXT NOT NULL) STRICT;
    CREATE INDEX records_source_type ON records(source_id, record_type);
  `);
  return database;
}

export async function buildPublicPack(input: BuildPublicPackInput): Promise<BuildPublicPackResult> {
  assertProfile(input.profile);
  if (!isAbsolute(input.manifestPath)) throw new Error('manifestPath must be absolute');
  if (existsSync(input.manifestPath)) throw new Error('manifestPath already exists');
  const registrations = new Map(input.sources.map((source) => [source.sourceId, source]));
  if (registrations.size !== input.sources.length) throw new Error('duplicate source registration');
  const sourceProblems = new Map(
    input.sources.map((source) => [
      source.sourceId,
      sourceRightsProblems(source, input.profile.generatedAt),
    ]),
  );
  const deniedSources = [...sourceProblems.entries()].filter(([, problems]) => problems.length > 0);
  if (deniedSources.length > 0) {
    throw new Error(
      `requested public sources failed rights gates: ${deniedSources
        .map(([sourceId, problems]) => `${sourceId}(${problems.join(',')})`)
        .join('; ')}`,
    );
  }
  const exclusions: PublicPackExclusion[] = [];
  const includedRecords: CanonicalRecord[] = [];
  for (const candidate of [...input.records].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    let record: CanonicalRecord;
    try {
      record = validateCanonicalRecord(candidate);
    } catch (error) {
      exclusions.push({
        sourceId: candidate.source.sourceId,
        subjectId: candidate.id,
        subjectKind: candidate.recordType,
        reason: 'record-invalid',
        detail: error instanceof Error ? error.message : 'invalid canonical record',
      });
      continue;
    }
    const registration = registrations.get(record.source.sourceId);
    const rightsProblems = sourceProblems.get(record.source.sourceId);
    let reason: PublicPackExclusionReason | null = null;
    let detail = '';
    if (!registration) {
      reason = 'source-unregistered';
      detail = 'no pack source registration';
    } else if (rightsProblems && rightsProblems.length > 0) {
      reason = 'source-rights-denied';
      detail = rightsProblems.join(',');
    } else if (
      record.classification !== 'public-reference' ||
      record.rights.distribution !== 'public'
    ) {
      reason = 'record-not-public';
      detail = `${record.classification}/${record.rights.distribution}`;
    } else if (!registration.allowedRecordTypes.includes(record.recordType)) {
      reason = 'record-type-not-approved';
      detail = record.recordType;
    } else if (record.validation.state !== 'valid') {
      reason = 'record-invalid';
      detail = record.validation.reasonCodes.join(',');
    } else if (record.tombstone) {
      reason = 'record-tombstoned';
      detail = 'tombstones are not emitted as active records';
    } else if (
      !registration.manifest.rights.attribution.every((item) =>
        record.rights.attribution.includes(item),
      )
    ) {
      reason = 'attribution-incomplete';
      detail = 'canonical record omits required source attribution';
    }
    if (reason) {
      exclusions.push({
        sourceId: record.source.sourceId,
        subjectId: record.id,
        subjectKind: record.recordType,
        reason,
        detail,
      });
    } else {
      includedRecords.push(record);
    }
  }

  const includedArtifacts: PublicPackArtifact[] = [];
  for (const artifact of [...(input.artifacts ?? [])].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const registration = registrations.get(artifact.sourceId);
    const rightsProblems = sourceProblems.get(artifact.sourceId);
    const valid =
      !!registration &&
      rightsProblems?.length === 0 &&
      /^[0-9a-f]{64}$/.test(artifact.contentChecksum) &&
      Number.isSafeInteger(artifact.byteLength) &&
      artifact.byteLength >= 0 &&
      /^https:\/\//.test(artifact.locator) &&
      registration.manifest.allowedHosts.includes(new URL(artifact.locator).hostname) &&
      ['PUBLIC_SYNTHETIC', 'SOURCE_REDISTRIBUTABLE'].includes(artifact.classification);
    if (!valid) {
      exclusions.push({
        sourceId: artifact.sourceId,
        subjectId: artifact.id,
        subjectKind: artifact.kind,
        reason:
          registration && rightsProblems?.length ? 'source-rights-denied' : 'artifact-invalid',
        detail: rightsProblems?.join(',') || 'artifact metadata/checksum is incomplete',
      });
    } else {
      includedArtifacts.push(artifact);
    }
  }

  exclusions.sort(
    (left, right) =>
      left.sourceId.localeCompare(right.sourceId) ||
      left.subjectId.localeCompare(right.subjectId) ||
      left.reason.localeCompare(right.reason),
  );
  const includedSourceIds = new Set([
    ...includedRecords.map((record) => record.source.sourceId),
    ...includedArtifacts.map((artifact) => artifact.sourceId),
  ]);
  const sourceInventory: PublicPackSourceInventory[] = input.sources
    .filter((source) => includedSourceIds.has(source.sourceId))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
    .map((source) => ({
      sourceId: source.sourceId,
      displayName: source.displayName,
      owner: source.owner,
      canonicalUrl: source.canonicalUrl,
      licenseId: source.licenseId,
      termsUrl: source.manifest.rights.termsUrl,
      attribution: [...source.manifest.rights.attribution],
      disclaimer: source.disclaimer,
      rightsPolicyChecksum: checksum(stableJson(source.manifest)),
      recordCount: includedRecords.filter((record) => record.source.sourceId === source.sourceId)
        .length,
      artifactCount: includedArtifacts.filter((artifact) => artifact.sourceId === source.sourceId)
        .length,
      dataAsOf: sourceDataAsOf(includedRecords, includedArtifacts, source.sourceId),
      staleAfterSeconds: source.manifest.requiredFreshnessSeconds,
    }));
  const attribution = [...new Set(sourceInventory.flatMap((source) => source.attribution))].sort();
  const coverageJson = stableJson(input.coverage);
  const exclusionJson = stableJson(exclusions);
  const dbom = {
    schemaVersion: 1,
    catalogFormat: 'sqlite3',
    tables: {
      artifacts: includedArtifacts.length,
      coverage: 1,
      exclusions: exclusions.length,
      records: includedRecords.length,
      recordSearch: includedRecords.length,
      sources: sourceInventory.length,
    },
    sourceIds: sourceInventory.map((source) => source.sourceId),
    recordTypes: Object.fromEntries(
      [...new Set(includedRecords.map((record) => record.recordType))]
        .sort()
        .map((type) => [
          type,
          includedRecords.filter((record) => record.recordType === type).length,
        ]),
    ),
  };
  const dbomJson = stableJson(dbom);
  const rightsPolicySnapshotChecksum = checksum(
    stableJson(sourceInventory.map((source) => [source.sourceId, source.rightsPolicyChecksum])),
  );

  const database = createCatalog(input.catalogPath);
  try {
    database.exec('BEGIN IMMEDIATE');
    const insertMetadata = database.prepare('INSERT INTO metadata(key, value) VALUES (?, ?)');
    const metadata = {
      bundleId: input.profile.bundleId,
      catalogSchemaVersion: input.profile.catalogSchemaVersion,
      classification: 'SOURCE_REDISTRIBUTABLE',
      contentVersion: input.profile.contentVersion,
      dataAsOf: input.profile.dataAsOf,
      formatVersion: PUBLIC_PACK_FORMAT_VERSION,
      generatedAt: input.profile.generatedAt,
      region: input.profile.region,
      rightsPolicySnapshotChecksum,
    };
    Object.entries(metadata)
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([key, value]) =>
        insertMetadata.run(key, typeof value === 'string' ? value : stableJson(value)),
      );
    const insertSource = database.prepare(
      'INSERT INTO sources(source_id, inventory_json, rights_checksum) VALUES (?, ?, ?)',
    );
    sourceInventory.forEach((source) =>
      insertSource.run(source.sourceId, stableJson(source), source.rightsPolicyChecksum),
    );
    const insertRecord = database.prepare(
      'INSERT INTO records(id, record_type, source_id, source_external_id, source_partition, retrieved_at, source_updated_at, content_checksum, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const insertBounds = database.prepare(
      'INSERT INTO record_bounds(rowid, west, east, south, north) VALUES (?, ?, ?, ?, ?)',
    );
    const insertSearch = database.prepare(
      'INSERT INTO record_search(id, name, keywords) VALUES (?, ?, ?)',
    );
    includedRecords.forEach((record, index) => {
      insertRecord.run(
        record.id,
        record.recordType,
        record.source.sourceId,
        record.source.externalId,
        record.source.sourcePartition,
        record.retrievedAt,
        record.sourceUpdatedAt,
        record.contentChecksum,
        stableJson(record),
      );
      const bounds = geometryBounds(record.geometry);
      if (bounds) insertBounds.run(index + 1, bounds[0], bounds[2], bounds[1], bounds[3]);
      const search = recordSearchDocument(record);
      insertSearch.run(record.id, search.name, search.keywords);
    });
    const insertArtifact = database.prepare(
      'INSERT INTO artifacts(id, source_id, kind, locator, content_checksum, byte_length, artifact_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    includedArtifacts.forEach((artifact) =>
      insertArtifact.run(
        artifact.id,
        artifact.sourceId,
        artifact.kind,
        artifact.locator,
        artifact.contentChecksum,
        artifact.byteLength,
        stableJson(artifact),
      ),
    );
    database.prepare('INSERT INTO coverage(id, report_json) VALUES (1, ?)').run(coverageJson);
    const insertExclusion = database.prepare(
      'INSERT INTO exclusions(ordinal, source_id, subject_id, subject_kind, reason, detail) VALUES (?, ?, ?, ?, ?, ?)',
    );
    exclusions.forEach((exclusion, index) =>
      insertExclusion.run(
        index + 1,
        exclusion.sourceId,
        exclusion.subjectId,
        exclusion.subjectKind,
        exclusion.reason,
        exclusion.detail,
      ),
    );
    database.prepare('INSERT INTO dbom(id, document_json) VALUES (1, ?)').run(dbomJson);
    database.exec('COMMIT; VACUUM;');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // The transaction may already be closed by SQLite.
    }
    throw error;
  } finally {
    database.close();
  }

  const catalogBytes = new Uint8Array(await readFile(input.catalogPath));
  if (catalogBytes.byteLength > input.profile.maximumCatalogBytes) {
    await unlink(input.catalogPath);
    throw new Error('public catalog exceeds configured byte limit');
  }
  const catalogChecksum = checksum(catalogBytes);
  const manifest: PublicPackManifest = {
    formatVersion: PUBLIC_PACK_FORMAT_VERSION,
    bundleId: input.profile.bundleId,
    contentVersion: input.profile.contentVersion,
    catalogSchemaVersion: input.profile.catalogSchemaVersion,
    generatedAt: input.profile.generatedAt,
    dataAsOf: input.profile.dataAsOf,
    region: input.profile.region,
    compatibleApp: input.profile.compatibleApp,
    offlineFeatures: [...input.profile.offlineFeatures].sort(),
    classification: 'SOURCE_REDISTRIBUTABLE',
    sources: sourceInventory,
    attribution,
    rightsPolicySnapshotChecksum,
    coverageChecksum: checksum(coverageJson),
    exclusionChecksum: checksum(exclusionJson),
    dbomChecksum: checksum(dbomJson),
    catalogChecksum,
    installedBytes: (await stat(input.catalogPath)).size,
    compressedBytes: catalogBytes.byteLength,
    recordCount: includedRecords.length,
    artifactCount: includedArtifacts.length,
    exclusionCount: exclusions.length,
  };
  const manifestJson = `${stableJson(manifest)}\n`;
  await writeFile(input.manifestPath, manifestJson, { encoding: 'utf8', flag: 'wx' });
  return {
    manifest,
    exclusions,
    catalogChecksum,
    manifestChecksum: checksum(manifestJson),
  };
}

export async function assertReproduciblePublicPacks(
  first: BuildPublicPackResult,
  second: BuildPublicPackResult,
  firstCatalogPath: string,
  secondCatalogPath: string,
): Promise<void> {
  const firstBytes = new Uint8Array(await readFile(firstCatalogPath));
  const secondBytes = new Uint8Array(await readFile(secondCatalogPath));
  if (
    first.catalogChecksum !== second.catalogChecksum ||
    first.manifestChecksum !== second.manifestChecksum ||
    firstBytes.byteLength !== secondBytes.byteLength ||
    !firstBytes.every((value, index) => value === secondBytes[index])
  ) {
    throw new Error('public pack reproduction mismatch');
  }
}

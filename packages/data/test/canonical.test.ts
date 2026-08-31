import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_JSON_SCHEMA,
  CANONICAL_SCHEMA_VERSION,
  CANONICAL_SQL_MIGRATION_001,
  migrateCanonicalCatalog,
  validateCanonicalGeometry,
  validateCanonicalRecord,
  validateCatalogIdRemap,
  type CanonicalGeometry,
  type CanonicalRecord,
} from '../src/index.js';

const ids = {
  land: '10000000-0000-4000-8000-000000000001',
  place: '10000000-0000-4000-8000-000000000002',
  trail: '10000000-0000-4000-8000-000000000003',
  condition: '10000000-0000-4000-8000-000000000004',
  restriction: '10000000-0000-4000-8000-000000000005',
  observation: '10000000-0000-4000-8000-000000000006',
  review: '10000000-0000-4000-8000-000000000007',
  checkIn: '10000000-0000-4000-8000-000000000008',
  media: '10000000-0000-4000-8000-000000000009',
} as const;

const point: CanonicalGeometry = { type: 'Point', coordinates: [-74, 42] };
const line: CanonicalGeometry = {
  type: 'LineString',
  coordinates: [
    [-74, 42],
    [-73.99, 42.01],
  ],
};
const polygon: CanonicalGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [-74, 42],
      [-73.9, 42],
      [-73.9, 42.1],
      [-74, 42.1],
      [-74, 42],
    ],
  ],
};

function record(
  recordType: CanonicalRecord['recordType'],
  id: string,
  properties: unknown,
  geometry: CanonicalGeometry | null,
): CanonicalRecord {
  return {
    schemaVersion: '1.0.0',
    recordType,
    id,
    source: {
      sourceId: 'synthetic-new-york',
      externalId: `${recordType}-1`,
      sourcePartition: 'fixture',
      connectorVersion: '1.0.0',
      parserVersion: '1.0.0',
      normalizerVersion: '1.0.0',
    },
    retrievedAt: '2026-09-01T12:00:00.123Z',
    sourceUpdatedAt: null,
    geometry,
    geometryQuality: geometry
      ? {
          sourceCrs: 'EPSG:4326',
          sourceAxisOrder: 'longitude-latitude',
          coordinatePrecisionMeters: 1,
          flags: [],
          repair: null,
        }
      : null,
    fieldProvenance: {
      name: {
        sourceField: 'NAME',
        sourceValue: recordType,
        observedAt: null,
        transformation: 'trim+nfc@1',
      },
    },
    rights: {
      policyId: 'synthetic-rights-v1',
      distribution: 'public',
      attribution: ['Open Outdoor synthetic fixture'],
    },
    validation: { state: 'valid', reasonCodes: [] },
    contentChecksum: 'a'.repeat(64),
    tombstone: false,
    classification: 'public-reference',
    properties,
  } as unknown as CanonicalRecord;
}

export function canonicalFixtures(): readonly CanonicalRecord[] {
  return [
    record(
      'land-unit',
      ids.land,
      {
        name: 'Synthetic Forest',
        ownership: 'public',
        manager: 'Synthetic Agency',
        areaSquareMeters: 1000,
        baseRule: 'unknown',
      },
      polygon,
    ),
    record(
      'place',
      ids.place,
      {
        name: 'Synthetic Camp',
        category: 'other',
        rawCategory: 'future_category',
        entrances: [[-74, 42]],
        elevation: { meters: 500, verticalDatum: 'orthometric_navd88' },
      },
      point,
    ),
    record(
      'trail',
      ids.trail,
      {
        name: 'Synthetic Trail',
        trailKind: 'route',
        rawTrailKind: null,
        lengthMeters: 1200,
        fingerprint: 'trail-fingerprint-v1',
      },
      line,
    ),
    record(
      'condition',
      ids.condition,
      {
        name: 'Wet trail',
        interval: {
          start: '2026-09-01T00:00:00.000Z',
          end: '2026-10-01T00:00:00.000Z',
          quality: 'known',
        },
        scope: 'trail',
        authority: 'Synthetic Agency',
        relationship: 'independent',
        relatedRecordId: null,
      },
      line,
    ),
    record(
      'restriction',
      ids.restriction,
      {
        name: 'Seasonal closure',
        interval: { start: null, end: null, quality: 'unknown' },
        scope: 'land-unit',
        authority: 'unknown',
        relationship: 'unknown',
        relatedRecordId: null,
      },
      polygon,
    ),
    record(
      'observation',
      ids.observation,
      {
        subjectId: ids.trail,
        field: 'passable',
        assertion: 'unknown',
        rawValue: 'not_inspected',
        observedAt: null,
      },
      point,
    ),
    record(
      'review',
      ids.review,
      { subjectId: ids.place, body: null, rating: null, identityPrecision: 'anonymous' },
      null,
    ),
    record(
      'check-in',
      ids.checkIn,
      {
        subjectId: ids.place,
        occurredAt: '2026-09-01T12:00:00.000Z',
        spatialPrecisionMeters: 1000,
      },
      point,
    ),
    record(
      'media-asset',
      ids.media,
      {
        subjectId: ids.place,
        mediaType: 'image',
        contentUrl: null,
        perceptualHash: 'ffff0000',
      },
      point,
    ),
  ];
}

describe('WP-203 canonical schema and migrations', () => {
  it('validates every canonical entity envelope and round-trips provenance', () => {
    for (const fixture of canonicalFixtures()) {
      const validated = validateCanonicalRecord(fixture);
      expect(validated.fieldProvenance).toEqual(fixture.fieldProvenance);
      expect(validated.source).toEqual(fixture.source);
      expect(validated).not.toBe(fixture);
    }
  });

  it('rejects invalid CRS axes, coordinate ranges, antimeridian edges, and ring orientation', () => {
    expect(() => validateCanonicalGeometry({ type: 'Point', coordinates: [42, 200] })).toThrow(
      /EPSG:4326/,
    );
    expect(() =>
      validateCanonicalGeometry({
        type: 'LineString',
        coordinates: [
          [179, 10],
          [-179, 10],
        ],
      }),
    ).toThrow(/antimeridian/);
    expect(() =>
      validateCanonicalGeometry({
        type: 'Polygon',
        coordinates: [
          [
            [-74, 42],
            [-74, 42.1],
            [-73.9, 42.1],
            [-73.9, 42],
            [-74, 42],
          ],
        ],
      }),
    ).toThrow(/counter-clockwise/);
    expect(() =>
      validateCanonicalGeometry({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [0, 1],
            [1, 0],
            [0, 0],
          ],
        ],
      }),
    ).toThrow(/self-intersection/);
  });

  it('rejects non-UTC time, non-UUID IDs, empty strings, and public rights mismatches', () => {
    const place = canonicalFixtures()[1]!;
    expect(() => validateCanonicalRecord({ ...place, id: 'place-from-name' })).toThrow(/UUIDv4/);
    expect(() =>
      validateCanonicalRecord({ ...place, retrievedAt: '2026-09-01T08:00:00-04:00' }),
    ).toThrow(/RFC 3339 UTC/);
    expect(() =>
      validateCanonicalRecord({ ...place, rights: { ...place.rights, policyId: '' } }),
    ).toThrow(/rights policy.*empty string/);
    expect(() =>
      validateCanonicalRecord({
        ...place,
        rights: { ...place.rights, distribution: 'private-user' },
      }),
    ).toThrow(/public classification/);
    expect(() => validateCanonicalRecord({ ...place, properties: {} })).toThrow(
      /place name and category.*entrances/,
    );
    expect(() =>
      validateCanonicalRecord({
        ...place,
        fieldProvenance: {
          name: {
            ...place.fieldProvenance.name!,
            observedAt: '2026-09-01T08:00:00-04:00',
          },
        },
      }),
    ).toThrow(/invalid field provenance/);
  });

  it('migrates the previous compatible schema without changing IDs or provenance', () => {
    const fixture = canonicalFixtures()[0]!;
    const { schemaVersion: _schemaVersion, ...legacyRecord } = fixture;
    const migrated = migrateCanonicalCatalog({ schemaVersion: '0.9.0', records: [legacyRecord] });
    expect(migrated.schemaVersion).toBe(CANONICAL_SCHEMA_VERSION);
    expect(migrated.records[0]?.id).toBe(fixture.id);
    expect(migrated.records[0]?.fieldProvenance).toEqual(fixture.fieldProvenance);
  });

  it('keeps JSON Schema, TypeScript, and SQL migration versions aligned', () => {
    expect(CANONICAL_JSON_SCHEMA.properties.schemaVersion.const).toBe(CANONICAL_SCHEMA_VERSION);
    expect(CANONICAL_SQL_MIGRATION_001).toContain(`canonical-schema: ${CANONICAL_SCHEMA_VERSION}`);
    expect(CANONICAL_SQL_MIGRATION_001).toContain(
      'UNIQUE(source_id, external_id, source_partition)',
    );
  });

  it('ships JSON Schema and SQL files that validate the canonical fixtures', async () => {
    const schema = JSON.parse(
      await readFile(new URL('../schema/canonical-record.schema.json', import.meta.url), 'utf8'),
    ) as unknown;
    const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
    const validate = ajv.compile(schema);
    for (const fixture of canonicalFixtures()) {
      expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
    }
    const sql = await readFile(new URL('../migrations/001-canonical.sql', import.meta.url), 'utf8');
    expect(sql).toContain(`canonical-schema: ${CANONICAL_SCHEMA_VERSION}`);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS catalog_id_remap');
  });

  it('executes the migration and stages a deterministic 10,000-row spatial fixture', async () => {
    const sql = await readFile(new URL('../migrations/001-canonical.sql', import.meta.url), 'utf8');
    const database = new DatabaseSync(':memory:');
    database.exec(sql);
    const insertRecord = database.prepare(`INSERT INTO canonical_record (
      id, schema_version, record_type, source_id, external_id, source_partition,
      retrieved_at, geometry_geojson, geometry_quality_json, field_provenance_json,
      rights_json, validation_json, properties_json, content_checksum, tombstone, classification
    ) VALUES (?, '1.0.0', 'place', 'scale-fixture', ?, 'grid', ?, ?, '{}', '{}', '{}',
      '{"state":"valid","reasonCodes":[]}', '{}', ?, 0, 'public-reference')`);
    const insertSpatial = database.prepare(
      'INSERT INTO canonical_spatial_index VALUES (?, ?, ?, ?, ?)',
    );
    database.exec('BEGIN');
    for (let index = 0; index < 10_000; index += 1) {
      const longitude = -79 + (index % 100) * 0.01;
      const latitude = 40 + Math.floor(index / 100) * 0.01;
      insertRecord.run(
        `30000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
        `place-${index}`,
        '2026-09-01T00:00:00.000Z',
        JSON.stringify({ type: 'Point', coordinates: [longitude, latitude] }),
        index.toString(16).padStart(64, '0'),
      );
      const rowId = database.prepare('SELECT last_insert_rowid() AS id').get() as { id: number };
      insertSpatial.run(rowId.id, longitude, longitude, latitude, latitude);
    }
    database.exec('COMMIT');
    const result = database
      .prepare(
        `SELECT count(*) AS count FROM canonical_spatial_index
         WHERE min_longitude >= -79 AND max_longitude < -78.90
           AND min_latitude >= 40 AND max_latitude < 40.10`,
      )
      .get() as { count: number };
    expect(result.count).toBe(100);
    database.close();
  });

  it('validates merge, split, and retirement remaps without recycling IDs', () => {
    expect(
      validateCatalogIdRemap({
        fromId: ids.place,
        toIds: [ids.trail],
        reason: 'merge',
        eventId: ids.media,
        recordedAt: '2026-09-01T00:00:00.000Z',
      }).toIds,
    ).toEqual([ids.trail]);
    expect(() =>
      validateCatalogIdRemap({
        fromId: ids.place,
        toIds: [ids.place],
        reason: 'merge',
        eventId: ids.media,
        recordedAt: '2026-09-01T00:00:00.000Z',
      }),
    ).toThrow(/distinct UUIDv4/);
  });
});

-- canonical-schema: 1.0.0
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS canonical_record (
  id TEXT PRIMARY KEY CHECK(length(id) = 36),
  schema_version TEXT NOT NULL CHECK(schema_version = '1.0.0'),
  record_type TEXT NOT NULL CHECK(record_type IN (
    'land-unit', 'place', 'trail', 'condition', 'restriction',
    'observation', 'review', 'check-in', 'media-asset'
  )),
  source_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  source_partition TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  source_updated_at TEXT,
  geometry_geojson TEXT,
  geometry_quality_json TEXT,
  field_provenance_json TEXT NOT NULL,
  rights_json TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  properties_json TEXT NOT NULL,
  content_checksum TEXT NOT NULL CHECK(length(content_checksum) = 64),
  tombstone INTEGER NOT NULL CHECK(tombstone IN (0, 1)),
  classification TEXT NOT NULL CHECK(classification IN (
    'public-reference', 'private-reference', 'private-user'
  )),
  UNIQUE(source_id, external_id, source_partition)
);

CREATE TABLE IF NOT EXISTS catalog_id_remap (
  from_id TEXT NOT NULL,
  to_id TEXT,
  reason TEXT NOT NULL CHECK(reason IN ('merge', 'split', 'retired')),
  event_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(from_id, to_id, event_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS canonical_spatial_index USING rtree(
  record_rowid,
  min_longitude, max_longitude,
  min_latitude, max_latitude
);

CREATE INDEX IF NOT EXISTS canonical_record_type_idx ON canonical_record(record_type);
CREATE INDEX IF NOT EXISTS canonical_source_idx
  ON canonical_record(source_id, source_partition);

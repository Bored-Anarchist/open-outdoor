# Canonical Geospatial Data Specification

**Status:** Accepted semantic baseline; machine-readable schemas are delivered by WP-203

## 1. Coordinate reference and axis order

- Canonical horizontal coordinates use WGS 84, EPSG:4326.
- GeoJSON and canonical coordinate arrays use `[longitude, latitude]` order.
- Longitude range is `[-180, 180]`; latitude is `[-90, 90]`; non-finite coordinates are invalid.
- Source CRS and axis metadata are preserved in provenance before transformation.
- Transformation records the library/version and rejects unknown or ambiguous CRS rather than guessing.
- Geometry crossing the antimeridian is normalized through a versioned rule and must not be represented by an unintended world-spanning edge.

## 2. Vertical reference

- Elevation values use meters.
- Every absolute elevation declares `vertical_datum`: `ellipsoidal_wgs84`, `orthometric_navd88`, another registered datum, or `unknown`.
- Barometric relative altitude is stored separately with a calibration/anchor history and never labelled as an absolute datum.
- Values with incompatible/unknown vertical datums are not blended without an explicit versioned transformation.

## 3. Time

- Instants use RFC 3339/ISO 8601 UTC with `Z` and sufficient subsecond precision for source fidelity.
- Original source timestamp text/offset is retained in provenance where permitted.
- Effective intervals are half-open `[start, end)` unless a source-specific semantic is explicitly recorded.
- Missing end means open-ended, not “unknown”; unknown time uses an explicit quality/status field.
- Operating hours use an IANA time-zone identifier plus structured local rules; UTC conversion does not erase local wall-time semantics.

## 4. Units

Canonical storage uses SI:

- distance/length/elevation: meters;
- area: square meters;
- duration: seconds;
- speed: meters/second;
- temperature: degrees Celsius;
- pressure: pascals;
- angle/bearing: degrees clockwise from true north where applicable.

Source values and units remain in provenance when permitted. Presentation converts units without changing stored canonical values.

## 5. Identifiers

- Canonical IDs are opaque UUIDv4 values generated once and never derived from names/coordinates.
- Private user entities use a separate UUID namespace and never reuse a public canonical ID as their primary key.
- Source identity is `(source_id, external_id, source_partition)` with the exact source string preserved.
- Merges/splits/retirement create immutable audit events and `CatalogIdRemap`; IDs are never silently recycled.
- Promotion links associate, but do not replace, private IDs.

## 6. Null, unknown, and enumeration rules

- `null` means not supplied/not applicable according to the field schema; it does not mean false.
- `unknown` is an explicit domain value when uncertainty is meaningful.
- Boolean source assertions map to `yes`, `no`, or `unknown` plus provenance/observation time.
- Unknown/future source enumeration values are preserved as raw values and mapped to `other`/`unknown` without failing the whole record unless safety requires quarantine.
- Empty string is not a substitute for null/unknown.

## 7. Geometry quality

- Geometry type/cardinality must match the entity field schema.
- Points outside valid coordinate ranges, non-finite coordinates, unclosed rings, self-intersection affecting meaning, invalid ring orientation, and impossible extents are rejected or quarantined under a recorded repair policy.
- Repairs retain original permitted geometry/checksum, operation/version, before/after quality flags, and cannot move a feature beyond a configured source-specific tolerance without review.
- Coordinate precision is recorded; display/storage does not invent survey precision.
- Administrative/context boundaries and surface ownership are distinct typed relationships.

## 8. Common envelope

Every normalized entity-producing record includes:

- schema version and record type;
- source identity and connector/parser/normalizer versions;
- retrieval and source update times;
- canonical candidate geometry and geometry-quality metadata;
- field-level provenance and source value where retention permits;
- license/rights policy reference and allowed distribution class;
- attribution requirements;
- validation/quarantine state and reason codes;
- content checksum and source tombstone/removal state; and
- public/private classification.

Secret values and authentication metadata are never part of an envelope.

## 9. Entity constraints

- `LandUnit`: area/multipolygon geometry; ownership/management are separate; base rule is persisted and effective status is derived.
- `Place`: point or area plus optional typed entrances; related child assets are not duplicates.
- `Trail`: line/multiline canonical geometry and versioned fingerprint; system/route/variant/activity remain distinct.
- `Condition`/`Restriction`: geometry plus temporal interval, scope, authority, and relationship (`revision-of`, `supersedes`, etc.).
- `Observation`: attributable source assertion that cannot overwrite authoritative facts.
- `Review`/`CheckIn`/`MediaAsset`: content/identity retained only at permitted precision/duration/distribution.
- `RecordedActivity`: immutable ordered samples with durable sequence and versioned derived revisions.

## 10. Text and locale

- Text is UTF-8 and normalized to Unicode NFC for comparison while preserving permitted original text.
- Case folding/search normalization is locale-aware and versioned.
- Language uses BCP 47 tags where known.
- Control characters, invalid Unicode, embedded markup, and dangerous URLs are validated/sanitized by field policy; source text is never executed.

## 11. Schema evolution

- Machine-readable JSON Schema/TypeScript/SQL representations share one declared schema version and generated compatibility tests.
- Additive optional fields are backward compatible only when older readers safely ignore them.
- Enum additions require unknown-value behavior.
- Breaking field/geometry/meaning changes increment the major catalog schema and require migration/remap policy.
- An app never opens a catalog outside its declared min/max compatibility range.

## 12. Privacy and rights

- Canonical reference schemas contain no private user notes, favorites, exact user visits, or personal photos.
- Private imports retain source and private classification; validation does not make them public.
- Field-level rights control comparison, retention, display, offline inclusion, export, and public/private distribution independently.

## 13. Acceptance

- Machine-readable schemas encode these constraints.
- CRS/axis, vertical datum, antimeridian, geometry repair, time-zone, units, unknown enums, IDs/remaps, and provenance have deterministic fixtures.
- Every production connector passes schema and round-trip provenance tests before activation.

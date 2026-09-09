# Connector scaffolding, acquisition, and private imports

WP-401 through WP-403 extend the accepted New York land, access/POI, and reviewed-document connector implementations from WP-206 through WP-208. They use the existing SDK manifest, rights decisions, raw artifact store, and connector runner.

## Create a connector

Run `pnpm source create my-source`. The command creates `packages/data/connectors/my-source` with a manifest, typed model, runnable adapter/parser/normalizer, synthetic fixture, contract test, attribution, health definition, and README. Existing destinations and unsafe identifiers are rejected. Run `pnpm exec vitest run packages/data/connectors/my-source/contract.test.ts`. Repository test discovery includes generated connectors automatically.

The generated connector is authorized only to read its own synthetic local fixture. It has no network hosts or secrets. To ingest a real source, review its exact acquisition, field, retention, distribution, and attribution rights; implement its source model and canonical normalization; and add representative authorized fixtures. Passing the generated test does not establish source authorization or production readiness. Pass a `RawArtifactStore` and durable checkpoint callback to `createConnector`.

## Shared acquisition

`AcquisitionSession` enforces the manifest and a per-run policy: allowed content types, payload/run bytes, request/page budget, timeout, and bounded retries. A session is scoped to one run and processes requests sequentially through the adapters. Every request, redirect, and next-page URL is checked against the exact HTTPS host allowlist. Credentials must be supplied by an approved transport port, never persisted in URLs. The transport must honor abort signals and manual redirects; the production default is native `fetch`.

Adapters cover REST pages with a source-specific next-page decoder, pinned bulk locators, ArcGIS object-ID batches, WFS 2.0 GeoJSON/CRS84 pages, RSS/Atom raw feeds, user-selected local bytes, and display-only overlays. XML feed links are never fetched. Overlays expose attribution and offline-use rights and cannot emit queryable entities. Format-specific bulk decoders remain separate: call `inspectBulkArchive` before extracting inventory-checked entries in an isolated decoder. This change does not add native GDAL or archive codecs.

Each page carries a SHA-256, source/version identity, ETag, and last-modified value. `pages` validates the next URL, awaits the sink's atomic `stage`, and only then persists the checkpoint and next locator. The sink must key staging by source/URL/checksum to make replay idempotent: a crash between staging and checkpoint saving replays the same page. Resume REST/WFS from the saved next URL; ArcGIS can rediscover and replay deterministic ID batches. Conditional requests accept only matching source/version/URL checkpoints; a 304 requires an already durable payload. Exhausted retries, page cycles, incomplete GIS pages, wrong content types, and exceeded budgets fail the current run without publishing anything.

## User-selected imports

`importSelectedFile` is a pure parser; `stageSelectedFile` additionally computes a SHA-256 and inserts the complete validated batch through a `PRIVATE_USER` sink. The sink must implement an atomic insert of a new batch, never replace a catalog or existing user database. Both APIs require explicit lawful user selection. Provenance retains the provider, source basename, format, parser version, import timestamp, classification, and acquisition mode. Returned routes are private; provider labels never grant redistribution rights.

| Format | Supported geometry and mapping |
| --- | --- |
| GPX | Track segments, routes, and waypoints; separate segments remain separate routes; names and point timestamps retained |
| GeoJSON | All Point and LineString features in a feature collection, individual features, or bare geometries; other geometry types fail explicitly |
| KML | Placemark Point and LineString geometry, names, and optional altitude validation; network links rejected |
| CSV | Explicit longitude/latitude columns, optional name/time columns, route or place mode; quoted commas/newlines/escaped quotes supported |
| FIT | Position-bearing record messages, little/big endian definitions, developer-field skipping, normal/compressed timestamps, file/header CRC verification |

AllTrails, Garmin, Strava, and iOverlander provider labels apply to files the user lawfully obtains in these supported interchange formats. This is not an account API or a promise that every service currently exports every format. iOverlander CSV imports require explicit column mapping from the selected official export; no proprietary schema is guessed. Use `csvMapping: { longitude: 'Lon', latitude: 'Lat', name: 'Title', geometry: 'places' }` for a file with those headers. Third-party fields not in the reviewed mapping are not imported. Private archives, photos, reviews, and account credentials must never enter public fixtures.

The parsers reject invalid UTF-8, active/entity-bearing XML, malformed nesting, invalid coordinates, bad CSV structure, corrupt FIT, missing selection/provenance, and byte/point budget overruns. KML polygons/gx tracks, KMZ/ZIP account archives, and FIT workout/sensor-only files do not produce routes. The implementation exposes shared APIs; it does not add a native file-picker UI or claim device acceptance.

The FIT reader follows the [Garmin FIT protocol](https://developer.garmin.com/fit/protocol/) and [activity file guidance](https://developer.garmin.com/fit/file-types/activity/). All checked-in test payloads are constructed synthetic examples.

## Verification

`pnpm exec vitest run packages/data/test/source-scaffold.test.ts packages/data/test/acquisition.test.ts packages/import-export/test/selected-import.test.ts` exercises generated code in a temporary directory, all adapter families, retries/checkpoints/security limits, every import format, account mappings, and private staging. `pnpm quality` and `pnpm test:privacy` provide repository-wide regression and public-boundary checks.

## Implementation provenance and validation record

The WP-401–WP-403 implementation and templates are original AI-assisted project code under the repository's Apache-2.0 contribution terms. FIT protocol documentation informed an original decoder; no SDK source, service export, private route, or third-party payload was copied. Fixtures are deterministic literals and the in-test FIT byte generator, classified PUBLIC_SYNTHETIC and permitted for public testing under the project license; source-rights review remains part of PR review.

Local validation on 2026-09-09 used Node 24.19.0 and pnpm 11.20.0: frozen lockfile installation; strict TypeScript build; formatting; release/workflow checks; all 236 tests in 39 files; privacy/public-boundary checks; and the browser production build. New ecosystem acceptance accounts for 50 tests, plus the generated child contract. Physical-device acceptance is not claimed.

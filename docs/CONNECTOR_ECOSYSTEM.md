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

## Permission-gated source shells (WP-404)

`createPermissionShell` covers AllTrails, The Dyrt, iOverlander, POI Factory, and the legacy FreeRoam archive case. Every manifest is disabled, permission-required, deep-link-only, and SOURCE_RESTRICTED, with no hosts, secrets, raw retention, parsing, derivation, offline storage, or distribution rights. Calling a stage directly still fails. Changing a manifest cannot create a fetch implementation: an authorized connector requires separately reviewed code and policy.

`shellCapabilities` distinguishes taxonomy support, shell implementation, implemented acquisition, authorization, and included records. `shellDeepLink` returns a same-origin HTTPS link selected by the user, without fetching it, accepting credentials, or persisting query strings. `mapShellCategory` handles project interchange categories while retaining unknown source values for review; road reports/checkpoints/warnings map to conditions and overnight prohibitions to restrictions. It never turns a category into permission to camp.

The [public iOverlander category legend](https://ioverlander.com/legend) and [export-format information](https://ioverlander.com/subscriptions) were checked on 2026-09-09. Only public category facts informed the mapping; no records, descriptions, reviews, media, or private schemas were collected. The terms endpoint was unavailable during this check, so no new rights authorization is claimed. Lawful selected exports continue through the separate WP-403 private importer.

## Private extension compatibility (WP-405)

`pnpm private:compatibility` validates the explicitly selected OUTDOOR_PRIVATE_ROOT against `config/extension-api.json`. Add `--proposed-core <contract.json>` to verify both current and proposed public contracts against unchanged package pins. Version ranges are stable semantic-version intervals with inclusive `minimum` and exclusive `before`; prerelease and ambiguous ranges are rejected. Canonical schema support and capabilities are negotiated separately.

The version-2 manifest declares extension identity/version, private classification, core/SDK ranges, canonical version, capabilities, secret names, packages, and the private lock path. Each package lock pins its version, every file's SHA-256, source origin, revision, and license/permission reference. The verifier rejects extra/missing/modified files, arbitrary hooks, traversal, links/junctions, overlapping package roots, absent provenance, and exceeded file/byte/depth budgets. It returns verified bytes and never imports or executes a package or reads a secret. A checksum pins bytes; it does not establish that code is safe or licensed. Extension code still requires review and the connector security/rights contract.

The [version-2 synthetic example](../fixtures/private-root-template/v2/README.md) can be copied into an external root to exercise the command. Legacy version-1 composition remains unchanged; no existing manifest is silently migrated. Private locks, real origins, permission references, and outputs remain private. The explicit verifier does not register an extension in the public build.

The downstream workflow template now verifies an exact public-main commit, checks current/proposed extension contracts in runner-temporary private storage, and runs a clean public build with the private-root variable removed. Workflow input is passed as an environment variable, not interpolated into shell code. The template uses no private caches, artifact uploads, secret-bearing pull-request events, or arbitrary package hooks. The separate local Git synchronization test now follows the actual upstream branch and preserves its synthetic private marker.

## Connector operations (WP-406)

`runMonitoredConnector` wraps the existing SDK pipeline and records discovery/fetch/parse/rejection/byte/record counts, required-field coverage, bounded nested schema fingerprints, and volume changes. Pass a source-specific health policy and a record extractor for its normalized batch. The generated connector's health.json and contract now exercise this runner directly.

The runner requires acquisition, derivation, offline-storage, and destination-distribution rights before contact, then defers emit and checkpoints until the complete run passes health checks. Emit is an isolated staging transformation; it must not publish an external catalog. FileConnectorOperationsStore atomically replaces a source's state and last-good output together after syncing the temporary file. Quarantined runs retain the previous output. Source checkpoints run only after that commit; failure produces a checkpoint-failed alert and safe replay. Consumers must keep their staging idempotent. Existing public-pack rights and completeness gates still apply before publication.

The operations store is a single-worker local store. Use a distinct state directory for each boundary; private directories must already exist outside public Git. Private reports and snapshots cannot enter a public store, and `publicConnectorHealth` omits private sources completely. Persisted reports contain reason codes and counts, never raw errors, payload fragments, or locators. Source-derived snapshots retain the manifest's classification.

Repeated failures open a persisted circuit. Diagnose the source and request `recoveryProbe: true` to run it again; this never bypasses rights. Required-field, volume, rejection-rate, and schema failures quarantine the run. To approve an intended schema change, review its report and pass the exact `reviewedSchemaFingerprint`; a general recovery probe alone does not approve schema drift. `inspectConnectorHealth` refreshes stale/right-review alerts from saved state without acquisition or mutation. Reports are returned locally; this change creates no scheduler or external notifications.

`runConnectorFleet` processes independent jobs and isolates thrown source/store failures. Fetch/parse stages retain SDK deadlines, and deferred emit/checkpoints have explicit deadlines too. No monitored connector failure can replace another source's snapshot.

## WP-404–WP-406 validation and provenance

All code, templates, and synthetic fixtures are original AI-assisted project contributions under Apache-2.0. No private package or source account was accessed. Local validation on 2026-09-09 passed all 270 tests in 42 files, including 34 new tests, the generated monitored connector contract, compatibility CLI, copied example, nested drift, persisted circuits, failed source isolation, and last-good recovery. Type, formatting, release/workflow, privacy, downstream-sync, and public-build checks are recorded in the work-package evidence. Production/private-host and physical-device acceptance are not inferred from synthetic tests.

### Automated Phase 4 acceptance

The retired `phase4:acceptance` runner executed the full machine acceptance workflow for WP-401 through WP-406. [The historical runner guide](PHASE_4_GUIDED_ACCEPTANCE.md) describes clean-candidate evidence and reviewer disposition. Its evidence-contract library and decision tests remain original AI-assisted repository contributions using synthetic fixtures and existing dependencies.

# Test and Acceptance Plan

**Status:** In progress; Phase 2 guided runner implemented, RIDB bulk-download migration pending, and live reviewer acceptance blocked until alignment
**Quality principle:** A test environment may only prove capabilities it actually exercises

Numeric limits, reference hardware, repetitions, formulas, and evidence fields are normative in the [non-functional budgets](NON_FUNCTIONAL_BUDGETS.md). A suite row identifies a family; every executable case uses `T-<LEVEL>-NNN-C<two digits>` (for example, `T-PHY-005-C03`) and records its exact case ID in evidence.

## 1. Test levels

| Level | Purpose | Typical environment |
| --- | --- | --- |
| Unit/property | Pure rules, calculations, parsers, scoring invariants, state transitions | Windows/public CI |
| Contract | Adapter, connector, schema, manifest, extension compatibility | Windows/public or private CI with safe fixtures |
| Integration | SQLite migrations, staging, pack build, imports, catalog activation | Windows/macOS/device as appropriate |
| End-to-end | User flows across UI, storage, map, catalog, export | Browser fixture harness and physical iPhone |
| Security/privacy | Malicious input, secret detection, root isolation, publication gates | Isolated public/private CI |
| Physical acceptance | Background tracking, sensors, MapLibre, permissions, accessibility, provisioning | Pinned physical iPhone |
| Release audit | Clean build, rights inventory, SBOM/DBOM, checksums, provenance, artifact reproduction | Clean controlled environment |

## 2. Named test suites

| ID | Suite | Principal assertions |
| --- | --- | --- |
| `T-UNIT-001` | Camping evaluator | Precedence, scope, authority, time, staleness, conflicts, inholdings, designated sites, access separation |
| `T-UNIT-002` | Distance/elevation | Synthetic gain, flat noise, sensor fallback, pause, drift, spikes, revisions, uncertainty |
| `T-UNIT-003` | Entity resolution | Place/trail candidates, precision thresholds, temporal relationships, media/review rules, merge/split reversibility |
| `T-UNIT-004` | Rights decisions | Independent status dimensions, public/private field decisions, retention/attribution/expiry failures |
| `T-INT-001` | Private storage | Migrations, WAL batches, sequence recovery, immutable samples, user/reference write separation |
| `T-INT-002` | Catalog lifecycle | Compatibility, free space, checksum, interruption, activation, rollback, remap/promotion, user retention |
| `T-INT-003` | Connector/canonical path | Discovery through emit, raw boundary, provenance, validation, coverage, independent failure |
| `T-INT-004` | Import/export | Format validation, hostile files, coordinate handling, round trip, endpoint/EXIF privacy, source retention |
| `T-INT-005` | Canonical data contract | EPSG:4326, longitude/latitude order, UTC/time zones, units, null/unknown, IDs, geometry validity, schema evolution |
| `T-INT-006` | Version compatibility and downgrade | Current/previous app-catalog-backup matrices, incompatible older app, intermediate migrator, read-only failure before mutation |
| `T-E2E-001` | Offline explore | Airplane-mode map/search/filter/details, freshness, origin, stale/live feature behavior |
| `T-E2E-002` | Recorder journey | Permission, start/pause/resume/recovery/finish, activity detail, match/new trail, export |
| `T-E2E-003` | Private composition | External root, private downstream compatibility, origin queries, absent extension, publication isolation |
| `T-SEC-001` | Hostile ingestion | Archive bomb/traversal, external entity, corrupt GIS/media, invalid Unicode, injection, resource limits |
| `T-SEC-002` | Public-boundary gate | Secrets, private paths/coordinates, database/media files, undeclared license, logs/caches/artifacts |
| `T-SEC-003` | Private extension and CI boundary | Ephemeral single-job runner, untrusted PR denial, cache/artifact isolation, allowlisted/pinned extensions, least-privilege secrets |
| `T-PHY-001` | Native tracking | Screen lock, suspension, GPS loss, poor sky, airplane/weak cell, checkpoint/relaunch, stop behavior |
| `T-PHY-002` | Energy/thermal (reserved) | Deferred to WP-307/WP-503; no Phase 0/Phase 1 battery acceptance or endurance claim |
| `T-PHY-003` | Native accessibility/field UX | VoiceOver, Dynamic Type, contrast, bold text, motion, touch, dark mode, sunlight/one-handed review |
| `T-PHY-004` | Provisioning/retention | Exact expiry, warnings, sign/install, refresh, same-ID upgrade, container retention |
| `T-PHY-005` | iOS protection and system backup | Protection class by artifact, lock-state active recording, sealed-data denial while locked, backup-exclusion inspection, deletion |
| `T-BAK-001` | Backup/restore | Same/older version, wrong/missing key, tamper, truncate, corrupt attachment, low space, all-or-nothing swap |
| `T-DIA-001` | Local diagnostics | Allow/deny fields, retention cap, coordinate/note/media/secret redaction, explicit export preview, deletion |
| `T-REL-001` | Clean public build | Windows bootstrap, pinned dependencies, no private access, deterministic shared tests, unsigned macOS build |
| `T-REL-002` | Release artifact | Rights/attribution, size, checksum, SBOM/DBOM, coverage, provenance, signature, reproducibility |
| `T-REL-003` | Catalog trust and channel | Missing/invalid/revoked/rotated key, wrong channel, replay, rollback, unsigned-development label, last-known-good retention |
| `T-REL-004` | Contribution privacy and CI efficiency | Public-handle/noreply identity, PR attestation, PII fixture rejection, path skips, superseded-run cancellation, timeouts, minimal matrix, candidate-only expensive jobs, minute report |

WP-205 through WP-210 assign these exact cases:

- `T-UNIT-001-C01`: produce all seven camping statuses with the versioned precedence engine.
- `T-UNIT-001-C02`: exclude private inholdings before public-land rules are considered.
- `T-UNIT-001-C03`: enforce designated-site-only rules and fail safely on unknown membership.
- `T-UNIT-001-C04`: block positive status for stale mandatory or missing safety evidence while retaining known prohibitions.
- `T-UNIT-001-C05`: explain equal-authority conflicts and honor explicit supersession.
- `T-UNIT-001-C06`: keep access status independent from camping eligibility.
- `T-INT-003-C01`: validate every official New York source's active rights, attribution, endpoint, and test-fixture separation.
- `T-INT-003-C02`: normalize public land, private inholdings, roads, access, and POI taxonomy.
- `T-INT-003-C03`: enumerate every ArcGIS object ID, page deterministically, preserve partitions, and emit access/dedup candidates.
- `T-INT-003-C04`: reject incomplete partition sets and report checksummed geometry/source freshness coverage.
- `T-INT-003-C05`: emit rule directives only for exact checksum-pinned human-reviewed documents.
- `T-INT-003-C06`: validate every RIDB, NPS, OSM, and 3DEP registration independently for endpoint, lifecycle, rights, license, attribution, and external-secret declarations; RIDB declares no secret.
- `T-INT-003-C07`: acquire the official daily RIDB JSON download deterministically, enforce a byte ceiling, record the acquisition time and SHA-256 digest, validate its contract, and keep the temporary raw snapshot out of public output.
- `T-INT-003-C08`: normalize NPS restrictions and retain 3DEP bounds, resolution, vertical datum, size, and freshness metadata.
- `T-INT-003-C09`: reject latest/unpinned OSM input and normalize only a dated checksum-matching Geofabrik extract.
- `T-REL-002-C01`: reproduce byte-identical public SQLite catalogs and manifests and audit their inventory, R-tree, coverage, exclusions, and DBOM.
- `T-REL-002-C02`: reject requested sources with revoked/incomplete rights and reject catalog output over its byte ceiling.
- `T-REL-002-C03`: report RIDB/NPS/OSM/3DEP family gaps, source freshness, geometry, and elevation-product coverage.

### 2.1 Phase 2 guided run

`pnpm phase2:acceptance` is the required M3 evidence workflow after its RIDB implementation is aligned with ADR-046. It requires a clean exact candidate, the pinned Node runtime, all Phase 2 data tests and named cases, the public-boundary scan, the official daily RIDB JSON download, and structurally valid samples from the other official registrations. The runner downloads RIDB without authentication and records the snapshot's acquisition time, byte count, and SHA-256 digest; it must not request or read `RIDB_API_KEY`. The only tester-supplied source credential is `NPS_API_KEY`. Offline mode is diagnostic and always blocked. The generated proposal requires separate reviewer acceptance through `config/phase2-gate.json`.

## 3. Required fixtures

### 3.1 Public synthetic fixtures

- Invented New York-like land polygons with inholdings and boundary conflicts.
- Rules covering every camping status, scope, supersession, expiry, and equal-authority conflict.
- Places/trails with labelled duplicate and non-duplicate pairs.
- Temporal closure/condition revisions and recurring seasons.
- Reviews/check-ins/media with invented content and rights variants.
- Deterministic GPX/location/barometer streams for flat, climb, loop, pause, drift, spikes, duplicate batches, and crash recovery.
- Benign and malicious import archives/files.
- Synthetic public/private catalogs with remaps, promotions, incompatible schemas, bad checksums/signatures, revoked/rotated keys, wrong channels, replay versions, and exact space estimates.

Fixtures carry classification, origin/license, generation method, and allowed test destinations. Real private coordinates are never “anonymized” by simply changing names.

### 3.2 Physical fixtures/evidence

- Pinned reference route or controlled outdoor/replay procedure.
- Device/OS/build/battery-health/temperature/radio/brightness metadata.
- Known-elevation climb/reference results.
- Provisioning profile states and same-identity version A/B builds.
- Accessibility scripts for every critical/degraded state.

Physical evidence remains private if it contains routes, device/account identifiers, screenshots, or logs. Public release evidence uses reviewed summaries and redacted/synthetic captures.

## 4. Critical acceptance scenarios

### 4.1 Version A to B retention

1. Install A and create an activity, user trail, association, overlay, note, favorite, and attachment.
2. Prepare B with schema migration, catalog replacement, ID remap, promotion link, and an intentionally unresolved link.
3. Refresh/re-sign/upgrade with the same channel identity.
4. Verify exact provisioning expiry, private record counts/hashes, migration audit, composed queries, duplicate suppression, unresolved review, and catalog integrity.
5. Force catalog activation failure and prove rollback without user-data rollback.

Cases `T-INT-002-C01` through `C08` cover activation boundaries; `T-INT-006-C01` through `C06` cover supported and unsupported app/catalog/backup version combinations.

### 4.2 Interrupted recording

Exercise permission changes, pause/resume, OS suspension, screen lock, process termination, duplicate/out-of-order batches, poor GPS, and relaunch. The saved activity must have an explainable gap/quality state and must not invent distance/elevation.

WP-007 assigns these exact cases:

- `T-PHY-001-C01`: replay contiguous sequenced batches without loss or reordering.
- `T-PHY-001-C02`: produce the same committed order from out-of-order delivery.
- `T-PHY-001-C03`: accept byte-equivalent duplicate sequences idempotently.
- `T-PHY-001-C04`: reject a conflicting duplicate sequence.
- `T-PHY-001-C05`: report missing sequence ranges instead of inventing samples.
- `T-PHY-001-C06`: reject invalid state, timestamp, coordinate, accuracy, or observation sequencing.
- `T-PHY-001-C07`: on the reference iPhone, preserve the declared screen-off batch/durability bound through lock, suspension, weak/absent GPS, and radio changes.
- `T-PHY-001-C08`: on the reference iPhone, terminate and relaunch during an active session with no silent loss or duplicate acceptance.
- `T-PHY-001-C09`: on the reference iPhone, permission loss/recovery and explicit stop leave an explainable state and no unintended sensor session.

Cases C01–C06 are deterministic Windows contract prechecks. They cannot pass C07–C09 or the physical suite by substitution.

T-PHY-002 has no required Phase 0 or Phase 1 cases. It is reserved for WP-307/WP-503, where a representative protocol, repetitions, and numeric limits must be approved before endurance claims or production release. Current tests validate tracker correctness and the 30-minute memory smoke, not battery draw.

### 4.3 Catalog interruption matrix

Interrupt before/after copy, checksum, compatibility, remap validation, transaction commit, active pointer switch, and first-launch confirmation. Each point must retain either the old known-good catalog or the fully validated new catalog.

WP-008 assigns these exact integration cases:

- `T-INT-001-C01`: every store has an explicit protection class and backup-exclusion policy.
- `T-INT-001-C02`: catalog handles expose no writable capability; user storage remains independently writable with WAL.
- `T-INT-002-C01`–`C06`: interrupt before copy, after copy, after checksum, after compatibility, after remap validation, and before pointer switch; retain the old known-good catalog and private digest.
- `T-INT-002-C07`: roll back a switched pointer when first launch is interrupted or fails.
- `T-INT-002-C08`: activate the fully validated catalog without changing private records.
- `T-INT-006-C01`: accept current app/catalog versions.
- `T-INT-006-C02`: accept the previous compatible versions.
- `T-INT-006-C03`–`C04`: reject unsupported app and catalog versions before mutation.
- `T-INT-006-C05`: reserved for WP-107 backup-schema compatibility and not part of WP-008 acceptance.
- `T-INT-006-C06`: reject malformed support state before mutation.

The same preflight enforces the exact combined-catalog ceiling and free-space formula from the non-functional budgets.

### 4.4 Privacy/publication failure

Attempt to publish a private path, exact personal route, SQLite backup, permission-limited source fixture, credential, signing material, and private log through source, cache, test report, and release artifact routes. All paths must fail before public upload.

### 4.5 Rights changes

Change an active source to expired/revoked, remove offline/public permission, shorten retention, or require new attribution. New acquisition/inclusion must stop; lawful retained data follows the updated decision; releases explain exclusions.

### 4.6 iOS protection and system-backup inspection

On the physical reference device, use the Phase-0-only synthetic harness to create an active recording, sealed activity database/WAL/SHM, attachment, public/private catalog, and diagnostic buffer. Verify each filesystem protection class and backup-exclusion attribute, lock the device before first unlock and after unlock where reproducible, confirm active spool continuity and sealed private-data denial, inspect the system backup inventory for absence, and verify the uninstall warning. These are `T-PHY-005-C01` through `C07`; a browser or simulator cannot substitute.

- `T-PHY-005-C01`: active spool and checkpoint use `completeUntilFirstUserAuthentication` and are excluded from system backup.
- `T-PHY-005-C02`: sealed private SQLite main/WAL/SHM use `complete` and are excluded.
- `T-PHY-005-C03`: synthetic attachments, diagnostics, and staging files use their declared classes and are excluded.
- `T-PHY-005-C04`: public/private catalogs retain declared protection and exclusion after copy, rename, and activation.
- `T-PHY-005-C05`: after first unlock, screen-lock recording continues through the active spool while sealed private data remains unavailable.
- `T-PHY-005-C06`: pre-first-unlock behavior after reboot fails safely and is explicitly disclosed.
- `T-PHY-005-C07`: inspected system-backup inventory contains none of the excluded artifacts and uninstall behavior matches the warning.
- `T-PHY-005-C08`: retired from Phase 0 by ADR-041; encrypted restore verification is `T-BAK-001` under WP-107/WP-306.

### 4.7 Private CI and catalog trust

Run synthetic private jobs from a clean ephemeral image, attempt access from an untrusted pull request, and verify separate caches/artifacts/credentials and post-job destruction (`T-SEC-003-C01` through `C06`). Catalog trust uses these exact cases:

- `T-REL-003-C01`: accept a valid channel-bound Ed25519 signature from an independently trusted active key.
- `T-REL-003-C02`: reject a production catalog with a missing signature envelope.
- `T-REL-003-C03`: reject altered manifest bytes and an invalid signature.
- `T-REL-003-C04`: reject the committed wrong-channel fixture.
- `T-REL-003-C05`: reject the committed equal-or-lower anti-replay version fixture.
- `T-REL-003-C06`: reject untrusted and revoked keys.
- `T-REL-003-C07`: accept a provisioned rotation key and reject its revoked predecessor.
- `T-REL-003-C08`: require the exact unsigned-development label locally, reject it in production, and leave the caller's last-known-good version unchanged.

### 4.8 Product boundary and MVP

Inspect the candidate and its user-facing claims to confirm that only iOS is shipped, the browser remains a QA harness, and selected-route display never emits turn instructions, rerouting, or off-route guidance. The Product MVP gate is passed only at M4 when trails, camping evidence, and GPS recording all pass offline together.

### 4.9 Contribution privacy and hosted-minute control

Use synthetic public contribution metadata to verify that legal names, personal email/address/location/phone, device/account identifiers, and unredacted evidence are rejected while a public handle plus privacy-protected commit address and pull-request attestation are accepted. Exercise documentation-only, shared-code, native-iOS, catalog, superseded, and release-candidate changes to prove path filters, concurrency cancellation, timeouts, narrow matrices, and candidate-only expensive jobs. Record requested, executed, skipped, cancelled, and billable minutes by job in `T-REL-004-C01` through `C10`. `T-REL-004-C11` proves that only the first 20 applicable post-start runs count; `C12` proves that an avoidable failure fails that bounded window.

## 5. Elevation acceptance

- Synthetic cumulative gain: within 1 m; sub-threshold oscillations excluded.
- Flat 10 km replay: no more than 25 m false ascent.
- Controlled barometric climb: within greater of 15 m or 10%.
- Representative combined-sensor replay: within greater of 30 m or 10%.
- GPS-only fallback: within greater of 50 m or 20%, visibly lower confidence.

Any threshold change creates a new algorithm/version decision with before/after error and energy evidence.

## 6. Deferred energy acceptance

Measured battery draw, thermal endurance, and multi-hour mode characterization are deferred to WP-307/WP-503. Phase 0 and Phase 1 make no battery-life claim and T-PHY-002 does not block their entrance gates. Energy-conscious implementation constraints remain subject to configuration and source validation; tracker correctness, unintended sessions, stop behavior, and memory remain separate acceptance concerns.

## 7. Accessibility acceptance

The normative standard is [WCAG 2.2 Level AA where applicable plus native iOS acceptance](ACCESSIBILITY_STANDARD.md).

Critical flows include permission, start, pause, resume, finish, save, recovery, catalog failure, private-origin display, offline/stale status, and destructive confirmation. Each must pass:

- VoiceOver names, values, order, and actions;
- Dynamic Type and bold text without hidden critical controls;
- touch target and one-handed reachability review;
- contrast and color-independent semantics in supported appearances;
- reduced motion; and
- physical iPhone review, with browser automation only as supplemental evidence.

## 8. Evidence record

Each accepted suite records:

- test ID and requirement IDs;
- public commit and release configuration hash;
- catalog/fixture versions and checksums;
- environment/device metadata;
- commands/procedure and results;
- redaction/classification;
- failures, waivers prohibited by scope, and residual risk; and
- reviewer and acceptance date.

## 9. Phase and release gates

- Phase gates use the work-package exit criteria and all named tests mapped in the RTM.
- A failing privacy, rights, data-preservation, physical tracking, critical accessibility, or release-integrity test blocks acceptance.
- Flaky tests are treated as failures until root cause and deterministic disposition are recorded.
- Browser/simulator success cannot waive a physical test.
- A release candidate is accepted only at the exact commit/artifact checksum reviewed.
- Product MVP acceptance occurs only at M4/Phase 3 and requires all must-haves in the [product release definition](PRODUCT_RELEASE_DEFINITION.md); no earlier alpha may be relabelled as MVP.

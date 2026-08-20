# Test and Acceptance Plan

**Status:** Proposed  
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
| Physical acceptance | Background tracking, sensors, MapLibre, permissions, accessibility, energy, provisioning | Pinned physical iPhone |
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
| `T-PHY-002` | Energy/thermal | Idle, three modes, periodic map, continuous map, poor GPS, Low Power Mode, four-hour runs |
| `T-PHY-003` | Native accessibility/field UX | VoiceOver, Dynamic Type, contrast, bold text, motion, touch, dark mode, sunlight/one-handed review |
| `T-PHY-004` | Provisioning/retention | Exact expiry, warnings, sign/install, refresh, same-ID upgrade, container retention, backup/reinstall/restore |
| `T-PHY-005` | iOS protection and system backup | Protection class by artifact, lock-state active recording, sealed-data denial while locked, backup-exclusion inspection, deletion |
| `T-BAK-001` | Backup/restore | Same/older version, wrong/missing key, tamper, truncate, corrupt attachment, low space, all-or-nothing swap |
| `T-DIA-001` | Local diagnostics | Allow/deny fields, retention cap, coordinate/note/media/secret redaction, explicit export preview, deletion |
| `T-REL-001` | Clean public build | Windows bootstrap, pinned dependencies, no private access, deterministic shared tests, unsigned macOS build |
| `T-REL-002` | Release artifact | Rights/attribution, size, checksum, SBOM/DBOM, coverage, provenance, signature, reproducibility |
| `T-REL-003` | Catalog trust and channel | Missing/invalid/revoked/rotated key, wrong channel, replay, rollback, unsigned-development label, last-known-good retention |
| `T-REL-004` | Contribution privacy and CI efficiency | Public-handle/noreply identity, PR attestation, PII fixture rejection, path skips, superseded-run cancellation, timeouts, minimal matrix, candidate-only expensive jobs, minute report |

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

Exercise permission changes, pause/resume, OS suspension, screen lock, process termination, duplicate/out-of-order batches, poor GPS, low battery, and relaunch. The saved activity must have an explainable gap/quality state and must not invent distance/elevation.

### 4.3 Catalog interruption matrix

Interrupt before/after copy, checksum, compatibility, remap validation, transaction commit, active pointer switch, and first-launch confirmation. Each point must retain either the old known-good catalog or the fully validated new catalog.

### 4.4 Privacy/publication failure

Attempt to publish a private path, exact personal route, SQLite backup, permission-limited source fixture, credential, signing material, and private log through source, cache, test report, and release artifact routes. All paths must fail before public upload.

### 4.5 Rights changes

Change an active source to expired/revoked, remove offline/public permission, shorten retention, or require new attribution. New acquisition/inclusion must stop; lawful retained data follows the updated decision; releases explain exclusions.

### 4.6 iOS protection and system-backup inspection

On the physical reference device, create an active recording, sealed activity, attachment, public/private catalog, diagnostic buffer, and explicit encrypted backup. Verify each filesystem protection class and backup-exclusion attribute, lock the device before first unlock and after unlock where reproducible, confirm active spool continuity and sealed private-data denial, inspect the system backup inventory for absence, and restore only from the explicit backup. These are `T-PHY-005-C01` through `C08`; a browser or simulator cannot substitute.

### 4.7 Private CI and catalog trust

Run synthetic private jobs from a clean ephemeral image, attempt access from an untrusted pull request, and verify separate caches/artifacts/credentials and post-job destruction (`T-SEC-003-C01` through `C06`). Attempt catalog activation with missing, altered, wrong-channel, replayed, revoked-key, and rotated-key signatures and prove the last known-good catalog remains active (`T-REL-003-C01` through `C08`).

### 4.8 Product boundary and MVP

Inspect the candidate and its user-facing claims to confirm that only iOS is shipped, the browser remains a QA harness, and selected-route display never emits turn instructions, rerouting, or off-route guidance. The Product MVP gate is passed only at M4 when trails, camping evidence, and GPS recording all pass offline together.

### 4.9 Contribution privacy and hosted-minute control

Use synthetic public contribution metadata to verify that legal names, personal email/address/location/phone, device/account identifiers, and unredacted evidence are rejected while a public handle plus privacy-protected commit address and pull-request attestation are accepted. Exercise documentation-only, shared-code, native-iOS, catalog, superseded, and release-candidate changes to prove path filters, concurrency cancellation, timeouts, narrow matrices, and candidate-only expensive jobs. Record requested, executed, skipped, cancelled, and billable minutes by job in `T-REL-004-C01` through `C10`.

## 5. Elevation acceptance

- Synthetic cumulative gain: within 1 m; sub-threshold oscillations excluded.
- Flat 10 km replay: no more than 25 m false ascent.
- Controlled barometric climb: within greater of 15 m or 10%.
- Representative combined-sensor replay: within greater of 30 m or 10%.
- GPS-only fallback: within greater of 50 m or 20%, visibly lower confidence.

Any threshold change creates a new algorithm/version decision with before/after error and energy evidence.

## 6. Energy acceptance

Each mode uses at least three independent four-hour physical runs under the pinned protocol. Provisional release limits are no more than 4 percentage points of battery per hour in Balanced and 3 in Endurance, calculated from normalized start/end state of charge. A candidate also fails for an unexplained regression greater than 10% relative to the accepted native baseline. High Accuracy is characterized and disclosed until a release limit is approved. Every result records the environment and raw samples required by the [non-functional budgets](NON_FUNCTIONAL_BUDGETS.md).

Release-blocking findings include unexplained background wakeups, continuous retries, thermal warning, missed stop, data loss, or a statistically meaningful unapproved regression against the pinned baseline.

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

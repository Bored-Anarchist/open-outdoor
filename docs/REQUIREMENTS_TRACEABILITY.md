# Requirements Traceability Matrix

**Status:** Proposed baseline  
**Rule:** IDs are permanent; implementation changes update this matrix and its change history in the same pull request  
**Metadata date:** 2026-08-19

## 1. Controls and vocabulary

- Priority: `P0` blocks its target milestone or protects safety/privacy/data; `P1` is required for the named release; `P2` is planned but deferrable from an earlier release.
- Status: `proposed`, `accepted`, `in-progress`, `verified`, `blocked`, or `retired` as defined in the [documentation index](README.md).
- Milestone: the first milestone at which the requirement must be verified; maintenance continues afterward.
- Accountable role: the single RACI role that approves completion. An issue additionally names a public project handle/role alias without requiring personal identifying details.
- Verification codes: `U` unit/property, `I` integration/contract, `E` end-to-end, `P` physical iPhone, `R` rights/privacy/security review, and `A` artifact/release audit.
- Case evidence uses `T-<LEVEL>-NNN-C<two digits>` beneath the named suite; a suite reference alone is not sufficient for a completed requirement.

## 2. Product requirements

| ID | Requirement | Priority | Status | Milestone | Accountable role | Scope | Work packages | Verification | Changed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `REQ-MVP-001` | Product MVP is the M4/Phase 3 offline combination of trails, camping evidence, and GPS recording; earlier recorder/data milestones are alphas | P0 | proposed | M4 | Product owner | 22, 24 | WP-301–WP-307 | T-E2E-001, T-E2E-002, release/MVP audit (`E`,`P`,`A`) | 2026-08-19 |
| `REQ-MAP-001` | Browse the bundled basemap, land, trails, camping, services, and POIs offline | P0 | proposed | M4 | Product owner | 5, 9 | WP-108, WP-301, WP-304 | T-E2E-001 (`E`,`P`) | 2026-08-19 |
| `REQ-MAP-002` | Local text/spatial search and filters operate without a network | P0 | proposed | M4 | Product owner | 9 | WP-304 | T-E2E-001 (`E`,`P`) | 2026-08-19 |
| `REQ-MAP-003` | Map and non-map details show provenance, origin, coverage, freshness, closures, and uncertainty | P0 | proposed | M4 | Product owner | 5, 9, 20 | WP-304, WP-305, WP-501 | T-E2E-001, T-PHY-003 | 2026-08-19 |
| `REQ-CAMP-001` | Derive the seven defined camping statuses through deterministic precedence | P0 | proposed | M3 | Data/safety owner | 5, 12.2 | WP-205 | T-UNIT-001 (`U`) | 2026-08-19 |
| `REQ-CAMP-002` | Never infer camping legality from ownership alone and exclude inholdings | P0 | proposed | M3 | Data/safety owner | 10.6, 12.1 | WP-205, WP-206, WP-208 | T-UNIT-001, T-INT-003 | 2026-08-19 |
| `REQ-CAMP-003` | Evaluate camping access separately from site eligibility | P0 | proposed | M3 | Data/safety owner | 10.6, 12.2 | WP-205, WP-207, WP-208 | T-UNIT-001, T-E2E-001 | 2026-08-19 |
| `REQ-CAMP-004` | Stale or missing mandatory safety evidence blocks positive status and exposes the reason | P0 | proposed | M3 | Data/safety owner | 12.2 | WP-205, WP-208 | T-UNIT-001, T-E2E-001 | 2026-08-19 |
| `REQ-TRL-001` | Discover and view reference trails with geometry, statistics, restrictions, and provenance | P0 | proposed | M4 | Product owner | 5, 12.1 | WP-207, WP-304 | T-INT-003, T-E2E-001 | 2026-08-19 |
| `REQ-TRL-002` | Match a completed activity or create/edit a reusable private `UserTrail` | P1 | proposed | M2 | iOS/tracking owner | 13.2 | WP-102, WP-105 | T-E2E-002 (`E`,`P`) | 2026-08-19 |
| `REQ-POI-001` | Support the defined camping, service, amenity, condition, and restriction taxonomy | P1 | proposed | M3 | Data/safety owner | 5, 12.1 | WP-203, WP-207 | T-INT-003 (`I`) | 2026-08-19 |
| `REQ-TRK-001` | Start, pause, resume, finish, checkpoint, and recover an offline activity through an explicit state machine | P0 | proposed | M2 | iOS/tracking owner | 13 | WP-103, WP-105 | T-E2E-002, T-PHY-001 | 2026-08-19 |
| `REQ-TRK-002` | Background sensors operate only during explicit active recording and stop afterward | P0 | proposed | M2 | iOS/tracking owner | 13, 14 | WP-103 | T-PHY-001 (`P`) | 2026-08-19 |
| `REQ-TRK-003` | Preserve immutable observations and versioned distance/elevation revisions | P0 | proposed | M2 | iOS/tracking owner | 12.1, 13.1 | WP-102, WP-104 | T-UNIT-002, T-INT-001 | 2026-08-19 |
| `REQ-TRK-004` | Provide Balanced, Endurance, and explicit High Accuracy modes with explainable changes | P1 | proposed | M2 | iOS/tracking owner | 14 | WP-103, WP-105 | T-PHY-002 (`P`) | 2026-08-19 |
| `REQ-USR-001` | Store activities, user trails/places, favorites, notes, photos, settings, and overlays privately | P0 | proposed | M2 | Privacy/rights owner | 5, 8, 12 | WP-102, WP-105 | T-INT-001 (`I`) | 2026-08-19 |
| `REQ-USR-002` | Catalog updates or removal never delete or rewrite private user records | P0 | proposed | M1 | Storage/backup owner | 8.1 | WP-008, WP-303, WP-305 | T-INT-002 (`I`,`P`) | 2026-08-19 |
| `REQ-IMP-001` | Import supported user-selected GPX/GeoJSON/KML/CSV/FIT files where applicable | P2 | proposed | M5 | Product owner | 5, 10.4 | WP-106, WP-403 | T-INT-004 (`I`) | 2026-08-19 |
| `REQ-EXP-001` | Explicit GPX/GeoJSON/share export supports endpoint and metadata privacy controls | P1 | proposed | M2 | Privacy/rights owner | 5, 13.2, 18 | WP-106 | T-INT-004, T-E2E-002 | 2026-08-19 |
| `REQ-BAK-001` | Encrypted backup and all-or-nothing restore preserve private data across reinstall | P0 | proposed | M4 | Storage/backup owner | 18 | WP-107, WP-306 | T-BAK-001 (`I`,`P`) | 2026-08-19 |

## 3. Catalog, connector, and source requirements

| ID | Requirement | Priority | Status | Milestone | Accountable role | Scope | Work packages | Verification | Changed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `REQ-DAT-001` | Every boundary follows the canonical CRS, axis, time, unit, ID, null/unknown, geometry, provenance, and evolution contract | P0 | proposed | M3 | Architecture owner | 12 | WP-201, WP-203 | T-INT-005 (`U`,`I`) | 2026-08-19 |
| `REQ-CAT-001` | Writable user data and read-only public/private catalogs use separate database files and write capabilities | P0 | proposed | M1 | Storage/backup owner | 7, 8 | WP-008, WP-102 | T-INT-001 | 2026-08-19 |
| `REQ-CAT-002` | Every catalog has a versioned manifest, checksum, app compatibility interval, classification, rights, size, and provenance | P0 | proposed | M3 | Data/safety owner | 8, 9 | WP-209, WP-302 | T-INT-002, T-REL-002 | 2026-08-19 |
| `REQ-CAT-003` | Public/private/user query composition retains explicit record origin and rights | P0 | proposed | M4 | Storage/backup owner | 8 | WP-305 | T-E2E-003 | 2026-08-19 |
| `REQ-CAT-004` | Private corrections, remaps, and promotion links are transactional and non-destructive | P0 | proposed | M4 | Storage/backup owner | 8.1 | WP-008, WP-303, WP-305 | T-INT-002 | 2026-08-19 |
| `REQ-CAT-005` | The combined public/private 3 GiB ceiling and exact free-space formula are enforced before staging | P0 | proposed | M4 | Data/safety owner | 9 | WP-008, WP-302, WP-303 | T-INT-002, T-REL-002 | 2026-08-19 |
| `REQ-CAT-006` | Production catalog activation requires a valid channel-bound signature, trusted non-revoked key, and non-replayed version | P0 | in-progress | M1 | Release/build owner | 8, 17, 19 | WP-010, WP-303, WP-504 | T-REL-003 (`I`,`A`) | 2026-08-21 |
| `REQ-CAT-007` | Catalog staging, pointer activation, first-launch confirmation, and rollback are interruption-safe and do not roll back private data | P0 | proposed | M4 | Storage/backup owner | 8, 9 | WP-008, WP-303 | T-INT-002 (`I`,`P`) | 2026-08-19 |
| `REQ-CFG-002` | Production supports current plus one previous compatible major app/catalog/backup schema and rejects unsafe downgrade before mutation | P0 | proposed | M1 | Storage/backup owner | 8, 18, 19 | WP-008, WP-107, WP-303 | T-INT-006, T-BAK-001 | 2026-08-19 |
| `REQ-SRC-001` | Each source is an isolated versioned connector implementing applicable common stages | P0 | proposed | M3 | Data/safety owner | 11 | WP-201, WP-401, WP-402 | T-INT-003 | 2026-08-19 |
| `REQ-SRC-002` | Independent lifecycle, authorization, acquisition, class, rights, and distribution fields gate processing | P0 | proposed | M3 | Privacy/rights owner | 10.1 | WP-201 | T-UNIT-004, T-INT-003 | 2026-08-19 |
| `REQ-SRC-003` | Raw retention, parser limits, quarantine, and secret redaction protect ingestion | P0 | proposed | M3 | Security owner | 11.1–11.2 | WP-202 | T-SEC-001 | 2026-08-19 |
| `REQ-SRC-004` | Canonical processing preserves field provenance and reversible entity decisions | P0 | proposed | M3 | Data/safety owner | 12.3 | WP-203, WP-204 | T-UNIT-003 | 2026-08-19 |
| `REQ-SRC-005` | Initial New York build reports geometry, rule, access, POI, freshness, and status coverage separately | P0 | proposed | M3 | Product owner | 10.6 | WP-206–WP-210 | T-REL-002 | 2026-08-19 |
| `REQ-SRC-006` | iOverlander is limited to taxonomy/deep links/lawful user-selected private export import unless written permission changes | P0 | proposed | M5 | Privacy/rights owner | 10.5 | WP-403, WP-404 | T-UNIT-004, T-SEC-002 | 2026-08-19 |

## 4. Privacy, security, and open-source requirements

| ID | Requirement | Priority | Status | Milestone | Accountable role | Scope | Work packages | Verification | Changed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `REQ-PRV-001` | Personal, restricted, secret, and operational-private data never enter public GitHub, CI, or releases | P0 | in-progress | M1 | Privacy/rights owner | 6 | WP-003 | T-SEC-002 (`R`,`A`) | 2026-08-19 |
| `REQ-PRV-002` | A Windows private root resolves outside the public checkout and is always explicit | P0 | in-progress | M1 | Architecture owner | 6.2 | WP-004 | T-E2E-003 | 2026-08-19 |
| `REQ-PRV-003` | Private downstream sync uses a private repository and never a public fork or public workflow carrying private payloads | P0 | in-progress | M1 | Architecture owner | 6.3 | WP-005, WP-405 | T-E2E-003, T-SEC-003 | 2026-08-19 |
| `REQ-PRV-004` | Secrets and signing/recovery keys remain outside Git, including private Git | P0 | in-progress | M1 | Security owner | 6, 18, 19 | WP-003, WP-006, WP-107 | T-SEC-002 | 2026-08-19 |
| `REQ-PRV-005` | Removing private extensions leaves a complete passing public build | P0 | in-progress | M1 | Architecture owner | 6.4 | WP-004, WP-405 | T-E2E-003 | 2026-08-19 |
| `REQ-PRV-006` | No private record is automatically promoted to a public catalog | P0 | proposed | M4 | Privacy/rights owner | 8.1, 18 | WP-305 | T-E2E-003, T-SEC-002 | 2026-08-19 |
| `REQ-PRV-007` | Only data whose policy permits indefinite versioned retention may enter private Git; expiring/revocable/deletion-bound data remains external | P0 | in-progress | M1 | Privacy/rights owner | 6.3, 18 | WP-003, WP-005 | T-SEC-002, T-SEC-003 | 2026-08-19 |
| `REQ-IOS-002` | Active spool, sealed database, attachments, catalogs, diagnostics, and backups use the declared iOS protection class | P0 | proposed | M1 | iOS/tracking owner | 8, 15, 18 | WP-007, WP-008 | T-PHY-005 (`P`) | 2026-08-19 |
| `REQ-IOS-003` | Private state and regenerable catalogs are excluded from implicit iOS system backup; supported recovery uses explicit encrypted backup | P0 | proposed | M1 | iOS/tracking owner | 8, 18 | WP-008, WP-107 | T-PHY-005, T-BAK-001 | 2026-08-19 |
| `REQ-DIA-001` | Diagnostics remain local, bounded, short-lived, redacted, user-previewed, and explicitly exported | P0 | in-progress | M1 | Privacy/rights owner | 18 | WP-003 | T-DIA-001 (`I`,`R`) | 2026-08-19 |
| `REQ-SEC-001` | Inputs are untrusted and bounded against traversal, bombs, entities, injection, and resource exhaustion | P0 | proposed | M3 | Security owner | 11.2 | WP-202 | T-SEC-001 | 2026-08-19 |
| `REQ-SEC-002` | Private CI uses ephemeral isolated jobs, no untrusted privileged head execution, separate caches/artifacts, and least-privilege credentials | P0 | in-progress | M1 | Security owner | 6.3, 17 | WP-005 | T-SEC-003 (`E`,`R`) | 2026-08-19 |
| `REQ-OSS-001` | Public project uses Apache-2.0, account-bound contribution attestation, governance/conduct/security files, and separate third-party notices | P0 | in-progress | M1 | Project owner | 16 | WP-001 | T-REL-001 (`A`) | 2026-08-19 |
| `REQ-OSS-002` | Public CI uses least privilege, immutable action pins, no untrusted release secrets, and public-safe inputs | P0 | in-progress | M1 | Release/build owner | 17 | WP-001, WP-003, WP-504 | T-SEC-002, T-REL-002 | 2026-08-19 |
| `REQ-OSS-003` | Public contributions, metadata, fixtures, and evidence require no legal name, personal contact/address/location, device/account identifier, or other unnecessary identifying detail | P0 | in-progress | M1 | Privacy/rights owner | 16–18 | WP-001, WP-003 | T-SEC-002, T-REL-004 (`R`,`A`) | 2026-08-19 |

## 5. Quality, platform, and management requirements

| ID | Requirement | Priority | Status | Milestone | Accountable role | Scope | Work packages | Verification | Changed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `REQ-PLT-001` | The initial consumer product ships only on iOS; browser code is a QA harness and Android delivery requires change control | P0 | in-progress | M1 | Product owner | 4, 22 | WP-002, WP-006 | T-REL-001, product-boundary audit | 2026-08-19 |
| `REQ-PLT-002` | Initial route display provides no turn-by-turn instruction, rerouting, or off-route guidance | P0 | proposed | M2 | Product owner | 5, 22 | WP-101, WP-105, WP-304 | T-E2E-001, T-E2E-002, product-boundary audit | 2026-08-19 |
| `REQ-OFF-001` | Each release declares and passes its offline capability matrix | P0 | proposed | M4 | Quality/accessibility owner | 9 | WP-304, WP-307 | T-E2E-001 | 2026-08-19 |
| `REQ-NFR-001` | Launch, query, map, recording durability, activation, storage, memory, accuracy, and energy pass the normative budgets | P0 | proposed | M1 | Quality/accessibility owner | 9, 14, 20 | WP-007, WP-008, WP-009, WP-307, WP-503 | Relevant budget case IDs (`I`,`P`,`A`) | 2026-08-19 |
| `REQ-ENE-001` | Energy limits use at least three four-hour physical runs per mode and unexplained thermal/wakeup or greater-than-10% regression blocks release | P0 | proposed | M2 | iOS/tracking owner | 14 | WP-007, WP-109, WP-307, WP-503 | T-PHY-002 | 2026-08-19 |
| `REQ-A11Y-001` | Critical flows meet WCAG 2.2 AA where applicable and native iOS VoiceOver, Dynamic Type, contrast, 44-point target, reduced-motion, and non-map alternative acceptance | P0 | proposed | M2 | Quality/accessibility owner | 20 | WP-105, WP-109, WP-502 | T-PHY-003 | 2026-08-19 |
| `REQ-DEV-001` | Shared development/build/test works on Windows from pinned public dependencies | P0 | in-progress | M1 | Release/build owner | 4, 15, 19 | WP-002 | T-REL-001 | 2026-08-19 |
| `REQ-IOS-001` | Native background/sensor/map/accessibility/provisioning/energy acceptance uses a physical iPhone | P0 | in-progress | M1 | iOS/tracking owner | 15, 19 | WP-006, WP-007, WP-109 | T-PHY-001–T-PHY-005 | 2026-08-19 |
| `REQ-CFG-001` | Release configuration pins JS/native/Python/GIS/iOS tools, identity, regions, schemas, trust, and budgets | P0 | in-progress | M1 | Release/build owner | 19.1 | WP-002, WP-010, WP-504 | T-REL-001, T-REL-002 | 2026-08-19 |
| `REQ-CI-001` | Hosted CI minimizes minutes with local-first checks, path filters, superseded-run cancellation, timeouts, fail-fast narrow matrices, no routine schedule, and candidate-only expensive jobs | P0 | in-progress | M1 | Release/build owner | 17, 23 | WP-001, WP-002, WP-006 | T-REL-001, T-REL-004 (`A`) | 2026-08-19 |
| `REQ-REL-001` | Release artifacts are traceable, signed/checksummed, rights-filtered, and reproducible from a protected commit | P0 | proposed | M4 | Release/build owner | 17 | WP-010, WP-302, WP-504, WP-506 | T-REL-002, T-REL-003 | 2026-08-19 |
| `REQ-UX-001` | Explore, Search, Track, Saved, and all field/degraded/private-origin states are complete | P1 | proposed | M4 | Product owner | 20 | WP-105, WP-304, WP-501 | T-E2E-001, T-PHY-003 | 2026-08-19 |
| `REQ-PMO-001` | Every active package has one accountable role and public handle/role alias, consulted roles, capacity, required hardware, and approved cost source | P0 | proposed | M0 | Project owner | 23 | All active work packages | Planning and phase-gate audit (`A`) | 2026-08-19 |

## 6. Traceability maintenance

- A pull request implementing a requirement links its requirement, work-package, risk, ADR, and exact test-case IDs.
- Test names and evidence manifests include the case ID, requirement IDs, commit, release-configuration hash, fixtures, environment/device, and reviewer.
- Moving status to `verified` requires accepted evidence at the named milestone; code completion alone is `in-progress`.
- A failed or retired requirement is never deleted; its status, rationale, and replacement remain in history.
- Scope additions require priority, accountable role/individual, work package, case-level test method, risk review, milestone, and change-history entry before implementation.

## 7. Change history

| Date | Change | Requirements affected | Approved by |
| --- | --- | --- | --- |
| 2026-08-19 | Established metadata columns and split high-risk camping/catalog obligations | All; REQ-CAMP-002–004, REQ-CAT-002, REQ-CAT-005, REQ-CAT-007 | Pending planning-baseline approval |
| 2026-08-19 | Added MVP/platform boundary, iOS protection/backup, catalog trust/compatibility, canonical data, diagnostics, private CI/Git retention, NFR, and resource accountability | REQ-MVP-001, REQ-DAT-001, REQ-CAT-006, REQ-CFG-002, REQ-PRV-007, REQ-IOS-002–003, REQ-DIA-001, REQ-SEC-002, REQ-PLT-001–002, REQ-NFR-001, REQ-PMO-001 | Pending planning-baseline approval |
| 2026-08-19 | Replaced public DCO identity exposure with account-bound attestation and added PII-free contribution plus hosted-CI minute controls | REQ-OSS-001, REQ-OSS-003, REQ-CI-001 | User-approved policy |
| 2026-08-19 | Began WP-001 implementation: added privacy-safe contribution intake, immutable-pinned least-privilege governance CI, protected-branch configuration, activation procedure, and evidence record | REQ-OSS-001–003, REQ-CI-001 | Repository-owner implementation request; acceptance pending |
| 2026-08-21 | Implemented the WP-010 signature envelope, external channel-trust contract, replay/revocation controls, unsigned-development label, fixtures, and T-REL-003-C01–C08 | REQ-CAT-006, REQ-CFG-001; foundation for REQ-REL-001 | Repository-owner implementation request; protected-CI acceptance pending |

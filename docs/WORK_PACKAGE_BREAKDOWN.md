# Work-Package Breakdown

**Status:** Proposed  
**Source:** [Consolidated project scope](../PROJECT_SCOPE.md)  
**Sizing:** `S` (days), `M` (roughly 1–2 focused weeks), `L` (multi-week), `XL` (must be split during planning)

## 1. Execution rules

- A work package starts only when its listed dependencies and entry conditions are satisfied.
- Each package produces code/configuration, automated tests, documentation, and reviewable evidence where applicable.
- Work packages involving private data use synthetic fixtures in the public repository.
- Physical-device, privacy, rights, migration, and release gates cannot be waived by a browser-only test.
- `XL` packages must be decomposed into pull-request-sized tasks before implementation.
- Phase exit is based on evidence, not completion percentage.

## 2. Workstream map

| Workstream | Scope | Primary phases |
| --- | --- | --- |
| Foundation | Governance, repository, toolchain, CI, configuration | 0–5 |
| Privacy and rights | Classification, private roots, source manifests, publication gates | 0–5 |
| Mobile and tracking | App shell, native service, recording, elevation, field UX | 0–5 |
| Data platform | Connectors, canonical model, entity resolution, catalogs | 0–4 |
| Offline mapping | Basemap, search, bundle activation, map experience | 1–5 |
| Quality and release | Automated/physical tests, accessibility, energy, signing, provenance | 0–5 |

Accountability, consulted roles, hardware profiles, and cost ownership are defined in the [resource and RACI plan](RESOURCE_AND_RACI_PLAN.md). Numeric acceptance limits are controlled by the [non-functional budgets](NON_FUNCTIONAL_BUDGETS.md).

## 3. Phase 0 — foundation and feasibility

| ID | Work package | Size | Depends on | Required outputs | Acceptance summary |
| --- | --- | --- | --- | --- | --- |
| `WP-001` | Public repository governance | M | — | License/notice, third-party notices, governance, contribution, conduct, security policy, account-bound contribution attestation, privacy-safe issue/PR templates, branch rules | Clean public clone; required files reviewed; contribution requires no personal identifying details; no proprietary-public contradiction |
| `WP-002` | Toolchain and monorepo bootstrap | L | ADR-012–ADR-015, ADR-036 | Pinned release config, lockfiles, mobile/shared/data packages, Windows scripts, CI skeleton with path filters/cancellation/timeouts/minimal matrices | Windows bootstrap/shared tests are deterministic; irrelevant and superseded hosted jobs do not consume avoidable minutes |
| `WP-003` | Privacy classification, diagnostics, and leak gates | L | WP-001 | Classification schema, secret/private path checks, fixture approval metadata, artifact scanner, incident procedure, local diagnostics/redaction contract | Deliberate secret/private-location fixtures and prohibited diagnostic fields are blocked before publication |
| `WP-004` | External private-root composition spike | M | WP-002, WP-003 | Root validation, private manifest discovery, synthetic private connector/pack | Private output stays outside public checkout; removing private root leaves a passing public build |
| `WP-005` | Private downstream workflow spike | M | WP-001, WP-003 | Upstream remote guide, ephemeral isolated private CI boundary, compatibility check | Public update can be incorporated without sending private content to public systems or shared caches/runners |
| `WP-006` | iOS build and Windows sideload feasibility | L | WP-002 | Accepted ADR-037, pinned macOS build, unsigned artifact, Windows sign/install/refresh instructions, channel identity | Physical iPhone launch, exact provisioning expiry, refresh, and relaunch pass |
| `WP-007` | Minimal native tracker and durability spike | L | WP-006 | Swift tracker spike, protected active spool, location/altimeter batches, deterministic replay, energy-conscious modes | Background screen-lock collection, recovery, stop behavior, protection class, and 30-minute memory smoke pass |
| `WP-008` | Private/reference database, protection, and compatibility spike | L | WP-002, WP-006 | Accepted ADR-017/ADR-018/ADR-041, separate protected SQLite stores, system-backup exclusion inspection, synthetic A→B app/schema/catalog fixture, remap/promotion/rollback diagnostics | Private records survive refresh/upgrade; app/catalog downgrade fails before mutation; catalogs never cross-write user DB; encrypted restore remains WP-107/WP-306 |
| `WP-009` | Phase 0 evidence and budget review | S | WP-001–WP-008, WP-010 | Evidence index, risk updates, decision closures, measured budget and hosted-minute usage report, bounded CI clean-window ledger, gate report | Every Phase 0 criterion and Phase 1 prerequisite budget passes; the 20-run CI window is clean or Phase 1 remains blocked |
| `WP-010` | Catalog trust and production-signing foundation | M | WP-001, WP-002 | Manifest signature envelope, channel trust roots, key/revocation procedure, replay/wrong-channel fixtures, unsigned-development labeling | Production catalog rejects missing/invalid/untrusted/wrong-channel signatures; private trust roots remain private |

### Phase 0 exit gate

- A clean public clone builds/tests on Windows without private access.
- Both private composition modes pass using synthetic data.
- Leak and source-rights gates fail closed.
- Physical iPhone signing, background tracking, refresh, and data retention pass.
- iOS file-protection classes and system-backup exclusions pass inspection, and the uninstall warning is verified; encrypted restore remains a later gate.
- Catalog activation/remap/rollback preserves private data; trust, replay, channel, and downgrade cases fail closed.
- Initial artifact size, activation time, launch, query, memory, and accuracy budgets pass the declared Phase 1 prerequisites; measured energy acceptance is deferred to WP-307/WP-503.

## 4. Phase 1 — recorder and private-data vertical slice

| ID | Work package | Size | Depends on | Required outputs | Acceptance summary |
| --- | --- | --- | --- | --- | --- |
| `WP-101` | Shared application shell and adapters | L | WP-009 | Application shell, selected-route display, `TrackerAdapter`, `SensorAdapter`, `MapAdapter`, storage ports | Browser fixture implementations pass; native capabilities remain explicitly gated; no turn-by-turn behavior exists |
| `WP-102` | Private activity/user-trail schema | L | WP-008 | Migrations, repositories, immutable samples, user trails, associations, overlays | Migration/recovery/property tests pass without a reference-catalog write |
| `WP-103` | Production native tracking bridge | XL | WP-007, WP-101, WP-102 | Start/pause/resume/finish, recovery checkpoints, native batches, state machine | Screen-lock, suspension, duplicate batch, crash, and GPS-loss tests pass |
| `WP-104` | Distance and elevation engine | L | WP-102, WP-103 | Versioned algorithms, barometer/GPS fusion, revisions, uncertainty | Defined synthetic, replay, and physical thresholds pass |
| `WP-105` | Recorder and activity-library UX | L | WP-101–WP-104 | Recording screen, recovery, library/detail, user-trail creation/editing | Critical controls pass accessibility and destructive-action tests |
| `WP-106` | Import/export and privacy trimming | L | WP-102, WP-105 | GPX/GeoJSON import/export baseline, endpoint trimming, EXIF option | Hostile input, round-trip, and privacy-default tests pass |
| `WP-107` | Encrypted backup/restore foundation | L | WP-102 | Versioned encrypted container, staging restore, key flow, corruption fixtures | Wrong-key/tamper/truncation never partially mutates private data |
| `WP-108` | Fixture-backed offline map shell | M | WP-101 | Local style/assets, synthetic trail/POI/catalog, active route overlay | Explore and active recording work without network |
| `WP-109` | Phase 1 physical/accessibility gate | L | WP-103–WP-108 | Tracker correctness and 30-minute memory smoke, VoiceOver/Dynamic Type evidence, elevation evidence | Current Phase 1 acceptance matrix passes on reference device; measured energy remains deferred |

## 5. Phase 2 — connector framework and New York authoritative data

| ID | Work package | Size | Depends on | Required outputs | Acceptance summary |
| --- | --- | --- | --- | --- | --- |
| `WP-201` | Connector SDK and manifest schema | L | WP-002, WP-003 | Lifecycle/auth/acquisition/right enums, connector stages, fixture contract | Synthetic connectors pass contract and rights tests |
| `WP-202` | Ingestion security and raw boundary | L | WP-201 | Isolated tasks, archive/parser limits, secret redaction, quarantine | Malicious fixture suite passes; public/private roots remain isolated |
| `WP-203` | Canonical schema and migrations | XL | WP-201 | Land, place, trail, condition, restriction, observation, review/check-in/media envelopes conforming to the canonical data specification | CRS/axis/unit/time/null/ID/schema compatibility and provenance tests pass |
| `WP-204` | Reversible entity resolution | XL | WP-203 | Candidate generation, scores, link/merge/split/tombstone audit | Labelled place/trail/temporal/media fixtures meet precision gates |
| `WP-205` | Camping-status evaluator | L | WP-203 | Versioned precedence engine, staleness/conflict explanation | All status, inholding, designated-site, and stale-input fixtures pass |
| `WP-206` | New York boundary and land connectors | XL | WP-201–WP-203 | NY boundary, PAD-US cross-check, DEC lands, FS surface ownership | Pinned/checksummed complete partitions and geometry coverage report |
| `WP-207` | New York trail, road, and POI connectors | XL | WP-201–WP-204 | DEC trails/roads/POIs, MVUM, normalized trail/place records | Coverage, validation, dedup, attribution, and rights gates pass |
| `WP-208` | New York rule/restriction connectors | XL | WP-201, WP-203, WP-205 | Statewide/unit rules, alerts/orders, freshness policy | Positive status cannot survive missing/stale mandatory evidence |
| `WP-209` | Public pack and coverage-report prototype | L | WP-203–WP-208 | Rights-aware SQLite catalog, source inventory, coverage and exclusion report | Public bundle includes only approved fields/sources and is reproducible |
| `WP-210` | Secondary authoritative connectors | XL | WP-209 | RIDB, OSM, NPS, 3DEP added incrementally | Each connector independently passes contract/rights/coverage review |

## 6. Phase 3 — offline field use

| ID | Work package | Size | Depends on | Required outputs | Acceptance summary |
| --- | --- | --- | --- | --- | --- |
| `WP-301` | Self-generated New York basemap | XL | WP-209, ADR-018 | Pinned OSM extract, tiles, local style/fonts/sprites, attribution | Offline rendering, size, attribution, and reproducibility gates pass |
| `WP-302` | Production pack builder | XL | WP-209, WP-301 | Region/detail selection, media/rights filters, SBOM/DBOM, size report | Oversize or incomplete-rights builds fail closed |
| `WP-303` | Catalog activation and rollback | L | WP-008, WP-010, WP-302 | Exact space preflight, resumable staging, signature/checksum/channel verification, atomic switch, rollback | Interruption at every checkpoint retains last known-good and private data; invalid/replayed/wrong-channel catalogs never activate |
| `WP-304` | Offline explore/search/details | XL | WP-301–WP-303 | Spatial/text search, filters, land/trail/place details, provenance/freshness | Offline capability matrix passes for bundled coverage |
| `WP-305` | Composed public/private/user experience | L | WP-004, WP-005, WP-303, WP-304 | Origin labels, composed queries, private overlays, export filtering | Removing a private catalog cannot remove private user records |
| `WP-306` | Complete encrypted backup/restore | L | WP-107, WP-303 | Attachment manifests, migrations, pre-uninstall flow | Full backup acceptance suite passes |
| `WP-307` | Field hardening | XL | WP-304–WP-306 | Outdoor/degraded/error states, storage/energy profiling, field evidence | Repeated real/replay field sessions meet reliability and energy budgets |

## 7. Phase 4 — connector scale and private ecosystem

| ID | Work package | Size | Depends on | Required outputs | Acceptance summary |
| --- | --- | --- | --- | --- | --- |
| `WP-401` | Connector scaffolding CLI | L | At least three accepted connectors | `source create`, templates, tests, manifest/fixture generation | Generated connector passes baseline contract without core edits |
| `WP-402` | Reusable acquisition adapters | XL | WP-201, WP-202 | REST, bulk, ArcGIS, WFS, feeds, local import, overlay adapters | Adapter security and retry/checkpoint fixtures pass |
| `WP-403` | User-controlled import ecosystem | XL | WP-106, WP-201 | GPX/KML/GeoJSON/CSV/FIT and authorized account-export mappings | Imports stay private by default and retain provenance |
| `WP-404` | Permission-gated adapter shells | M | WP-401 | Disabled source mappings, deep links, synthetic fixtures | No shell fetches or implies authorization without manifest change |
| `WP-405` | Private extension compatibility | L | WP-004, WP-005, WP-401 | Version negotiation, private package lock/provenance, upstream sync tests | Supported private extension survives declared public-core upgrades |
| `WP-406` | Connector operations | L | WP-201, WP-209 | Health metrics, drift detection, staleness/right-review alerts | Failing connector quarantines without blocking other sources |

## 8. Phase 5 — production and community maturity

| ID | Work package | Size | Depends on | Required outputs | Acceptance summary |
| --- | --- | --- | --- | --- | --- |
| `WP-501` | Product brand and component system | XL | Phase 3 UX | Original tokens, components, icons, map styles, documented states | No copied trade dress; complete component-state coverage |
| `WP-502` | Production accessibility | L | WP-501 | VoiceOver, Dynamic Type, contrast, motion, touch, bold-text evidence | No unresolved critical accessibility defect |
| `WP-503` | Performance and endurance hardening | L | WP-501, WP-307 | Launch/map/scroll/memory/thermal/energy profiles | Numeric budgets pass on pinned reference matrix |
| `WP-504` | Release security and provenance | L | WP-001, WP-302 | Signing, checksums, SBOM/DBOM, provenance, dependency response | Independent artifact verification succeeds |
| `WP-505` | Community governance maturity | M | Sustained contributor activity | Maintainer/reviewer roles, release quorum, support/LTS policy | Governance reflects actual contributor count and responsibilities |
| `WP-506` | Production release audit | L | WP-501–WP-505 | Clean-room build, privacy/rights audit, release acceptance report | All project-level acceptance criteria pass |

## 9. Work-package completion record

Every completed package records:

- package ID, owner, reviewers, and linked issues/PRs;
- public base commit and private compatibility range where applicable;
- requirements implemented and tests/evidence produced;
- security, privacy, source-rights, accessibility, migration, and documentation impact;
- measured size/performance/energy changes where relevant;
- residual risks and follow-up packages; and
- acceptance date and approver.

The Product MVP is achieved only after `WP-301` through `WP-307` pass the M4 gate; finishing Phase 1 or Phase 2 is not an MVP claim. Platform, feature, and release names are controlled by the [product release definition](PRODUCT_RELEASE_DEFINITION.md).

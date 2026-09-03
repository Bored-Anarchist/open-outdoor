# Risk Register

**Status:** Active register; Phase 0 gate reviewed 2026-08-21  
**Scoring:** Probability (`P`) and impact (`I`) from 1–5; score = `P × I`

## 1. Active risks

| ID | Risk | P | I | Score | Primary mitigation | Trigger/indicator | Owner role |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `R-001` | Free Apple provisioning/Windows refresh path is unreliable or loses the app container | 4 | 5 | 20 | Phase 0 physical A→B refresh/retention gate; encrypted backup; stable identity | Refresh failure, changed application ID, missing records | iOS/build owner |
| `R-002` | Background GPS/barometer recording is suspended, loses batches, or cannot recover | 4 | 5 | 20 | Minimal native spike; sequence/checkpoint protocol; screen-lock/crash matrix | Gaps without quality state, unrecoverable active session | Tracking owner |
| `R-003` | Energy/thermal use is unacceptable for long field sessions | 4 | 5 | 20 | Active-only sensors, adaptive modes, explicit High Accuracy, no runtime polling; measurement deferred to WP-307/WP-503 | Endurance claim requested without evidence, thermal warning, unexplained wakeups | Tracking/performance owner |
| `R-004` | Private or restricted data reaches public GitHub/CI/releases | 3 | 5 | 15 | External roots, classification, pre-push/CI/artifact scans, incident exercise | Private path/coordinate/secret detected in public system | Privacy owner |
| `R-005` | Source terms/license change invalidates acquisition or public bundle | 4 | 5 | 20 | Independent rights fields, review dates, fail-closed release, replacement sources | Expiry/revocation/new terms/attribution | Rights owner |
| `R-006` | Safety-sensitive rules/closures become stale or conflict | 4 | 5 | 20 | `stale_after`, mandatory freshness, conflict-to-unknown, visible dates | Missed refresh, equal-authority conflict, expired alert | Data/safety owner |
| `R-007` | New York rule coverage is insufficient to provide useful positive camping status | 4 | 4 | 16 | Separate coverage report; unit-rule connector; honest `unknown`/`generally-eligible` | Large candidate area lacks current unit evidence | Product/data owner |
| `R-008` | Offline regional bundle exceeds install/storage/activation limits | 4 | 4 | 16 | Early size reports, selective zoom/media/regions, physical install gate | Component/total ceiling or reserve failure | Catalog/map owner |
| `R-009` | Catalog migration/remap corrupts associations or hides private trails | 3 | 5 | 15 | Separate stores, transactional remaps, interruption/rollback matrix | Count/hash mismatch, orphan loss, duplicate suppression error | Storage owner |
| `R-010` | Hostile or malformed source/import exploits parser or exhausts resources | 3 | 5 | 15 | Isolation, archive/parser limits, quarantine, malicious fixture suite | Parser crash, high expansion ratio, traversal/resource breach | Security/data owner |
| `R-011` | Entity resolution produces harmful false merges, especially campsites/restrictions | 4 | 4 | 16 | Precision-first type/source thresholds, review queue, reversible audit | Labelled precision miss or user correction spike | Data owner |
| `R-012` | Source schema/volume drift silently degrades catalog | 4 | 4 | 16 | Field metrics, fingerprints, counts, thresholds, quarantine | Required field disappears or abnormal volume/error rate | Connector owner |
| `R-013` | Limited macOS/physical-device access slows gates | 4 | 3 | 12 | Schedule gate batches, pinned CI, deterministic shared fixtures, explicit device owner | Queue delay or unavailable reference device | Project owner |
| `R-014` | Backup key loss or restore defect makes private data unrecoverable | 3 | 5 | 15 | Independent recovery secret, staged restore, corruption/migration tests, reminders | User lacks key or restore test fails | Privacy/storage owner |
| `R-015` | Private extensions drift from public core | 3 | 4 | 12 | Versioned extension API, compatibility range, upstream sync suite | Core schema/interface outside declared range | Platform owner |
| `R-016` | Toolchain/hosted runner drift breaks reproducibility | 3 | 4 | 12 | Exact pins, lockfiles, generated-project drift check, upgrade branches | Unexpected native diff or dependency resolution | Build owner |
| `R-017` | Accessibility is postponed until redesign and becomes expensive | 3 | 4 | 12 | MVP native accessibility gate in Phase 1; component-level tests | Critical flow lacks VoiceOver/Dynamic Type state | Design/quality owner |
| `R-018` | Maintainer capacity is insufficient for broad source and production scope | 5 | 4 | 20 | Evidence-gated phases, New York first, package decomposition, community governance | Growing queue, long review/source staleness | Project owner |
| `R-019` | Public branding/assets accidentally copy a source service or have unclear license | 2 | 4 | 8 | Original design, asset inventory, license review | Similarity complaint or missing asset notice | Design/rights owner |
| `R-020` | “Open source” is misunderstood to include third-party data | 4 | 4 | 16 | Separate code/data licenses, DBOM, public/private bundle gates | Contributor adds public web content without rights | Maintainer/rights owner |
| `R-021` | iOS system backup or incorrect protection class exposes private state or prevents locked-device recording | 3 | 5 | 15 | Explicit class matrix, backup exclusions, physical lock/backup inspection, encrypted explicit recovery | Protected file unavailable during active recording or private file appears in system backup | iOS/privacy owner |
| `R-022` | Persistent or privileged private CI leaks data through untrusted code, caches, artifacts, or later jobs | 3 | 5 | 15 | Ephemeral single-job isolation, untrusted-head denial, separate caches/destinations, least privilege | Private secret visible to PR or reused workspace/cache contains private state | Security/build owner |
| `R-023` | Catalog signing/trust compromise permits tampered, replayed, or wrong-channel data | 3 | 5 | 15 | Phase 0 signature envelope, channel trust roots, anti-replay version, rotation/revocation, last known-good | Invalid/replayed catalog activates or trusted key is compromised | Release/security owner |
| `R-024` | App downgrade or incompatible app/catalog/backup versions mutate or strand private data | 3 | 5 | 15 | Current-plus-previous support matrix, pre-write compatibility check, staged migrators, independent catalog rollback | Older app opens migrated DB or restore requires unavailable path | Storage/release owner |
| `R-025` | CRS, axis, time, unit, null, or identity ambiguity corrupts geospatial meaning | 3 | 5 | 15 | Canonical data specification and boundary contract/property tests | Swapped coordinates, local-time drift, unit mismatch, unstable IDs | Data architecture owner |
| `R-026` | Platform, navigation, or premature MVP claims expand scope and delay a coherent release | 4 | 4 | 16 | iOS-only/no-navigation decision, M4 MVP definition, issue/change-control checks | Android/navigation work enters a package or an alpha is called MVP | Product owner |
| `R-027` | Private data committed to Git conflicts with deletion, expiry, revocation, or retention obligations | 3 | 5 | 15 | Treat Git history as indefinite; external controlled storage for restricted lifecycles; pre-commit/publication gates | Deletion request or permission expiry affects committed object | Privacy/rights owner |
| `R-028` | Diagnostics expose routes, notes, media, identifiers, or secrets | 3 | 5 | 15 | Local-only bounded schema, denylist/redaction, short retention, explicit preview/export | Export or crash record contains prohibited field/value | Privacy/quality owner |
| `R-029` | Hosted CI minutes are exhausted by redundant pushes, broad matrices, schedules, or irrelevant expensive jobs | 4 | 3 | 12 | Local-first checks, path filters, concurrency cancellation, timeouts, fail-fast minimal matrices, candidate gates, usage review | Rising cancelled/duplicate minutes or macOS job on documentation-only change | Release/build owner |
| `R-030` | Contributor names, personal email, locations, device IDs, or other identifying details become permanent public history | 3 | 5 | 15 | Public handles, privacy-protected commit addresses, account-bound attestation, content/metadata gates, incident removal process | Personal detail appears in commit metadata, issue, PR, fixture, log, or artifact | Privacy/rights owner |

## 2. Phase 0 review — 2026-08-21

WP-007 now passes its required physical tracker evidence. WP-008 is owner-accepted on existing evidence, with its unexecuted physical cases retained as residual risks. Open risks remain governed as follows:

- `R-001` remains open pending the full same-identity A→B refresh, data-retention, and expiry workoff; encrypted restore is a later WP-107/WP-306 control.
- `R-002` and `R-021` remain open for owner-accepted WP-008 locked/pre-first-unlock residuals and later production evidence; historical iOS 26.2 launch evidence remains recorded. They no longer block Phase 0.
- `R-003` remains score 20 and open. ADR-048 conditionally accepts it for Phase 3/M4, prohibits battery/endurance claims, and makes complete WP-503/Phase 5 evidence the blocking acceptance point.
- `R-009` and `R-024` now have deterministic activation, rollback, private-digest, and compatibility prechecks, but remain open pending native/device integration.
- `R-029` is controlled by a bounded ledger whose first 20 applicable post-baseline runs passed with zero avoidable failures. Candidate-only macOS execution, local-first checks, and explicit reasons for exclusions remain required for subsequent work.
- WP-009 completed the review and published a `BLOCKED` Phase 0 result; acceptance cannot be inferred from implementation or contract tests alone.

2026-08-23 update: the project owner accepted WP-008 based on the existing evidence and explicitly accepted the residual risk from its unverified encrypted backup inventory, locked/pre-first-unlock denial, complete spool/replacement inspection, and incompatible downgrade attempt. This owner disposition closes WP-008 for Phase 0 but does not convert any unexecuted case into a pass or lower a risk score without separate review.

## 3. Risk response rules

- Scores 15–25 require an explicit mitigation work package/test and phase-gate review.
- Scores 8–14 require an owner and monitored trigger.
- Scores 1–7 may be accepted with rationale but remain recorded.
- A realized privacy, rights, data-loss, safety, signing, or critical accessibility risk blocks the affected phase/release until disposition.
- Risk score changes cite evidence, not optimism.

## 4. Review cadence

- At planning baseline approval.
- At work-package start and completion.
- At each phase gate and release candidate.
- On source terms/schema changes, security/privacy incidents, toolchain upgrades, or device/OS changes.

## 5. Risk closure record

A risk is closed only when the underlying condition is eliminated or accepted by an authorized owner with evidence, residual impact, and any monitoring transferred to another risk/operational control. Closed risks are retained for history.

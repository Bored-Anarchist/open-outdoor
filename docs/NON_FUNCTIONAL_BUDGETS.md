# Non-Functional Budgets and Objective Acceptance

**Status:** Binding Phase 0 thresholds; required physical measurements remain pending

## 1. Rules

- A budget is binding when recorded in the machine-readable release configuration with an environment/profile ID.
- A binding value may change only through an ADR with measurement evidence and updated RTM/tests/risks.
- Phase 1 cannot start until every `Phase 1 prerequisite` budget below is binding.
- Release evidence reports median, p95 where meaningful, worst observed, repetitions, and raw private evidence location.
- A result measured on browser/simulator cannot satisfy a physical iPhone budget.

## 2. Initial performance and reliability budgets

| ID | Metric | Provisional threshold | Profile | Gate |
| --- | --- | --- | --- | --- |
| `BUD-LAUNCH-001` | Cold launch to usable offline primary screen | p50 ≤ 2.5 s; p95 ≤ 4.0 s | iPhone 14, installed max-profile catalog, no migration | Phase 3/release |
| `BUD-SEARCH-001` | Local search/filter response for first 50 results | p50 ≤ 150 ms; p95 ≤ 500 ms; max ≤ 1 s | Release-declared New York entity count | Phase 3/release |
| `BUD-MAP-001` | Interactive map frame rate after warm load | p95 frame rate ≥ 30 fps; no main-thread stall > 250 ms | Representative dense New York fixture | Phase 3/release |
| `BUD-REC-001` | Recording control acknowledgement | p95 ≤ 500 ms | Physical iPhone | Phase 1 prerequisite |
| `BUD-REC-002` | Maximum committed-data gap after process death | ≤ 30 s and ≤ one configured native batch | Balanced/Endurance screen-off | Phase 1 prerequisite |
| `BUD-REC-003` | Missed/duplicate accepted sample count after replay | 0 silent loss; duplicate sequence is idempotent | Deterministic replay | Phase 1 prerequisite |
| `BUD-CAT-001` | Activation of maximum supported catalog | ≤ 5 min; resumable progress every ≤ 30 s | Physical iPhone with declared reserve | Phase 3 |
| `BUD-CAT-002` | First launch after successful catalog switch | ≤ 10 s before usable status or explicit recovery UI | Physical iPhone | Phase 3 |
| `BUD-MEM-001` | Screen-off tracker resident memory | p95 ≤ 150 MiB | Physical iPhone, four-hour profile | Phase 1 prerequisite |
| `BUD-MEM-002` | Dense interactive map resident memory | p95 ≤ 500 MiB without OS memory termination | Physical iPhone | Phase 3 |

## 3. Entity-resolution budgets

| ID | Decision class | Threshold |
| --- | --- | --- |
| `BUD-ER-001` | Automatic durable-place/trail merge | Estimated precision ≥ 99.5% on a representative labelled set; zero known severe incompatible-type merge |
| `BUD-ER-002` | Automatic restriction/condition duplicate | Precision ≥ 99.9%; recurring/separate incidents never merged solely by proximity |
| `BUD-ER-003` | Calibration sample | At least 200 labelled positive and 200 labelled negative candidates per materially distinct entity/source-pair configuration before automatic merging is enabled |
| `BUD-ER-004` | Review band | Any score below the accepted automatic threshold but above reject threshold remains separate pending review; recall is reported but cannot lower the precision gate |

When the labelled sample is smaller, automatic linking remains disabled for that configuration.

## 4. Import and ingestion safety limits

Defaults are configurable downward by source; raising them requires a security/performance ADR.

| ID | Limit | Default maximum |
| --- | --- | --- |
| `BUD-ING-001` | Network response | 500 MiB per response and manifest-declared per-run total |
| `BUD-ING-002` | User/archive compressed input | 1 GiB |
| `BUD-ING-003` | Expanded archive | 4 GiB, 10,000 files, 100:1 expansion ratio |
| `BUD-ING-004` | Archive structure | Nesting depth 3; path depth 20; no links/devices/alternate streams/traversal |
| `BUD-ING-005` | Single geometry | 2,000,000 vertices before source-specific simplification/rejection policy |
| `BUD-ING-006` | Image decode | 50 megapixels and 200 MiB decoded buffer |
| `BUD-ING-007` | Single connector partition | 15 min wall time before checkpoint/timeout unless manifest-approved |

## 5. Energy and thermal method

- Each mode uses at least three valid four-hour screen-off runs under the pinned representative profile after one warm-up run.
- Record median, worst, temperature range, battery health, radio/GPS conditions, travelled distance, screen time, and native-baseline delta.
- Binding Phase 0 targets are ≤ 4% battery/hour Balanced and ≤ 3% Endurance.
- High Accuracy receives a measured published budget before release; it is not accepted as “unbounded.”
- A release regression greater than 10% relative to the binding mode budget or native-overhead baseline requires explanation and explicit budget approval.
- Any thermal warning, continuous retry, unintended background session, or missed stop fails regardless of battery percentage.

## 6. Elevation and camping correctness

The numeric elevation thresholds in the test plan remain binding. Camping evaluator acceptance is 100% on deterministic precedence, scope, stale-input, inholding, designated-site, and conflict fixtures; a known wrong positive result blocks release.

## 7. Storage preflight formula

The 3 GiB installed reference ceiling is a **combined total across active public and private reference catalogs**, excluding private user data.

Required free space before activation is calculated, not estimated:

```text
current_active_combined_catalog_bytes
+ incoming_combined_catalog_bytes
+ max(1 GiB, 25% of incoming_combined_catalog_bytes) workspace/decompression
+ 2 GiB post_activation_reserve
```

The coordinator reuses the current active catalog as the rollback copy; an implementation that creates another full copy must add that copy to the formula. For the maximum 3 GiB current plus 3 GiB incoming profile, the formula requires at least 9 GiB free. The UI displays the exact byte calculation and offers region/media reduction; it never evicts private user data.

## 8. Test-case granularity

Named suites are containers. Executable cases use `T-<LEVEL>-NNN-C<two digits>`, for example `T-INT-002-C04`. Every case records setup, fixture version, exact assertion, expected result, environment, and evidence. A suite cannot pass when an unexecuted required case is reported only as “covered.”

## 9. Phase 0 closure

WP-009 published the binding release-config values, iPhone 14/iOS 26.2 profile, measurement procedure, and risk disposition in the Phase 0 gate record and report. The review result is `BLOCKED`: WP-007/WP-008 physical runs and protection/backup inspection remain incomplete, High Accuracy has no approved measured budget, and avoidable hosted-CI work was detected. Phase 1 must not be scheduled until a later gate record passes every blocking item.

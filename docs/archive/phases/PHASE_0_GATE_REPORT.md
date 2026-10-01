# Phase 0 gate report

**Decision date:** 2026-08-23
**Reference profile:** `iphone14-ios26.6-phase0-v1` (advanced on 2026-08-23 after the phone and instrumented report confirmed iOS 26.6; historical iOS 26.2 launch records are retained)
**Gate result:** PASSED — Phase 1 may start

## Completed foundations

WP-001 through WP-010 are accepted. WP-007 passes its required physical tracker, durability, protection-class, and memory cases on the reference iPhone. WP-008 owner acceptance is based on the recorded evidence and explicitly retains unexecuted physical cases as residual risks rather than test passes. WP-009 supplies the machine-readable release budgets, bounded CI ledger, and fail-closed gate evaluator.

## Gate evidence

- No blocking Phase 0 evidence remains. WP-007's required background screen-lock collection, recovery, Stop behavior, active-spool protection class, and 30-minute memory profile pass on the physical iPhone.
- WP-008's unexecuted locked sealed-library, pre-first-unlock, backup-inventory, complete spool/replacement, and downgrade cases remain owner-accepted residual risks rather than test passes.
- Battery/thermal scope: measured acceptance is deferred to WP-307/WP-503 and is not a current blocker; no endurance claim is permitted.
- CI efficiency: historical avoidable failures remain recorded; the bounded post-baseline window passed 20/20 applicable runs with zero avoidable failures.

BUD-REC-001 passes on the physical iPhone running iOS 26.6 with Start p95 13 ms and Stop p95 2 ms against the 500 ms threshold. BUD-REC-002 passes with an observed zero committed-data gap across forced termination and relaunch. BUD-REC-003 passes at the deterministic replay layer: duplicate sequences are idempotent, conflicting duplicates fail, and gaps are explicit. BUD-MEM-001 passes with 392 samples over 1,953.73 seconds and independently recomputed p95 resident memory of 42.141 MiB against the 150 MiB threshold.

## Hosted CI usage

GitHub run history from 2026-08-19 through 2026-08-21 contains 57 requested/completed workflow runs, 49 successful and 8 failed, with 53.32 aggregate workflow wall-clock minutes. No runs or Windows jobs were reported cancelled/skipped in this period. GitHub's timing endpoint reported zero billed milliseconds for the sampled public macOS run; because billing attribution is not independently available from run-list data, wall-clock minutes are the conservative operational metric.

| Workflow | Requested/executed | Passed | Failed | Cancelled | Aggregate wall-clock minutes |
| --- | ---: | ---: | ---: | ---: | ---: |
| design-accessibility-traceability | 12 | 12 | 0 | 0 | 1.65 |
| documentation-integrity | 15 | 14 | 1 | 0 | 4.72 |
| macos-ios-build | 6 | 3 | 3 | 0 | 18.55 |
| security-rights-privacy | 12 | 12 | 0 | 0 | 3.78 |
| windows-quality | 12 | 8 | 4 | 0 | 24.62 |

The historical interval remains the baseline but no longer creates a permanent blocker. Gate schema v2 starts a bounded clean window after 2026-08-21T23:40:00Z. The first 20 applicable runs must contain zero avoidable failures; excluded runs require an explicit reason in config/hosted-ci-window.json. As of 2026-08-23, the machine evaluator reports 20/20 applicable runs with zero avoidable failures and status `passed`. Later assessments remain recorded but do not change the bounded first-20 result.

## Risk disposition

R-001 is reduced by accepted WP-006 launch/refresh feasibility and the owner-accepted WP-008 same-identity/A-to-B evidence; unexecuted WP-008 cases remain explicit residual risks. R-002, R-009, R-021, and R-024 remain open as accepted residual risks or later production work, but no longer block Phase 0. R-003 remains open and is explicitly accepted as deferred risk for Phase 0/Phase 1; it still blocks endurance claims and production until WP-307/WP-503. No probability or impact score is reduced without measurement evidence or explicit owner disposition.

## Exit workoff

1. Completed 2026-08-23: built the native-spike candidate in the pinned macOS workflow and installed it with the stable local identity.
2. Completed 2026-08-23: executed and accepted the WP-007 physical tracking protocol and 30-minute memory smoke.
3. Completed 2026-08-23 by owner disposition: accept WP-008 on the existing evidence while retaining its unexecuted physical cases as explicit residual risks.
4. Completed 2026-08-23: the bounded first 20 applicable post-baseline workflow runs passed with zero avoidable failures.
5. Completed 2026-08-23: every machine-readable package and prerequisite budget is accepted/passed, protected checks pass, and `config/phase0-gate.json` declares `passed`.

# Phase 0 gate report

**Decision date:** 2026-08-21
**Reference profile:** `iphone14-ios26.6-phase0-v1` (advanced on 2026-08-23 after the phone and instrumented report confirmed iOS 26.6; historical iOS 26.2 launch records are retained)
**Gate result:** BLOCKED — Phase 1 may not start

## Completed foundations

WP-001 through WP-006, WP-008, and WP-010 are accepted. WP-008 owner acceptance is based on the recorded evidence and explicitly retains unexecuted physical cases as residual risks rather than test passes. WP-007 now includes a durable active-session manifest, torn-line-tolerant spool readback, explicit process recovery, and UI controls. WP-009 supplies the machine-readable release budgets, bounded CI ledger, and fail-closed gate evaluator.

## Blocking evidence

- WP-007: locked-screen active-spool availability, sealed-library denial, and safe pre-first-unlock behavior remain incomplete. Exact process-death sequencing, Endurance radio/GPS adversity, permission-loss/recovery with explicit Stop, acknowledgement timing, effective active-spool policy, and the 30-minute memory profile have passed on the physical iPhone.
- Battery/thermal scope: measured acceptance is deferred to WP-307/WP-503 and is not a current blocker; no endurance claim is permitted.
- CI efficiency: avoidable failed/repeated hosted runs occurred during Phase 0 and require process workoff.

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

R-001 is reduced by accepted WP-006 launch/refresh feasibility and the owner-accepted WP-008 same-identity/A-to-B evidence; unexecuted WP-008 cases remain explicit residual risks. R-002, R-009, R-021, and R-024 remain open where WP-007 or later production evidence is still pending. R-003 remains open and is explicitly accepted as deferred risk for Phase 0/Phase 1; it still blocks endurance claims and production until WP-307/WP-503. No probability or impact score is reduced without measurement evidence or explicit owner disposition.

## Exit workoff

1. Build the native-spike candidate once in the pinned macOS workflow and install it with the stable local identity.
2. Execute the WP-007 physical tracking protocol and 30-minute memory smoke.
3. Completed 2026-08-23 by owner disposition: accept WP-008 on the existing evidence while retaining its unexecuted physical cases as explicit residual risks.
4. Completed 2026-08-23: the bounded first 20 applicable post-baseline workflow runs passed with zero avoidable failures.
5. Change `config/phase0-gate.json` to passed only when every machine-readable item is accepted/passed and protected checks pass on the exact candidate.

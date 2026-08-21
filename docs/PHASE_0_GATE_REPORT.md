# Phase 0 gate report

**Decision date:** 2026-08-21
**Reference profile:** `iphone14-ios26.2-phase0-v1`
**Gate result:** BLOCKED — Phase 1 may not start

## Completed foundations

WP-001 through WP-006 and WP-010 are accepted. WP-007 and WP-008 now have executable shared contracts and autolinked Swift feasibility implementations. WP-009 supplies the machine-readable release budgets and fail-closed gate evaluator.

## Blocking evidence

- WP-007: physical screen-lock/suspension/process-death/stop behavior is unmeasured.
- BUD-REC-001 and BUD-REC-002: acknowledgement and committed-gap thresholds lack physical measurements.
- BUD-MEM-001: the four-hour screen-off p95 memory profile is absent.
- Balanced and Endurance energy: three four-hour measured runs per mode are absent.
- High Accuracy: no measured battery limit is approved, so it remains explicitly blocked.
- WP-008: protection classes, backup exclusion, same-identity A→B retention, and downgrade/rollback require device inspection.
- CI efficiency: avoidable failed/repeated hosted runs occurred during Phase 0 and require process workoff.

BUD-REC-003 passes at the deterministic replay layer: duplicate sequences are idempotent, conflicting duplicates fail, and gaps are explicit. It does not substitute for BUD-REC-002 physical durability.

## Hosted CI usage

GitHub run history from 2026-08-19 through 2026-08-21 contains 57 requested/completed workflow runs, 49 successful and 8 failed, with 53.32 aggregate workflow wall-clock minutes. No runs or Windows jobs were reported cancelled/skipped in this period. GitHub's timing endpoint reported zero billed milliseconds for the sampled public macOS run; because billing attribution is not independently available from run-list data, wall-clock minutes are the conservative operational metric.

| Workflow | Requested/executed | Passed | Failed | Cancelled | Aggregate wall-clock minutes |
| --- | ---: | ---: | ---: | ---: | ---: |
| design-accessibility-traceability | 12 | 12 | 0 | 0 | 1.65 |
| documentation-integrity | 15 | 14 | 1 | 0 | 4.72 |
| macos-ios-build | 6 | 3 | 3 | 0 | 18.55 |
| security-rights-privacy | 12 | 12 | 0 | 0 | 3.78 |
| windows-quality | 12 | 8 | 4 | 0 | 24.62 |

Avoidable work is present: repeated failing Windows iterations, three failed manual macOS builds, and multiple PR evidence-only updates each requested the full PR check set. Workoff is to batch evidence changes, require local focused/full gates before push, keep macOS manual-only, and avoid dispatching another macOS build until the exact native candidate is ready. This historical usage cannot be erased, so the gate retains the CI-efficiency blocker until the next review demonstrates the corrected workflow.

## Risk disposition

R-001 is reduced by accepted WP-006 launch/refresh feasibility but remains open for A→B retention. R-002, R-003, R-009, R-021, and R-024 remain open because their physical/native acceptance is pending. No probability or impact score is reduced without measurement evidence.

## Exit workoff

1. Build the native-spike candidate once in the pinned macOS workflow and install it with the stable local identity.
2. Execute the WP-007 physical tracking, memory, and repeated energy protocol.
3. Execute WP-008 protection, backup inventory, A→B retention, downgrade, and rollback inspection.
4. Approve a measured High Accuracy energy limit or keep that mode unavailable.
5. Review hosted usage after a batched, locally validated candidate and remove the CI-efficiency blocker only with evidence.
6. Change `config/phase0-gate.json` to passed only when every machine-readable item is accepted/passed and protected checks pass on the exact candidate.

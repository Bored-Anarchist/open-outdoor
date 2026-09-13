# Phase 3 automatic acceptance

**Retired:** The in-app Phase 3 runner and native acceptance store were removed after the phase gate was accepted. This procedure remains as historical evidence and is not present in current builds.

The Phase 3 workflow combines deterministic repository checks with an automatic physical-iPhone run. Every result is bound to the embedded source commit, installed executable SHA-256, iPhone 14/iOS 26.6 profile, and a coordinate-free protected report.

## Phone run

Install the exact candidate IPA and launch Open Outdoor. After the private store is ready, **Automatic Phase 3 test run** starts without a Begin button, checklist, hash field, manual measurements, or tester attestation.

The phone automatically executes:

1. Installed candidate, device, OS, commit, and executable identity.
2. Offline explore, search, and details through the product map module.
3. Catalog activation, interrupted-switch rollback, retry, and insufficient-space rejection through the product storage module.
4. Explicit public/private/user composition and private-catalog removal without private-user-data mutation.
5. Protected AES-GCM backup/restore, backup exclusion, and wrong-secret rejection.
6. Degraded/error-state invariants.
7. Startup, offline-search, display-frame, main-thread-stall, catalog-switch, and resident-memory budgets.
8. The build-validated native accessibility contract.

The runner saves its machine result in complete-protection app storage and displays one result card per check. A completed run with no Failed card is the executable phone-test pass condition.

## Platform and endurance dispositions

An iOS application cannot uninstall and reinstall itself. The runner reports that destructive lifecycle as **Externally constrained**, does not request a manual Pass, and does not claim the lifecycle was executed. A reviewer may accept that explicit residual risk separately from the passed protected backup/restore round trip.

Field endurance is conditionally approved for Phase 3 under ADR-048 and remains a blocking WP-503/Phase 5 requirement. Phase 3 does not make battery-life, thermal-endurance, or multi-hour reliability claims.

## Repository run

Use the exact clean candidate with Node.js 24.19.0 and pnpm 11.20.0. Run pnpm phase3:acceptance.

The command executes the local M4 suites and writes the draft physical-report template when no external report is supplied. Repository ingestion remains fail-closed: it validates a supplied report, exact candidate identity, privacy classification, named commands/files, and required budgets before producing a reviewer proposal.

The accepted phone-test disposition for candidate ef6d3bee48a0057f0e94a9fb08fae3257dd33c23 is recorded in [the Phase 3 gate report](PHASE_3_GATE_REPORT.md) and its [machine-readable evidence](evidence/artifacts/phase3-phone-test-disposition-ef6d3be.json).

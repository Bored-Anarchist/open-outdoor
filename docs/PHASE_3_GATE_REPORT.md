# Phase 3 Product MVP test disposition

**Status:** Phase 3 tests passed and were accepted on 2026-09-08 by Bored-Anarchist

The exact candidate ef6d3bee48a0057f0e94a9fb08fae3257dd33c23 passed the repository suite and the automatic on-device Phase 3 runner on the declared iPhone 14 (iPhone14,7) running iOS 26.6. The owner observed "Automatic tests completed with an iOS platform constraint" and confirmed that no result card said "Failed".

The accepted machine results cover installed-candidate identity, offline explore/search/details, catalog activation and rollback, explicit public/private/user origins, private-catalog removal without private-user-data mutation, protected encrypted backup/restore, wrong-secret and degraded states, non-endurance performance budgets, and the accessibility contract. The matching unsigned IPA was produced by [macOS build 33714447752](https://github.com/Bored-Anarchist/open-outdoor/actions/runs/33714447752) with SHA-256 A4E208E8FB23D50E2303BDFDF20FB9F02EB53E037A3CA95D0472DB8D1DF1189C.

The reviewed [machine-readable disposition](evidence/artifacts/phase3-phone-test-disposition-ef6d3be.json) records two non-failing residual conditions:

- An iOS application cannot uninstall and reinstall itself. The protected encrypted backup/restore round trip passed, but the destructive operating-system lifecycle was not executed and is not represented as a passed test.
- Field endurance remains conditionally approved under ADR-048 and moves to WP-503/Phase 5. Phase 3 makes no battery-life, thermal-endurance, or multi-hour reliability claim.

This owner disposition marks the Phase 3 test suite passed while preserving the distinction between executed evidence, accepted residual risk, and deferred evidence.

# Phase 3 acceptance checklist

## Local preparation

1. Use the exact candidate commit with a clean working tree and Node.js v24.19.0.
2. Confirm type, test, format, release-configuration, workflow, native-contract, and public-boundary checks pass.
3. Build the unsigned device IPA in the pinned macOS/Xcode workflow and verify its SHA-256.

## Automatic iPhone run

1. Install the matching IPA on the declared iPhone 14/iOS 26.6 profile.
2. Launch Open Outdoor and wait for **Automatic Phase 3 test run** to finish.
3. Do not enter a hash, measurements, or Pass/Fail choices; the runner performs and records the checks itself.
4. Require the completion message and zero Failed result cards.
5. Record any **Externally constrained** item as residual risk rather than converting it into a test pass.

## Review

1. Bind the disposition to the exact source commit, IPA checksum, build run, device profile, date, and reviewer.
2. Confirm the evidence is coordinate-free and contains no personal data.
3. Keep uninstall/reinstall limitations distinguishable from the passed protected backup/restore test.
4. Keep Phase 3 field endurance conditionally approved and assigned to WP-503/Phase 5; do not make an endurance claim.

The accepted 2026-09-08 result is documented in [the Phase 3 gate report](PHASE_3_GATE_REPORT.md).

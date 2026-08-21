# Phase 0 acceptance-gap solutions

**Status:** Recommended workoff plan updated 2026-08-21

This document records the recommended solutions for the blockers identified by WP-009. It does not claim that unexecuted physical checks have passed.

## Accepted scope reduction: battery and thermal tests

Measured battery draw, thermal endurance, and multi-hour energy runs are removed from the Phase 0 and Phase 1 entrance gates. They move to WP-307 and WP-503, where representative maps, UI, and field workflows can be measured. No battery-life or endurance claim may be made before that work passes.

The implementation still must conserve energy by construction: start location and altimeter sensors only for an active recording, stop them immediately afterward, prohibit continuous polling, require explicit High Accuracy selection, and use the configured 10 m Balanced and 25 m Endurance distance filters. The former four-hour memory run is a separate concern and is reduced to a 30-minute screen-off smoke.

## Recommended blocker solutions

### 1. Process-death recovery and readback

Add a durable active-session manifest beside the protected spool. At launch, discover the latest session, tolerate a torn final line, recover the highest valid sequence/mode/session identifier, and expose native `recoverTrackingSession` plus readback/inspection controls in the feasibility UI. Execute T-PHY-001-C08 only after this exists; relaunching a shell without recovery is not acceptance.

### 2. WP-008 physical diagnostic harness

Add Phase-0-only native diagnostics that create synthetic user SQLite/WAL/SHM files, catalogs, attachments, and diagnostic artifacts. Report effective file-protection and backup-exclusion resource values, simulate catalog activation checkpoints, and compute record counts and hashes. Exclude this harness from production builds and never seed real or private data.

### 3. Protection and backup inspection from Windows

Export the native diagnostic report for direct review, then inspect the iTunes backup `Manifest.db` to confirm which synthetic artifacts are absent or present. This gives auditable evidence for protection classes and system-backup exclusions without relying on UI appearance alone.

### 4. Deterministic version A to B fixture

Provide a fixture generator that seeds the exact synthetic activity, user trail, catalog associations, overlay, and hashes used by both builds. Install A and seed it, install B with the same bundle identity and a changed catalog/remap, force activation checkpoints, and compare counts/hashes after upgrade and relaunch.

### 5. Restore-scope correction

Recommended scope change: remove encrypted backup restore from WP-008 and the Phase 0 physical matrix. Phase 0 should inspect system-backup exclusion and the uninstall warning; authenticated encrypted restore belongs to WP-107/WP-306 after its crypto/container ADR is decided. This recommendation is not adopted by the battery-scope decision and needs separate owner approval.

### 6. Hosted-CI history criterion

Replace the sticky subjective history flag with a defined clean window, such as the next 20 applicable runs or one milestone with zero avoidable failures. Keep macOS manual-only, avoid docs-only native jobs, batch related changes, and recompute `avoidableJobsDetected` from the bounded window. Until the agreed window passes, hosted-CI efficiency remains a blocker.

## Recommended order

1. Implement recovery/readback and the synthetic WP-008 physical diagnostic harness.
2. Add the deterministic A-to-B fixture and diagnostic export.
3. Execute the shortened physical tracker/storage workoff on the iPhone.
4. Review the bounded hosted-CI window.
5. Schedule full battery/thermal characterization only in WP-307/WP-503.

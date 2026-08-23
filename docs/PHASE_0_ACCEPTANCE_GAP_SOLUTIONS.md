# Phase 0 acceptance-gap solutions

**Status:** Recommended implementations complete; physical workoff pending

This document records the implemented solutions for the blockers identified by WP-009. The native recovery, synthetic diagnostic harness, backup inspector, deterministic A-to-B fixtures, restore-scope correction, and bounded CI ledger are implemented; unexecuted physical checks remain pending.

## Accepted scope reduction: battery and thermal tests

Measured battery draw, thermal endurance, and multi-hour energy runs are removed from the Phase 0 and Phase 1 entrance gates. They move to WP-307 and WP-503, where representative maps, UI, and field workflows can be measured. No battery-life or endurance claim may be made before that work passes.

The implementation still must conserve energy by construction: start location and altimeter sensors only for an active recording, stop them immediately afterward, prohibit continuous polling, require explicit High Accuracy selection, and use the configured 10 m Balanced and 25 m Endurance distance filters. The former four-hour memory run is a separate concern and is reduced to a 30-minute screen-off smoke.

## Implemented blocker solutions

### 1. Process-death recovery and readback

Implemented a durable `active-session.json` beside the protected spool. Launch inspection validates the manifest, tolerates only a torn final JSONL line, recovers the highest contiguous sequence/mode/session identifier, and exposes native inspect/recover/discard controls in the feasibility UI. T-PHY-001-C08 is now executable but remains physically pending.

### 2. WP-008 physical diagnostic harness

Implemented a compile-flagged Phase-0-only native harness that creates synthetic user SQLite/WAL/SHM files, public/private catalogs, attachments, and diagnostics. It reports effective file-protection and backup-exclusion values, simulates every activation checkpoint, and computes deterministic record counts/hashes. The native-spikes package and compile condition are excluded from the future production bridge.

### 3. Protection and backup inspection from Windows

Implemented a share-sheet export for exactly one generated diagnostic JSON file; broad iTunes File Sharing remains disabled. The read-only Python `Manifest.db` inspector reports only redacted relative paths and fails if a declared excluded synthetic artifact appears in the app backup domain.

### 4. Deterministic version A to B fixture

Implemented matching cross-platform and native fixture generators for the exact synthetic activity, user trail, association, overlay, note, favorite, attachment, catalog remap, unresolved link, counts, and hashes used by builds A and B. The device UI can seed A, inspect after upgrade, force every checkpoint, apply B, and share the result.

### 5. Restore-scope correction

Adopted in ADR-041: encrypted backup restore is removed from WP-008 and the Phase 0 physical matrix. Phase 0 inspects system-backup exclusion and the uninstall warning; authenticated encrypted restore belongs to WP-107/WP-306 after its crypto/container ADR is decided.

### 6. Hosted-CI history criterion

Implemented gate schema v2 and `config/hosted-ci-window.json`: the first 20 applicable runs after the recorded start must contain zero avoidable failures. Exclusions require a reason, duplicate or pre-window run IDs fail validation, and only the bounded first 20 count. On 2026-08-23 the bounded window reached 20/20 applicable runs with zero avoidable failures and passed.

## Physical workoff order

1. Compile the exact native candidate and install it with the stable local identity.
2. Execute tracker recovery/readback and the 30-minute memory smoke on the iPhone.
3. Execute the synthetic WP-008 protection/system-backup/A-to-B checkpoint matrix and retain the shared private reports.
4. Completed 2026-08-23: the bounded 20-run hosted-CI window passed with zero avoidable failures.
5. Schedule full battery/thermal characterization only in WP-307/WP-503.

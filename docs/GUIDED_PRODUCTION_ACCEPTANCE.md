# Guided acceptance on Windows and iOS

The Phase 5 runner coordinates automated checks, the phone checklist and the post-WP-506 evidence handoff. It does not automatically approve a release or replace physical instrumentation and independent review.

## Windows

Use the pinned Node 24.19.0/pnpm 11.20.0 environment and commit changes first:

```text
pnpm phase5:acceptance
```

The command runs full quality/tests, privacy checks, browser accessibility and desktop profiling, then exports the iOS JavaScript bundle. It prints progress and creates a new `dist/phase5-guided-*` directory containing `GUIDE.md`, a complete checklist, physical/audit templates and a summary report. Command output is represented by hashes, not copied into the report. A failing step stops the automated sequence. Dirty candidates cannot count as clean acceptance evidence. Successful automation exits zero even while physical/release acceptance remains blocked; those statuses are separate in the summary.

`--prepare-only` generates the guide without running checks. `--import-only` validates/transfers observations or completed physical evidence without repeating the automated suite. Neither mode claims automated success. Use the separate `scripts/Test-ReleaseCleanRoom.ps1` procedure for a fresh public checkout; this runner does not claim host isolation or native iOS reproduction.

## iOS

Install the matching diagnostic iOS build using the existing macOS build/sideload procedure. JavaScript updates alone do not add the new native storage/share methods: rebuild and reinstall the native app. The guide is available under **Track → Physical acceptance evidence → Guided production acceptance**, where diagnostic controls are enabled. Earlier Phase 1 and Phase 3 runners remain available.

Tap **Begin or resume Phase 5 guide**. The phone automatically obtains its embedded source commit, installed executable digest, model, OS, resident-memory snapshot and protected encrypted-backup round-trip results. Wrong-key rejection is also checked. A single memory snapshot is preflight evidence, not a performance profile. Unknown commit bindings cannot start a session; a wrong phone/OS cannot pass preflight.

The guide walks through 99 accessibility flow/setting combinations, eight measurement profiles, six three-hour field runs, and provisioning/protection/uninstall/elevation lifecycle checks. Follow the instructions with disposable test data and record observations. It cannot toggle all system settings, verify VoiceOver usability, uninstall itself, supply an independent reviewer, or collect every profiler measurement automatically. Field runs and measurement steps have no checklist Pass action: collect actual native numeric evidence separately. Nothing starts location recording, changes settings or deletes user data automatically.

Progress is saved before advancing to separate complete-protection, system-backup-excluded Phase 5 diagnostic storage. Resume after interruption or relaunch. Evidence from another executable/commit is retained for export but cannot receive new observations; explicitly export it and start a new session. The replace confirmation affects only Phase 5 observations. It does not reset tracking or earlier reports.

Tap **Share redacted Phase 5 observations** and explicitly transfer `phase5-guided-observations.json` to Windows. Reports contain only fixed IDs/statuses/timestamps, candidate identity and numeric/boolean preflight values; they contain no coordinates, personal notes or identifiers. The native share sheet makes no automatic network submission.

## Handoff and final evaluation

Obtain the installed executable SHA-256 independently from the candidate build. The native report hashes the executable inside the app, not the enclosing IPA archive; do not substitute the archive digest.

```text
pnpm phase5:acceptance --import-only --ios-report PHONE.json --binary-sha256 EXECUTABLE_SHA256
```

The importer validates the complete report shape and exact commit/executable binding, rejecting private extra fields, duplicate/missing rows and fabricated numeric-checklist passes. It records observations separately and leaves the physical template unexecuted. A tap, automatic preflight or imported report cannot become a measured acceptance result.

Complete `physical-template.json` using actual native profiler/device evidence and the independent reviewer attestation. Then run:

```text
pnpm phase5:acceptance --import-only --physical-report COMPLETED.json --binary-sha256 EXECUTABLE_SHA256 --require-physical
```

This reuses the strict production evaluator. Missing evidence, simulator substitutions, missing runs, budget failures and candidate mismatches exit nonzero. All 26 project criteria, native reproduction and independent reviews still feed the WP-506 signed audit described in [production release audit](PRODUCTION_RELEASE_AUDIT.md). The runner creates the corresponding checklist and template, but never signs or publishes a production artifact.

ADR-050 remains in force: physical execution happens after WP-506 implementation. The interface is a guided collector, not a claim that those physical tests have already passed.

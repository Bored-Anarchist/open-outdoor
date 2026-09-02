# Phase 3 acceptance checklist

## Local preparation

1. Use the exact candidate commit with a clean working tree and Node.js v24.19.0.
2. Run `pnpm phase3:acceptance` once to execute local checks and generate `dist/phase3-physical-report-template.json`.
3. Confirm local type, test, format, release-configuration, workflow, native-contract, and public-boundary commands pass. The run remains blocked until physical evidence is supplied.

## Physical iPhone work

1. Install the matching binary on iPhone 14/iOS 26.6 and record its SHA-256.
2. Complete the performance and catalog-switch measurements using the binding budgets in `docs/NON_FUNCTIONAL_BUDGETS.md`.
3. Complete offline, rollback, composed-origin, private-data-preservation, backup/reinstall/restore, and degraded-state flows.
4. Complete all nine accessibility checks.
5. Complete three 180-minute Balanced and three 180-minute Endurance field runs. Do not include coordinates, route traces, raw logs, photos, or identifiers in the report.
6. Mark the attestation complete and retain the underlying evidence in approved private storage.

## Ingestion and review

1. Run `pnpm phase3:acceptance -- --physical-report <approved-report.json>` on the unchanged clean commit.
2. Require `Phase 3 guided acceptance: passed`, an empty blocker list, and the two generated report/proposal files.
3. Review the report SHA-256, source commit, binary checksum, all local commands/files, and the private source evidence.
4. Confirm the proposal remains `blocked-pending-reviewer`; it must not approve itself.

Replay or simulator evidence, a dirty tree, a different commit, unsafe report classification, missing repetitions, an over-budget result, or an unchecked device/accessibility flow blocks the run.

# Phase 4 guided acceptance

**Retired:** The Phase 4 runner command was removed after the gate was accepted. Its evidence-contract library, tests, reports and disposition remain for auditability.

Run `pnpm phase4:acceptance` from the repository after installing the pinned Node 24.19.0 and pnpm 11.20.0 toolchain (`pnpm install --frozen-lockfile`). Windows PowerShell is required on Windows; other hosts need `pwsh` for the downstream check. Commit all changes first. A dirty checkout can run diagnostics but cannot produce passing acceptance evidence.

The runner automates full TypeScript checks, the complete Vitest suite, formatting, release/workflow/native-contract validation, private CI policy, isolated synthetic downstream Git synchronization, the public browser build, and public-boundary scanning. It requires explicit passing suite evidence for WP-401 through WP-406 and their case IDs in [the acceptance plan](TEST_AND_ACCEPTANCE_PLAN.md). No tests may be skipped. Commands have ten-minute limits; a missing dependency, failed command, or missing test output blocks acceptance. Every command prints progress and the runner continues through remaining checks after ordinary command failures.

Each invocation creates a fresh ignored `dist/phase4-acceptance-*` directory containing:

- `report.json`: exact starting/ending commit, clean-checkout checks, runtime/platform, input hashes, command outcomes and output hashes, required suite results, and blockers.
- `review-proposal.json`: report SHA-256, all six package recommendations and an uncompleted reviewer record.
- `vitest.json`: local detailed test diagnostics. Keep this local; it may contain local filesystem paths.

The report hashes the package manifest, lockfile, release configuration and extension API contract; the commit identifies the tracked fixtures and runner. A changed commit or dirty checkout at completion blocks acceptance. Run against a quiescent checkout. Output directories cannot be redirected by command-line arguments, and an existing linked `dist` directory is rejected.

Only synthetic fixtures are used. Private-root variables, credential variables and injected Node/Git settings are removed from child environments. Machine reports contain no command output or environment values; output hashes allow comparison without copying diagnostics. For failures, rerun the corresponding package script or suite locally to inspect details. The boundary check runs after the public build. The downstream test operates in disposable local clones without contacting third-party services.

Review `report.json` and its proposal together, verify the report hash and candidate, then record reviewer identity/date and disposition in the normal evidence workflow. The runner does not change milestone gates or claim service authorization, native file-picker UI, real private-data validation, or physical-device acceptance. No additional device session is needed to execute these shared API and laptop-worker cases. A passed machine run is ready for reviewer acceptance, not an automatic milestone approval.

Exit codes: `0` automated checks passed, `1` acceptance blocked, `2` runner/prerequisite failure. `pnpm phase4:acceptance --help` shows usage. Runner decision coverage is in `packages/config/test/phase4-guided.test.ts`.

The owner-approved candidate and verified evidence are recorded in [the Phase 4 acceptance disposition](PHASE_4_GATE_REPORT.md).

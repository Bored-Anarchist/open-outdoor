# Phase 2 acceptance checklist

This is the shortest complete path for accepting WP-201 through WP-210. The tester performs one command and one result check. The runner performs the remaining local and live checks and creates reviewable evidence; it cannot approve its own gate.

## Tester steps

1. Open a clean checkout of the exact candidate commit. Do not edit files before the run.
2. Confirm the repository dependencies were bootstrapped with the pinned Node.js 24.19.0 runtime.
3. Run the acceptance workflow from the repository root:

   ```powershell
   pnpm phase2:acceptance
   ```

4. Read the final console summary. Continue only when it says `Phase 2 guided acceptance: passed`, reports all 17 source probes as passed, and lists no blockers.
5. Give the reviewer these two generated files:

   - `dist/phase2-guided-report.json`
   - `dist/phase2-evidence-proposal.json`

No login, API key, dataset download, interactive answer, or manual evidence transcription is required. The runner uses api.data.gov's public `DEMO_KEY` for three small NPS requests and reads only bounded samples from the other official sources.

## Automated test sequence

The one command executes the following checks in order and records every result against the full candidate commit.

1. **Candidate integrity:** require a clean working tree, resolve the full 40-character commit, and require Node.js v24.19.0.
2. **Canonical contracts:** type-check the shared/data packages and prove schema, provenance, rights, attribution, and deterministic canonical serialization behavior.
3. **Camping safety:** run `T-UNIT-001-C01` through `T-UNIT-001-C06`, including conservative unknown/closed handling and time-sensitive rule behavior.
4. **Connector contracts:** run `T-INT-003-C01` through `T-INT-003-C09` for acquisition, normalization, provenance, rights, coverage, and source-specific failure behavior.
5. **Entity resolution:** prove deterministic matching, stable identifiers, precedence, and conflict handling.
6. **Hostile ingestion:** reject unsafe archives, path traversal, oversized input, malformed data, and untrusted source content.
7. **Live source availability:** make bounded structural probes against all 17 declared registrations: NYS boundary; USGS PAD-US; NYS DEC lands, roads, trails, POI, statewide camping rules, and unit rules; USFS ownership, MVUM roads, and Green Mountain restrictions; RIDB facilities bulk data; NPS parks, campgrounds, and alerts; Geofabrik OpenStreetMap; and USGS 3DEP.
8. **RIDB archive contract:** read only the final 64 KiB of the official daily ZIP, require its ZIP end record plus facilities/address entries, and record archive metadata and a SHA-256 sample digest.
9. **Public-pack reproducibility:** run `T-REL-002-C01` through `T-REL-002-C03` for byte-reproducible output, boundary safety, and reported RIDB/NPS/OSM/3DEP coverage gaps.
10. **Publication boundary:** scan the repository to prevent raw restricted inputs, secrets, or other non-public material from crossing into public output.
11. **Rights and attribution:** require the source catalog's license, review-date, attribution, and redistribution decisions.
12. **Coverage and exclusions:** require documented source/geometry/elevation gaps and explicit excluded records instead of silently overstating coverage.
13. **Evidence validation:** validate the JSON report schema, recompute all ten Phase 2 acceptance criteria, hash the report, and write a separate reviewer proposal.

The nine required Phase 2 test files and all 18 named acceptance cases must be observed in the machine-readable Vitest result. A skipped file or case blocks the run.

## If the run is blocked

Use the report's `blockers` list; do not manually convert a blocked result to passed.

- **Dirty working tree:** commit or safely set aside the changes, then rerun on the intended commit.
- **Wrong Node version:** use the repository's pinned Node.js 24.19.0 toolchain, then rerun.
- **NPS 429/rate-limit response:** create a personal NPS developer key, set `$env:NPS_API_KEY` for that process, and rerun. The personal key overrides `DEMO_KEY` and is never written to evidence.
- **Official source timeout or 5xx:** retry the unchanged clean commit. Any changed commit requires fresh evidence.
- **Local test, format, or boundary failure:** fix the candidate, commit it, and run the full workflow again.
- **Offline mode:** use `pnpm phase2:acceptance --offline` only for diagnosis; offline evidence always remains blocked.

## Reviewer-only completion

1. Confirm the report's `sourceCommit` is the candidate being reviewed and `workingTreeClean` is `true`.
2. Confirm `status` is `passed`, `blockers` is empty, all four commands passed, all nine test files passed, all 18 case IDs were observed, and all 17 source probes passed.
3. Confirm the proposal's `sourceCommit` and `reportSha256` match the reviewed report.
4. Review rights dates, attribution inventory, coverage/exclusions, live-source observations, and residual risks.
5. Update `config/phase2-gate.json` with reviewer identity, review date, evidence path/checksum, all criteria as `passed`, and WP-201 through WP-210 as `accepted`.
6. Run `pnpm phase2:gate`. Acceptance is complete only when this reviewer-controlled gate command passes.

The generated proposal intentionally remains `blocked-pending-reviewer`; neither the runner nor its author may self-approve the acceptance gate.

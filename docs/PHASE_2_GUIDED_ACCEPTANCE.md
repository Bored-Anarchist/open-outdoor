# Phase 2 guided acceptance

The Phase 2 runner reduces the New York data-alpha acceptance pass to one non-interactive command. It runs every local Phase 2 suite, samples all 17 official source registrations concurrently, validates the public boundary, and writes a schema-validated report plus a reviewer proposal. It never changes the gate record.

## Tester preparation

Use a clean checkout of the exact candidate commit with the pinned Node.js 24.19.0 dependencies already bootstrapped. The only tester-provided values are the two API credentials required by the source operators. Keep them in the process environment; do not place them in a repository file or command argument.

```powershell
$env:RIDB_API_KEY = '<RIDB key>'
$env:NPS_API_KEY = '<NPS key>'
pnpm phase2:acceptance
```

The package command enables Node's operating-system CA store so Windows and managed networks can validate the same HTTPS sources without disabling TLS verification.

No interactive questions or manual result transcription are required. Missing credentials, unavailable sources, a dirty checkout, the wrong Node version, or a failed criterion produce a blocked report with the exact retry reason.

## What the command does

1. Binds evidence to the full Git commit and requires a clean working tree.
2. Type-checks the shared and data packages.
3. Runs the complete data-package suite and independently requires all nine Phase 2 test files and all 18 named cases.
4. Checks the Phase 2 files with Prettier and runs the public publication-boundary scanner.
5. Probes all 17 official New York, RIDB, NPS, Geofabrik/OpenStreetMap, and USGS registrations concurrently with a 20-second per-source timeout.
6. Validates a small response sample against each source family contract without retaining source payloads.
7. Re-evaluates canonical, camping-safety, connector, resolution, hostile-input, rights/attribution, coverage/exclusion, live-source, reproducible-pack, and publication-boundary criteria.
8. Writes `dist/phase2-guided-report.json` and `dist/phase2-evidence-proposal.json`.

The runner reads at most 64 KiB per source. It does not download the region-sized OSM PBF or complete government datasets merely to prove endpoint availability. Complete-pagination, checksum, normalization, coverage, exclusion, and byte-reproducibility behavior are exercised by deterministic contract fixtures; live probes establish that the corresponding official contracts remain reachable and structurally recognizable. This is the Phase 2 data-alpha gate, not the Phase 3 production basemap or production pack build.

## Safe retry modes

Run `pnpm phase2:acceptance --offline` to debug local failures without network calls. Offline mode always reports `blocked` and cannot be used as acceptance evidence.

Transient source failures require only rerunning the same command on the same clean candidate. A changed commit requires a fresh report. Credentials are sent only in the declared request headers, never placed in URLs, output, report fields, hashes, or failure excerpts.

The local type, test, format, and boundary subprocesses run with both API-key variables removed from their environments. Only the bounded RIDB and NPS probe requests can access those values.

Custom generated-file destinations are optional:

```powershell
pnpm phase2:acceptance --output dist/phase2-report.json --proposal dist/phase2-proposal.json
```

## Reviewer acceptance

The reviewer verifies the report and proposal hashes, exact commit, all 17 source results, rights-review dates and attribution inventory, coverage/exclusion results, and residual risks. Only then may the reviewer update `config/phase2-gate.json`: every WP-201 through WP-210 package becomes `accepted`, every criterion becomes `passed`, and the reviewed report checksum, date, and reviewer identity are recorded.

Run `pnpm phase2:gate` after that edit. A proposal never accepts itself, and the gate has no waiver path for ambiguous rights, raw-boundary leakage, stale positive camping results, missing provenance, skipped sources, or failed reproducibility.

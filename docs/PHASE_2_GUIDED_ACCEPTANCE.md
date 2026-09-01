# Phase 2 guided acceptance

The Phase 2 runner reduces the New York data-alpha acceptance pass to one non-interactive command. It runs every local Phase 2 suite, checks all 17 official source registrations, validates the public boundary, and writes a schema-validated report plus a reviewer proposal. It never changes the gate record.

> **RIDB migration notice:** ADR-046 replaces the RIDB live-API probe with Recreation.gov's official daily JSON bulk download. The committed runner still uses the older RIDB API-key path and must not be used to approve Phase 2 until its implementation and tests are aligned with this guide. The bulk-download migration removes `RIDB_API_KEY` from tester preparation and from the mobile application's secret inventory.

## Tester preparation

Use a clean checkout of the exact candidate commit with the pinned Node.js 24.19.0 dependencies already bootstrapped. The only tester-provided value is the NPS API credential. Keep it in the process environment; do not place it in a repository file or command argument. RIDB needs no tester-provided credential or manually downloaded file: the runner acquires the current official JSON snapshot from [RIDB Recreation Data](https://ridb.recreation.gov/download).

```powershell
$env:NPS_API_KEY = '<NPS key>'
pnpm phase2:acceptance
```

The package command enables Node's operating-system CA store so Windows and managed networks can validate the same HTTPS sources without disabling TLS verification.

No interactive questions, RIDB account, RIDB key, manual RIDB download, or manual result transcription are required. A missing NPS credential, unavailable source or RIDB snapshot, a dirty checkout, the wrong Node version, or a failed criterion produces a blocked report with the exact retry reason.

## What the command does

1. Binds evidence to the full Git commit and requires a clean working tree.
2. Type-checks the shared and data packages.
3. Runs the complete data-package suite and independently requires all nine Phase 2 test files and all 18 named cases.
4. Checks the Phase 2 files with Prettier and runs the public publication-boundary scanner.
5. Checks all 17 official New York, RIDB, NPS, Geofabrik/OpenStreetMap, and USGS registrations. RIDB is acquired from its official daily JSON bulk download; API-backed sources use bounded live probes.
6. Streams the RIDB archive through checksum and contract validation, records its acquisition time and digest, and deletes the temporary raw snapshot after validation. Other source families retain only small structural samples.
7. Re-evaluates canonical, camping-safety, connector, resolution, hostile-input, rights/attribution, coverage/exclusion, live-source, reproducible-pack, and publication-boundary criteria.
8. Writes `dist/phase2-guided-report.json` and `dist/phase2-evidence-proposal.json`.

Except for the RIDB JSON snapshot, the runner reads at most 64 KiB per source. It does not download the region-sized OSM PBF or other complete government datasets merely to prove endpoint availability. The RIDB snapshot is the official acquisition artifact, so it is streamed to a temporary location, bounded by the configured byte ceiling, checksummed, structurally sampled, and removed after the report records its digest. Complete normalization, coverage, exclusion, and byte-reproducibility behavior remain exercised by deterministic contract fixtures. This is the Phase 2 data-alpha gate, not the Phase 3 production basemap or production pack build.

## Safe retry modes

Run `pnpm phase2:acceptance --offline` to debug local failures without network calls. Offline mode always reports `blocked` and cannot be used as acceptance evidence.

Transient source failures require only rerunning the same command on the same clean candidate. A changed commit or a changed RIDB snapshot digest requires a fresh report. The NPS credential is sent only in its declared request header and is never placed in URLs, output, report fields, hashes, or failure excerpts. RIDB acquisition uses no credential.

The local type, test, format, and boundary subprocesses run with `NPS_API_KEY` removed from their environments. Only the bounded NPS probe requests can access that value. `RIDB_API_KEY` is neither requested nor read.

Custom generated-file destinations are optional:

```powershell
pnpm phase2:acceptance --output dist/phase2-report.json --proposal dist/phase2-proposal.json
```

## Reviewer acceptance

The reviewer verifies the report and proposal hashes, exact commit, all 17 source results, rights-review dates and attribution inventory, coverage/exclusion results, and residual risks. Only then may the reviewer update `config/phase2-gate.json`: every WP-201 through WP-210 package becomes `accepted`, every criterion becomes `passed`, and the reviewed report checksum, date, and reviewer identity are recorded.

Run `pnpm phase2:gate` after that edit. A proposal never accepts itself, and the gate has no waiver path for ambiguous rights, raw-boundary leakage, stale positive camping results, missing provenance, skipped sources, or failed reproducibility.

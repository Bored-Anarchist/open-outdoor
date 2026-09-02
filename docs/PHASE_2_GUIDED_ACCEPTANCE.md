# Phase 2 guided acceptance

The Phase 2 runner reduces the New York data-alpha acceptance pass to one non-interactive command. It runs every local Phase 2 suite, checks all 17 official source registrations, validates the public boundary, and writes a schema-validated report plus a reviewer proposal. It never changes the gate record. Follow the [Phase 2 acceptance checklist](PHASE_2_ACCEPTANCE_CHECKLIST.md) for the exact tester and reviewer sequence. ADR-046 is implemented: RIDB uses Recreation.gov's official daily JSON ZIP and does not require an API key.

## Tester preparation

Use a clean checkout of the exact candidate commit with the pinned Node.js 24.19.0 dependencies already bootstrapped. No credential is required for the normal acceptance run. The three bounded NPS probes use api.data.gov's public `DEMO_KEY`; RIDB needs no credential or manually downloaded file and is checked through the current official archive published via [RIDB Recreation Data](https://ridb.recreation.gov/download).

```powershell
pnpm phase2:acceptance
```

The package command enables Node's operating-system CA store so Windows and managed networks can validate the same HTTPS sources without disabling TLS verification.

No interactive questions, account, API key, manual download, or manual result transcription are required. An unavailable source or snapshot, an exhausted shared NPS demo quota, a dirty checkout, the wrong Node version, or a failed criterion produces a blocked report with the exact retry reason.

## What the command does

1. Binds evidence to the full Git commit and requires a clean working tree.
2. Type-checks the shared and data packages.
3. Runs the complete data-package suite and independently requires all nine Phase 2 test files and all 18 named cases.
4. Checks the Phase 2 files with Prettier and runs the public publication-boundary scanner.
5. Checks all 17 official New York, RIDB, NPS, Geofabrik/OpenStreetMap, and USGS registrations. RIDB is acquired from its official daily JSON bulk download; API-backed sources use bounded live probes.
6. Range-reads the final 64 KiB of the RIDB ZIP, validates its end record and required facilities/address entries, and records the archive byte count, last-modified value, ETag, and directory-sample SHA-256. Other source families retain only small structural samples.
7. Re-evaluates canonical, camping-safety, connector, resolution, hostile-input, rights/attribution, coverage/exclusion, live-source, reproducible-pack, and publication-boundary criteria.
8. Writes `dist/phase2-guided-report.json` and `dist/phase2-evidence-proposal.json`.

The runner reads at most 64 KiB per source. It does not download the 570 MB RIDB ZIP, region-sized OSM PBF, or other complete government datasets merely to prove endpoint availability. The RIDB connector separately range-fetches only `Facilities_API_v1.json` and `FacilityAddresses_API_v1.json`, joins them by facility ID, selects New York addresses, and stores a checksummed raw acquisition artifact. That extraction, normalization, coverage, exclusion, and byte-reproducibility behavior is exercised with deterministic contract fixtures during the guided run. This is the Phase 2 data-alpha gate, not the Phase 3 production basemap or production pack build.

## Safe retry modes

Run `pnpm phase2:acceptance --offline` to debug local failures without network calls. Offline mode always reports `blocked` and cannot be used as acceptance evidence.

Transient source failures require only rerunning the same command on the same clean candidate. A changed commit or changed RIDB archive metadata/directory sample requires a fresh report. If the public NPS demo quota is exhausted, set a personal key for the retry only; it overrides `DEMO_KEY`:

```powershell
$env:NPS_API_KEY = '<personal NPS key>'
pnpm phase2:acceptance
```

The NPS key is sent only in its declared request header and is never placed in URLs, output, report fields, hashes, or failure excerpts. RIDB acquisition uses no credential.

The local type, test, format, and boundary subprocesses run with `NPS_API_KEY` removed from their environments. Only the three bounded NPS probe requests can access a personal override. `RIDB_API_KEY` is neither requested nor read.

Custom generated-file destinations are optional:

```powershell
pnpm phase2:acceptance --output dist/phase2-report.json --proposal dist/phase2-proposal.json
```

## Reviewer acceptance

The reviewer verifies the report and proposal hashes, exact commit, all 17 source results, rights-review dates and attribution inventory, coverage/exclusion results, and residual risks. Only then may the reviewer update `config/phase2-gate.json`: every WP-201 through WP-210 package becomes `accepted`, every criterion becomes `passed`, and the reviewed report checksum, date, and reviewer identity are recorded.

Run `pnpm phase2:gate` after that edit. A proposal never accepts itself, and the gate has no waiver path for ambiguous rights, raw-boundary leakage, stale positive camping results, missing provenance, skipped sources, or failed reproducibility.

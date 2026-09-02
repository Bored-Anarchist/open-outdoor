# Phase 3 guided acceptance

The Phase 3 runner combines the Product MVP's deterministic repository checks with the required physical iPhone evidence. It binds every result to one clean commit, validates a coordinate-free device report, and writes a schema-validated acceptance report plus a reviewer proposal. It never edits a gate record or treats replay/simulator output as physical evidence.

## Prepare the candidate

Use a clean checkout at the exact candidate commit with Node.js 24.19.0 and locked dependencies installed. Build and install that commit's local/public iOS candidate on the declared iPhone 14 running iOS 26.6. Record the installed binary SHA-256.

First generate and review the physical template:

```powershell
pnpm phase3:acceptance
```

This runs the local checks, writes `dist/phase3-physical-report-template.json`, and exits blocked because no physical evidence was supplied. Copy the template outside the public checkout if its notes could become identifying. Never add coordinates, routes, account/device identifiers, photos, or raw diagnostics.

## Complete the physical workflow

For the same candidate and installed binary:

1. Prove installation and offline launch with the production catalog.
2. Measure cold launch, local search, dense-map frame rate/stalls/memory, catalog activation, and first launch after switch.
3. Exercise offline explore/search/details, interrupted activation/rollback, explicit composed origins, private-catalog removal, full backup/reinstall/restore, and every degraded/error state.
4. Complete VoiceOver, Dynamic Type, bold text, increased contrast, differentiate-without-color, reduced motion, dark mode, touch-target, and one-handed checks.
5. Perform three independent 180-minute Balanced runs and three independent 180-minute Endurance runs. Record only aggregate battery, thermal, checkpoint, storage, stopped-sensor, offline, recovery, degraded-GPS, and accessibility results.
6. Set the tester attestation only after every recorded value was checked against the source evidence.

Run the final ingestion:

```powershell
pnpm phase3:acceptance -- --physical-report C:\approved-private-evidence\phase3-physical.json
```

The path may be outside the repository. The generated public report retains only its base file name and SHA-256, not the private path or raw evidence.

## Outputs and acceptance

The runner writes:

- `dist/phase3-guided-report.json`
- `dist/phase3-evidence-proposal.json`

Acceptance requires all seven local commands, all nine required test files, the physical schema, exact commit match, installability, six device flows, nine accessibility checks, ten performance budgets, and all six field runs. Any failure produces a blocker and a non-zero exit.

The proposal recommends WP-301 through WP-307 only after a passing run. A separate reviewer must verify the report checksum, candidate/binary identity, private raw evidence, redaction, and residual risk before updating any authoritative milestone record.

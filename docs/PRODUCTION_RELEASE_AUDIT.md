# Production release audit (WP-506)

WP-506 implements the final acceptance procedure. Per owner-approved ADR-050, physical tests and independent review execution happen after WP-506 implementation. Production acceptance remains blocked until all evidence passes. A passing unit fixture, browser export or shared clean checkout is not an approved production release.

## Public clean checkout

On a Windows environment provisioned only with public tools and no private roots, credentials or user data, run:

```powershell
./scripts/Test-ReleaseCleanRoom.ps1 -Commit <40-character-published-commit>
```

The runner fetches the public remote into a new uniquely named checkout, uses a fresh dependency store with frozen locks, runs quality/privacy checks, and exports the web harness and iOS JavaScript. Node 24.19.0 and pnpm 11.20.0 are required. Logs stay local; the report contains command statuses and hashes, with no log contents. It never deletes existing work. Inspect the local logs before sharing; the script does not sandbox the Windows host or prove host isolation. A fresh VM or another contributor's clean machine is required for independent evidence. Provision Python/uv and execute the documented Python tests there as well.

The runner reports shared-build implementation results separately from production acceptance. It does not build a signed native iOS app on Windows. Two production reproductions must use the pinned macOS/Xcode/native inputs, exact source commit and same environment digest, with one authorized non-author builder. Compare unsigned native payloads before nondeterministic Apple signing if necessary, and retain both that comparison and the exact installed binary hash. The automated gate currently requires identical final candidate artifact hashes: signing variability is a blocker, not silently normalized. Record a reviewed reproducible packaging procedure before attempting acceptance.

## Assemble the evidence

Run `pnpm phase5:audit` to generate `dist/release-audit/audit-template.json`, `report.json` and `report.md`. With no candidate it exits 1 and lists blocked acceptance, as intended. Each of PROJECT_SCOPE.md section 23's 26 numbered requirements has its own `AC-01` through `AC-26` row. No omission, duplicate, waiver or deferred status can pass. Criteria 11, 14, 17, 23 and 24 require the applicable physical and milestone evidence in addition to automated regressions.

Complete the template with the exact source commit and installed iOS binary SHA-256. Every criterion uses `status: passed` and an `evidence` array of reviewed file names. Include sanitized candidate-bound reports for Windows onboarding, licensing/notices, public input classification, external private-root/downstream isolation, public-only operation, read-only catalogs/private user stores, rollback/remaps, source rights, NY coverage, background/recovery/provisioning/storage, offline capability, entity resolution, elevation, encrypted restore, incident response, iOS protection/deletion, private CI, catalog trust, schema compatibility, geospatial contracts, diagnostics, numeric budgets, M4, contribution identity and hosted-CI usage. A test suite name alone is not proof of the whole criterion.

Attach one review each for `release`, `privacy`, `rights` and `reproduction`, containing exactly `role`, `reviewer` (public handle), `approved: true`, and an inventoried `evidence` file. Reviews attest actual inspection, scope/candidate coverage, conflicts and findings. Privacy review includes revocation/containment/history handling and safe communications. Rights review checks all source/field grants, expiry/freshness, exclusions, attribution and complete platform SBOM/DBOM inventories. Resolve critical/high release defects and open source-permission issues before approval.

The `cleanRoom` array contains exactly two records with `runId`, `builder`, `sourceCommit`, `environmentSha256`, `artifactSha256`, `publicOnly`, `freshCheckout`, `checksPassed`, and `evidence`. Both booleans and checks must be true; artifact digests match the installed candidate, environment digests match each other, run IDs/builders/evidence digests differ. The independent builder must be an authorized reproduction reviewer outside the author list. Evidence is a signed, reviewed assertion: software cannot establish who operated a machine merely from a handle.

Set `physicalReport` to the completed WP-502/WP-503 report filename. The existing strict evaluator rechecks the actual accessibility cases, measured budgets and six three-hour endurance runs. Its reviewer must have an independently assigned `physical` role and must not be a candidate author. Legacy physical gates outside that report are also required under their individual criterion rows. ADR-050 changes timing only.

All evidence file names, the audit JSON and the installed binary must appear in the WP-504 signed release inventory. Keep private raw tests/data outside the public bundle; use approved redacted reports and privately reviewed references. The fixed-shape audit schema excludes freeform private diagnostics. Review the underlying attachments before assigning APPROVED_REDACTED classification; hashes do not establish privacy or rights.

## Independent acceptance

Obtain both policies separately from the artifact publisher. The WP-504 release trust policy authenticates the approved commit, materials, channel, sequence and active signer. A separate audit policy contains exactly:

```json
{
  "sourceCommit": "40-character-approved-commit",
  "binarySha256": "64-character-installed-binary-digest",
  "authors": ["candidate-author"],
  "reviewers": [
    {"handle": "release-owner", "roles": ["release"]},
    {"handle": "independent-reviewer", "roles": ["privacy", "rights", "reproduction", "physical"]}
  ]
}
```

These illustrative identities are not appointments. The owner verifies actual roles, conflicts, release quorum, exact-head approvals, branch protection and supported-version obligations under GOVERNANCE.md before authorizing this policy. A candidate cannot appoint its own reviewers. One real independent reviewer may hold multiple specialist roles if qualified and conflict-free.

```text
pnpm phase5:audit BUNDLE RELEASE_POLICY.json AUDIT_POLICY.json audit.json app.ipa
```

The CLI first verifies WP-504 signatures and all inventory bytes, requires the public channel and the exact installed artifact, then evaluates all criteria, reviews, reproduction and physical evidence. Missing/invalid/tampered inputs exit 1. Only complete validated evidence exits zero. Reports contain controlled blocker codes rather than untrusted input/log contents. They are derived outputs outside the signed input bundle to avoid circular signatures; archive the report with its candidate and policy hashes through the release review process. Never rewrite evidence in an already sealed bundle.

No release, tag, merge, private key or production approval is created by this command.

For the coordinated Windows command and persistent iOS guide, use [guided production acceptance](GUIDED_PRODUCTION_ACCEPTANCE.md). It collects observations and prepares this audit; it does not waive the signed evidence, numeric measurement or independent review requirements.

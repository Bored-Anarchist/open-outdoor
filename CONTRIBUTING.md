# Contributing to Open Outdoor

Thank you for helping build Open Outdoor. The project is in planning/bootstrap status; implementation work must follow an accepted work package and decision baseline.

## Before contributing

Read:

- [Project scope](PROJECT_SCOPE.md)
- [Development workflow](docs/DEVELOPMENT_WORKFLOW.md)
- [Data, privacy, and rights plan](docs/DATA_PRIVACY_RIGHTS_PLAN.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

Do not post personal routes, exact private locations, credentials, signing material, permission-limited source records, copyrighted payloads, or unredacted diagnostics in public issues or pull requests.

## Contribution process

1. Select or open an issue linked to a work-package and requirement ID.
2. Confirm dependencies and relevant ADRs are accepted.
3. Work from a short-lived branch based on current `main`.
4. Use only synthetic, approved redacted, or redistribution-compatible fixtures.
5. Add or update tests, documentation, traceability, risks, and decisions with the implementation.
6. Run the public quality, privacy, and rights checks defined by the repository.
7. Open a pull request describing scope, evidence, risks, and private-data impact.
8. Resolve review and ensure required checks pass at the exact head commit.

Use the repository's issue forms and pull-request template. Blank public issues are disabled because an unstructured report is more likely to omit traceability or expose sensitive evidence. The templates never replace the private reporting route in [SECURITY.md](SECURITY.md).

Run applicable checks locally before pushing. Keep commits and force-updates deliberate so hosted CI is not repeatedly triggered for work that can be validated on the contributor's computer.

The repository does not yet implement the planned application build commands. Until WP-002 completes, run the WP-001 governance check from a public Windows checkout:

```powershell
./scripts/Test-Wp001.ps1
```

Repository protections and the required-check rollout are defined in the [public repository controls](docs/REPOSITORY_CONTROLS.md).

## Contribution attestation and identity privacy

Do not add a legal name, personal email address, home/work location, phone number, device/account identifier, or other personal identifying detail to commits, issues, pull requests, fixtures, screenshots, logs, or documentation. Use a public project handle and the hosting provider's privacy-protected `noreply` commit address. Repository history is durable.

The project does not require a public DCO `Signed-off-by` line because it would add contributor name/email data to permanent Git history. Instead, every pull request includes this account-bound attestation:

> I have the right to submit this contribution, and I license it under the repository's stated contribution terms.

The hosting-account audit trail and attestation identify the contribution without requiring additional personal details. Contributors who cannot make that attestation must not submit the material.

## Licensing and provenance

Contributions intentionally submitted for inclusion are licensed under Apache License 2.0 unless an accepted compatible license is explicitly recorded. Third-party code, generated output, data, media, and AI-assisted work require provenance and rights review; generated origin never waives copyright or license obligations. Provenance records use public handles and source identifiers, not personal contact details.

## Security and privacy reports

Do not open a public issue for a vulnerability, exposed secret, private-data leak, unsafe catalog, or source-rights incident. Follow [SECURITY.md](SECURITY.md).

## Review expectations

Reviewers evaluate correctness, tests, accessibility, privacy, security, source rights, migrations, performance/energy impact, and documentation. Browser/simulator evidence cannot replace a required physical-iPhone gate.

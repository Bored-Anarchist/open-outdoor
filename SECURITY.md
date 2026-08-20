# Security Policy

## Supported status

The repository is currently planning/bootstrap documentation and has no released application. Once releases exist, the release plan will list supported app, catalog, backup, and private-extension versions. Only supported versions receive security fixes unless the repository owner approves an exceptional backport.

## Reporting a vulnerability or sensitive incident

Use GitHub Private Vulnerability Reporting for this repository. WP-001 requires it to be enabled as part of public-host activation. If the control is unexpectedly unavailable, contact the repository owner through a non-public contact method exposed by the owner's hosting account and request a secure reporting channel; do not fall back to a public issue.

Do not open a public issue or discussion for:

- vulnerabilities or exploit details;
- exposed credentials, signing/recovery keys, or private filesystem paths;
- personal routes, photos, notes, device/account identifiers, or backups;
- permission-limited source records or license/terms evidence that must remain private;
- malicious fixture payloads that would be unsafe to publish; or
- catalog/source errors that could cause immediate safety or legal harm.

Send the minimum information necessary: affected version/commit, impact, reproduction using synthetic data where possible, and a safe way to contact you. Do not send real secrets or personal datasets unless the responder explicitly establishes an approved encrypted channel.

## Response targets

- Acknowledge a new report within 3 business days.
- Triage severity, exposure, and containment within 7 business days where possible.
- Rotate exposed secrets immediately on confirmation or credible suspicion.
- Coordinate a remediation and disclosure timeline based on user/source risk rather than a fixed public deadline.

These are response objectives, not a warranty.

## Severity priorities

Critical issues include private-data publication, arbitrary code execution through imports/connectors, signing or update compromise, backup decryption bypass, destructive catalog/private-data corruption, and incorrect safety status caused by integrity compromise.

High issues include persistent privilege escalation, secret exposure limited to private infrastructure, reliable denial of recording/recovery, or bypass of rights/publication gates.

## Handling and disclosure

Reports and evidence are `PRIVATE_OPERATIONAL` or `SECRET`. Access is least privilege. Public advisories describe impact, affected versions, fixes, and credit without exposing private content or exploit detail that would create disproportionate risk.

The project does not promise monetary rewards. Good-faith research that avoids privacy violations, service disruption, unauthorized source access, and data destruction will be handled respectfully.

## Supply-chain and workflow requirements

- Untrusted pull-request code receives no private data or release secrets.
- Privileged `pull_request_target` workflows must never execute untrusted head code.
- Private-data jobs use isolated ephemeral runners or a documented equally strong local boundary.
- Third-party actions and dependencies are pinned and reviewed.
- Release/catalog authenticity and provenance follow the configuration and release plan.

## Incident response

The detailed containment process is defined in the [threat model](docs/THREAT_MODEL.md), [diagnostics plan](docs/DIAGNOSTICS_PLAN.md), and [data/privacy plan](docs/DATA_PRIVACY_RIGHTS_PLAN.md). Deleting a visible file does not close a Git-history, cache, artifact, or secret exposure.

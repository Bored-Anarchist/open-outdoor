# Public Repository Controls

**Status:** Implemented configuration; hosting activation requires the public repository identifier  
**Work package:** `WP-001`  
**Requirements:** `REQ-OSS-001`, `REQ-OSS-002`, `REQ-OSS-003`, `REQ-CI-001`

## 1. Protected branch baseline

The committed [main ruleset](../.github/rulesets/main.json) is the source-controlled baseline for the public host. It targets the default branch and:

- blocks branch deletion and force pushes for every actor, including administrators;
- requires pull requests, linear history, resolved review conversations, and squash merges;
- requires `documentation-integrity` to pass on the current head; and
- has no bypass actors.

During the owner-led single-maintainer stage, the required approval count is zero so the owner is not forced to manufacture an independent approval. Accepted changes remain auditable through pull requests, account-bound attestation, exact-head checks, and squash commits. Once another independent maintainer is active, the repository owner updates this ruleset to require at least one approval. Release quorum remains governed separately by [GOVERNANCE.md](../GOVERNANCE.md).

`documentation-integrity` is the only executable status context in WP-001. WP-002 adds `windows-quality` and the initial `design-accessibility-traceability` skeleton; WP-003 adds `security-rights-privacy`; WP-006 adds the pinned `macos-ios-build` gate. Each context must exist and pass safely before it is added as a required ruleset context. Required workflows must not use top-level path filtering that leaves a required check absent; inexpensive routing jobs may succeed explicitly when expensive work is not applicable.

## 2. Host settings

The host configuration must also:

- enable issues and the committed issue forms while disabling blank public issues;
- allow squash merges only and delete merged head branches;
- set default GitHub Actions token permissions to read-only and prevent Actions from approving pull requests;
- enable GitHub Private Vulnerability Reporting;
- send no secrets to untrusted pull requests and never execute untrusted head code through `pull_request_target`; and
- retain no private or secret material in public caches, artifacts, logs, or releases.

The repository owner applies the idempotent configuration after creating or linking the public repository:

```powershell
./scripts/Test-Wp001.ps1
./scripts/Set-GitHubRepositoryControls.ps1 -Repository 'OWNER/REPOSITORY' -Confirm
```

The second command changes public GitHub settings and therefore requires authenticated repository-administration authority. The committed configuration alone does not prove that host settings are active.

## 3. Verification and evidence

Before WP-001 acceptance, the repository owner records public-safe evidence that:

1. a clean public clone passes `./scripts/Test-Wp001.ps1`;
2. a test pull request cannot merge until `documentation-integrity` passes at its current head;
3. pushing a new head cancels the superseded workflow run;
4. force push and deletion of `main` are denied;
5. unresolved review conversations block a merge;
6. issue forms and the pull-request template render, including the exact account-bound attestation;
7. the Actions token default is read-only and workflows cannot approve pull requests; and
8. Private Vulnerability Reporting is enabled without publishing a personal contact address.

Evidence uses a repository URL, safe run/PR identifiers, configuration screenshots with account/device identifiers removed, and the exact accepted commit. It must not include access tokens, personal contact details, private locations, or security-report content.

## 4. Change control

Ruleset changes use a pull request linked to `WP-001` or its successor, applicable `REQ-OSS-*`/`REQ-CI-001` requirements, and `T-REL-004`. Weakening protection requires repository-owner approval, security/privacy review, a dated rationale, and a compensating control. An emergency containment change is reviewed and restored or superseded as soon as the incident permits.

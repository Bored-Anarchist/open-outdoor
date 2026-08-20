# Development and Repository Workflow

**Status:** Proposed

## 1. Principles

- `main` is releasable at the level claimed by the current phase.
- Work begins from an approved work package and traceable requirement/test IDs.
- Public work uses only public-safe fixtures and evidence.
- Small pull requests deliver thin vertical value and preserve reviewability.
- Phase/release acceptance occurs at an exact commit and artifact checksum.

## 2. Issue and task structure

Each implementation issue records:

- work-package ID, priority, lifecycle status, milestone, accountable public project handle/role alias, and accountable RACI role;
- requirement IDs and user/engineering outcome;
- in-scope and explicitly out-of-scope behavior;
- dependencies and accepted ADRs;
- privacy, rights, security, accessibility, migration, energy, and documentation impact;
- planned tests/evidence IDs;
- completion/acceptance criteria; and
- risk-register changes.

An `XL` package must be decomposed before code work. Decomposition does not remove the parent package's phase gate.

## 3. Branch and pull-request flow

1. Branch from current protected `main` using a short-lived descriptive branch.
2. Implement one cohesive change with tests and docs.
3. Run local public quality/privacy checks before push.
4. Open a pull request linking package/requirement/test IDs.
5. CI runs on the exact head when its path and gate conditions require it; untrusted forks receive no secrets. Private CI uses an ephemeral isolated single-job boundary, separate public/private caches and artifacts, and never uses privileged `pull_request_target` execution of an untrusted head.
6. Resolve review discussions and rerun checks after changes.
7. Squash merge after required checks/review pass.
8. Record phase/device evidence separately when the change requires controlled physical testing.

Private downstream work follows equivalent controls inside the private repository. Public contributions are recreated on clean public branches, never opened from private history.

## 4. Required public checks

Hosted minutes are a constrained resource. Contributors run applicable checks locally before push. Workflows use path filters, one concurrency group per pull request with cancellation of superseded runs, fail-fast behavior, narrow matrices, explicit timeouts, and safe immutable caches. No routine schedule/cron is enabled without measured need. Documentation-only changes run only lightweight documentation integrity checks. macOS/native, full-catalog, physical-device, and release jobs run only when relevant paths change and a protected-branch, milestone, or release gate requests them.

- `windows-quality`: formatting, lint, typecheck, unit/integration tests, deterministic fixtures.
- `security-rights-privacy`: dependency/secret/input gates, source classifications, licenses, public artifact inspection.
- `design-accessibility-traceability`: semantic tests, docs/RTM links, UI states where applicable.
- `macos-ios-build`: pinned native generation/build matrix without personal signing material.
- `documentation-integrity`: relative links, requirement/work-package/test/ADR/risk references, heading/fence/table structure, and change-history fields.

Release and phase-gate changes additionally require the named physical/release evidence in the test plan. Branch rules apply to administrators and prevent force push/deletion.

## 5. Commit and contribution policy

- Contributions use the account-bound rights/license attestation in `CONTRIBUTING.md`; public DCO sign-off lines are not required.
- Accepted contributions are licensed under Apache-2.0 unless a file's compatible license is explicit.
- Third-party code/data/assets declare origin, license, version, and modification.
- Generated or AI-assisted work receives the same authorship, rights, review, security, and test scrutiny.
- Commits, authorship metadata, issues, reviews, evidence, and artifacts contain no unnecessary personal details. Contributors use public project handles and privacy-protected platform commit addresses rather than legal names, personal email, locations, phone numbers, device/account identifiers, or unredacted logs.

## 6. Fixture policy

Every public fixture is one of:

- generated synthetic data with generator/seed;
- approved redistribution-compatible source subset with manifest/attribution; or
- reviewed redacted evidence that cannot reconstruct the private original.

Fixture metadata declares classification, source, license/permission, fields, allowed use, and reviewer. Renaming or coarsening a real route is not sufficient anonymization.

## 7. Definition of ready

A task is ready when:

- parent work package is unblocked;
- behavior and exclusions are clear;
- relevant ADRs are accepted;
- requirement/test IDs exist;
- required safe fixtures and environments are available;
- source rights are current; and
- acceptance evidence can be produced without exposing private material.

## 8. Definition of done

A task is done when:

- implementation and migrations are complete;
- unit/contract/integration/end-to-end tests pass at the appropriate layer;
- privacy/rights/security/accessibility/energy impacts are tested or explicitly not applicable with rationale;
- public/private compatibility remains intact;
- docs, RTM, release configuration, risks, and decisions are updated;
- no placeholder, debug secret, private path, unclassified artifact, or silent fallback remains;
- checks pass at the exact head; and
- required reviewer/physical evidence is accepted.

## 9. Change-control triggers

Update scope and affected plans before implementing a change that adds:

- hosted runtime/account/cloud synchronization;
- new personal data or continuous sensor collection;
- a new source/acquisition mode or broader redistribution;
- an App Store/public signing channel;
- a new platform or paid-team-only capability;
- a breaking catalog/private-extension interface;
- altered elevation/energy/size/safety thresholds; or
- behavior that could delete, auto-publish, or reclassify private data.

Initial Android delivery, a consumer web product, and turn-by-turn/rerouting/off-route guidance are scope changes rather than ordinary backlog items. Changing the Product MVP boundary also requires an approved scope/RTM/roadmap update.

## 10. Security and sensitive reports

Security/privacy reports use the private process in `SECURITY.md` once WP-001 creates it. Public issues use synthetic reproductions. Maintainers redact accidental sensitive posts and do not ask reporters to upload private datasets or logs publicly.

## 11. Release branch policy

Normal development remains trunk-based on protected `main`. A short-lived release branch is allowed only for stabilization of an identified candidate. Fixes land on `main` first where practical and are cherry-picked with traceability. Long-lived divergent public release branches require an accepted decision.

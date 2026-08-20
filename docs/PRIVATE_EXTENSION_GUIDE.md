# Private Extension Guide

**Status:** Phase 0 composition and isolation spike implemented

Set `OUTDOOR_PRIVATE_ROOT` to an absolute directory outside the public checkout containing `open-outdoor.private.json`; run `pnpm catalog:private`. Validate the composition boundary with `pnpm test:private-root` and the isolated downstream template with `pnpm test:private-downstream`. The repository-local example is inert and deliberately rejected as an active private root.

## 1. Purpose

Allow personal, permission-limited, or organization-only data and connector code to extend Open Outdoor without entering the public repository or becoming a hidden requirement of the public build.

## 2. Supported modes

### Mode A — external Windows private root

Preferred for an individual or local hobby build:

```text
C:\Projects\open-outdoor\
D:\OpenOutdoorPrivate\
  private-extension.yaml
  config\
  connectors\
  raw\
  staging\
  media\
  catalogs\
  artifacts\
  logs\
  evidence\
```

The public checkout is ordinary open-source Git. The private root is explicit, external, access-controlled, backed up separately, and never scanned into public artifacts.

### Mode B — private downstream repository

Use a separate private Git repository created as a confidential downstream copy/mirror, then add the public repository as `upstream`. A native fork of a public GitHub repository is public and is not the confidential mode.

The private repository may contain private connector code, manifests, configurations, permission-evidence references, and only fixtures whose rights and retention policy explicitly permit indefinite versioned Git history. Data subject to expiry, deletion, revocation, mutable personal content, or limited historical retention belongs in access-controlled external private storage, regardless of size. Raw data, media, user records, logs, and generated catalogs normally remain external. Keep secrets, signing keys, and recovery keys outside Git.

## 3. Private extension manifest

The versioned manifest declares:

- extension ID/name/version;
- compatible public-core version range;
- private package/connector entry points;
- enabled source manifest paths;
- region/catalog build profiles;
- distribution class (`private_user` or `private_organization`);
- required secret names, never values;
- output and log roots;
- public/private dependency lock/provenance references; and
- optional capability flags exposed to the app.

An incompatible extension fails before acquisition/build and explains the required core range.

## 4. Local configuration sequence

The planned workflow is:

1. Clone and bootstrap the public project normally.
2. Create/select an external private root with restricted permissions.
3. Set `OUTDOOR_PRIVATE_ROOT` or pass the explicit private-root option to a private task.
4. Validate that the resolved path is outside the public checkout and not a filesystem root.
5. Register secrets in Windows Credential Manager or the approved private CI secret store.
6. Add private manifests/connectors/inputs under the private root.
7. Run private validation and a dry-run inclusion/exclusion report.
8. Generate a classified private regional catalog/artifact.
9. Install using the private build channel and keep reports in private evidence storage.

No public command should contact, index, or enumerate the private root unless the user explicitly selects a private task.

## 5. Private connector requirements

A private connector uses the same public SDK and must pass the same:

- manifest/status/rights checks;
- untrusted input, parser, archive, geometry, and resource limits;
- raw retention and provenance rules;
- canonical schema and entity-resolution interfaces;
- attribution and freshness obligations;
- catalog compatibility/checksum/size rules; and
- private output classification/publication prohibition.

Private mode permits authorized private distribution; it does not permit scraping, bypassing source controls, or ignoring terms.

## 6. Build composition

```text
public core + public packages + public catalog profile
                     plus
private extension packages + private manifests + private profile
                     →
distinct private build channel + optional private read-only catalog
```

- Public and private dependency/provenance records remain separate in the composed report.
- Private hooks are limited to documented extension points; arbitrary pre/post shell execution is not accepted by default.
- Extension packages and executables must be allowlisted by identifier and pinned digest/version; a manifest cannot introduce an arbitrary command.
- A private extension receives only its declared input/output roots and secret names, with least-privilege credentials scoped to that connector and run.
- The app queries public and private catalogs as a logical collection while retaining origin and rights.
- Removing the private catalog/extension returns to a complete public build; it never removes user activities or user trails.

## 7. Private downstream synchronization

Recommended process:

1. Fetch the public `upstream` protected branch/tag.
2. Create a private integration branch.
3. Merge/rebase according to the private repository's accepted policy.
4. Run public clean-build tests with private extensions disabled.
5. Run private extension compatibility/rights tests with private systems only.
6. Review manifest/core-version and schema migrations.
7. Merge into the private protected branch and produce private artifacts.

Private automation uses an isolated ephemeral single-job runner or a documented equivalent local boundary. It does not reuse public caches, workspaces, artifacts, service accounts, or runner images containing another job's private state. Untrusted pull-request heads never execute with private secrets/data, including through a privileged `pull_request_target` workflow. Dependency downloads and artifact publication use separate public/private credentials and destinations.

Never open a public pull request from a branch containing private commits, fixtures, logs, or Git object history. A public contribution is recreated from a clean public branch using only reviewed public-safe changes.

## 8. Private user export and promotion

- Import/export/promotion is explicit and record-selective.
- A private trail or correction first enters the private review workflow.
- Private catalog acceptance does not imply public eligibility.
- Public eligibility requires consent, privacy trimming, source/asset rights, provenance, and public review.
- Promotion links never delete the original private activity/trail/notes/media.

## 9. Backup, retention, and removal

- Back up the private root and private repository under their own access/retention policy.
- Versioned Git retention is treated as indefinite; do not commit content that must later be fully deleted or whose permission can expire.
- Do not mix device encrypted backups with reference-pack source control.
- Source retention deadlines apply to raw, normalized, cache, log, evidence, and derived artifacts.
- Removing an extension revokes future builds, removes its catalog through the catalog coordinator, and preserves private user records/overlays for review.
- Secret rotation and source revocation have documented runbooks.

## 10. Acceptance scenarios

- Private-root path inside public checkout is rejected.
- Private-root build creates no modified/untracked private output in public checkout.
- Public build passes when the private root is unavailable.
- Private downstream sync incorporates a public core change and detects incompatible contracts.
- A private CI job starts from a clean ephemeral image, receives only declared secrets, publishes only to a private destination, and leaves no reusable private cache/workspace.
- A deliberately untrusted pull request cannot read private secrets/data or invoke privileged private build steps.
- An unpinned extension executable or arbitrary manifest hook is rejected before execution.
- Public publication target rejects a private-classified artifact.
- Removing private catalog retains user data and shows explicit unavailable-origin state.
- A selected private correction can be reviewed privately without including unrelated personal records.

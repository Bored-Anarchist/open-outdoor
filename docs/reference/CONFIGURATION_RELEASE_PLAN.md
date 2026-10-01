# Configuration and Release Plan

**Status:** Proposed

## 1. Configuration authority

A committed machine-readable release configuration is the source of truth for toolchain, app identity, catalog compatibility, selected region, and measured budgets. Documentation explains the configuration but does not override it.

## 2. Required pins

- Node/package manager, React Native, Expo/prebuild, TypeScript, and JS/native dependencies.
- Python, GIS/parser libraries, spatial database, tile compiler, and pack tools.
- Swift mode, iOS target, Xcode, macOS image, CocoaPods/SPM resolution.
- MapLibre native/web, map schema/style, sprites, fonts, and attribution versions.
- Public/private/local bundle IDs, entitlements, keychain groups, signing method.
- Catalog schema version/range and private extension API range.
- Regions/detail areas, content flags, zoom levels, and source-policy snapshot.
- Compressed/installed/component size ceilings and activation reserve.
- Energy/performance/elevation/accuracy thresholds and reference environment from the [non-functional budgets](NON_FUNCTIONAL_BUDGETS.md).
- Workflow event/path filters, concurrency cancellation key, job timeouts, minimal test matrices, cache policy, and protected-candidate gates for macOS/full-catalog/release jobs.

## 3. Version model

| Item | Versioning requirement |
| --- | --- |
| Application | Semantic version plus public commit/build identifier |
| Catalog schema | Monotonic version with compatible app range and migration policy |
| Catalog content | Independent content version and data-as-of/source versions |
| Connector | Connector version plus normalized schema version |
| Algorithms | Stored distance/elevation/evaluator/entity-resolution version |
| Private extension API | Explicit core compatibility range |
| Backup container | Independent format version with supported migration matrix |
| Map style/schema | Pinned version included in bundle manifest |

## 4. Release channels

| Channel | Purpose | Data allowed | Signing/identity |
| --- | --- | --- | --- |
| Public development | Public CI/browser/unsigned native validation | Public/synthetic only | No personal signing |
| Public release | Eligible public source/app/catalog artifacts | Public redistribution-approved only | Mandatory project signature, provenance, and public-channel trust root |
| Local hobby | Owner's device and optional private catalogs | Public plus that user's authorized private data | User-provided free/paid Apple identity |
| Private organization | Controlled private distribution/build | Public plus organization-authorized data | Mandatory separate private identity, trust root, secrets, and policy |

Each channel has a distinct identity and trust root unless a documented same-channel upgrade requires stability. A private artifact can never be promoted by changing only its label. Unsigned development artifacts are visibly marked and rejected by production-channel installers.

## 5. Build pipeline

1. Validate protected source commit, configuration schema, lockfiles, and clean workspace.
2. Resolve only pinned dependencies and record dependency inventory.
3. Run quality/security/privacy/rights checks.
4. Build shared/browser and pinned native artifacts.
5. Build selected public/private catalogs in their classified environments.
6. Validate catalog compatibility, checksums, coverage, rights, attribution, size, and exclusion report.
7. Assemble channel artifact without crossing classifications.
8. Generate SBOM, data/source bill of materials, provenance, checksums, and release notes.
9. Sign artifacts, manifests, and provenance through the authorized channel and record signer/key ID and monotonic anti-replay version.
10. Reproduce or independently verify before publication/install.

## 6. Catalog manifest and compatibility

Each catalog declares:

- bundle ID, origin/distribution class, region, capabilities;
- schema/content/style versions and app compatibility range;
- source/field rights and attribution inventory;
- generation/data-as-of/freshness/expiry;
- dependencies, installed/compressed size, checksums;
- ID remap and promotion-link versions;
- public/private inclusion/exclusion summary; and
- signature algorithm, signer/key ID, trust channel, anti-replay version, and revocation metadata.

An app rejects an incompatible, corrupt, expired-required, replayed, unsigned/invalidly signed, revoked-key, wrong-channel, or unclassified catalog before activation. Production trust roots are compiled/configured independently of catalog input. Key rotation supports an overlap period signed by an already trusted key; emergency revocation blocks future activation while retaining the last known-good compatible catalog.

## 7. Activation and rollback

- Preflight the exact formula `current active combined public/private catalogs + incoming combined public/private catalogs + max(1 GiB, 25% of incoming installed size) workspace + 2 GiB reserve`; reject before mutation if it cannot fit.
- Copy/stage resumably away from active recording.
- Verify manifest, signature/checksum, schema, dependencies, and remap/promotion integrity.
- Apply private association changes transactionally.
- Atomically switch the active catalog pointer.
- Retain old compatible catalog until first successful launch/integrity check.
- On failure, restore old catalog pointer without rolling back private user data.

The combined active public and private catalog ceiling is 3 GiB. Public and private reports remain separate, but neither channel may treat the ceiling as its own independent allowance.

## 8. Application, catalog, and backup compatibility

- Production supports the current major app/catalog/backup schema and one previous compatible major version.
- Catalog compatibility is declared as an app-version interval and is checked before staging and again before activation.
- A forward private-database migration records the minimum readable app schema. Launching an older incompatible app fails read-only before any write; automatic application downgrade is unsupported.
- Catalog rollback changes only the read-only active pointer and never downgrades the private database.
- Backup restore migrates only through a declared supported path in isolated staging. An older backup requiring an unavailable intermediate migrator is reported without mutating current data.
- A support-window change requires an ADR, migration/rollback fixtures, release notes, and a user recovery path.

## 9. Public release contents

Allowed:

- source archives and project documentation;
- unsigned or project-authorized app/test artifacts;
- synthetic demonstration catalogs;
- regional catalogs whose every included field/asset permits public distribution;
- SBOM/DBOM, rights/attribution, coverage, checksum, provenance, and release notes.

Prohibited:

- user/private/reference-restricted databases or media;
- unredacted logs/routes/screenshots/device identifiers;
- credentials, cookies, signing/recovery material;
- owner-only/private organization catalogs; and
- artifacts without complete classification and source inventory.

## 10. Release evidence

- Exact source commit and release-config checksum.
- Passing required checks and test IDs.
- Toolchain/runner/device/OS matrix.
- Hosted CI minutes by job/event, skipped/cancelled counts, and rationale for every expensive run.
- Public/private artifact classification.
- SBOM/DBOM, licenses/attributions, coverage/exclusions.
- Component and total size; install/activation/rollback timing.
- Physical energy/accessibility/provisioning evidence where applicable.
- Artifact checksums/signatures/provenance and independent verification.
- Known limitations, stale/expired coverage, and residual risks.

## 11. Emergency and revocation procedures

- A compromised key/token is revoked and replaced; prior artifacts are assessed and release channels paused if needed.
- A source-rights revocation stops new acquisition/inclusion immediately and triggers retained-data review.
- A safety-critical stale/incorrect catalog blocks or retracts affected positive claims and produces an updated bundle/release note.
- A bootstrap/emergency protection override is documented, reviewed afterward, and blocks release until exact resulting `main` is independently checked.
- Catalog rollback never substitutes for private database restoration.

## 12. Release acceptance

A release is accepted only when every mapped test and artifact audit passes at the exact candidate; no unresolved critical privacy, rights, security, data-preservation, accessibility, energy, or integrity defect remains; and installation/rollback instructions match the channel actually tested.

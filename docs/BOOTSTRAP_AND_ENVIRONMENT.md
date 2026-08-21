# Bootstrap and Environment Specification

**Status:** WP-002 implementation baseline

## 1. Objective

Create a deterministic public development environment that supports Windows shared development and data tooling, pinned macOS iOS builds, deterministic browser fixtures, and physical-device acceptance without requiring any private dataset.

## 2. Environment roles

| Environment | Required uses | Must not claim |
| --- | --- | --- |
| Windows workstation | Repository bootstrap, TypeScript/shared UI, browser QA, Python/GIS ingestion, catalog/pack builds, Windows sideload workflow | Native iOS background, energy, VoiceOver, provisioning acceptance |
| macOS build environment | Xcode/native project generation, dependency resolution, unsigned/signed iOS build as authorized | Physical-device field behavior by itself |
| iPhone 14 reference device | Background tracker, screen lock, sensors, MapLibre, permissions, VoiceOver, Dynamic Type, refresh retention, energy/thermal | Broader device compatibility without matrix evidence |
| Public CI | Clean reproducible build/test with synthetic/redistributable inputs | Processing private datasets or personal signing credentials |
| Private CI/local root | Permission-limited connectors/packs and compatibility tests | Publishing private artifacts to public GitHub |

## 3. Required release configuration

The repository will contain a machine-readable configuration pinning:

- Node.js and package manager/version;
- React Native and Expo/prebuild;
- TypeScript and test/lint/format tools;
- Python and locked ingestion dependencies;
- GDAL-compatible tooling and spatial database version;
- Swift language mode, iOS deployment target, Xcode, macOS image;
- CocoaPods/SPM resolution and native dependency versions;
- MapLibre versions and map style/schema profile;
- app bundle identity per public/private/local channel;
- entitlements, keychain groups, signing method;
- selected regions and catalog compatibility range;
- compressed/installed size and activation-reserve ceilings; and
- performance budgets after Phase 0 measurement; energy/thermal measurement after WP-307/WP-503 protocol approval.

The machine classes, device profiles, accountable roles, and cost categories needed to approve these pins are listed in the [resource and RACI plan](RESOURCE_AND_RACI_PLAN.md). Numeric defaults and measurement protocols come from the [non-functional budgets](NON_FUNCTIONAL_BUDGETS.md).

“Latest” is prohibited in release configuration. Upgrade branches deliberately change pins and rerun required evidence.

Public CI configuration also pins maximum job durations, minimal supported matrices, path filters, concurrency cancellation, and the event/gate allowed to run each expensive job. Documentation-only changes do not provision macOS; full native/catalog/release jobs are candidate-gated rather than scheduled or run on every draft commit.

## 4. Bootstrap deliverables

WP-002 creates:

- root package/workspace configuration and committed lockfiles;
- TypeScript strict configuration, formatter, linter, and unit test baseline;
- mobile and browser-fixture applications;
- shared domain/tracking/storage/map package shells;
- Python environment lock and connector/catalog tool shells;
- release-config schema plus validator;
- public synthetic fixture catalog and deterministic GPX replay;
- Windows bootstrap/test scripts using ordinary user permissions;
- pinned macOS CI build job; and
- dependency, license, secret, and private-data scan jobs.

## 5. Windows prerequisites

The approved setup guide will pin and verify:

- Git and GitHub CLI where contribution workflows require it;
- selected Node/package manager;
- selected Python runtime/environment manager;
- PostgreSQL/PostGIS or accepted equivalent;
- GDAL-compatible command/library runtime;
- Java/JDK only if a selected iOS React Native build dependency demonstrably requires it; Android build tooling and Android delivery are not initial prerequisites;
- Apple-provided Windows components and AltServer/AltStore Classic only for the approved hobby sideload path; and
- sufficient local disk for raw/staging/catalog copies and rollback tests.

Installers and download URLs must be checksum/signature verified where supported. The setup script reports missing/mismatched versions and never silently upgrades a pin.

## 6. macOS and iOS prerequisites

- Exact macOS runner image and Xcode build.
- CocoaPods/SPM behavior and cache key.
- Stable channel-specific bundle/application identity.
- Minimal entitlements compatible with free provisioning.
- Physical reference device OS, battery-health range, and free-space prerequisite.
- A non-secret test profile for unsigned CI and user-supplied credentials only in the local signing step.

## 7. Public checkout and private root

Example:

```text
C:\Projects\open-outdoor\       public Git checkout
D:\OpenOutdoorPrivate\         optional private root
```

The planned configuration command accepts an absolute private root. It rejects a path inside the public checkout, an unresolved path, a filesystem root, or a path whose permissions do not meet policy. Public bootstrap creates no private root automatically.

## 8. Standard command contract

Exact commands depend on the selected package manager, but the repository must expose stable task meanings:

| Task | Meaning |
| --- | --- |
| `bootstrap` | Validate pins and install locked public dependencies |
| `quality` | Format check, lint, typecheck, unit/integration tests |
| `test:fixtures` | Deterministic tracker/catalog/import fixture suite |
| `test:privacy` | Secret/private-path/classification/publication gates |
| `build:web` | Browser QA harness with local fixtures |
| `build:ios:unsigned` | Pinned macOS native build without personal signing material |
| `catalog:public` | Rights-aware public catalog from approved public inputs |
| `catalog:private` | Explicit private-root catalog build; unavailable without private configuration |
| `release:verify` | Reproduce/check artifacts, manifests, checksums, provenance |

Scripts have documented PowerShell entry points on Windows. The commands above are implemented by the root workspace; later packages may extend their checks without changing their meanings.

## 9. Bootstrap acceptance

- A new Windows user can bootstrap and run public quality/browser tasks from documented steps.
- No private directory, secret, or paid service is required.
- Re-running bootstrap with unchanged pins produces no dependency drift.
- macOS CI creates the declared unsigned iOS artifact from the same commit.
- Synthetic private-root tests prove discovery without public writes.
- A synthetic private-repository job proves ephemeral isolation, cache separation, and denial of untrusted privileged pull-request execution.
- Dependency/source/artifact inventories are generated and reviewable.
- Setup failures state the missing pin or prerequisite and do not modify unrelated tools/files.
- A superseded pull-request run is cancelled, irrelevant path changes skip expensive jobs, every job has a timeout, and the milestone report records hosted-minute usage and avoidable reruns.

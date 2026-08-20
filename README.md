# Open Outdoor

Open Outdoor is a planned open-source, offline-first iOS application for trail discovery, camping information, and GPS hike recording. The initial reference implementation targets New York, an iPhone 14, and a Windows-first contributor workflow. The browser is a QA harness; Android and turn-by-turn navigation are not in the initial scope.

The repository is in Phase 0 bootstrap. It contains executable shared/data/privacy shells and feasibility tooling, but no production application or catalog.

## Phase 0 developer bootstrap

The workspace pins Node.js 24.19.0, pnpm 11.20.0, Python 3.13.14, and uv 0.12.1. After installing those exact public tools on Windows, run:

```powershell
pnpm install --frozen-lockfile
pnpm quality
pnpm build:web
uv run --frozen python -m unittest discover -s python/tests
```

Private composition is optional and must point outside this checkout. The iOS feasibility build is a manual candidate job; physical-device acceptance remains separate.

## Authoritative documents

- [Consolidated project scope](PROJECT_SCOPE.md)
- [Build-document index](docs/README.md)
- [Work-package breakdown](docs/WORK_PACKAGE_BREAKDOWN.md)
- [Implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md)
- [System architecture](docs/ARCHITECTURE.md)
- [Requirements traceability matrix](docs/REQUIREMENTS_TRACEABILITY.md)
- [Product and release definition](docs/PRODUCT_RELEASE_DEFINITION.md)
- [Test and acceptance plan](docs/TEST_AND_ACCEPTANCE_PLAN.md)
- [Data, privacy, and rights plan](docs/DATA_PRIVACY_RIGHTS_PLAN.md)
- [Private extension guide](docs/PRIVATE_EXTENSION_GUIDE.md)

## Core product areas

- Offline trail and outdoor-place discovery.
- Developed and dispersed-camping information with evidence, restrictions, closures, and freshness.
- Background GPS hike recording, recovery, distance, pace, and elevation.
- Private favorites, notes, places, photos, trails, imports, and encrypted backups.
- Optional private datasets through an external Windows workspace or private downstream repository.

## Scope boundary

The public repository may contain open-source code, documentation, synthetic/redacted fixtures, and data whose redistribution rights have been verified. Personal data, permission-limited datasets, credentials, signing material, and unredacted diagnostics must remain in an approved private environment.

Private data can be composed from an external access-controlled Windows root or a confidential downstream repository. Git history is treated as indefinite: expiring, revocable, deletion-bound, mutable personal, raw, media, diagnostic, and generated catalog data stays in external private storage. Private automation uses isolated ephemeral jobs and never exposes secrets/data to untrusted pull requests.

Implementation begins with Phase 0 in the [work-package breakdown](docs/WORK_PACKAGE_BREAKDOWN.md). The Phase 0 exit gate must pass before feature development proceeds. The first Product MVP is M4/Phase 3, when offline trails, camping evidence, and GPS recording work together.

## Project policies

- [Apache License 2.0](LICENSE), [NOTICE](NOTICE), and [third-party notices](THIRD_PARTY_NOTICES.md)
- [Contributing](CONTRIBUTING.md), [governance](GOVERNANCE.md), and [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)
- [Public repository controls](docs/REPOSITORY_CONTROLS.md)

Public contributions use project handles, privacy-protected commit addresses, and an account-bound rights attestation—no additional personal identifying details. Hosted CI is local-first and path/gate-filtered to minimize GitHub Actions minutes.

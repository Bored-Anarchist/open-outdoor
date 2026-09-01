# Build Documentation Index

This directory translates the [consolidated project scope](../PROJECT_SCOPE.md) into documents that can be used to plan, implement, verify, and release Open Outdoor.

## Authority and change control

1. `PROJECT_SCOPE.md` defines the approved product and project boundary.
2. Accepted architecture decisions refine implementation choices but may not silently expand or contradict scope.
3. The requirements matrix assigns stable requirement IDs and links them to work packages and tests.
4. The work-package breakdown controls implementation sequencing and deliverable ownership.
5. Test, release, privacy, and workflow documents define how evidence is produced and accepted.

A change that affects product behavior, privacy, source rights, distribution, architecture boundaries, or a phase exit gate must update every affected document in the same pull request.

## Document set

| Document | Purpose | Primary owner role |
| --- | --- | --- |
| [Project scope](../PROJECT_SCOPE.md) | Normative product, architecture, privacy, and delivery boundary | Product owner |
| [Documentation audit](DOCUMENTATION_AUDIT.md) | Identified issues, implemented resolutions, and validation record | Quality lead |
| [Product and release definition](PRODUCT_RELEASE_DEFINITION.md) | iOS/platform boundary, release vocabulary, exact M4 Product MVP, and exclusions | Product owner |
| [Work-package breakdown](WORK_PACKAGE_BREAKDOWN.md) | Implementable units, dependencies, outputs, and exit criteria | Technical lead |
| [Implementation roadmap](IMPLEMENTATION_ROADMAP.md) | Phase sequence, milestones, gates, and evidence | Product/technical lead |
| [Resource and RACI plan](RESOURCE_AND_RACI_PLAN.md) | Accountability, staffing, capacity, hardware, and cost categories | Project owner |
| [Architecture](ARCHITECTURE.md) | Components, data planes, interfaces, trust boundaries, and proposed repository layout | Architecture owner |
| [Threat model](THREAT_MODEL.md) | Assets, trust boundaries, threats, mitigations, and residual-risk rules | Security owner |
| [Bootstrap and environment specification](BOOTSTRAP_AND_ENVIRONMENT.md) | Pinned toolchain, Windows/macOS/device prerequisites, and repository bootstrap | Build owner |
| [Canonical data specification](CANONICAL_DATA_SPEC.md) | CRS, coordinates, time, units, IDs, geometry, nulls, provenance, and evolution | Data architecture owner |
| [Requirements traceability](REQUIREMENTS_TRACEABILITY.md) | Requirement IDs mapped to work packages and verification | Quality lead |
| [Test and acceptance plan](TEST_AND_ACCEPTANCE_PLAN.md) | Test levels, environments, evidence, and release gates | Quality lead |
| [Non-functional budgets](NON_FUNCTIONAL_BUDGETS.md) | Numeric performance, durability, size, accuracy, memory, and energy limits | Performance/quality owner |
| [Accessibility standard](ACCESSIBILITY_STANDARD.md) | WCAG 2.2 AA applicability and physical native acceptance | Accessibility owner |
| [Data, privacy, and rights plan](DATA_PRIVACY_RIGHTS_PLAN.md) | Classification, source authorization, private storage, and publication gates | Privacy/rights owner |
| [iOS data protection and backup](IOS_DATA_PROTECTION_AND_BACKUP.md) | File-protection classes, lock behavior, system-backup exclusions, and explicit recovery | iOS/privacy owner |
| [iOS build and Windows sideload feasibility](IOS_SIDELOAD_FEASIBILITY.md) | Pinned unsigned build, Windows signing/install path, and pending physical-device evidence | iOS/build owner |
| [iOS native spike procedure](IOS_NATIVE_SPIKE_PROCEDURE.md) | Windows candidate preparation and exact physical tracker/storage workoff | iOS/tracking owner |
| [Phase 0 gate report](PHASE_0_GATE_REPORT.md) | WP-009 budget, risk, CI-usage, and phase-entry disposition | Project/release owner |
| [Phase 0 acceptance-gap solutions](PHASE_0_ACCEPTANCE_GAP_SOLUTIONS.md) | Implemented workoff tooling and the remaining physical/CI completion steps | Technical lead |
| [Phase 1 guided acceptance](PHASE_1_GUIDED_ACCEPTANCE.md) | Minimal physical recorder-alpha evidence workflow | Quality/iOS owner |
| [Phase 1 gate report](PHASE_1_GATE_REPORT.md) | Recorder-alpha acceptance disposition | Project/release owner |
| [Phase 2 guided acceptance](PHASE_2_GUIDED_ACCEPTANCE.md) | One-command New York data-alpha evidence workflow | Data/quality owner |
| [Phase 2 gate report](PHASE_2_GATE_REPORT.md) | Data-alpha acceptance disposition | Project/release owner |
| [Evidence index](evidence/README.md) | Work-package implementation and acceptance records | Quality lead |
| [Diagnostics plan](DIAGNOSTICS_PLAN.md) | Local-only schema, redaction, retention, preview, export, and deletion | Privacy/quality owner |
| [Public-boundary incident response](INCIDENT_RESPONSE.md) | Credential revocation, containment, private reporting, corrective action, and safe resumption | Security/privacy owner |
| [Private extension guide](PRIVATE_EXTENSION_GUIDE.md) | Local Windows and private downstream composition workflows | Platform owner |
| [Development workflow](DEVELOPMENT_WORKFLOW.md) | Issues, branches, reviews, checks, fixtures, and definition of done | Maintainer |
| [Public repository controls](REPOSITORY_CONTROLS.md) | Protected-branch ruleset, host settings, activation, and WP-001 verification | Project/release owner |
| [Configuration and release plan](CONFIGURATION_RELEASE_PLAN.md) | Version pins, build channels, catalog compatibility, signing, release, and rollback | Release owner |
| [Risk register](RISK_REGISTER.md) | Delivery, technical, legal/rights, privacy, and operational risks | Project owner |
| [Decision log](DECISION_LOG.md) | Accepted and open architecture/product decisions | Architecture owner |

## Repository governance and legal files

| Document | Purpose |
| --- | --- |
| [Apache License 2.0](../LICENSE) and [NOTICE](../NOTICE) | Project-owned code/document licensing and attribution notice |
| [Third-party notices](../THIRD_PARTY_NOTICES.md) | Separate code, data, asset, and service rights inventory process |
| [Contributing guide](../CONTRIBUTING.md) | Account-bound attestation, identity privacy, local-first checks, safe fixtures, and review expectations |
| [Governance](../GOVERNANCE.md) | Roles, decisions, releases, conflicts, and succession |
| [Code of Conduct](../CODE_OF_CONDUCT.md) | Community behavior and enforcement |
| [Security policy](../SECURITY.md) | Private vulnerability reporting, supported versions, and disclosure handling |

Work-package implementation and acceptance records are stored under [`evidence/`](evidence/); a record is not acceptance unless its reviewer, exact commit, date, and final result are complete.

## Status vocabulary

- `proposed`: drafted but not approved for implementation.
- `accepted`: approved and active.
- `in-progress`: implementation or evidence collection has started.
- `verified`: acceptance evidence exists and has passed review.
- `blocked`: an explicit external dependency prevents progress.
- `retired`: superseded with a recorded replacement.

Unless a document says otherwise, this initial set is `proposed` and becomes `accepted` when the project owner approves the planning baseline.

## Identifier conventions

- Requirements: `REQ-<area>-NNN`, such as `REQ-TRK-001`.
- Work packages: `WP-<phase><sequence>`, such as `WP-103`.
- Tests: `T-<level>-NNN`, such as `T-PHY-004`.
- Risks: `R-NNN`.
- Decisions: `ADR-NNN`.
- Threats: `THR-NNN`.
- Budgets: `BUD-<area>-NNN`.
- Documentation findings: `DOC-NNN`.
- Test cases: `T-<level>-NNN-CNN` under a named suite.

Identifiers are permanent. Retired items keep their ID and point to the replacement.

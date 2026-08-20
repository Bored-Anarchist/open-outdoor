# Documentation Audit and Resolution Record

**Audit date:** 2026-08-19  
**Status:** All identified documentation issues resolved; implementation evidence remains governed by the work packages

## 1. Resolution summary

| ID | Issue | Implemented resolution | Primary evidence |
| --- | --- | --- | --- |
| `DOC-001` | Open-source legal and community files were missing | Added Apache-2.0 license, notice, third-party notice process, privacy-preserving contribution attestation, governance, conduct, and security policies | [Repository policy files](../README.md#project-policies) |
| `DOC-002` | Initial platform and route-guidance scope were ambiguous | Declared iOS-only delivery, browser QA only, Android excluded, and selected-route display without turn-by-turn/rerouting/off-route guidance | [Product/release definition](PRODUCT_RELEASE_DEFINITION.md) |
| `DOC-003` | “MVP” could refer to several incomplete phases | Defined Product MVP exclusively as Phase 3/M4 with trails, camping evidence, and GPS recording offline together | [Product/release definition](PRODUCT_RELEASE_DEFINITION.md), [roadmap](IMPLEMENTATION_ROADMAP.md) |
| `DOC-004` | Phase 0 ADR/work-package dependencies were circular | Limited WP-002 prerequisites to ADR-012–015/036; moved storage, catalog, and runner decisions to the first task with relevant evidence | [Decision log](DECISION_LOG.md), [work packages](WORK_PACKAGE_BREAKDOWN.md) |
| `DOC-005` | Private Git guidance did not account for durable history | Permitted only material whose policy allows indefinite versioned retention; moved expiring/revocable/deletion-bound/mutable data to external controlled storage | [Private extension guide](PRIVATE_EXTENSION_GUIDE.md) |
| `DOC-006` | Private CI isolation was under-specified | Required ephemeral single-job isolation, untrusted-head denial, separated caches/artifacts, pinned extensions, and least-privilege credentials | [Threat model](THREAT_MODEL.md), [private extension guide](PRIVATE_EXTENSION_GUIDE.md) |
| `DOC-007` | iOS file protection and implicit backup behavior were undefined | Specified protection classes, active spool/sealed-store split, backup exclusions, key behavior, deletion, and physical inspection | [iOS data protection/backup policy](IOS_DATA_PROTECTION_AND_BACKUP.md) |
| `DOC-008` | Catalog signing was deferred too late | Established Phase 0 catalog trust/signing, channel roots, replay protection, rotation/revocation, and last-known-good behavior | [Configuration/release plan](CONFIGURATION_RELEASE_PLAN.md), `WP-010` |
| `DOC-009` | App/catalog/backup downgrade and support behavior were ambiguous | Defined current plus one previous compatible major support, read-only failure before unsafe mutation, and staged intermediate migration | [Configuration/release plan](CONFIGURATION_RELEASE_PLAN.md) |
| `DOC-010` | Geospatial semantics differed by implication across components | Added one canonical CRS/axis/time/unit/datum/ID/null/geometry/provenance/evolution contract | [Canonical data specification](CANONICAL_DATA_SPEC.md) |
| `DOC-011` | Security boundaries and diagnostics handling lacked normative plans | Added threat register, private extension/runner policy, local-only diagnostics, forbidden fields, retention, preview/export, and residual risks | [Threat model](THREAT_MODEL.md), [diagnostics plan](DIAGNOSTICS_PLAN.md) |
| `DOC-012` | Public/private catalog size could be read as separate allowances | Defined a combined 3 GiB active ceiling and one exact preflight formula requiring 9 GiB at the maximum profile | [Non-functional budgets](NON_FUNCTIONAL_BUDGETS.md) |
| `DOC-013` | Performance, durability, accuracy, memory, and energy gates were subjective | Added numeric budgets, reference profiles, repetitions, samples, regression rules, and Phase 0 binding procedure | [Non-functional budgets](NON_FUNCTIONAL_BUDGETS.md) |
| `DOC-014` | Accessibility target and native acceptance were incomplete | Adopted WCAG 2.2 AA where applicable plus physical native iOS flows, map alternatives, 44-point targets, and defect severity | [Accessibility standard](ACCESSIBILITY_STANDARD.md) |
| `DOC-015` | Requirements lacked priority, lifecycle, milestone, accountable owner, granular tests, and history | Rebuilt the RTM with all metadata, split high-risk compound obligations, added case-ID policy, and recorded changes | [Requirements traceability matrix](REQUIREMENTS_TRACEABILITY.md) |
| `DOC-016` | Staffing, accountability, hardware, and cost assumptions were implicit | Added canonical roles, RACI, assignment gate, capacity, device/machine profiles, and cost categories | [Resource and RACI plan](RESOURCE_AND_RACI_PLAN.md) |
| `DOC-017` | Native and application writers could contend for private activity storage | Made native tracker sole writer to the active spool and application coordinator sole writer/importer to the sealed database | [Architecture](ARCHITECTURE.md), ADR-035 |
| `DOC-018` | Suite-level test names were too coarse for objective acceptance | Added unique `-CNN` case identifiers and explicit protection, CI, signature, compatibility, diagnostics, and MVP scenarios | [Test and acceptance plan](TEST_AND_ACCEPTANCE_PLAN.md) |
| `DOC-019` | Supporting documents were not fully discoverable | Added a complete documentation/legal index and cross-links from the authoritative scope and root README | [Documentation index](README.md) |
| `DOC-020` | Hosted CI cost and contributor identifying details needed explicit minimization | Added local-first/path-filtered/cancelled/timed/candidate-gated CI and public-handle/noreply contribution rules with attestation, tests, requirements, decisions, threats, and risks | [Development workflow](DEVELOPMENT_WORKFLOW.md), [contributing guide](../CONTRIBUTING.md) |

## 2. Validation performed

The completed set was checked for:

- exactly one non-fenced H1 per Markdown file, balanced code fences, and no heading-level jumps;
- consistent Markdown table column counts;
- valid local relative links;
- unique definitions and no unresolved references for work packages, test suites, ADRs, requirements, risks, threats, and budgets;
- no unresolved placeholder-work markers; and
- explicit consistency for platform/MVP scope, Phase 0 dependencies, seven camping statuses, combined storage ceiling/formula, test-case naming, and private-data rules.

This audit closes documentation defects only. A policy marked accepted at the planning level still requires the implementation and evidence named in its mapped work package before the associated product capability is claimed.

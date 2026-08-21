# Implementation Roadmap

**Status:** Proposed  
**Planning model:** Evidence-gated phases; no calendar commitment is implied

## 1. Roadmap objective

Deliver the smallest technically honest vertical slice first, prove the unusually risky iOS/private-data/offline path on a physical device, and only then scale source coverage and production design.

## 2. Critical path

```text
Public/private foundation
  → iOS signing + native background feasibility
  → private/reference storage migration proof
  → recorder vertical slice
  → connector + canonical data path
  → New York offline catalog and basemap
  → offline explore/search
  → connector/private ecosystem scale
  → production design and release audit
```

The highest-risk work is deliberately early: public/private leakage prevention, free provisioning, physical background tracking, catalog/private-data isolation, and source-rights enforcement. Measured energy acceptance is deliberately deferred to field/performance hardening.

## 3. Milestones

| Milestone | User-visible result | Enabling packages | Exit evidence |
| --- | --- | --- | --- |
| `M0 Planning baseline` | Build work can begin from one traceable document set | Documentation package | Scope, WBS, RTM, risks, decisions approved |
| `M1 Feasibility build` | A minimal app installs from Windows and records background points | WP-001–WP-010 | Phase 0 gate report |
| `M2 Recorder alpha` | Record, recover, review, and export a private hike on an offline fixture map | WP-101–WP-109 | Recorder/elevation/accessibility report |
| `M3 New York data alpha` | Generate an explainable public New York land/trail/POI catalog | WP-201–WP-210 | Rights, coverage, evaluator, dedup reports |
| `M4 Product MVP / offline field beta` | Explore/search bundled New York trails and camping evidence and record hikes with GPS, all without a network | WP-301–WP-307 | Offline matrix and field-test report; all MVP must-haves pass |
| `M5 Extensible beta` | Add authorized sources/imports/private extensions through stable contracts | WP-401–WP-406 | Compatibility and connector-operations report |
| `M6 Production candidate` | Polished, accessible, reproducible public release candidate | WP-501–WP-506 | Production acceptance audit |

## 4. Parallel work policy

Safe parallel work includes:

- governance/docs and bootstrap tooling after planning approval;
- browser/shared adapters while native tracker feasibility runs;
- canonical schema design while source rights/fixtures are prepared;
- map design tokens while offline pack infrastructure matures, provided production styling does not block functional work;
- independent source connectors after the connector contract is accepted; and
- accessibility test design throughout every phase.

Work must remain sequential when it depends on a gate:

- feature development waits for Phase 0 device/signing/data-retention proof;
- production connectors wait for manifest/raw/security contracts;
- a positive camping status waits for rule/freshness evaluation;
- offline UI waits for catalog compatibility/activation contracts;
- connector scaffolding waits for multiple real connectors to validate the abstraction; and
- production release waits for physical accessibility, energy, privacy, rights, and reproducibility evidence.

## 5. Phase outcomes

### Phase 0 — foundation and feasibility

Outcome: a clean public project and two safe private composition modes; deterministic Windows shared build; physical iPhone signing/background/storage proof; iOS protection/backup inspection; catalog trust and compatibility proof; passing Phase 1 prerequisite budgets.

Stop conditions: private content can enter public artifacts, signing/refresh loses user data, native background tracking cannot recover reliably, or the build cannot be reproduced from declared pins.

### Phase 1 — recorder vertical slice

Outcome: private offline activity recording from start through recovery, statistics, reusable user trail, export, and encrypted backup foundation.

Stop conditions: elevation thresholds are not viable, critical controls fail native accessibility, or raw observations cannot be recovered after crash/suspension. Energy-conscious implementation remains required, but measured energy acceptance is deferred.

### Phase 2 — authoritative data path

Outcome: rights-aware source acquisition through canonical entities, reversible resolution, deterministic camping evaluation, and a reproducible New York catalog prototype.

Stop conditions: source authorization is ambiguous, public/private raw boundaries leak, positive statuses survive stale mandatory evidence, or provenance cannot explain canonical output.

### Phase 3 — Product MVP / offline field beta

Outcome: offline New York explore/search/details, self-generated basemap, atomic catalog updates, composed public/private/user data, full backup/restore, and field hardening.

This is the first milestone named Product MVP. The exact must-haves and non-goals are controlled by the [product release definition](PRODUCT_RELEASE_DEFINITION.md); recorder-only and catalog-only milestones are alphas.

Stop conditions: catalog interruption can damage private data, size/free-space limits are impractical, or field energy/reliability misses release budgets.

### Phase 4 — extensibility

Outcome: repeatable source scaffolding, reusable adapters, lawful user imports, disabled permission-gated shells, health/drift operations, and private extension compatibility.

Stop conditions: new sources require mobile-core changes, authorization state is conflated with implementation state, or private compatibility cannot be bounded by version.

### Phase 5 — production

Outcome: original production design, complete accessibility, measured performance, verifiable releases, mature governance, and a clean-room/privacy-rights audit.

Stop conditions: critical accessibility/privacy/right defects, unexplained energy/thermal regressions, placeholder experience, or unreproducible artifacts.

## 6. Planning cadence

- Select only work packages whose dependencies are accepted.
- Break `XL` packages into thin end-to-end tasks with explicit tests.
- Review risks and open decisions at the start and end of each milestone.
- Demonstrate working software and evidence at each phase gate.
- Update the RTM in the same change that implements or retires a requirement.
- Do not assign dates until Phase 0 measures build/device/source throughput and maintainer capacity.

## 7. First implementation queue

1. Approve the planning baseline and close only the decisions that gate the package being started; ADR-012–ADR-015 and ADR-036 gate WP-002.
2. Implement WP-001 public governance and repository controls.
3. Implement WP-002 pinned bootstrap and shared skeleton.
4. Run WP-003 privacy/leak gates before adding fixtures or build artifacts.
5. Run WP-004 and WP-005 private-composition spikes.
6. Run WP-006 through WP-008 and WP-010 on the physical device and selected Windows sideload path.
7. Complete WP-009 budget/evidence gate review before scheduling Phase 1.

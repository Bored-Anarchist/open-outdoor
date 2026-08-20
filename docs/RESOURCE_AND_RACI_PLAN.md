# Resource, Ownership, and RACI Plan

**Status:** Accepted role baseline; named assignees are recorded in issues before work starts

## 1. Accountability rule

The repository owner is initially accountable for the project. A work package cannot move to `in-progress` until its issue names one accountable public project handle or role alias, responsible implementer handle(s), reviewer handle(s), availability window, and required environment. Legal names, personal email, locations, and other personal identifying details are not required in public planning records. Role names alone are not a substitute for assignment.

## 2. RACI matrix

`R` responsible, `A` accountable, `C` consulted, `I` informed.

Canonical accountable roles used by the RTM are: Project owner, Product owner, Architecture owner, iOS/tracking owner, Storage/backup owner, Data/safety owner, Privacy/rights owner, Security owner, Quality/accessibility owner, Release/build owner, and Design owner. One person may hold multiple roles, but each requirement/package names only one accountable role and one public project handle/role alias. In the compact matrix below, technical/architecture includes architecture, iOS/tracking, and storage/backup; quality/accessibility includes performance; data/connector includes data/safety; and repository owner initially includes project/product/design.

| Workstream | Repository owner | Technical/architecture lead | Privacy/rights reviewer | Quality/accessibility lead | Release/build owner | Data/connector owner |
| --- | --- | --- | --- | --- | --- | --- |
| Scope/governance | A/R | C | C | C | I | I |
| Bootstrap/architecture | A | R | C | C | R | C |
| Private-data boundary | A | C | R | C | C | C |
| Mobile/tracking/storage | A | R | C | C | C | I |
| Sources/canonical/catalog | A | C | C | C | I | R |
| Accessibility/test evidence | A | C | C | R | C | C |
| Release/signing/provenance | A | C | C | C | R | C |
| Incident response | A | C | R | C | R | C |

During a one-person stage, the owner may fill every role but records the lack of independent review as a risk. Production release should add at least one independent privacy/rights or security reviewer.

## 3. Recommended staffing profile

Minimum practical Phase 0/1 capacity:

- one technical owner able to coordinate React Native, Swift/iOS, SQLite, and Windows tooling;
- access to privacy/source-rights review;
- access to native accessibility/quality review; and
- a release/build owner with the physical iPhone and signing environment.

Phases 2–3 benefit from a dedicated GIS/data engineer. Phase 5 benefits from a product designer/accessibility specialist. One person can proceed, but schedule/risk assumptions must reflect serialized work and review limitations.

## 4. Environment and hardware profile

| Resource | Minimum for assigned work | Recommended baseline |
| --- | --- | --- |
| Windows shared development | 4 modern CPU cores, 16 GiB RAM, SSD, 50 GiB free | 8+ cores, 32 GiB RAM, 100 GiB free |
| Windows full New York GIS/pack build | 8 cores, 32 GiB RAM, 250 GiB fast free storage | 12+ cores, 64 GiB RAM, 500 GiB NVMe/private workspace |
| macOS build | Exact pinned runner/Xcode supported resources | Dedicated/pinned CI image plus occasional local Mac access |
| Physical iOS | iPhone 14, pinned iOS, healthy battery, calculated catalog reserve | Dedicated test device with stable battery-health tracking |
| Private storage | Enough for raw + staging + output + evidence + backup under retention policy | Encrypted volume with at least 2× expected active private workspace |

Phase 0 records actual CPU/RAM/disk/build-time use and adjusts these profiles before full connector/catalog work.

## 5. Cost categories

Before scheduling a phase, the owner records expected/actual:

- macOS CI minutes or Mac access;
- GitHub/public and private repository/runner plan constraints;
- iPhone/device replacement and battery-health needs;
- Windows/private storage and backup capacity;
- source API/subscription/permission costs;
- code signing/release provenance services;
- accessibility, security, and legal/rights review; and
- field-test travel/time/equipment.

The default cost posture is local-first: use the standard Windows workstation for shared checks and data work, cancel superseded hosted runs, skip jobs by path/capability, avoid routine scheduled workflows, and reserve macOS/full-catalog/release execution for evidence gates. Each milestone records hosted minutes by job and removes redundant matrices or repeated work.

No paid source/service is assumed merely because it appears in the scope.

## 6. Capacity and scheduling gates

- Dates remain unset until WP-009 reports actual build, device-test, catalog-size, and maintainer throughput.
- Each milestone plan identifies critical-path owner availability and a substitute/stop condition.
- Source refresh/review work reserves recurring capacity; it is not treated as a one-time connector task.
- Physical test batches are scheduled around the pinned device/OS and do not accumulate beyond a phase gate.

## 7. Work-package assignment record

Each issue includes:

```text
Accountable public handle/role alias:
Responsible implementer handle(s):
Required reviewer handle(s):
RACI exceptions/conflicts:
Availability window:
Required environments/data/device:
Cost/storage estimate:
Dependencies and gate date:
```

Unassigned work remains `proposed`, not `in-progress`.

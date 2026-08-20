# Open Outdoor Governance

## 1. Current model

Open Outdoor begins as an owner-led open-source project. The repository owner is accountable for scope, privacy, source rights, security response, releases, and appointing maintainers. Technical authority is delegated through accepted work packages and ADRs.

No contributor count, title, or unmerged work grants access to private data, signing keys, security reports, or release authority.

## 2. Roles

| Role | Responsibilities | Appointment |
| --- | --- | --- |
| Repository owner | Final scope/governance decisions, role appointment/removal, emergency authority | Repository ownership |
| Maintainer | Review/merge within assigned areas, enforce workflow and code of conduct | Owner decision based on sustained contribution |
| Release manager | Verify exact candidate, evidence, signing, notices, and publication | Owner or maintainer appointment per release |
| Privacy/rights reviewer | Review classifications, source permissions, incidents, publication gates | Owner appointment; conflict-free for the source |
| Security responder | Receive and coordinate private vulnerability reports | Owner appointment with least required access |
| Contributor | Propose issues, code, tests, docs, or data-safe fixtures | Participation under project policies |

One person may hold several roles initially, but conflicts and missing independent review must be recorded in release evidence. Public records identify people only by their chosen project/hosting handle or role alias; legal names and personal contact details are not required.

## 3. Decisions

- Scope changes require repository-owner approval and corresponding updates to scope, RTM, work packages, tests, risks, and release plan.
- Architecture choices use ADRs. Accepted ADRs are immutable history and are changed by a superseding ADR.
- Ordinary implementation merges after required checks and maintainer review.
- Security/privacy/source-rights decisions require the applicable specialist role or repository owner.
- Emergency action may temporarily bypass normal timing only to contain harm. The exact resulting state is independently reviewed before release.

## 4. Maintainer progression

A maintainer candidate demonstrates sustained, respectful contributions; reliable reviews; understanding of privacy/source-rights boundaries; and secure handling of project access. Appointment records area, permissions, and review date.

Inactive or unsafe access is removed promptly. Private-data or signing access is reviewed at least quarterly once granted.

## 5. Release authority

During the single-maintainer stage, the repository owner may approve releases only after automated checks and all independent physical/privacy/rights evidence required by the scope pass. With three or more active maintainers, production releases require two approvals, including one release manager and one non-author reviewer. Critical privacy/security/source-rights fixes may use an emergency release followed by retrospective review.

## 6. Conflict of interest

A reviewer discloses personal, employment, financial, source-owner, or authorship conflicts that could affect a decision. Conflicted reviewers may provide facts but do not provide the required independent approval.

## 7. Policy changes

Governance changes use a public pull request, rationale, impact assessment, and at least seven calendar days for comment once the project has external active contributors. Changes cannot retroactively revoke accepted contribution rights.

# Data, Privacy, and Source-Rights Plan

**Status:** Proposed  
**Policy:** Missing classification or rights metadata fails closed

## 1. Data classification

| Class | Examples | Public source/CI/release | Approved storage |
| --- | --- | --- | --- |
| `PUBLIC_CODE` | Project-owned source, schemas, build scripts | Allowed under project license | Public checkout |
| `PUBLIC_DOCS` | Scope, architecture, safe evidence summaries | Allowed | Public checkout |
| `PUBLIC_DATA_REDISTRIBUTABLE` | Approved open fixture/dataset subset | Allowed within field/attribution/derivation terms | Public input/artifact roots |
| `SYNTHETIC_OR_REDACTED` | Invented routes/POIs, reviewed scrubbed fixtures | Allowed after metadata and review | Public fixtures |
| `PRIVATE_PERSONAL` | Tracks, favorites, notes, photos, backups, exact locations | Prohibited | Device/private root/private services |
| `PRIVATE_RESTRICTED_SOURCE` | User exports, personal-use archives, licensed records/media | Prohibited | Private root/private controlled storage |
| `PRIVATE_OPERATIONAL` | Permission evidence and explicitly exported/redacted diagnostics | Prohibited | Private evidence/log root |
| `SECRET` | Tokens, passwords, cookies, signing/recovery keys | Prohibited from Git/artifacts | OS/private CI credential store |

Classification attaches to raw inputs, normalized rows, derived outputs, logs, reports, caches, screenshots, and archives. Derivation never automatically lowers sensitivity.

## 2. Storage and movement rules

- Public checkout and public CI contain only the first four allowed classes.
- Public contribution records use only a chosen project/hosting handle and privacy-protected platform commit address. Legal names, personal email/address/location/phone, device/account identifiers, and unrelated profile details are neither requested nor copied into project records.
- Windows private data uses an explicit absolute root outside the public checkout.
- Private downstream repositories may hold private code/config and only fixtures whose policy permits indefinite versioned retention. Expiring, revocable, deletion-bound, mutable personal, raw, media, log, catalog, and user data uses access-controlled external storage regardless of size.
- Secrets remain outside all Git history, including private Git.
- Public and private processing use separate raw, staging, logs, cache, artifact, and publication roots.
- Device user data, public catalogs, and private catalogs use separate database files.
- Diagnostics remain local, minimize and bound fields/retention, exclude routes/coordinates/note/media/secret values, and require an explicit redacted export as defined by the [diagnostics plan](DIAGNOSTICS_PLAN.md).

## 3. Source authorization model

Each source manifest independently records:

- lifecycle: `experimental`, `active`, `failing`, `disabled`, `retired`;
- authorization: `authorized`, `permission-required`, `expired`, `revoked`;
- acquisition: `automated`, `manual-import`, `user-export`, `overlay`, `deep-link-only`;
- class: `current`, `legacy`;
- allowed transport/endpoints/redirects/auth secret names;
- fields/media, retention, deletion, derivation, offline storage, and attribution;
- public/private-user/private-organization distribution scope;
- terms/license/permission evidence and review/expiry date;
- refresh/rate/concurrency limits and required freshness; and
- fixture/redaction/publication policy.

Lifecycle does not imply authorization. An `active` parser can remain `permission-required` and `deep-link-only`.

## 4. Rights decision gates

The pipeline evaluates separate decisions:

1. May the source be contacted by this acquisition mode?
2. May the raw payload be stored, and for how long?
3. Which fields/media may be parsed and normalized?
4. Which transformations/derivatives are permitted?
5. May records be stored offline?
6. May they enter a private-user or private-organization bundle?
7. May they enter a public repository, CI artifact, or release?
8. What attribution and notices are required, and where?
9. What happens at expiry, revocation, deletion, or source removal?

Each decision returns allow/deny, source policy version, reason codes, expiry, and required obligations. Publication requires an affirmative answer to every applicable question.

## 5. Source manifest example

This is illustrative and not an implemented schema:

```yaml
source_id: example-public-trails
lifecycle: experimental
authorization: authorized
acquisition_mode: manual-import
source_class: current
rights:
  raw_retention: P30D
  offline_storage: true
  derived_data: true
  distribution:
    public: true
    private_user: true
    private_organization: true
  attribution:
    text: Example Agency
    placement: [in_app_source, release_notice]
  reviewed_at: 2026-08-19
  review_due_at: 2026-11-19
security:
  allowed_schemes: [https]
  allowed_hosts: [data.example.gov]
  max_response_bytes: 500000000
fixtures:
  public_fixture: synthetic
```

No secret value or permission-limited sample belongs in the manifest.

## 6. Public publication gate

Before a public push, CI artifact, or release, the gate checks:

- known secret patterns and high-entropy credentials;
- absolute/private root paths and user/device identifiers;
- exact location fixtures without approved synthetic metadata;
- database, backup, key, signing, cookie, media, and large binary types;
- source/asset/license inventory completeness;
- public redistribution, derivation, retention, offline, and attribution rights;
- archive contents, logs, test reports, caches, screenshots, and source maps;
- SBOM/DBOM and checksum/provenance linkage;
- explicit `PUBLIC_*` or approved synthetic/redacted classification; and
- contributor metadata/evidence limited to the permitted public handle/privacy-protected commit identity and account-bound contribution attestation.

`.gitignore` is supplemental. The gate must block a staged file even if ignore configuration changes.

## 7. Private user data lifecycle

- Collection occurs only for an explicit feature such as recording, import, favorite, note, photo, correction, or backup.
- Background sensors run only during an explicit active recording; the initial product does not provide turn-by-turn navigation.
- Immutable raw activity data supports recovery/reprocessing; unnecessary continuous raw motion is excluded.
- User can inspect storage and explicitly export/archive/delete records.
- Sharing defaults to selected records and offers endpoint/EXIF removal.
- Backup encrypts content and identifying metadata with a user-held recovery secret.
- Catalog activation/removal cannot mutate or evict private records.
- Private user state and regenerable catalogs are excluded from implicit iOS app-container backups. Protection classes, lock-state behavior, deletion rules, and supported explicit recovery follow the [iOS data protection and backup policy](IOS_DATA_PROTECTION_AND_BACKUP.md).
- Before enabling location, motion, photos, imports, or diagnostics export, the UI provides a plain-language purpose and the user can decline without hidden collection. Permission denial cannot silently enable a weaker collection path.
- Deleting an activity removes its derived data and unshared attachments after the documented undo/grace boundary; a backup remains an independent user-controlled artifact until the user deletes it.

## 8. Private-to-public promotion

No automatic synchronization or contribution exists.

1. User explicitly selects a trail/correction and eligible evidence.
2. Private export excludes unrelated private data.
3. Rights/privacy review determines whether any transformed artifact may be public.
4. A public contribution uses only the transformed public-safe artifact and declares provenance/license.
5. Ordinary review and CI apply.
6. The private original remains private and retained/deleted only by the user.

## 9. Special source decisions

- iOverlander: no scraping or automated authenticated/private API acquisition. Only taxonomy, deep links, synthetic fixtures, and a lawful user-selected export importer; derived records remain private absent separate written permission.
- Public tile services: public visibility is not offline-pack permission. Generate the basemap from an approved extract and retain attribution.
- Commercial/community catalogs: disabled/deep-link-only unless API/export/license/written permission covers the exact mode.
- Official government data: authority does not eliminate license, disclaimer, freshness, completeness, or retention review.

## 10. Incident response

If private/restricted/secret content reaches a public system:

1. Stop publication and preserve private incident evidence.
2. Revoke/rotate secrets and signing material immediately.
3. Identify every repository object, fork exposure, cache, log, artifact, release, and download channel.
4. Follow GitHub/provider sensitive-data removal procedures where possible.
5. Notify affected parties or source owners when policy/law requires it without reproducing the content.
6. Add a regression fixture using synthetic/redacted characteristics.
7. Record root cause, timeline, exposure, corrective actions, and gate changes privately.

Deleting the visible file or adding it to `.gitignore` does not close the incident.

Threats, trust boundaries, and required mitigations are maintained in the [threat model](THREAT_MODEL.md). A production privacy notice must match this plan, list collected categories and purposes, state that no hosted account/telemetry backend is required, explain local retention and system-backup exclusions, and describe export/deletion and private-extension consequences.

## 11. Acceptance

- Every source and asset has complete machine-readable rights/classification before build inclusion.
- Public build succeeds with no private roots and fails when deliberately supplied private content.
- Private builds cannot target a public publication destination.
- Authorization expiry/revocation stops new acquisition/inclusion.
- Backup, catalog, and promotion tests preserve privacy and user data.
- Protection-class, lock-state, system-backup exclusion, diagnostics-redaction, deletion, and permission-denial tests pass on the reference device.
- Private automation uses an ephemeral isolated runner or documented equivalent; untrusted pull-request code cannot access private credentials/data or privileged private workflows.
- A tabletop leak exercise completes before the first production release.

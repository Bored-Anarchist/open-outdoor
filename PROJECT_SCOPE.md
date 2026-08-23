# Open Outdoor — Consolidated Open-Source Project Scope

**Status:** Consolidated authoritative implementation scope  
**Scope date:** 2026-08-19  
**Supersedes:** The supplied private/proprietary scope and the intermediate open-source draft  
**Primary host:** A public GitHub repository  
**Reference implementation:** New York regional build, iPhone 14 field testing, and a Windows-first contributor workflow  
**Implementation documents:** [Build documentation index](docs/README.md)

## 1. Purpose

Open Outdoor is an open-source, offline-first outdoor mapping and hike-recording application. It combines lawfully reusable public-land, trail, campground, service, restriction, and condition data with private user-created information while keeping those two classes of information technically and operationally separate.

The public GitHub repository is the authoritative home for the reusable application code, schemas, documentation, build tools, connector framework, tests, and redistributable sample data. It must be possible to clone, build, test, audit, modify, and redistribute the public project under its open-source license without access to any maintainer's personal information, credentials, restricted datasets, or private repository.

Private data and permission-limited sources may be added later in either of two supported private environments:

1. an external workspace on a standard Windows computer; or
2. a private downstream Git repository that regularly incorporates changes from the public upstream repository.

Neither private mode may require private data to be committed to, uploaded to, cached by, or processed in the public GitHub repository or its public CI workflows.

## 2. Scope authority and resolved conflicts

This document merges the supplied **Outdoor Super App — Project Scope** with the requested open-source edition. The supplied document was treated as product source material, not as an instruction set. This consolidated document is the sole project-scope authority; the two earlier documents are historical inputs and must not be used as parallel specifications.

The merge resolves conflicts as follows:

| Issue | Consolidated decision |
| --- | --- |
| Public repository licensing | The authoritative GitHub repository is genuinely open source under Apache License 2.0, not publicly visible proprietary source. |
| Meaning of “hosted on GitHub” | GitHub hosts source, collaboration, CI, documentation, and eligible releases. The app retains no required hosted runtime backend. |
| Personal versus community project | The reference deployment supports one hobby owner and free provisioning, while the public project supports outside contributors through documented governance. |
| Public distribution | Source and eligible artifacts may be distributed publicly. App Store submission remains out of MVP scope. Data and media are distributed only when their independent rights allow it. |
| Private data | Personal, secret, restricted-source, signing, and unredacted operational data are prohibited from public GitHub and public CI. They may be composed only in an approved private environment. |
| “Private GitHub fork” | GitHub native forks of a public repository are public. The supported confidential GitHub workflow is a separate private downstream copy or mirror with an `upstream` remote. |
| Permission-limited sources | Open-source adapter code does not make source records open. Owner-only or organization-only records remain private and never enter public fixtures, catalogs, caches, or releases. |
| Catalog types | Public and optional private reference catalogs may be composed at query time but remain read-only, origin-labelled, independently rights-checked, and separate from writable user data. |
| Signing and release identity | Public, private, and local hobby builds use distinct release channels. A channel keeps a stable bundle identity for update retention; private signing material never enters public automation. |
| Source facts and terms | URLs and source candidates from the earlier scope are planning inputs. Every acquisition and release revalidates current schema, freshness, terms, and redistribution rights rather than relying on the scope date. |

When a requirement could be interpreted in more than one way, the stricter privacy, source-rights, safety, attribution, and data-preservation interpretation applies.

## 3. Product principles

- **Open core, private edge:** reusable code and safe examples are public; personal, secret, restricted, or permission-limited material remains private.
- **Offline first:** the reference app remains useful in a bundled region without a hosted runtime backend or network connection.
- **Privacy by architecture:** private records use a separate writable store and never become reference-catalog records merely because both are visible in the same app.
- **Rights before ingestion:** public availability on the internet does not by itself permit collection, storage, derivation, or redistribution.
- **Evidence over certainty:** the app exposes provenance, freshness, restrictions, conflicts, and uncertainty. It does not guarantee legality, access, road condition, or safety.
- **Replaceable sources:** source-specific acquisition and mapping stay inside connector packages rather than leaking into the mobile application or canonical domain model.
- **Field reliability:** recording recovery, offline status, data retention, battery draw, and accessibility are release requirements.
- **Public reproducibility:** a contributor can validate the public project with open or synthetic fixtures and no private dependencies.

## 4. Assumptions and constraints

- The reference build is operated as a noncommercial project. Apache-2.0 permits commercial use of project-owned code, but every distributor must independently satisfy the licenses and permissions of included datasets, assets, services, and private extensions.
- The authoritative repository is public on GitHub and must not require a paid GitHub plan for ordinary contribution or public CI.
- Initial product validation targets New York. Additional regions are delivered as independently selected and versioned builds or packs.
- The primary reference device remains an iPhone 14. Each release pins its actual iOS test version, deployment target, Xcode version, macOS build image, and JavaScript/native dependency versions.
- Shared UI, business logic, ingestion, pack generation, and browser QA must be workable from Windows. Native iOS acceptance still requires macOS build capacity and a physical iPhone.
- The initial shipping product is iOS-only. Browser code is a QA harness, not a consumer web product; Android delivery is out of scope until separately approved.
- The initial app displays selected trails, user location, and the active recorded route but does not provide turn-by-turn navigation, rerouting, or off-route guidance.
- Free Apple Personal Team provisioning may be supported for hobby use. Its seven-day signing profile is an accepted availability constraint, not a promise of continuous installation.
- No hosted application backend, account service, cloud synchronization service, or public runtime catalog API is required by this scope.
- GitHub hosts the project, not the user's private runtime data. Public GitHub Releases may contain code and redistributable artifacts only.

## 5. Product goals

### 5.1 Functional goals

1. Map public land, prioritizing BLM-managed land, National Forest System land, and state forests, and show a derived camping status of `generally-eligible`, `verified-allowed`, `restricted`, `permit-required`, `prohibited`, `temporary-closure`, or `unknown`.
2. Discover developed campgrounds, lawfully included dispersed-camping spots, and useful outdoor traveler services.
3. Support a broad outdoor POI taxonomy covering camping and lodging; water and sanitation; fuel, charging, parking, and vehicle services; connectivity, medical, pet, shopping, and traveler services; and conditions, warnings, closures, checkpoints, and overnight restrictions.
4. Discover hiking routes from official, open, licensed, permission-approved, or user-imported sources.
5. Record a hike in the foreground or background; calculate distance and elevation gain; recover interrupted recordings; match a recording to a known trail; or save it as a private named, favorited, and explicitly shareable user trail.
6. Import supported GPX, GeoJSON, KML, CSV, and FIT files where applicable.
7. Export selected user tracks and places through GPX, GeoJSON, or generated summaries, with optional sensitive start/end removal and metadata stripping.
8. Allow private connectors, datasets, corrections, media, and user information to be composed into a private build without modifying the public application's core contracts.

### 5.2 Quality goals

- Remain useful offline under a release-specific capability contract.
- Keep activities, favorites, notes, personal campsites, private trails, corrections, and local media on the device unless the user explicitly exports or backs them up.
- Prevent private build inputs and outputs from entering public source control, CI, issues, pull requests, logs, caches, or release artifacts.
- Provide a cohesive, accessible, outdoor-focused experience with readable maps and explicit degraded, stale, offline, and uncertain states.
- Minimize battery use during long, screen-off recordings and maintain measurable, device-tested energy budgets.
- Preserve immutable raw activity observations so improved distance or elevation algorithms can produce traceable revisions.
- Make a new authorized source addable through an isolated connector package and manifest.

## 6. Open-source and private-data boundary

### 6.1 Data classifications

Every file, record, fixture, artifact, and log is classified before it is stored or published.

| Classification | Examples | Public GitHub | Public CI/artifacts |
| --- | --- | --- | --- |
| `PUBLIC_CODE` | Application source, connector SDK, schemas, tests, build scripts | Allowed under project license | Allowed |
| `PUBLIC_DOCS` | Architecture, contribution guide, source policy, threat model | Allowed | Allowed |
| `PUBLIC_DATA_REDISTRIBUTABLE` | Small open-data fixtures with recorded license and attribution | Allowed only when redistribution and repository storage are confirmed | Allowed within rights limits |
| `SYNTHETIC_OR_REDACTED` | Generated tracks, invented POIs, scrubbed error fixtures | Allowed after automated and human review | Allowed |
| `PRIVATE_PERSONAL` | Tracks, favorites, notes, home/start locations, photos, backups, device diagnostics | Prohibited | Prohibited |
| `PRIVATE_RESTRICTED_SOURCE` | Permission-limited exports, licensed archives, non-redistributable reviews/media | Prohibited | Prohibited |
| `SECRET` | Tokens, passwords, signing material, private keys, cookies, recovery keys | Prohibited | Prohibited except approved private secret stores in private CI |
| `PRIVATE_OPERATIONAL` | Unredacted logs, source-acquisition notes, private correction evidence | Prohibited | Prohibited |

“Private data” in this scope includes personal information even when the user created it, source material whose terms do not allow public redistribution, secrets and signing assets, unredacted diagnostics, exact private locations, and any derived artifact that could reconstruct those inputs.

`.gitignore` is a convenience control, not the privacy boundary. The design must remain safe if a contributor accidentally runs `git add --all` from the public checkout.

### 6.2 Supported mode A — external Windows private workspace

The preferred personal workflow uses two sibling or otherwise independent directories:

```text
C:\Projects\open-outdoor\                  # public Git checkout
D:\OpenOutdoorPrivate\                    # private root; not nested in the checkout
  config\
  connectors\
  raw\
  staging\
  media\
  packs\
  logs\
  evidence\
```

The private root is supplied explicitly through a command option or a task-specific variable such as `OUTDOOR_PRIVATE_ROOT`. The public toolchain must:

- reject a private root that resolves inside the public checkout;
- refuse to use the repository directory as a default private-data location;
- keep secrets in Windows Credential Manager or another approved credential store rather than ordinary configuration files;
- write temporary private files beneath the private root or an OS-protected task-specific temporary directory;
- mark generated private packs and reports with a `PRIVATE — DO NOT PUBLISH` classification;
- support local execution without sending telemetry or source content to a hosted service; and
- provide cleanup, backup, and restore instructions that do not delete public source or unrelated user files.

The public repository may contain example private manifests, but examples must use invented values and synthetic fixtures.

### 6.3 Supported mode B — private downstream repository

A team may create a separate private repository from the public upstream and periodically merge or rebase upstream changes. The private repository may contain private connector code, internal configuration, permission-record references, and only fixtures whose rights explicitly permit indefinite versioned Git retention. Data with expiry, deletion, revocation, mutable personal content, or limited historical retention must remain in access-controlled external private storage. Secrets, signing keys, and recovery keys stay out of Git even when the repository is private because Git history is durable and access can expand.

GitHub's native public forks are public and cannot independently be made private. Therefore, the supported GitHub pattern is a **private downstream copy or mirror with an `upstream` remote**, not a native public fork presented as private. If another Git host or enterprise policy supports an isolated private fork, it must provide equivalent confidentiality. See [GitHub's fork visibility documentation](https://docs.github.com/en/pull-requests/reference/forks) and [repository duplication guidance](https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository).

Private downstream CI must use a private repository, private secrets, access-controlled artifacts, and an isolated ephemeral single-job runner or documented equivalent local boundary. It must not execute untrusted pull-request code with private secrets/data, use privileged `pull_request_target` to run an untrusted head, call public-repository workflows with private payloads, reuse public/private caches, or upload private artifacts to public Actions, Releases, or issue logs.

### 6.4 Composition contract

The same composition interface supports both private modes:

1. The public core discovers extension manifests only from explicitly configured roots.
2. A private connector implements the published connector SDK and targets versioned canonical envelopes.
3. Private configuration may override region selection, connector enablement, and pack composition, but it may not silently weaken validation, attribution, retention, or privacy gates.
4. Public and private packages have separate dependency lock and provenance entries in the composed build report.
5. A private extension declares a compatible public-core version range and fails clearly when incompatible.
6. Private modules are loaded at build time or through an explicit local plugin boundary; the public app does not download or execute untrusted private code at runtime.
7. A private build is visually and cryptographically distinguishable from an official public build and records its public base commit without exposing private commit identifiers to public systems.
8. Removing the private root produces a fully functional public build with no missing imports or compile-time dependency on private modules.

### 6.5 Leakage prevention and response

The repository includes a `privacy-boundary` quality gate that:

- rejects known private paths, secret formats, unapproved large binaries, database files, unredacted location fixtures, and undeclared dataset licenses;
- scans Git changes and generated artifacts before push and again in public CI;
- verifies that test fixtures are synthetic, redacted, or explicitly approved for redistribution;
- inspects archives before publication and creates a machine-readable software/data bill of materials;
- runs example public builds with network access disabled after dependencies and approved public inputs are staged; and
- fails closed when classification or rights metadata is absent.

If private material reaches GitHub, deleting the visible file is insufficient because Git history, caches, forks, logs, and downloaded artifacts may retain it. The incident procedure must immediately revoke affected secrets, stop releases, assess exposure, remove or rotate the data where possible, follow GitHub's sensitive-data removal process, and record a private post-incident review. Public notification must not reproduce the sensitive content.

The [threat model](docs/THREAT_MODEL.md) is the normative asset/boundary/mitigation register. Operational and crash evidence follows the [local diagnostics plan](docs/DIAGNOSTICS_PLAN.md): no hosted telemetry by default, bounded local retention, forbidden-field redaction, user preview, and explicit export only.

## 7. Delivery architecture

- React Native, TypeScript, and Expo prebuild for shared UI and business logic, with Windows browser QA that does not claim to validate native iOS behavior.
- A native Swift tracking service for Core Location background sessions and Core Motion/barometer readings.
- MapLibre Native on iOS and a MapLibre GL JS adapter for browser QA.
- Separate SQLite stores on the device for writable private user data and read-only versioned reference catalogs.
- Laptop-local PostgreSQL/PostGIS or an equivalent spatial staging database for normalization, validation, deduplication, and pack generation. It is a build tool, not a runtime service.
- Python ingestion workers using GDAL-compatible formats, runnable on Windows or another user-controlled build machine.
- Versioned regional SQLite/vector-tile bundles generated on a local or controlled build machine.
- A source-connector SDK, validation harness, and scaffolding command so new authorized datasets can be added without source-specific mobile changes.
- Private-extension discovery through an external path or private downstream package set, never through a hard-coded public dependency on a private repository.
- The [canonical data specification](docs/CANONICAL_DATA_SPEC.md) defines CRS, axes, units, time, IDs, geometry, unknown values, provenance, and schema evolution across all components.

## 8. Data planes and update path

Runtime and build data are separated by ownership and mutability:

- **Private user plane:** a writable SQLite database in the app container holds activities, user-created trails and places, favorites, notes, settings, private corrections, and import/export history.
- **Public reference catalog:** read-only, versioned bundles contain only redistributable processed land, rule, trail, campsite, service, and POI records with required attribution.
- **Private reference extension:** optional read-only bundles contain records authorized only for that user or organization. They are built and distributed solely in the private environment.
- **Public processing workspace:** reproducible tooling and safe staging fixtures used to validate public connectors.
- **Private processing workspace:** raw permission-limited inputs, normalized staging data, unredacted provenance, correction evidence, and private build outputs.

The default catalog flow is:

```text
authorized source
  → classified acquisition workspace
  → validation and entity resolution
  → rights-aware regional bundle
  → app/private build
  → checksum verification
  → atomic catalog activation
```

Every bundle includes a schema version, content version, covered region, source/attribution manifest, creation and data-as-of times, freshness metadata, compatible app versions, checksums, included capability flags, and a public/private distribution classification.

The private user database never shares a writable database file with a reference catalog. An update stages and verifies a new catalog, migrates private associations transactionally, switches catalogs atomically, and retains a compatible rollback catalog until successful launch. Catalog activation or rollback must never delete an activity, user trail, note, photo, favorite, private correction, or audit event.

Private and public reference bundles may be queried as a composed read-only catalog, but each result retains its origin and rights metadata. Export and diagnostics default to excluding private-extension records unless the user explicitly selects a permitted export.

On iOS, active recording, sealed user data, attachments, catalogs, diagnostics, and backups follow the explicit protection and system-backup rules in the [iOS data protection and backup policy](docs/IOS_DATA_PROTECTION_AND_BACKUP.md). Private user data and regenerable catalogs are excluded from implicit app-container backups; supported recovery uses the user-initiated encrypted backup.

### 8.1 Catalog correction and promotion loop

The phone never mutates a bundled public or private reference catalog. A user action such as `same place`, `not a duplicate`, `hide`, or `suggest pin correction` creates a private overlay keyed by canonical/source IDs and the base catalog version. The UI applies the overlay locally and preserves it across compatible catalog updates.

The user may explicitly export selected correction events or a selected `UserTrail` to a private laptop review workflow. The export excludes unrelated activities, favorites, notes, photos, and personal identifiers by default. The laptop validates the package, checks rights and privacy, and records an auditable entity-resolution decision. Acceptance into a public catalog additionally requires an intentional public contribution containing only redistributable, non-sensitive evidence and the ordinary public review process.

An accepted correction appears canonically only in a later generated catalog. `CatalogIdRemap` records map retired canonical IDs to replacements. `CatalogPromotionLink` records map an explicitly exported private UUID/source-record ID to the new canonical entity. Activation applies both transactionally to private associations and overlays, marks unresolved links for rematching, and never deletes or rewrites the underlying `UserTrail`, `RecordedActivity`, note, media, or audit history.

Installing an app update with the same channel identity must migrate the private database in place, stage the new catalogs, validate remaps/promotion links, atomically switch catalogs, and retain the previous compatible catalogs until first successful launch. A catalog failure rolls back catalogs without rolling back private data. Uninstalling the app may erase its container; recovery after reinstall requires a separate explicit encrypted backup and restore.

## 9. Offline capability contract

Every release declares and tests its actual offline coverage.

| Capability | Required offline behavior |
| --- | --- |
| Explore and search | Browse bundled basemap, land units, trails, campsites, services, and POIs; text and spatial filters operate locally. |
| Land and access | Display ownership, base camping rule, active bundled restrictions, derived status, provenance, and last-verified/stale dates without implying live verification. |
| Trail and POI details | Show all fields and media that are present and licensed for offline inclusion; unavailable content is explicit. |
| Hike recording | Start, pause, resume, recover, finish, calculate distance/elevation, and save without connectivity. |
| Personal actions | Create and edit private trails/places, favorite, annotate, attach photos, and apply private correction overlays locally. |
| Export and share | Generate selected GPX, GeoJSON, and share artifacts offline; remote delivery may wait for connectivity. |
| External/live functions | Mark source links, live conditions, and new authoritative verification unavailable when offline. |

Each bundle manifest contains `bundle_id`, schema/content versions, geographic coverage, entity types, offline feature flags, source and attribution inventory, rights-policy snapshot, generation and data-as-of times, per-source freshness/expiry, minimum and maximum compatible app versions, dependencies, compressed and installed sizes, checksums, and distribution classification.

Catalog activation is checksum-verified and atomic. Before activation, the app confirms compatibility and enough free space for the incoming bundle, migration workspace, and rollback copy. Interrupted activation retains the last known-good catalogs. Old catalogs are removed only after a successful launch and integrity check. The UI always exposes bundle coverage, version, origin, and stale or expired safety-relevant content.

The rights-aware pack builder hard-fails if a requested bundle includes a source or field without the required offline/public/private distribution permission, exceeds retention, omits attribution, forbids the proposed derivation, or lacks complete rights metadata. Each build emits an auditable inclusion/exclusion report by region, source, entity/media class, distribution class, and reason.

### 9.1 Basemap contract

- Build the reference New York basemap from a checksum-pinned [Geofabrik New York OpenStreetMap PBF extract](https://download.geofabrik.de/north-america/us/new-york.html), or another source whose manifest permits the intended offline/public/private distribution.
- Generate the local vector-tile archive with a pinned compiler and versioned schema/style profile.
- Never prefetch or package tiles from `tile.openstreetmap.org`; its [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) does not make that public service an offline-pack source.
- Bundle the MapLibre style, sprites, and fonts locally, with a recorded license and attribution entry for each asset.
- Record source timestamp, extract boundary, provider, license, attribution, style version, and schema version.
- Declare zoom and layer coverage per release rather than implying unlimited offline detail. The initial New York target is statewide context through zoom 14 and zooms 15–16 only for configured high-detail outdoor areas; trail, land, and active-recording overlays remain queryable beyond basemap detail.
- Preserve the [OpenStreetMap copyright/license attribution](https://www.openstreetmap.org/copyright), extract-provider attribution, and all applicable derivative-data obligations.

### 9.2 Storage budgets

Initial reference ceilings carried forward from the supplied scope are:

- compressed IPA target at most 1.5 GiB, with a 2 GiB hard stop until the Windows signing/install path proves otherwise;
- combined installed public and private read-only reference data at most 3 GiB, including at most 1.5 GiB basemap, 1 GiB catalog/search/elevation content, and 512 MiB eligible media; and
- enough free space for the new bundle, bounded migration workspace, rollback copy, and at least 2 GiB remaining after activation.

Public and private component reports remain separate while the 3 GiB installed ceiling applies to their combined active total. Preflight uses the exact formula and provisional budgets in [NON_FUNCTIONAL_BUDGETS.md](docs/NON_FUNCTIONAL_BUDGETS.md), which requires at least 9 GiB free for maximum 3 GiB current plus 3 GiB incoming catalogs, workspace/decompression, and reserve. Private user data is never silently evicted. Raising a limit requires measured install, refresh, activation, rollback, and first-launch tests on the reference device.

The build fails when a component or total exceeds its ceiling and reports size by region, source, entity/media class, zoom, distribution class, and artifact. Reducing zoom detail, eligible media, or secondary regions is preferred to removing safety-critical rules, restrictions, attribution, or private user records.

## 10. Source and data-rights policy

### 10.1 Source registration

Every source has a machine-readable rights and operations record containing:

- owner, canonical URL, and acquisition endpoint;
- transport and acquisition mode;
- lifecycle, authorization, and source-class status;
- license, permission, or user-export basis;
- allowed fields, media variants, retention, redistribution, derived-data, and offline-storage rights;
- public, private-user-only, private-organization, or prohibited bundle scope;
- attribution text and required placement;
- refresh schedule, rate limits, and last terms review;
- deletion/tombstone behavior; and
- redaction and fixture rules.

The controlled status values are independent dimensions:

- lifecycle: `experimental`, `active`, `failing`, `disabled`, or `retired`;
- authorization: `authorized`, `permission-required`, `expired`, or `revoked`;
- acquisition: `automated`, `manual-import`, `user-export`, `overlay`, or `deep-link-only`; and
- source class: `current` or `legacy`.

Typical lifecycle movement is `experimental → active`, `active → failing → active|disabled`, or any state to `retired`. Authorization expiry/revocation immediately blocks new acquisition and bundle inclusion without erasing records that may still lawfully be retained. No dimension may masquerade as another; for example, an `active` connector is not necessarily `authorized` for a public bundle.

Automated acquisition or bundle inclusion occurs only when all applicable status and rights fields permit it. Personal or noncommercial intent does not waive terms, robots controls, authentication, rate limits, paywalls, or copyright.

### 10.2 Public catalog eligibility

A record or asset enters a public repository, public CI artifact, or public release only if its manifest affirmatively permits the intended redistribution, modification/derivation, offline inclusion, retention, and attribution method. Missing or ambiguous rights fail closed.

Open-source code does not make third-party data open source. Each public release includes separate code, data, and asset notices and does not apply the project's code license to third-party content.

### 10.3 Private catalog eligibility

A permission-limited source may enter a private build only when its manifest documents the applicable user export, personal-use grant, organization license, or written permission. Private use is not a bypass for prohibited acquisition. Retention, field, device-count, attribution, and redistribution limits continue to apply.

The public repository may include a disabled adapter shell, taxonomy mapping, and synthetic fixtures for a permission-gated source. It may not include copied records, photos, reviews, session material, or proprietary schemas acquired through prohibited means.

### 10.4 Initial source tiers

#### Tier A — authoritative/open candidates

- USGS PAD-US for land ownership, management, and coarse access classification.
- BLM public geospatial layers.
- USDA Forest Service trails, roads, boundaries, surface ownership, and MVUM-related layers.
- Recreation.gov RIDB facilities, campgrounds, campsites, permits, and recreation areas.
- National Park Service APIs for campgrounds, alerts, places, and park information.
- OpenStreetMap trails, trailheads, campsites, roads, barriers, and amenities under ODbL obligations.
- USGS 3DEP elevation for postprocessed profiles.
- State and local open-data portals, regulations, closures, and GIS services, added jurisdiction by jurisdiction.

Tier placement expresses priority, not authorization. Every connector remains disabled, manual, overlay-only, or deep-link-only until its manifest records an applicable license/permission, acquisition method, retention, derivation, redistribution scope, and attribution.

Secondary candidates retain tighter defaults:

- [TrailSplits API](https://trailsplits.com/api) remains disabled until its current API, noncommercial, developer-preview, offline-storage, derived-data, and map-tile terms are reviewed. If enabled privately, it is a laptop-build input rather than a runtime dependency; safety-sensitive snow data honors provider validity and a short `stale_after`.
- [OpenCampingMap](https://opencampingmap.org/en/) may be used as an OpenStreetMap-derived discovery/QA view but does not create a second canonical copy of records acquired through the direct OSM connector.
- [US Campgrounds](https://uscampgrounds.info/) is private-user-only unless its current terms expressly permit public redistribution; source age must be visible.
- [FreeCampsites.net](https://freecampsites.net/) remains `deep-link-only` unless an official API, export, applicable license, or written permission authorizes another mode.

#### Tier B — user-controlled imports

- GPX, GeoJSON, KML, CSV, FIT, account-data exports, or equivalent files that a user lawfully obtains from AllTrails, iOverlander, The Dyrt, Gaia GPS, onX, CalTopo, Garmin, Strava, or another service.
- User-selected [POI Factory](https://www.poi-factory.com/poifiles) CSV or GPX downloads when the applicable file license permits the user's intended use.
- Personal spreadsheets, bookmarks, waypoints, tracks, and photos.

Imports retain source and attribution, enter the private user plane by default, and are not automatically passed into the reference-catalog pipeline or any public contribution.

#### Tier C — permission-gated catalogs

- AllTrails catalog descriptions, reviews, photos, and search results.
- The Dyrt campground catalog, reviews, photos, and search results.
- iOverlander place catalog, comments/check-ins, and photos outside an allowed user export.
- POI Factory catalogs whose individual file permissions do not authorize the proposed bundle.
- Other commercial or community campsite/trail catalogs.

The public project may implement adapter interfaces, complete taxonomy mappings, source links, and synthetic fixtures. Automated harvesting and record inclusion remain disabled until an official API, suitable license, user export, or written permission covers the exact acquisition and distribution mode. The UI and release notes distinguish `taxonomy supported`, `connector implemented`, `source authorized`, and `records included`; none implies the others.

#### Tier D — legacy sources

FreeRoam and other discontinued catalogs are excluded unless an owner releases an authorized archive or compatible open-data dump.

### 10.5 iOverlander private-use decision

As rechecked on 2026-08-19, the [iOverlander Terms of Service](https://ioverlander.com/terms_2023) are dated April 1, 2024. They grant use, modification, and reproduction of content solely for personal, noncommercial use; prohibit broader distribution or storage without written permission; and expressly prohibit harvesting or scraping service content. The current [subscription page](https://ioverlander.com/subscriptions) describes official KML, GPX, or CSV website exports as an Unlimited-plan feature. These facts may change, so every implementation and use must recheck the live terms.

The consolidated decision is therefore stricter and clearer than the earlier scope:

- no automated iOverlander fetcher, scraper, authenticated-session reuse, or private-API connector is in scope;
- the public repository may contain only the compatible taxonomy, a local user-selected export importer, synthetic fixtures, and deep links;
- a user may import an export lawfully obtained through iOverlander's official feature into that user's private environment for personal, noncommercial use, subject to the current terms;
- iOverlander-derived records, comments, check-ins, photos, translations, and private export fixtures never enter public GitHub, public CI, public caches, public catalogs, or public releases without separate written permission; and
- commercial, multi-user, hosted, or broader distribution requires written permission and a source-policy update before acquisition or inclusion.

For a lawfully obtained private export, the importer must:

- treat package or download IDs as source partitions rather than jurisdiction boundaries, filter by exact selected-region geometry and country code, preserve partition mappings, and deduplicate overlaps;
- preserve tombstones/deleted markers and provenance when present while excluding deleted records from the active catalog;
- retain permitted verification date, revision, language, source ID, and stale-state fields and never present the snapshot as live verification;
- keep national or multi-region exports only in private staging and build selected regional packs within size limits;
- preserve every encountered category and amenity, including unknown/future values, without assuming that photo counts imply licensed media payloads; and
- report unavailable territories, fields, media, and intentional exclusions instead of implying complete coverage.

### 10.6 New York reference registry

The earlier scope recorded the following registry review on 2026-08-06. The URLs are discovery/canonical endpoints, not permanent authorization or data pins. Every build records and revalidates the exact dataset/service version, schema, retrieval time, checksum, fields used, license/permission, attribution, and `stale_after`.

| Purpose | Canonical source | Build pin and safety treatment |
| --- | --- | --- |
| National ownership cross-check | [USGS PAD-US downloads](https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-download) | Pin named release, New York extract checksum, and retrieval date. Use only as a coarse ownership/access cross-check. |
| New York bundle boundary | [NYS ITS Civil Boundaries](https://gis.ny.gov/civil-boundaries/) `State`/`State Shoreline`, cross-checked with the latest released [Census TIGER/Line](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) state FIPS `36` | Pin edition/vintage, CRS, geometry checksum, and disclaimer. Planning geometry does not establish parcel ownership or a legal survey boundary. |
| DEC-managed land | [NYS DEC `DEC Lands`, Feature Layer 2](https://gisservices.dec.ny.gov/arcgis/rest/services/reference/MapServer/2) | Page the complete layer; pin schema, maximum source update, record count, and checksum. Category/class creates a candidate, not `verified-allowed`. |
| DEC roads and hiking trails | [DEC Road, Layer 0](https://gisservices.dec.ny.gov/arcgis/rest/services/dil/dil_trails/MapServer/0) and [Hiking Trails, Layer 2](https://gisservices.dec.ny.gov/arcgis/rest/services/dil/dil_trails/MapServer/2) | Pin layer IDs, schema, counts, update maxima, and checksums. Public-use and modal fields do not prove present passability. |
| DEC recreation assets | [Points of Interest on DEC Lands, dataset `yvkb-z58x`](https://data.ny.gov/Recreation/Points-of-Interest-on-Department-of-Environmental-/yvkb-z58x) | Pin export time/schema/checksum. Map campsites, lean-tos, privies, parking, structures, and other assets through normal POI/dedup processing. |
| Statewide primitive-camping policy | [NYS DEC Primitive Camping](https://dec.ny.gov/things-to-do/camping/primitive) and [Rules for Using State Forests and Forest Preserve](https://dec.ny.gov/nature/forests-trees/state-forests/rules-for-use) | Fetch/hash and review at each release. Encode defaults and exclusions as dated rules with regulatory references; retain property-specific exceptions. |
| Property/unit rules | Official property page and Unit Management Plan referenced by each DEC land record | Required for `verified-allowed`. Missing, conflicting, draft-only, or stale unit evidence leaves `generally-eligible` or `unknown`. |
| Finger Lakes ownership | [USDA Forest Service EDW Surface Ownership](https://apps.fs.usda.gov/ArcX/rest/services/EDW/EDW_SurfaceOwnership_01/MapServer) and [NFS land-unit downloads](https://data.fs.usda.gov/geodata/edw/datasets.php?xmlKeyword=national+forest+system+land+units) | Clip to New York/Finger Lakes, pin schema/version/checksum, and exclude non-Forest-Service surface ownership/private inholdings. Proclaimed boundaries are context only. |
| Finger Lakes motor access | [USDA Forest Service MVUM Roads](https://apps.fs.usda.gov/fsgisx05/rest/services/wo_nfs_gtac/IVMQuery/MapServer/0) | Pin schema, update metadata, count, and checksum. Season/vehicle class are dated access rules; designation is not a passability guarantee. |
| Finger Lakes restrictions | [Green Mountain and Finger Lakes National Forests](https://www.fs.usda.gov/r09/gmfl) official alerts, orders, and closure documents | Resolve/pin applicable documents per build. Safety-sensitive restriction data expires after at most seven days unless the authority supplies an earlier end/review time; stale data cannot support `verified-allowed`. |

Initial coverage is New York clipped to the selected authoritative boundary. Coverage reports separately quantify land geometry, current rules, access, POIs, restrictions, and the percentage of candidate area in each effective-status class. Statewide geometry may ship before every unit has verified rules, but the UI and release may not imply complete legal verification.

## 11. Connector architecture

Every external source is an isolated, versioned connector package. The shared contract supports applicable stages:

1. `discover` — enumerate files, pages, layers, regions, or partitions;
2. `fetch` — retrieve an authorized API response, open-data artifact, approved page, or user-selected export;
3. `store_raw` — persist permitted raw content and retrieval metadata before parsing;
4. `parse` — create versioned source records without discarding permitted original fields;
5. `normalize` — map records to canonical envelopes;
6. `validate` — check fields, geometry, coordinates, timestamps, and enumerations;
7. `checkpoint` — store cursors, ETags, checksums, and completed partitions after durable success; and
8. `emit` — send validated envelopes to isolated staging and entity resolution.

Each connector manifest declares its stable ID, display name, owner/canonical URL, connector/schema versions, transport, entry points, canonical record types/categories, geographic/content coverage, all independent source statuses, rights/attribution, allowed public/private distribution, authentication secret names, rate/concurrency/retry policy, retention, pagination/partitioning, incremental/deletion behavior, and fixture locations. Secret values never appear in the manifest.

Supported transport patterns include REST/GraphQL APIs; downloadable CSV, JSON, GeoJSON, GPX, KML/KMZ, FIT, Shapefile, File Geodatabase, GeoPackage, and Parquet; ArcGIS Feature Services; standards-based WFS; RSS/Atom; permission-approved HTML; browser-assisted/user exports; and local files. WMS, raster, and vector-tile services are display-only overlays unless a separately authorized feature source supplies queryable entities.

### 11.1 Raw-data boundary

- Store immutable raw payloads or content-addressed snapshots immediately after fetch and before parsing/normalization only when retention permits.
- Record retrieval metadata, HTTP status, content type, checksum, parser version, source partition, classification, and authorized storage root.
- Normalize from saved permitted fixtures/snapshots during development to avoid unnecessary repeated source contact.
- Quarantine malformed or newly incompatible payloads instead of partially importing them.
- Reprocess saved raw records when a parser, taxonomy, or canonical schema improves. If retention requires raw deletion, keep only permitted normalized fields/provenance, mark the run `non_replayable`, and lawfully reacquire when reprocessing is needed.
- Never copy a private raw snapshot into the public connector fixture directory. Public parser tests use synthetic, redacted, or independently redistributable samples.

### 11.2 Ingestion and import security

Connector inputs are untrusted, including authoritative network payloads, archives, GIS files, user imports, metadata, URLs, and media.

- Allow only manifest-declared schemes, hosts, redirects, content types, and maximum sizes. Enforce connection/read timeouts, bounded retries, and a per-run byte budget.
- Inspect magic bytes and structure rather than trusting extensions or headers. Reject executable content, macros, external XML entities, unexpected nested formats, malformed coordinate systems, and non-finite coordinates.
- Before archive extraction, enforce compressed/expanded size, file-count, path-depth, nesting, and compression-ratio limits. Reject absolute paths, traversal, device names, alternate data streams, and links escaping a task-specific temporary directory.
- Run complex native/GDAL/media parsers with least privilege and bounded CPU, memory, time, vertex count, image dimensions, and recursion. A parser failure quarantines only that artifact/partition.
- Use parameterized database operations and validate geometry, type, and cardinality before isolated staging. Imports cannot overwrite a last known-good catalog or the private user database.
- Store connector secrets only in an approved OS/private CI credential store or short-lived process environment. Redact authentication headers, cookies, query secrets, personal identifiers, and private filesystem roots from diagnostics.
- Pin parser/tool versions, scan dependencies/artifacts, and maintain malicious fixtures for zip bombs, traversal, entity expansion, oversized geometry/media, invalid Unicode, injection strings, and corrupt multipart data.

The planned `source create <connector-id>` command creates a manifest, typed source model, adapter, parser, normalizer, redacted/synthetic fixtures, contract tests, attribution entry, and health definition. Before the generator exists, connectors use the same documented directory convention.

### 11.3 Reliability and change detection

- Use bounded concurrency, source-specific rate limits, exponential backoff with jitter, conditional requests, and circuit breakers.
- Support full refresh and lawful incremental sync by cursor, timestamp, ETag, last-modified value, or checksum.
- Detect HTML/schema drift through fixtures, field-coverage metrics, payload fingerprints, and parser-failure thresholds.
- Quarantine a connector when required fields disappear, geometry errors cross threshold, rights review expires, or output volume changes unexpectedly.
- Track records discovered, added, changed, unchanged, rejected, tombstoned, linked, and excluded by rights on every run.
- Alert on staleness, repeated failures, volume anomalies, license-review dates, attribution gaps, and retention deadlines without leaking private values into public systems.
- One failing connector cannot corrupt the last known-good dataset or block unrelated connectors.

### 11.4 Shared downstream processing

Entity-producing connectors emit the same versioned envelopes with source and field-level provenance. Coordinate cleanup, taxonomy mapping, confidence, duplicate candidate generation, canonical linking, search indexing, and offline-tile generation occur in shared downstream processing. Display-only overlay connectors bypass entity resolution and retain their own attribution, availability, cache, and offline-use rules.

Public and private envelopes can use the same algorithms, but their staging tables, raw roots, logs, build reports, caches, and publication destinations remain classified. A public build cannot query a private staging database, and a private result cannot be promoted merely by passing canonical validation.

## 12. Canonical data model

The shared model retains field-level provenance and does not blend conflicting facts without explanation.

- **`LandUnit`:** geometry, owner/manager, access class, base camping rule, stay/access/fire rules, authoritative references, confidence, verification, review, and stale dates.
- **`Place`:** campsite, campground, trailhead, service, or amenity geometry; type, access, cost, season, hours, vehicle constraints, and source records.
- **`Trail`:** reference geometry, route fingerprint, name, activities, distance, ascent/descent, surface, difficulty, season, restrictions, and provenance.
- **`UserTrail`:** private stable UUID, user-approved geometry and metadata, photos, favorite/privacy state, and `user-recorded` provenance.
- **`RecordedActivity`:** immutable timestamped location observations, permitted sensor summaries, pauses, waypoints, derived metrics, matches, notes, photos, privacy, and export history.
- **`Condition`:** time-sensitive road, passability, hazard, checkpoint, or degraded-access information.
- **`Restriction`:** authoritative closure, prohibition, permit zone, fire restriction, seasonal rule, or vehicle limitation.
- **`Observation`:** attributable, time-bounded source assertion that cannot silently overwrite newer authoritative facts.
- **`Review`, `CheckIn`, and `MediaAsset`:** separately licensed and retained source content included only when its rights allow the intended environment.
- **`TrailAssociation`, `TrailOverlay`, `CatalogIdRemap`, and `CatalogPromotionLink`:** non-destructive links between private and reference entities across catalog versions.

Durable destinations use `Place`; temporal reports use `Condition`; enforceable rules use `Restriction`. A bathroom within a campground and the campground itself are related entities, not duplicates.

### 12.1 Entity, taxonomy, and retention requirements

`LandUnit` stores canonical geometry; owner and manager; public-access class; persisted base camping rule; stay, access, and fire rules; effective dates; separately modelled restriction references; authoritative source; retrieval time; confidence; `verified_as_of`; `review_due_at`; and `stale_after`.

Ownership begins a camping decision but never finishes it:

- BLM-managed and National Forest System surface-ownership land are primary candidate classes because dispersed camping is commonly possible subject to unit, designation, closure, permit, stay, access, and special-area rules. Neither is encoded as universally allowed.
- State forests are jurisdiction-specific candidates. `verified-allowed` requires a current affirmative unit rule; permit, distance, seasonal, and designated-site requirements are retained.
- Administrative/proclamation boundaries do not prove public surface ownership. Private and other inholdings are excluded before camping evaluation.
- Legal vehicle access is evaluated separately through current travel-management, MVUM, closure, seasonal, and private-crossing evidence.
- National/state parks, refuges, military land, tribal land, protected designations, and conservation closures are never inferred to permit dispersed camping from apparent public ownership.

`Place` supports point/area geometry plus entrances; primary and secondary types; access, cost, season, hours, amenities, and vehicle constraints; confidence; and independently attributed source records. Private notes, favorite/visit state, and user privacy remain in the user plane rather than imported facts.

The canonical taxonomy covers:

- camping and lodging: established campground, informal/wild/dispersed campsite, farm/vineyard camping, hotel, hostel, short-term parking, and vehicle storage;
- hygiene and sanitation: toilets/type/accessibility, showers, laundry, dump stations, trash, recycling, and related eco-services;
- water and food: potable/non-potable water, restaurants, groceries, and relevant shopping;
- vehicle services: fuel, propane, EV charging, mechanics/parts, insurance, shipping, and storage;
- connectivity and money: Wi-Fi, permitted cellular observations, work space, banks/ATMs, and currency exchange;
- traveler services: medical, pet, tourist information/attractions, customs/immigration, consulates/embassies, and other useful destinations; and
- conditions/restrictions: road reports, checkpoints, hazards, closures, and overnight prohibitions represented as `Condition` or `Restriction`, not durable place points.

Amenity values support `yes`, `no`, `unknown`, and structured details including fee, hours, season, potable status, toilet style, shower temperature, accessibility, and observation date. Unknown and future source categories are preserved for review rather than silently discarded.

`Condition` stores point/line/polygon geometry, type, observed/valid interval, review/expiry, applicable direction, confidence, and provenance. `Restriction` stores applicable geometry, closure/prohibition/permit/fire/season/vehicle type, effective interval, affected activity/vehicle, authority, official source, supersession, and staleness. `Observation` records an attributable assertion, observation time, permitted reporter identity, confidence, and expiry without overwriting authoritative facts.

`Review`, `CheckIn`, and `MediaAsset` retain exact source subject/ID, timestamps, permitted creator identity/attribution, language and structured fields, moderation/removal status, checksums, license, retention, offline/public/private distribution scope, and source URL. Body text or media is retained/bundled only where expressly permitted. Private user visits and photos stay in the user database.

`Trail` stores canonical geometry/fingerprint, name, activity, distance, ascent/descent, surface, difficulty, season, restrictions, and source provenance. `UserTrail` uses a private stable UUID and stores the user-approved cleaned geometry, metadata, access notes, photos, favorite/privacy state, and `user-recorded` provenance.

`RecordedActivity` stores immutable timestamped `CLLocation` values with coordinate, altitude, accuracy, speed/course where available; low-frequency relative altitude; permitted derived/coarse motion summaries; pause intervals and waypoints; versioned distance, time, pace, ascent/descent; match candidates; and private title, notes, media, privacy, and export history. Canonical coordinate, datum, time, unit, ID, geometry, null/unknown, and provenance semantics follow the versioned canonical data specification.

Raw activity observations are preserved so algorithms can be rerun. Samples use bounded, crash-safe SQLite WAL batches, durable sequence numbers, checkpoints, and appropriate delta encoding/compression. Continuous raw accelerometer/gyroscope streams are not retained without a future justified feature. Rejected duplicate points, transient filters, high-frequency motion intermediates, and processing caches are disposable after durable results/diagnostics. Users can inspect storage and explicitly archive, export, or delete private activities without silently degrading saved trails.

### 12.2 Camping-status evaluation

`effective_camping_status` is deterministic, versioned, time-aware, and explainable. It combines ownership evidence, current unit rules, spatially applicable restrictions, access constraints, effective intervals, supersession, authority, and staleness.

Precedence is:

1. current explicit camping prohibition → `prohibited`;
2. otherwise, applicable current emergency/order closure → `temporary-closure`;
3. designated-site-only rule → `prohibited` outside designated geometry;
4. applicable permit requirement → `permit-required`;
5. other applicable limits that still allow camping → `restricted`;
6. incomplete, conflicting, or stale mandatory evidence → `unknown`; and
7. otherwise, an affirmative current unit rule → `verified-allowed`, or a supported ownership presumption → `generally-eligible`.

Before precedence, the evaluator filters rules/restrictions by spatial scope, activity, jurisdiction, effective interval, supersession/rescission state, and queried point. It records considered inputs and rejection reasons. A more specific current authoritative rule overrides a general rule; a newer superseding order overrides its predecessor. Equal-authority conflicts block a positive result.

Known prohibitions remain visible even if positive evidence is incomplete. Crowdsourced observations may lower confidence but never override an authoritative rule. Vehicle access is derived separately. The UI exposes the winning rule, relevant overridden/conflicting inputs, evaluation time, and freshness. A cached result carries evaluator/input versions and is replaceable; stale mandatory safety inputs invalidate positive results.

Acceptance fixtures cover permanent prohibition plus temporary closure, expired mandatory closure feed, current permit rule with unrelated missing positive evidence, designated-site geometry boundaries, superseded orders, equal-authority conflicts, private inholdings, and recovery to a positive status when every mandatory input becomes current.

### 12.3 Entity resolution

Deduplication links permitted immutable source records to canonical entities and is reversible. Raw retention follows source policy; where raw retention is prohibited, the pipeline keeps only permitted normalized fields/provenance, marks the record `non_replayable`, and requires lawful reacquisition for reprocessing.

Place candidate generation prefers exact stable/cross-source identifiers, then spatial search, geohash, address/phone/URL, normalized names, and intersecting geometry. Type-specific radii reflect coordinate precision and entity scale. Clearly incompatible types are excluded, while compatible multi-type places remain possible.

Place match scores combine independent evidence: distance/overlap, normalized names/aliases, compatible type/amenities, structured identifiers, managing agency/reservation IDs, entrances/access roads, permitted descriptions, coordinate precision, source quality, and recency of durable identity. Temporary closure/condition state is excluded from durable identity. Weights and automatic/review thresholds are calibrated by place type and, where needed, source pair. Nearby unnamed dispersed sites are not merged by proximity alone.

Trail matching uses bounding boxes, endpoints, buffered overlap, length, elevation profile, and direction-independent Fréchet/Hausdorff-style geometry similarity. Trail systems, named trails, variants, and recorded activities remain distinct so a loop and out-and-back sharing segments are not collapsed.

Condition/restriction matching combines compatible type, authority/source ID, affected activity/vehicle, geometry, and overlapping/adjacent time. Links are classified as `duplicate-report`, `revision-of`, `supersedes`, `extends`, or `related-event`; only duplicates share a canonical event without preserving a temporal relationship. Recurring seasons and separate incidents remain separate absent explicit continuity.

Reviews use exact source ID and subject first; cross-source author/time/text similarity never authorizes copying. Check-ins require event ID or subject plus permitted reporter/time/context and preserve repeated visits. Media uses cryptographic hashes for identical bytes; perceptual similarity only nominates review. Rights and attribution remain on every source record even when content is identical.

Canonical field selection retains field-level provenance, prefers current authoritative access/closure/legal evidence, summarizes subjective observations with dates/confidence, and preserves conflict. Canonical merges, splits, moves, same-place decisions, and non-duplicate decisions create auditable events. Deleted/expired/superseded content retains only permitted tombstone fields so it is not recreated. Rights and attribution remain attached after matching, and deduplication never expands retention, use, or export permissions.

## 13. Hike recording and elevation

- Start, pause, resume, finish, background operation, checkpoints, and crash recovery.
- Background location and motion/barometer services run only during an active recording. Navigation is not an initial product feature.
- Native code batches bounded observations to storage instead of waking the JavaScript layer for each point.
- Immutable raw location and low-frequency barometric observations are retained; derived tracks and statistics are versioned.
- Elevation prefers continuous barometric relative change, uses accuracy-gated GPS altitude as fallback, and may apply a compatible bundled 3DEP correction after recording.
- Pauses, pressure drift, spikes, poor GPS, clock disorder, duplicate batches, suspension, and crash recovery have deterministic regression fixtures.
- Finishing a recording offers a strong reference/user-trail match or creation of a new private `UserTrail`.
- Trimming sensitive endpoints, removing obvious spikes, splitting/joining segments, selecting route form, and previewing recalculated statistics occur before saving or exporting.

### 13.1 Elevation calculation and revisions

Every derived result stores `elevation_algorithm_version`, selected sensor source, calibration anchors, filter parameters, quality flags, and uncertainty. The algorithm rejects non-finite/out-of-order samples and accuracy-inconsistent pressure/location spikes, smooths separately from the immutable raw series, and uses configurable hysteresis/minimum-climb thresholds so noise is not repeatedly counted.

Continuous barometric relative change is preferred. Slow drift is anchored only to sufficiently accurate absolute observations or a compatible bundled elevation profile; poor GPS altitude never forces the barometric track. Each anchor/correction is recorded. Paused movement/elevation is excluded, resume starts a segment boundary, and a pressure change during pause is not interpreted as climbed elevation.

GPS-only fallback uses vertical-accuracy gates and stronger smoothing. Insufficient data yields an estimated/low-confidence result rather than false precision. Trimming, spike correction, segment changes, or later elevation correction creates a new derived revision linked to the same immutable activity; it does not silently rewrite a previously exported result.

Initial elevation acceptance remains:

- deterministic synthetic gain within 1 meter with sub-threshold oscillation excluded;
- no more than 25 meters false ascent on a flat 10 km replay;
- controlled barometric physical climb within the greater of 15 meters or 10%;
- representative combined-sensor replay within the greater of 30 meters or 10%; and
- GPS-only fallback within the greater of 50 meters or 20%, clearly marked lower confidence.

Regression fixtures also cover pause/resume, weather/pressure drift, tunnel/tree cover, poor GPS, missing barometer, suspension, clock disorder, duplicate native batches, and crash recovery. These are engineering thresholds, not survey-accuracy claims. Changing the algorithm or thresholds requires fixture reprocessing, before/after error and energy evidence, a new algorithm version, and enough compatibility to explain previously saved results.

### 13.2 Recorded activity to reusable trail

1. Preserve the immutable activity and calculate its cleaned track, distance, duration, ascent/descent, elevation profile, endpoints, and route fingerprint.
2. Search reference and private trails/variants by overlap, endpoints, length, elevation, and direction-independent geometry.
3. For a strong match, let the user attach the activity, inspect other candidates, or choose `Create new hike anyway`.
4. With no accepted match, open `Create hike from activity` using suggested metadata and cleaned geometry.
5. Let the user trim private/error sections, remove spikes, split/join segments, choose loop/out-and-back/point-to-point, reverse preferred direction, and preview recalculated statistics.
6. Save a `UserTrail` with stable private UUID, approved geometry, metadata, trailhead/access notes, season, photos, favorite/privacy state, and user-recorded provenance.
7. Keep `UserTrail` and `RecordedActivity` as separate linked private records. Later activities attach through `TrailAssociation` without replacing either record or its history.

Sharing is always explicit and offers sensitive-endpoint/metadata removal. Exporting a trail to the correction/promotion workflow does not delete or declassify its private original. A later public/private catalog may link to a promoted canonical trail, but catalog removal/split leaves the private `UserTrail` intact and returns unresolved associations to review.

## 14. Battery and field endurance

Phase 0 and Phase 1 implement energy-conscious behavior but do not establish, test, or claim numeric battery-life or thermal acceptance. Physical energy characterization is deferred to WP-307 and WP-503, after representative maps, UI, and field workflows exist. Deferral does not permit continuous polling, sensors outside an active recording, or silent selection of High Accuracy.

Tracking modes are:

- **Balanced:** adaptive default using movement, accuracy, direction change, terrain, and stationarity;
- **Endurance:** reduced GPS/UI frequency while retaining low-frequency barometric quality; and
- **High Accuracy:** explicit temporary dense tracking, never the silent default.

No numeric battery-per-hour threshold is binding in Phase 0 or Phase 1. WP-307/WP-503 must define and approve representative protocols and thresholds before any endurance claim or production release.

Location sampling prefers movement-driven updates, suitable fitness activity type, distance filters, and stationarity over fixed high-frequency polling. Lightweight native filtering rejects low-value duplicates and delivers bounded batches. When conserving energy, the app reduces GPS density, UI/stat refresh, map rendering, animation, and nonessential motion work before dropping low-frequency barometric sampling. It starts sensors only for active recording and stops them immediately afterward.

SQLite WAL batches amortize writes without risking substantial loss. Spatial indexes and zoom-appropriate tiles prevent offscreen decode/draw work. Expensive matching, elevation correction, simplification, and share-card work occurs after recording in foreground where practical. The app does no runtime polling for catalog updates or closures; catalog staging occurs in a controlled foreground state away from active recording.

The app shows estimated endurance, selected mode, GPS quality, Low Power Mode, and provisioning validity; supports a one-tap lower-power switch; warns when battery or signing validity is insufficient for a planned duration; and creates a durable checkpoint before critical battery. Low Power Mode or poor GPS does not automatically stop a recording.

Phase 0 physical tracker validation covers recording correctness, screen-lock/background behavior, process recovery, stop behavior, and a 30-minute screen-off memory smoke. Battery percentage, thermal endurance, and multi-hour energy runs are not current acceptance criteria. WP-307/WP-503 restore representative long-duration energy and thermal validation before production.

## 15. Cross-platform QA boundary

Shared code depends on explicit ports:

- `TrackerAdapter` for lifecycle, recovery, batches, and state;
- `SensorAdapter` for relative altitude, motion summaries, battery, and permissions;
- `MapAdapter` for product map commands and events; and
- storage/catalog interfaces that can run against deterministic fixtures.

Windows/browser tests may accept shared logic, filters, storage transitions, catalog queries, calculations, offline states, and most semantic UI behavior. They do not accept iOS background location, screen-lock recovery, barometer behavior, native MapLibre performance, iOS permissions, VoiceOver, Dynamic Type layout, provisioning, thermal behavior, app-container retention, or battery draw. Those require physical-device testing; simulator checks are supplementary.

## 16. Public repository scope and governance

### 16.1 License and notices

- Original project code and project-authored documentation are released under **Apache License 2.0** unless a file states otherwise.
- Third-party datasets, fonts, icons, styles, media, and dependencies retain their own licenses and notices.
- The repository includes `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, and a machine-readable source/asset inventory.
- Contributions use an account-bound pull-request rights/license attestation rather than a public DCO sign-off. Public Git history and collaboration records use project handles and privacy-protected platform addresses, never required legal names or personal contact details. A CLA may be introduced only through a documented governance/privacy decision and may not retroactively revoke accepted rights.
- Project names and logos are not automatically granted as trademarks by the code license; any trademark policy must remain compatible with honest fork identification.

### 16.2 Required public files

The repository includes at minimum:

- `README.md` with honest current capabilities and quick start;
- this scope and architecture decision records;
- `LICENSE`, `NOTICE`, and third-party/data notices;
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, and `SECURITY.md`;
- public source/data rights policy and connector manifest schema;
- privacy threat model and private-extension guide;
- reproducible Windows development and iOS build instructions;
- sample configuration using synthetic data;
- release configuration and lockfiles; and
- public roadmap/issues that contain no private evidence.

### 16.3 Repository protections

`main` uses branch protection or rulesets with current-head status checks, resolved conversations, linear history, and force-push/deletion prevention. Normal changes use short-lived branches and pull requests. Required checks include:

- `windows-quality`;
- `security-rights-privacy`;
- `design-accessibility-traceability`; and
- pinned `macos-ios-build` jobs.

When the project has only one maintainer, required external approval may remain disabled, but checks apply to administrators and accepted changes remain auditable. As the maintainer group grows, governance adds review and release quorum requirements.

### 16.4 Community contribution boundary

Public issues and pull requests must use synthetic or redistributable reproductions. Maintainers remove or redact accidental personal locations, tokens, private-source samples, and copyrighted payloads rather than requesting that contributors post more evidence publicly. Security reports use the private process defined in `SECURITY.md`.

Contributors retain copyright and license accepted contributions under Apache-2.0. Generated code, fixture provenance, and AI-assisted contributions must satisfy the same authorship, license, review, and test requirements as hand-authored changes.

## 17. Public CI, releases, and supply chain

- CI permissions default to read-only and are elevated per job only when necessary.
- Third-party Actions are pinned to immutable commit SHAs and reviewed before updates.
- Dependencies and toolchains are version-pinned; lockfiles and native resolutions are committed.
- Pull-request workflows from forks receive no release secrets and cannot publish artifacts to trusted release channels.
- Public CI uses only public, synthetic, or approved redacted inputs.
- Hosted CI minutes are minimized through path filters, concurrency cancellation, strict timeouts, fail-fast jobs, narrow matrices, local-first validation, and reuse of safe immutable dependency caches. Scheduled builds are disabled unless a measured operational need is approved.
- Phase 0 CI-efficiency closeout uses a recorded 20-applicable-run window with zero avoidable failures. Excluded runs require reasons; a failed finite window is closed in the gate report before an owner-approved replacement window begins.
- Documentation-only changes do not run macOS/native/device jobs. Expensive macOS, full-catalog, physical-device, and release workflows run only for relevant protected-branch candidates, an explicit maintainer-approved gate, or a release—not for every draft commit.
- Production builds emit software and data bills of materials, source/rights manifests, checksums, signed artifacts/catalogs, and signed provenance. Development artifacts may remain unsigned only when visibly labelled and barred from production channels.
- Release artifacts are signed, checksum-published, and traceable to a protected commit and pinned build environment.
- Public release workflows hard-fail when a source lacks redistribution rights, required attribution, compatible retention, or complete classification metadata.
- Private builds use a visibly distinct application identifier/channel and cannot be uploaded by the public release workflow.
- Caches and artifacts use the shortest practical retention and never contain secret or private payloads.

Official public releases may include:

- source archives;
- redistributable app/test artifacts;
- synthetic demonstration catalogs; and
- regional catalogs only when every included source and field permits public redistribution.

They may not include user data, private extensions, personal-use-only datasets, unredacted logs, signing material, or owner-only packs.

## 18. Private backup and export

Private device backups use a versioned, documented container and authenticated encryption from a vetted platform/library implementation; custom cryptography is prohibited. A user-held passphrase or explicit recovery key is derived through a pinned memory-hard KDF. The sole recovery secret may not exist only inside the app container or device keychain and must be retainable independently by the user.

The unencrypted header contains only the format version and cryptographic routing fields required to derive/decrypt the key, such as algorithm/KDF identifiers and parameters, salt, and nonce. Identifying inventory, dates, counts, filenames, hashes, and app/schema metadata remain inside authenticated ciphertext.

Backups include the private SQLite data, immutable activity observations, user trails/places, overlays, interpreting settings, and selected local attachments. Reference catalogs are identified by version and regenerated/reinstalled rather than duplicated into every backup. A backup is private output regardless of whether it contains only apparently innocuous favorites or tracks.

Restore decrypts into staging and validates authentication, manifest counts, attachment hashes, available space, and schema compatibility; performs supported forward migrations transactionally; and swaps private data only after full success. Failure leaves existing data untouched. A newer unsupported format fails before mutation and never partially restores.

Application downgrade after a forward private-database migration is unsupported unless the older app explicitly declares read compatibility. Catalog rollback is independent and cannot downgrade the private schema. The supported production policy is current app/catalog/backup schema plus one previous compatible major version; older explicit backups require an intermediate supported migrator or fail read-only before mutation.

Backup tests cover same-version restore, supported migrations, wrong keys, tampering, truncation, corrupt attachments, insufficient space, and backup-before-uninstall. Exports offer sensitive start/end trimming and optional EXIF location/time removal.

ADR-041 bounds Phase 0 to effective protection-class inspection, implicit system-backup exclusion, backup-inventory inspection, and the uninstall warning. Phase 0/WP-008 does not implement or execute encrypted restore; container/KDF selection, backup-schema compatibility, and all-or-nothing restore begin in WP-107 and complete in WP-306/T-BAK-001.

An explicit promotion workflow may export a selected private trail or correction to a review area. The default package excludes unrelated activities, favorites, notes, photos, and identifiers. Nothing becomes public automatically: publication requires user intent, rights review, privacy review, deduplication, and an ordinary public pull-request/release process using a safe transformed artifact.

## 19. Windows and Apple provisioning

- Contributors develop and test shared code on Windows and use deterministic route replay for tracker QA.
- A pinned macOS runner or available Mac produces the unsigned or appropriately signed iOS artifact.
- Hobby users may install and refresh through an explicitly documented Windows-compatible sideloading path using their own Apple account.
- Bundle identifier, team/application identity, entitlements, and keychain groups remain stable across refreshes and upgrades for a given distribution channel.
- The app reads the actual embedded provisioning expiration and warns at 72 and 24 hours, including a pre-trip readiness check.
- Current [AltStore Classic documentation](https://faq.altstore.io/altstore-classic/your-altstore) confirms that apps installed with a regular/free Apple ID expire after seven days and describes a three-sideloaded-app limit. These are external constraints to revalidate, not constants silently assumed by code.
- The hobby configuration uses one app without unnecessary extensions and treats App-ID registration limits as a feasibility risk.
- Same-identity refresh and upgrade must preserve the application container and all recorded activities.
- Uninstall/reinstall is treated as destructive and requires a separately tested encrypted backup/restore path.
- Public build jobs never receive a contributor's Apple credentials or personal signing certificate.
- Paid-team-only services such as push notifications or CloudKit are not MVP dependencies.

Starting a planned recording whose expected duration plus a 24-hour margin exceeds remaining provisioning validity requires an explicit risk acknowledgement. The pre-trip flow offers a local backup check. Phase 0 physically tests unsigned build, Windows signing/install, background recording, expiration detection, refresh, same-identity upgrade, relaunch, catalog activation, and private-data retention.

### 19.1 Toolchain and release pinning

The machine-readable release configuration pins Node.js, package manager, React Native, Expo/prebuild, native dependencies, Swift language mode, iOS deployment target, Xcode, macOS CI image, CocoaPods/SPM resolution, build tools, bundle identity per channel, entitlements, keychain groups, signing method, regions, size ceilings, and catalog schema compatibility.

Every release records the exact iOS version and physical/simulator matrix tested. “Latest” versions are evaluated in an upgrade branch rather than inherited from a hosted-runner change. Lockfiles/native resolutions are committed, and CI fails when the selected runner/Xcode or generated native project drifts from declared configuration.

Toolchain changes rerun signing, refresh/upgrade retention, background tracking, private database migration, offline bundle, rights/privacy gates, energy-conscious implementation checks, and physical smoke tests before becoming the new pin. After WP-307/WP-503 establishes measured energy acceptance, toolchain changes also rerun the applicable energy characterization. Security/device-support needs may require an upgrade, but the decision and recalibrated budgets are recorded in release notes.

## 20. User experience and accessibility

### 20.1 Information architecture and field use

Primary navigation centers on `Explore`, `Search`, `Track`, and `Saved`, with settings available without competing with field tasks. Starting or resuming a hike remains one obvious action. Map-linked detail sheets retain geographic context and expose provenance, access confidence, restrictions, closures, bundle origin, offline status, and data freshness without implying certainty. Filters and saved views behave consistently across land, campsites, trails, and POIs.

Active recording state, pause/resume, elapsed time, distance, ascent, battery impact, GPS quality, and checkpoint status are glanceable and reachable one-handed. Controls account for gloves, rain, sunlight, fatigue, and intermittent attention. Destructive recording actions require deliberate confirmation and offer recovery where feasible.

Explicit states cover empty/loading, stale source, degraded GPS, no network, denied permission, expired provisioning, catalog activation/rollback, partial import, insufficient space, source conflict, private-extension unavailable, and rights-excluded content. Safety-critical behavior never depends on network-only imagery or details.

### 20.2 Accessibility baseline

MVP accessibility includes readable contrast, Dynamic Type, VoiceOver names/order/actions, sufficient touch targets, one-handed recording controls, color-independent safety states, reduced-motion compliance, deliberate destructive confirmations, and explicit GPS, battery, provisioning, offline, checkpoint, and error status.

### 20.3 Visual and map system

Production design adds original branding; reusable color, type, spacing, corner, elevation, icon, motion, and haptic tokens; coherent icons; light/dark/high-contrast map styles; and outdoor readability. Critical states differ by shape/text as well as color. The project does not copy source-service trade dress, icons, colors, or layouts.

Map hierarchy distinguishes basemap, land polygons/status, trails, POIs, closures, hazards, and active recording. Dense POIs cluster and progressively reveal detail. The user location and route remain visible on each style. A compact interactive legend explains land/camping status. Canonically matched records render as one place with source/confidence detail instead of stacked duplicate pins.

Motion and haptics communicate recording lifecycle, favorites, catalog/import completion, filters, and errors without delaying map use or increasing background energy. Reduced-motion settings are honored, and no animation is required to understand state.

### 20.4 Production design quality gate

User flows and low-fidelity wireframes precede final styling. A reusable component catalog documents variants/states. Final layouts are tested on the physical iPhone 14, small/large simulated viewports, increased text sizes, supported appearances, and browser semantic tests.

Production acceptance requires consistent components, complete error/empty/offline/private-origin states, no placeholder copy/imagery, no unresolved critical accessibility defect, acceptable map/scroll/launch/memory performance, and passing physical-device VoiceOver, Dynamic Type, contrast, touch-target, bold-text, reduced-motion, dark-mode, outdoor-readability, energy, and endurance gates.

Accessibility targets and severity/test rules are defined in [ACCESSIBILITY_STANDARD.md](docs/ACCESSIBILITY_STANDARD.md): WCAG 2.2 Level AA where applicable plus native iOS accessibility acceptance.

## 21. Phased delivery

The release terms prototype, recorder alpha, data alpha, product MVP, extensible beta, and production candidate are defined in [PRODUCT_RELEASE_DEFINITION.md](docs/PRODUCT_RELEASE_DEFINITION.md). Product MVP means the Phase 3/M4 release in which trails, camping evidence, and GPS tracking work together offline; no earlier milestone may use that label.

Package accountability, required roles, capacity, hardware profiles, and cost categories are controlled by the [resource and RACI plan](docs/RESOURCE_AND_RACI_PLAN.md). Work cannot enter progress without one accountable public project handle or role alias and the required environment/cost source; legal names and personal contact details are not required in public planning records.

### Phase 0 — open foundation and feasibility gate

- Create the public GitHub repository with Apache-2.0 licensing, notices, governance, security reporting, contribution policy, branch protections, and pinned release configuration.
- Implement the public/private data-classification schema, external-private-root validation, private extension manifest contract, and leak-prevention checks.
- Accept the iOS data-protection/system-backup ADR, catalog signing/trust ADR, app/catalog/backup compatibility policy, platform/MVP boundary, and binding non-functional release budgets.
- Prove a clean public clone builds and tests on Windows with synthetic fixtures and no private inputs.
- Prove a private Windows root can add a synthetic “private” connector and pack without writing any private artifact into the public checkout.
- Prove the private downstream-repository workflow can incorporate a public upstream update without exposing private content.
- Produce and install an iOS feasibility build; prove background location/altimeter collection, refresh/upgrade data retention, exact provisioning expiration, catalog remap/promotion behavior, and rollback on the physical reference device.
- Install version A and seed a private activity, `UserTrail`, reference association, and overlay. Build version B with the same channel identity, a changed catalog, canonical-ID remap, and promotion link; refresh/re-sign/upgrade; then verify private records survive, links update transactionally or enter review, composed queries suppress promoted duplicates without deleting originals, and catalog activation never cross-writes the private database.
- Validate the compressed-artifact ceiling through the selected Windows sign/install/refresh path and record install, copy, activation, rollback, and first-launch times.
- Build the minimal native tracker with active-recording-only sensors, explicit High Accuracy, lower-frequency Balanced/Endurance behavior, and no continuous polling; defer measured energy acceptance to WP-307/WP-503.

**Exit gate:** Phase 1 does not begin until public reproducibility, both private composition paths, repository leak controls, signing/refresh retention, physical background tracking, iOS protection/backup inspection, catalog trust, compatibility/downgrade behavior, and every Phase 1 prerequisite budget are demonstrated and committed.

### Phase 1 — recorder and private data vertical slice

- Application shell, private SQLite activity/`UserTrail` schema, crash recovery, native event batching, energy-conscious adaptive modes without battery-life claims, versioned distance/elevation calculations, pause/resume/finish, local library, association/overlay model, and activity-to-user-trail flow.
- Secure import/export, sensitive endpoint trimming, encrypted backup/restore skeleton, and a fixture-backed offline map.
- Synthetic, recorded-replay, and physical elevation fixtures; a 30-minute screen-off memory smoke; and the MVP safety/accessibility states on the physical device.
- Tests proving private activity data never enters reference catalogs, public logs, or test artifacts.

### Phase 2 — connector framework and first authoritative public data

- Common connector contract, independent lifecycle/authorization/acquisition/source-class fields, rights manifests, raw-data boundary, untrusted-input controls, normalized envelopes, quarantine, and one laptop-local worker without premature service decomposition. Initial connectors follow documented directories but are created manually until Phase 4 validates scaffolding.
- Initial New York boundary, ownership, DEC land/trail/POI, official rule, Forest Service, MVUM, and alert/order connectors as rights and freshness reviews permit.
- Canonical land/place/trail/condition/restriction/observation/review/check-in/media models, deterministic camping status, private-inholding exclusion, field-level provenance, reversible entity resolution, spatial-temporal fixtures, and separate geometry/rule/access/POI coverage reports.
- Add RIDB, OpenStreetMap, NPS, 3DEP, and other authoritative sources incrementally only after the first end-to-end land/rule/POI path succeeds.
- Public CI uses redistributable or synthetic fixture subsets; full raw data remains external when repository storage is not permitted.

### Phase 3 — offline field use

- Enforce the offline matrix, self-generated basemap, rights-aware manifest, build-time region/detail selection, size/free-space preflight, atomic activation/rollback, canonical remaps/promotion links, composed reference/private queries, orphan rematching without deletion, offline search/detail, favorites/personal places, stale-closure warnings, and complete encrypted backup/restore.
- Public and private pack classifications enforced end to end.
- Interrupt/resume catalog staging and field-test storage, battery, accessibility, degraded GPS, and provisioning failure paths.

### Phase 4 — connector scale-out and private ecosystem

- Reusable acquisition adapters, `source create` scaffolding, health metrics, schema-drift detection, and operational reports.
- User-controlled AllTrails, official iOverlander export, and generic GPX/KML/GeoJSON/CSV/FIT importers, each limited to formats the user lawfully obtains.
- Disabled permission-gated shells, taxonomy mappings, deep links, and private-extension examples for commercial/community catalogs; no scraper is implied.
- Additional states and authorized open-data sources.
- Documented upstream-sync and compatibility testing for private downstream repositories.

### Phase 5 — production design, community maturity, and release hardening

- Original brand, high-fidelity flows, full component catalog, final map styles, motion/haptics, exhaustive accessibility states, and performance/energy gates.
- Mature maintainer/reviewer governance, release signing, provenance, dependency response, and long-term support policy.
- Independent clean-room reproduction of the public build and a privacy-boundary audit before a production release.

## 22. Explicit exclusions

- Storing or processing personal, secret, restricted, or permission-limited data in the public GitHub repository or its public workflows.
- Claiming that a native GitHub fork of a public repository is private.
- A hosted runtime backend, account service, public catalog API, or cloud sync requirement.
- Android delivery, a consumer web product, turn-by-turn navigation, rerouting, or off-route guidance.
- Automated acquisition that a source prohibits or has not authorized.
- Bypassing authentication, CAPTCHA, robots controls, rate limits, paywalls, or private APIs.
- Republishing third-party reviews, descriptions, photos, exports, or map assets without applicable rights.
- Automatically promoting a private user record or correction into the public project.
- App Store distribution as an MVP requirement.
- Presenting a map layer as a legal survey or guaranteeing campsite legality, access, road condition, safety, weather, fire status, or current closure status.
- Treating browser or simulator QA as proof of native background, accessibility, provisioning, thermal, or energy behavior.
- Making safety-critical access or camping decisions from ownership geometry alone.
- Treating open-source licensing of code as a license to redistribute third-party data, media, styles, fonts, or branding.
- Keeping the only recovery secret inside the app container or replacing an explicit backup/restore with uninstall/reinstall assumptions.

## 23. Project-level acceptance criteria

The open-source scope is accepted when all of the following are true:

1. A new contributor can clone the public repository on Windows, follow documented steps, and run the shared application/tests without private access or undeclared data.
2. The repository has an OSI-compatible code license, contribution/governance/security files, complete third-party notices, and machine-readable source rights.
3. Public CI and releases use only public, redistributable, synthetic, or approved redacted inputs and fail closed on missing classification.
4. An external Windows private root can contribute a private connector and data pack while the public checkout remains byte-for-byte free of private generated content.
5. A private downstream repository can consume a pinned public upstream revision and pass the same contracts without sending private content to public systems.
6. Removing all private extensions leaves a passing, useful public build.
7. Public and private catalogs remain read-only at runtime and separate from the private writable user database.
8. Catalog update, rollback, ID remap, and promotion-link tests never delete or overwrite private activities, trails, notes, photos, or corrections.
9. Source manifests enforce acquisition, retention, redistribution, derived-data, offline, and attribution rights for both public and private bundles.
10. The New York reference build reports separate geometry, rule, access, POI, freshness, and effective-status coverage.
11. The iPhone reference build passes physical-device background recording, recovery, accessibility, provisioning-refresh retention, storage, and measured energy gates.
12. Offline recording, search, details, personal actions, export generation, catalog interruption/rollback, and stale-data presentation meet the declared capability contract.
13. Entity resolution is reversible, preserves field/source rights, and passes place, trail, condition/restriction, review, check-in, media, and catalog-remap fixtures.
14. Elevation passes the defined synthetic/replay/physical thresholds with versioned algorithm and uncertainty metadata.
15. Private backup/restore passes authentication, migration, corruption, wrong-key, insufficient-space, and pre-uninstall recovery fixtures without partial mutation.
16. A privacy-response exercise demonstrates secret revocation, artifact containment, sensitive-history handling, and safe public communication without reproducing private content.
17. iOS file-protection classes, lock-state behavior, system-backup exclusions, explicit recovery, and deletion semantics pass physical inspection.
18. Private CI is ephemeral and isolated; untrusted pull-request code cannot access private data/secrets, privileged workflows, or reusable private caches/artifacts.
19. Production catalogs reject missing/invalid/revoked/wrong-channel/replayed signatures and retain a last known-good compatible catalog.
20. Current and one previous compatible major app/catalog/backup schema pass; unsafe application downgrade and unsupported restore fail before mutation.
21. Every geospatial boundary passes the canonical CRS/axis/time/unit/ID/null/geometry/provenance contract.
22. Diagnostics remain local, bounded, redacted, previewed, explicit, and unable to enter public artifacts with prohibited fields.
23. The exact non-functional budgets and case-level tests pass on their declared environments, including the combined 3 GiB catalog ceiling and 9 GiB maximum-profile preflight.
24. Product MVP is claimed only after the M4 offline trails/camping/GPS matrix and its accessibility/privacy/rights/energy gates pass.
25. Public contributions and evidence contain no unnecessary personal identifying details; contribution authorization uses the account-bound attestation and privacy-protected commit identity.
26. Hosted CI demonstrates path filtering, cancellation, timeouts, minimal matrices, local-first execution, and candidate-only expensive jobs, with usage reviewed at each milestone.

## 24. Deliverables

- Public GitHub repository and protected `main` branch.
- Open-source license, notices, governance, contribution, security, privacy, and data-rights documentation.
- Product/release definition, canonical data specification, threat model, diagnostics plan, accessibility standard, iOS protection/backup policy, objective budgets, and resource/RACI plan.
- Windows-first developer environment and reproducible pinned build configuration.
- Mobile application, native tracker, browser adapters, and deterministic fixtures.
- Public connector SDK, manifests, validators, scaffolding, and initial authorized connectors.
- Rights-aware public and private regional pack builder.
- External-private-workspace guide and private downstream-repository guide.
- Private backup/restore and explicit export/promotion workflows.
- Public/private software and data bills of materials, coverage reports, checksums, and release provenance.
- Physical-device field, accessibility, energy, refresh, rollback, and retention evidence.

## 25. Consolidation decisions

The merge makes five intentional decisions relative to the supplied baseline:

1. The public repository is licensed open source rather than publicly visible proprietary source.
2. Public reproducibility and community governance become project-level requirements.
3. Private data is supported through an external Windows workspace or a separate private downstream repository, not a public GitHub fork.
4. Rights-aware build gates distinguish public redistribution from owner-only or organization-only private use.
5. Privacy leak prevention, incident response, private-extension compatibility, and clean public builds become Phase 0 and release acceptance gates.

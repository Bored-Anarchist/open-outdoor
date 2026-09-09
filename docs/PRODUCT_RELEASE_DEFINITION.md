# Product and Release Definition

**Status:** Accepted planning baseline  
**Initial product platform:** iOS only

## 1. Product statement

Open Outdoor helps a user find trails and camping information offline and record a private GPS hike. The initial product combines three core capabilities: trail discovery, camping/public-land evidence, and background GPS recording.

## 2. Initial platform boundary

- The shipping reference application is iOS-only.
- The initial physical acceptance device is an iPhone 14 running the release-pinned iOS version.
- Windows is the primary shared development, ingestion, catalog-build, and browser-QA environment.
- The browser application is a deterministic QA harness, not a supported consumer web product.
- Android tooling may be installed only if a selected dependency requires it for development; Android application delivery and Android-specific acceptance are out of scope until a scope change adds requirements, work packages, devices, and release support.

## 3. Navigation boundary

The initial product displays the user's location, a selected trail, and the active recorded route. It does not provide turn-by-turn navigation, off-route alerts, rerouting, live guidance, or safety-critical navigation instructions.

Background location/sensor access is permitted only for an active recording. References to a future “navigation feature” do not authorize sensor use until that feature receives an approved scope change and permission/energy/test plan.

## 4. Release levels

| Level | Milestone | Product meaning | Required capabilities |
| --- | --- | --- | --- |
| Technical prototype | Phase 0 / M1 | Feasibility evidence, not an MVP | Public/private boundary, Windows build, iOS install/refresh, native tracking/storage spikes |
| Recorder alpha | Phase 1 / M2 | Internal GPS recorder | Offline recording/recovery, private activity library, elevation, user trail, import/export baseline, fixture map |
| Data alpha | Phase 2 / M3 | Internal New York catalog pipeline | Rights-aware connectors, canonical model, camping evaluator, land/trail/POI catalog prototype |
| **Product MVP** | **Phase 3 / M4** | First complete core product | Offline New York map/search, trails, camping status/evidence, GPS recording, favorites/personal records, catalog activation, encrypted backup |
| Extensible beta | Phase 4 / M5 | Stable source/private-extension contracts | Scaffolding, lawful imports, private compatibility, connector operations |
| Production candidate | Phase 5 / M6 | Public production-quality candidate | Original design, complete accessibility, measured performance/energy, signed reproducible release, audit |

No earlier milestone may be described publicly as the product MVP.

## 5. MVP must-have features

- Installable iOS app through the tested local/public channel.
- Offline New York basemap and declared coverage.
- Offline local search/filter for trails, camping places, public land, and supported POIs.
- Explainable camping status with source, verification/freshness, restrictions, and uncertainty.
- Trail detail and selected-route display.
- Start, pause, resume, recover, finish, and save a background GPS recording.
- Distance, moving time, pace, ascent/descent, elevation profile, and quality/uncertainty.
- Match an activity to a trail or create a private reusable `UserTrail`.
- Favorites, notes, personal places, and private corrections.
- GPX/GeoJSON import/export baseline with endpoint/metadata privacy controls.
- Separate public/private/user stores, atomic catalog activation/rollback, and encrypted explicit backup/restore.
- MVP accessibility, storage, privacy, rights, and required physical-device acceptance. Multi-hour energy/thermal endurance is conditionally approved for M4, cannot support an endurance claim, and becomes blocking at WP-503/Phase 5.

## 6. MVP non-goals

- Android application.
- Consumer web application.
- Turn-by-turn navigation, rerouting, or off-route alerts.
- Hosted accounts, cloud synchronization, live public catalog API, or push notifications.
- App Store submission.
- National coverage or complete verification of every New York land unit.
- Automated acquisition from permission-gated commercial/community services.
- Weather/snow forecasting as a user-facing feature.
- Social feeds, public profiles, leaderboards, or automatic trail publication.

## 7. MVP success criteria

- A clean public build and an optional private extension both pass their declared boundaries.
- A user can complete the three core journeys offline: find a trail, assess camping evidence, and record/recover/export a hike.
- No positive camping status survives missing/stale mandatory evidence.
- Physical-device energy, accessibility, background, refresh, storage, and backup gates pass.
- The release clearly states coverage gaps, source freshness, legal/safety limitations, and private-data behavior.

## 8. Scope-change rule

Adding Android, navigation, hosted services, live data, public social sharing, new sensor collection, or App Store distribution requires a scope change plus requirements, work packages, threats, permissions, budgets, and acceptance tests before implementation.

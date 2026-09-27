# Private state agency + iOverlander pipeline

**Status:** private validation is active for the 107 pinned Unconfirmed agency roles. This pipeline writes source data and combined state overlays only under the Git-ignored `PrivateData/` root. The publisher-rights matrix remains Unconfirmed for these roles; public packages and downstream redistribution require a separate grant and release review.

As of September 27, 2026, the local private ledger records 101 of 107 Unconfirmed roles represented by selected, staged data: 71 original exact roles, 16 selected service roots, six roles sharing staged service URLs, and [eight resolved alternate sources](AGENCY_PENDING_SOURCE_RESOLUTION_2026-09-27.md). Four forestry links (KS, LA, NE, NC) point to planning or land-cover material rather than exact visitor data; two Maryland DNR visitor layers remain unavailable, and trial substitutes were rejected after inspecting their attributes. Of five Permission required roles, three NJDEP roles are staged for local validation under the [NJDEP GIS FAQ](https://dep.nj.gov/gis/faq/); two Michigan DNR roles remain uncollected because the [DNR terms](https://www.michigan.gov/dnr/about/DNR-Website-and-application-policies) require prior written permission to copy the currently linked content. One selected Florida park boundary child returned HTTP 500, while four other children from that service staged successfully. Combined overlays exist for 43 states, with 517,231 agency features and 51,092 iOverlander places. CA, CT, MA, MI, MN, and NE have no combined overlay within this workflow. ZIP archives from Georgia and Texas remain raw until shapefile parsing and role-specific manager filters are reviewed.

## Inputs and output

- The [provisional source list](../config/agency-provisional-private-validation-2026-09-27.json) pins the exact 107 agency role IDs. The [connector](../tools/state-agency-feeds.mjs) uses source-specific local approvals and stores raw features with checksum receipts at `PrivateData/agency-feeds/US/<code>/<source-id>/`. The source URL, rights status, private-only setting, and retrieved time are recorded in each receipt.
- `PrivateData/sources/ioverlander/US/<state>/tiles_<version>/` supplies the existing per-state iOverlander archive. The builder checks base-tile MD5s against its source manifest, removes contributor IDs, deduplicates place GUIDs, and filters points against the [U.S. Census Bureau's 2026 state boundary service](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0). Census boundaries are cached in `PrivateData/reference/`.
- `node tools/build-private-state-agency-ioverlander.mjs <code>` combines verified staged agency GeoJSON and iOverlander places at `PrivateData/catalogs/US/<state>/current/agency-ioverlander.private.geojson`, alongside a checksum manifest. `--all` builds every state with staged agency GeoJSON and writes a private build report. Duplicate agency URLs assigned to multiple roles are loaded once. ZIP/KML downloads remain raw until format-specific parsers and source filters are reviewed.
- Agency features in the combined overlay carry `reviewStatus: provisional`, `rightsStatus: Unconfirmed`, and a private-use caution. They are not certified visitor POIs or current access guidance. The combined overlay is a private validation input, not a public package or an automatic mobile bundle.
- The [reviewed child-layer selections](../config/agency-provisional-child-selections-2026-09-27.json) identify visitor-related layers within service roots. `stage-provisional-agency-children.mjs` creates exact local approvals and stages those layers. A service root alone is never treated as a data layer.
- The [alternate-source selections](../config/agency-pending-source-resolutions-2026-09-27.json) and [Permission required role decisions](../config/agency-permission-required-private-validation-2026-09-27.json) drive `stage-private-agency-resolutions.mjs`. NJDEP records retain `rightsStatus: Permission required` and `publicDistribution: false`; the Michigan roles have no acquisition approval.

## Repeatable commands

```text
node tools/state-agency-feeds.mjs init-provisional
node tools/stage-provisional-agency-feeds.mjs --max-features 10000
node tools/stage-provisional-agency-feeds.mjs --max-features 200000
node tools/stage-provisional-agency-children.mjs --max-features 200000
node tools/stage-private-agency-resolutions.mjs --max-features 200000
node tools/build-private-state-agency-ioverlander.mjs --all
node tools/report-provisional-agency-status.mjs
```

The batch staging command skips sources with receipts already present, records failures in `PrivateData/agency-feeds/batch-report.json`, and enforces the source-advertised ArcGIS page size up to 1,000 features. Service roots need exact child-layer selection; download or information pages need direct files or adapters. The commands do not add agency or iOverlander records to Git.

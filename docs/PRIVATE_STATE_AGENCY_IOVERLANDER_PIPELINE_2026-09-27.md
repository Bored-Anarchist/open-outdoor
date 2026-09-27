# Private state agency + iOverlander pipeline

**Status:** private validation is active for the 107 pinned Unconfirmed agency roles. This pipeline writes source data and combined state overlays only under the Git-ignored `PrivateData/` root. The publisher-rights matrix remains Unconfirmed for these roles; public packages and downstream redistribution require a separate grant and release review.

As of September 27, 2026, the local private ledger records 93 of 107 roles represented by staged source data: 71 exact roles, 16 selected service roots, and six other roles sharing staged service URLs. The other 14 need exact download endpoints (10), a suitable child layer (one Idaho forestry role), or source recovery (three Maryland roles). One selected Florida park boundary child returned HTTP 500, while four other children from that service staged successfully. Combined overlays exist for 41 states, containing 420,817 agency features and 50,613 iOverlander places. The eight states without a combined overlay are CA, CT, MD, MA, MI, MN, NE, and NJ; this reflects the present Unconfirmed-source staging scope, not a finding that those states lack agency data.

## Inputs and output

- The [provisional source list](../config/agency-provisional-private-validation-2026-09-27.json) pins the exact 107 agency role IDs. The [connector](../tools/state-agency-feeds.mjs) uses source-specific local approvals and stores raw features with checksum receipts at `PrivateData/agency-feeds/US/<code>/<source-id>/`. The source URL, rights status, private-only setting, and retrieved time are recorded in each receipt.
- `PrivateData/sources/ioverlander/US/<state>/tiles_<version>/` supplies the existing per-state iOverlander archive. The builder checks base-tile MD5s against its source manifest, removes contributor IDs, deduplicates place GUIDs, and filters points against the [U.S. Census Bureau's 2026 state boundary service](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0). Census boundaries are cached in `PrivateData/reference/`.
- `node tools/build-private-state-agency-ioverlander.mjs <code>` combines verified staged agency GeoJSON and iOverlander places at `PrivateData/catalogs/US/<state>/current/agency-ioverlander.private.geojson`, alongside a checksum manifest. `--all` builds every state with staged agency GeoJSON and writes a private build report. Duplicate agency URLs assigned to multiple roles are loaded once. ZIP/KML downloads remain raw until format-specific parsers and source filters are reviewed.
- Agency features in the combined overlay carry `reviewStatus: provisional`, `rightsStatus: Unconfirmed`, and a private-use caution. They are not certified visitor POIs or current access guidance. The combined overlay is a private validation input, not a public package or an automatic mobile bundle.
- The [reviewed child-layer selections](../config/agency-provisional-child-selections-2026-09-27.json) identify visitor-related layers within service roots. `stage-provisional-agency-children.mjs` creates exact local approvals and stages those layers. A service root alone is never treated as a data layer.

## Repeatable commands

```text
node tools/state-agency-feeds.mjs init-provisional
node tools/stage-provisional-agency-feeds.mjs --max-features 10000
node tools/stage-provisional-agency-feeds.mjs --max-features 200000
node tools/stage-provisional-agency-children.mjs --max-features 200000
node tools/build-private-state-agency-ioverlander.mjs --all
node tools/report-provisional-agency-status.mjs
```

The batch staging command skips sources with receipts already present, records failures in `PrivateData/agency-feeds/batch-report.json`, and enforces the source-advertised ArcGIS page size up to 1,000 features. Service roots need exact child-layer selection; download or information pages need direct files or adapters. The commands do not add agency or iOverlander records to Git.

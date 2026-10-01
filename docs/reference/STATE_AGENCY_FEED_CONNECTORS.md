# Gated state agency feed connectors

**Public packaging update (2026-09-28):** All **50 states**, including New York, now use the private system's GeoJSON/checksum-manifest structure with public search indexes and **169 app-parser-validated import parts**. The packages contain **757,622 features**, **77,013 POIs**, and **138,872 eligible direct agency features** in 12 states. See the [current inventory](../archive/reports/PUBLIC_STATE_PACKAGE_INVENTORY_2026-09-27.md) and [format/rebuild guide](../guides/PUBLIC_STATE_PACKAGE_FORMAT.md). The older acquisition-stage notes below are superseded where they say no agency data are public, categories are unmapped, or parts have not been validated. Permission-held data stay private; dated references do not establish current access.

**Remaining-gap review (2026-09-28):** Michigan's 9,460 hiking records are publicly licensed and packaged. Recovered MD/FL/LA/NC feeds, Mississippi's three state forests and all eight OPRHP feeds are now acquired privately; selected OPRHP visitor records are integrated into New York's private map. Scope exclusions and remaining source-license/current-coverage dependencies are recorded in the [resolution report](../archive/reports/STATE_AGENCY_GAP_RESOLUTION_2026-09-28.md). OSM POI/trail extracts remain deferred by request. Earlier acquisition-failure and not-acquired statements below are historical.

**Status:** The private connector and agency+iOverlander overlays remain under ignored PrivateData. The separate public acquisition/packaging pipeline contributes 138,872 eligible agency records from 18 exact acquisitions in 12 states; see the public format guide. Private permission gates and public derivative receipts remain separate.

The [14-role source-resolution audit](../archive/reports/AGENCY_PENDING_SOURCE_RESOLUTION_2026-09-27.md) has eight privately staged alternate sources and six roles without an acquired exact visitor layer. All five Permission required roles are tracked privately. Three NJDEP roles are locally staged because NJDEP permits data download and use while requiring permission for redistribution. The project owner approved private Michigan staging, but confirmed no DNR written copying grant; the two Michigan roles remain held under the DNR terms. This narrow NJDEP private path requires an exact local approval and leaves `publisherGrant: false`.

`node tools/acquisition/state-agency-feeds.mjs list` builds a fail-closed catalog from the 50-state registry, the current agency rights matrix, and the selected Arkansas/Idaho/South Dakota plan. It covers **231 source-role definitions**: 212 registry entries (98 primary agency, 44 non-OSM supplements, 70 OSM fallbacks) and 19 selected three-state plan entries. Repeated URLs remain separate where different agencies or management filters need separate review. The catalog now includes 99 exact ArcGIS layer roles, 26 ArcGIS service-root roles requiring child-layer selection, and four direct-download roles. The remaining URLs are OSM extracts, download/catalog pages, or information leads; no parser or public package is implied by a URL entry. See the [93-role rights recheck](../archive/reports/STATE_AGENCY_RIGHTS_AND_LEADS_RECHECK_2026-09-26.md) and [last-17 download-point audit](../archive/reports/STATE_AGENCY_LAST_17_DOWNLOAD_POINTS_2026-09-26.md).

## Acquisition gate

The [visitor source scope policy](../../config/state-visitor-source-scope.json) rejects forestry inventory, land-cover and planning layers before acquisition and during packaging. The [NC/LA follow-up](../archive/reports/NC_LA_VISITOR_COVERAGE_2026-09-28.md) records the exact SPO public-use clearance, current private NC forest selection, Indian Creek page-evidence enrichment and Oklahoma inventory removal. Agency visitor references are checksum-bound private snapshots, with changed source facts or ambiguous place matches stopping the build.

Every feature or raw-file fetch requires a source-specific approval in ignored `PrivateData/agency-feeds/approvals.json`. A missing approval, mismatched source ID/URL, expired review, absent evidence URL, or request for public distribution fails before the feature query. Restricted, permission-required, and lead-only entries require an explicit publisher grant. Unconfirmed entries require either a publisher grant or the project's [pinned provisional private-validation approval](../../config/agency-provisional-private-validation-2026-09-27.json), plus a matching local approval record. The provisional path authorizes private collection and evaluation only; `publisherGrant` stays `false` and the rights matrix stays Unconfirmed. It does not authorize public Git, offline packages, or downstream redistribution. A supported or conditional rights label alone does not certify freshness, manager attribution, completeness, access, or camping rules.

The approval object is keyed by the `id` printed by `list` or `children` and has this form:

```json
{
  "registry-xx-parks-0123456789": {
    "sourceId": "registry-xx-parks-0123456789",
    "sourceUrl": "https://agency.example/arcgis/rest/services/Example/FeatureServer/0",
    "collect": true,
    "privateStorage": true,
    "publicDistribution": false,
    "publisherGrant": true,
    "evidenceUrl": "https://agency.example/terms-for-this-layer",
    "reviewedAt": "2026-09-26T00:00:00.000Z",
    "expiresAt": "2027-09-26T00:00:00.000Z"
  }
}
```

The example ID and URL are placeholders. `publisherGrant` is required for a source whose current rights status lacks a usable grant unless it is one of the 107 pinned Unconfirmed roles being validated privately, or one of the three NJDEP roles approved for private evaluation only. Set `publisherGrant` to `true` only when publisher evidence actually covers collection and private storage. Run `node tools/acquisition/state-agency-feeds.mjs init-provisional` to add time-limited local approvals for the 71 exact ArcGIS layers and two direct files among those 107 roles. It preserves any existing approvals and records `provisionalPrivateValidation: true`, `publisherGrant: false`, and the source URL as evidence of the item reviewed, not of a publisher grant. The [alternate resolution tool](../../tools/acquisition/stage-private-agency-resolutions.mjs) stages selected exact replacements and permitted NJDEP roles. The approval file and staged raw data stay under ignored `PrivateData/agency-feeds/`.

## Commands and outputs

- `node tools/acquisition/state-agency-feeds.mjs list` prints counts by rights status and source type. `list <state-code>` prints source IDs and definitions for one state. Neither command accesses source servers.
- `node tools/acquisition/state-agency-feeds.mjs init-provisional` writes or extends the ignored local approval file for the 73 exact provisionally approved roles; it does not fetch feature records.
- `node tools/acquisition/state-agency-feeds.mjs children <service-id>` reads only ArcGIS service metadata and lists its child layer IDs. Select a specific child before approving or staging it.
- `node tools/acquisition/state-agency-feeds.mjs stage <layer-or-download-id>` fetches an approved exact layer or direct file into `PrivateData/agency-feeds/US/<state>/<source-id>/` with a checksum receipt. For a service root, use `stage <service-id> <child-layer-id>` after reviewing the child and creating an approval for its printed child ID.
- `node tools/acquisition/stage-provisional-agency-feeds.mjs --max-features 200000` resumes exact provisionally approved layers and direct files. `node tools/acquisition/stage-provisional-agency-children.mjs --max-features 200000` stages the [reviewed service child layers](../../config/agency-provisional-child-selections-2026-09-27.json). Both write only under ignored `PrivateData/`.

The ArcGIS adapter enumerates object IDs and fetches GeoJSON pages up to the source-advertised limit, capped at 1,000 features, then rejects incomplete page/count responses. On Windows it uses the native curl HTTPS trust store for agency servers whose certificate chains are not accepted by the bundled Node runtime. It preserves raw source fields and geometry for the joint POI mapping pass. Direct ZIP/KML/other files are staged as raw bytes only. The [private shapefile converter](../../tools/acquisition/convert-private-agency-shapefiles.py) parses the checked Georgia and Texas ZIPs into filtered, projected private GeoJSON; other formats still need source-specific parsers. Catalog pages, non-direct downloads, and OSM PBFs require source-specific adapters and remain disabled. None of these commands writes a public package.

## Remaining release work

1. Validate the 107 pinned Unconfirmed roles privately under the provisional approval while obtaining source-specific public derivative-distribution language. Obtain written permission for the two Michigan and three NJDEP roles classified Permission required in the [111-role deep dive](../archive/reports/STATE_AGENCY_111_RIGHTS_LANGUAGE_DEEP_DIVE_2026-09-27.md). Resolve appropriate data endpoints for the six remaining lead-only registry entries in the [rights matrix](../archive/reports/STATE_AGENCY_REDISTRIBUTION_RIGHTS_2026-09-26.md). The [earlier recheck](../archive/reports/STATE_AGENCY_RIGHTS_AND_LEADS_RECHECK_2026-09-26.md) explains why the original 93 stayed unconfirmed; the [last-17 audit](../archive/reports/STATE_AGENCY_LAST_17_DOWNLOAD_POINTS_2026-09-26.md) resolves eleven more exact layers and records why six cannot yet be assigned. The three-state additions have separate [rights](../archive/reports/ID_AR_SD_REDISTRIBUTION_RIGHTS_2026-09-26.md) and [freshness](../archive/reports/ARKANSAS_FACILITY_FRESHNESS_AUDIT_2026-09-26.md) gates.
2. Validate geometry, coverage, manager filters, dates, duplicates, and terms for every selected layer. Keep provisional raw data in ignored private storage; retain the source-specific receipt and time-limited review record.
3. Map the staged agency points together with NPS, USFS, BLM, DEC, and OSM points into canonical places and the app's category filters. Keep land, trail, condition, and restriction records distinct. The [complete dataset tracker](ALL_DATASETS_TRACKER.md) records the current POI mismatch.
4. Build public state packages only from sources that independently pass public offline redistribution and product validation. Update attribution and manifests at that point.

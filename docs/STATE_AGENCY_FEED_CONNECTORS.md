# Gated state agency feed connectors

**Status:** source definitions and private staging code are available. No state agency feature records were added to Git, the 49 public state packages, or the New York package. POI category mapping is intentionally pending until the selected feeds are acquired and validated together.

`node tools/state-agency-feeds.mjs list` builds a fail-closed catalog from the 50-state registry, the current agency rights matrix, and the selected Arkansas/Idaho/South Dakota plan. It covers **231 source-role definitions**: 212 registry entries (98 primary agency, 44 non-OSM supplements, 70 OSM fallbacks) and 19 selected three-state plan entries. Repeated URLs remain separate where different agencies or management filters need separate review. The catalog now includes 99 exact ArcGIS layer roles, 26 ArcGIS service-root roles requiring child-layer selection, and four direct-download roles. The remaining URLs are OSM extracts, download/catalog pages, or information leads; no parser or public package is implied by a URL entry. See the [93-role rights recheck](STATE_AGENCY_RIGHTS_AND_LEADS_RECHECK_2026-09-26.md) and [last-17 download-point audit](STATE_AGENCY_LAST_17_DOWNLOAD_POINTS_2026-09-26.md).

## Acquisition gate

Every feature or raw-file fetch requires a source-specific approval in ignored `PrivateData/agency-feeds/approvals.json`. A missing approval, mismatched source ID/URL, expired review, absent evidence URL, or request for public distribution fails before the feature query. Unconfirmed, restricted, permission-required, and lead-only entries additionally require an explicit publisher grant recorded in that private approval. This is an internal control, not a substitute for obtaining a real grant. A supported or conditional rights label alone does not certify freshness, manager attribution, completeness, access, or camping rules.

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

The example ID and URL are placeholders. `publisherGrant` is required for a source whose current rights status lacks a usable grant; set it only when the publisher evidence actually covers collection and private storage. The approval file and staged raw data stay under ignored `PrivateData/agency-feeds/`.

## Commands and outputs

- `node tools/state-agency-feeds.mjs list` prints counts by rights status and source type. `list <state-code>` prints source IDs and definitions for one state. Neither command accesses source servers.
- `node tools/state-agency-feeds.mjs children <service-id>` reads only ArcGIS service metadata and lists its child layer IDs. Select a specific child before approving or staging it.
- `node tools/state-agency-feeds.mjs stage <layer-or-download-id>` fetches an approved exact layer or direct file into `PrivateData/agency-feeds/US/<state>/<source-id>/` with a checksum receipt. For a service root, use `stage <service-id> <child-layer-id>` after reviewing the child and creating an approval for its printed child ID.

The ArcGIS adapter enumerates object IDs and fetches 100-feature GeoJSON pages, then rejects incomplete page/count responses. It preserves raw source fields and geometry for the joint POI mapping pass. Direct ZIP/KML/other files are staged as raw bytes only; format-specific parsing remains required. Catalog pages, non-direct downloads, and OSM PBFs require source-specific adapters and remain disabled. None of these commands writes a public package.

## Remaining release work

1. Obtain source-specific public derivative-distribution language for the 109 currently Unconfirmed agency roles and written permission for the two Michigan roles moved to Permission required by the [111-role deep dive](STATE_AGENCY_111_RIGHTS_LANGUAGE_DEEP_DIVE_2026-09-27.md). Resolve appropriate data endpoints for the six remaining lead-only registry entries in the [rights matrix](STATE_AGENCY_REDISTRIBUTION_RIGHTS_2026-09-26.md). The [earlier recheck](STATE_AGENCY_RIGHTS_AND_LEADS_RECHECK_2026-09-26.md) explains why the original 93 stayed unconfirmed; the [last-17 audit](STATE_AGENCY_LAST_17_DOWNLOAD_POINTS_2026-09-26.md) resolves eleven more exact layers and records why six cannot yet be assigned. The three-state additions have separate [rights](ID_AR_SD_REDISTRIBUTION_RIGHTS_2026-09-26.md) and [freshness](ARKANSAS_FACILITY_FRESHNESS_AUDIT_2026-09-26.md) gates.
2. Validate geometry, coverage, manager filters, dates, duplicates, and terms for every selected layer. Stage only sources with current collection/storage evidence.
3. Map the staged agency points together with NPS, USFS, BLM, DEC, and OSM points into canonical places and the app's category filters. Keep land, trail, condition, and restriction records distinct. The [complete dataset tracker](ALL_DATASETS_TRACKER.md) records the current POI mismatch.
4. Build public state packages only from sources that independently pass public offline redistribution and product validation. Update attribution and manifests at that point.

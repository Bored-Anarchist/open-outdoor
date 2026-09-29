# North Carolina and Louisiana visitor data — 2026-09-28

North Carolina forest coverage is updated, Indian Creek's existing private place now includes an official visitor reference, and forestry inventory, land-cover and planning layers are excluded from acquisition and visitor packaging. OSM POI/trail extracts remain deferred. Public redistribution and visitor access are checked separately.

## North Carolina

The public package now has **9,541 features**, including **six new forest-property tracts**: one for Dan River Educational State Forest and five for Backbone Ridge State Forest. The source is the Department of Administration's [State-Owned Land (Latest) layer](https://services3.arcgis.com/zMTrRjxZirPAKsKd/arcgis/rest/services/State_Owned_Land_NC_Latest_02/FeatureServer/0), owned by the State Property Office publisher and linked to its public GIS applications. The query selects only the two named forest complexes managed by Agriculture / Forest Service. Offices, nurseries, unrelated holdings and property contacts are excluded.

The [NCFS acquisition announcement](https://blog.ncagr.gov/2023/08/07/n-c-forest-service-continues-to-expand-educational-and-recreational-opportunities-for-visitors-to-state-forests/) identifies Shoebuckle as Dan River ESF. The package retains the original source IDs and normalizes that name. Source tract totals are approximately **848.4 acres** for Dan River and **494.4 acres** for Backbone Ridge; these are source area attributes, not surveyed acreage or access permission. Individual source edits are dated December 2025; retrieval and terms review occurred September 28, 2026. Service edit time does not establish when every boundary was surveyed.

The [SPO policy](https://www.doa.nc.gov/divisions/state-property) and [NC OneMap terms](https://www.nconemap.gov/pages/terms) support public use. The exact item also links to NC OneMap's free and unrestricted use policy. Acquisition verifies the exact service item, source URL, forest-selection query, publisher disclaimer and OneMap policy; missing or changed evidence stops acquisition. Credit, source disclaimers, modifications, query inventory and terms checksums are retained in the public manifest and notices. This clearance applies only to this reviewed source; existing NCFS/NCWRC roles retain their original rights findings.

The private NC package now contains **1,086 features**: **1,019 iOverlander places** and **67 agency features**. Nine historical NCFS boundaries and nine locators remain. The two obsolete NCFS Rendezvous Mountain entries are removed from the active overlay. The current State Parks Rendezvous record remains, and one current [NCWRC Little Fork State Forest boundary](https://services1.arcgis.com/YfqBAUM5nWR3yhGP/arcgis/rest/services/gamelands_detail/FeatureServer/22) is added privately. Its exact name/owner selection and selected fields are pinned; it is not publicly redistributed. [NCWRC identifies Little Fork as formerly Rendezvous Mountain](https://www.ncwildlife.gov/hunting/where-hunt-shoot/game-lands-maps/mountain-game-land-maps), while the [State Parks history](https://www.ncparks.gov/state-parks/rendezvous-mountain/education) documents the park's transfer. The old entire forest is not relabeled as the current park or Little Fork boundary.

Together, public and private agency geometry represents the **12 forest names in the recent [NCFS office map](https://webservices.ncleg.gov/ViewDocSiteFile/105364)**: Backbone Ridge, Bladen Lakes, Clemmons, Dan River, DuPont, Headwaters, Holmes, Jordan Lake, Little Fork, Mountain Island, Turnbull Creek and Tuttle. Historical NCFS records are still dated references. The 2023 announcement additionally describes Broyhill State Forest; a verified current Broyhill boundary was not found in the queried official sources. It remains a named coverage dependency, without a fabricated point or polygon. This update does not assert complete, surveyed or currently accessible NCFS coverage.

## Louisiana Indian Creek

The existing Indian Creek place is retained in the private Louisiana package, with its original ID, coordinates, category, community description and check-ins. An agency visitor reference adds LDAF contact details, the Woodworth street address, a concise description, [published amenities](https://www.ldaf.la.gov/indian-creek-recreation-area/activities-amenities), the [official booking page](https://www.ldaf.la.gov/indian-creek-recreation-area/book-your-stay-today) and [four official map references](https://www.ldaf.la.gov/indian-creek-recreation-area/campground-maps). The amenities include three beach areas, four bath houses, more than 100 campsites, two dump stations, boat launch, picnic facilities, playground and pavilions. These counts describe the agency's published facilities; they do not create separate geographic POIs or promise availability.

Five official page snapshots remain in ignored private storage with URL, retrieval time, byte size and SHA-256 evidence. Required facts and all four map links are checked before staging. The private package contains a checksum-bound reference file and a binding to the existing place. Source IDs and geometry provenance remain separate: the website does not provide the place's coordinates. Snapshots are marked `currentConditions: false` and `publicDistribution: false`.

Louisiana remains **578 private features**: **550 iOverlander places** and **28 agency records**. One place is enriched; no duplicate campground or invented campsite points are added. The previously selected Alexander State Forest WMA boundary remains a separate managed-land record. It is not substituted for an Indian Creek campground boundary.

Individual campsites, beach/bath-house/dump-station locations and hiking/horse routes still need verified geographic geometry and compatible terms. The agency maps are raster references. The officially linked reservation service exposes a site-selection map, but this environment received an anti-bot response for direct acquisition; it was not bypassed. A dated web result does not prove current inventory or availability. No bookings or provider messages were made. The old tourism-guide locator was not substituted for a current entrance coordinate.

## Enforced exclusions

`config/state-visitor-source-scope.json` excludes declared forestry inventories, land-cover and planning datasets plus the known source endpoints. Private acquisition, public acquisition, public packaging and private composition apply the rule; private inventory verification rejects an excluded source in a finished package. Actual visitor trails and managed-land boundaries remain subject to their exact source and rights checks.

The audit found **379 Oklahoma species/tree-inventory points** in `Eco_Inventory_view/FeatureServer/68`. They are removed from the active visitor package. Oklahoma now has **607 private features**: 563 iOverlander places and 44 historical state-park locations. Raw inventory evidence remains archived privately; it is not a visitor overlay. Minnesota Forest Stand Inventory, Kansas/Nebraska land-cover rasters and forest planning leads remain excluded. Louisiana’s original USFS tree-canopy/land-cover lead is also excluded; its reviewed Alexander boundary uses a separate exact visitor-land source. The NC Natural Heritage Managed Areas service was not imported because its stated planning purpose and location-sharing restrictions do not support this visitor use.

The private role ledger now has **104 of 107 Unconfirmed roles** represented through eligible private source/shared-service receipts. The three scope exclusions are KS land cover, NE land cover and OK species inventory. Three NJDEP roles remain private; two Michigan roles use the previously cleared exact public hiking dataset. Role counts are not feature or unique-source counts.

## Rebuild and verification

```text
node tools/acquire-public-state-agency.mjs nc-spo-forest-additions
node tools/build-public-state-packages.mjs NC
node tools/report-public-state-packages.mjs
python tools/build-state-loader.py --states NC --workers 2
node tools/stage-private-agency-resolutions.mjs --state NC
node tools/private-state-visitor-references.mjs LA
node tools/build-private-state-agency-ioverlander.mjs NC
node tools/build-private-state-agency-ioverlander.mjs LA
node tools/build-private-state-agency-ioverlander.mjs OK
node tools/report-private-state-packages.mjs
node tools/report-provisional-agency-status.mjs
node tools/verify-public-state-packages.mjs
python tools/verify-state-loader.py
```

All 50 public packages total **757,622 features**, including **138,872 direct agency features** from **18 acquisitions in 12 states**, and **169 import parts**. Following [same-state public deduplication](PRIVATE_PUBLIC_STATE_DEDUPLICATION_2026-09-28.md), all 50 private packages total **527,153 features**: **463,870 agency/DEC/OPRHP records** and **63,283 iOverlander places**, with all **5,289** preserved DEC profiles. Current counts and checksums are in the public and private inventories. Private source data and composed packages remain Git-ignored; GitHub receives eligible public data, configuration, tooling and this aggregate evidence.

Validation passed for all 50 public packages and 169 import parts, all 50 SQLite catalogs and 757,622 original geometries, all 50 private packages and 5,289 preserved DEC profiles, 115 release tests and six Python catalog tests. All 9,535 pre-existing NC public features are unchanged; six source tracts are added. TypeScript, formatting, documentation governance, public-boundary scanning and local iOS/Metro export passed. Full native compilation and physical phone acceptance are separate from these local checks.

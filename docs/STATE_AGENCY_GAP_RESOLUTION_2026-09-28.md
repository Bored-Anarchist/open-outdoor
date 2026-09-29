# Remaining state agency gaps — resolution, 2026-09-28

This review addresses the datasets omitted from both systems in the September 28 gap audit. OSM POI/trail extracts are excluded at the user's request. Source acquisition, private packaging, public redistribution and current visitor coverage are separate decisions. Earlier failure and candidate notes in the trackers are historical; this report records the current result.

There are still **50 public state packages** and **50 private state packages**. Public packages now contain **757,616 features**, including **138,866 direct agency records from 17 acquisitions in 11 states**, and **169 validated import parts**. Private packages contain **536,293 features**, including **472,960 agency/DEC/OPRHP records** and **63,333 iOverlander places**. All **5,289** preserved DEC elevation profiles remain verified. These are package entries, not deduplicated national entities.

## Acquired and packaged

| Gap | Resolution | Public/private result |
| --- | --- | --- |
| Michigan's duplicate parks/forestry trail roles | Acquired **9,460** hiking records from exact [DNR Trails Open Data layer 2](https://gisagodnr.state.mi.us/arcgis/rest/services/DNR/DNRTrailsOPENDATA/FeatureServer/2). Its [dataset license](https://gisagodnr.state.mi.us/arcgis/rest/services/DNR/DNRTrailsOPENDATA/FeatureServer/info/iteminfo?f=json) expressly allows use, reproduction and distribution. | Public Michigan package rebuilt with **31,083** features and four import parts; SQLite catalog rebuilt. The general website's copying policy is retained in the original role ledger; this exception clears only the exact dataset. Full license, credit, modifications and source checksums are retained in the package notices and manifest. |
| Maryland campsites | Original [AIMS campsite layer 0](https://dnr.geodata.md.gov/dnrdata/rest/services/AIMS/AIMStrailDataRO/MapServer/0) recovered: **278** records. | Private Maryland package rebuilt. Names come from `CampsiteName`; the source's campsite designation drives the `campsite` category. Camping permission and current availability are unknown. Rejected planning substitutes remain excluded. |
| Maryland owned lands | Original [AIMS owned-property layer 14](https://dnr.geodata.md.gov/dnrdata/rest/services/AIMS/AIMStrailDataRO/MapServer/14) recovered: **317** records. | Together with the 32 already staged Forest Service properties, Maryland now has **627** agency records and **888** private package features. Blank dataset terms do not clear public redistribution. |
| Florida failed park-boundary child | Recovered [PARKS_BOUNDARIES layer 0](https://ca.dep.state.fl.us/arcgis/rest/services/OpenData/PARKS_BOUNDARIES/MapServer/0): **179** boundaries. | Private Florida package rebuilt with **19,159** features. Existing campsites, entrance points, POIs, trails and 76 forest polygons are retained. Public terms remain unconfirmed. |
| Louisiana forestry download lead | Verified the LDWF-owned [WMA/Refuge layer](https://services1.arcgis.com/6euNCaGPCgCzgAVF/arcgis/rest/services/LDWF_WMA_Refuge/FeatureServer/0), linked by the official LDWF WMA web map. Selected the exact `NAME='Alexander State Forest WMA'` record. | One boundary added privately; Louisiana now has **578** features. The [LDAF visitor page](https://www.ldaf.la.gov/indian-creek-recreation-area) identifies Indian Creek recreation services, but the WMA boundary is not a complete campground/facility inventory. No invented facility geometry was added. |
| North Carolina forestry PDF lead | The agency's [State Forests web map](https://www.arcgis.com/home/item.html?id=456de0d3bcbe4ca9888ea11b92113903) identifies exact [forest boundaries](https://services6.arcgis.com/3Sj1fiIDvQtFfbvg/arcgis/rest/services/NCFS_StateForests/FeatureServer/0) and [forest locators](https://services6.arcgis.com/3Sj1fiIDvQtFfbvg/arcgis/rest/services/NCFS_State_Forests_Points/FeatureServer/0): **10 of each**. | Both feeds added privately; North Carolina now has **1,087** features. The source inventory is historical: it includes Rendezvous Mountain and omits Dan River ESF from the [current NCFS directory](https://www.ncagr.gov/divisions/nc-forest-service/contacts). The map does not assert current ownership or access; current complete geometry needs the manager's update. |
| Mississippi forestry lead | [MFC identifies Camden, Kurtz and Jamie L. Whitten State Forests](https://www.mfc.ms.gov/programs/public-lands-programs/). An exact query against [its property layer](https://arcsrv.mfc.ms.gov/server/rest/services/MississippiForestry/MapServer/5) recovered **10** matching forest tracts. | Added privately; Mississippi now has **3,373** features. The query selects only the three forest names and only object ID/name fields. Individual clients, contacts, management plans and unrelated property records are excluded. Packaged names are canonical forest names. No public grant or current visitor-access designation was found. |

The remaining acquisition ledger now represents **105 of 107 Unconfirmed roles** through private source or shared-service receipts; the other two are Kansas/Nebraska raster roles outside visitor scope. Three NJDEP permission-required roles remain privately represented. The two Michigan roles are represented by the exact publicly licensed alternate. These counts describe source roles; repeated URLs are ingested once.

## New York OPRHP

All eight named services were acquired locally with complete object-ID inventories, raw-source checksums, and individual layer/terms evidence. Terms were evaluated individually; the polygon restriction was not applied to unrelated feeds. None is publicly distributed by this change.

| Source | Raw records | Packaged result |
| --- | ---: | --- |
| [Park polygons](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NYS_Park_Polygons/FeatureServer/0) | 858 | Unchanged raw polygons retained as a separate private reference. The terms prohibit editing and redistribution; polygons are not converted into the composed visitor map. |
| [Trails](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Parks_Trails/FeatureServer/0) | 16,641 | **16,497** public-designated records added privately. `Public_='Y'` required; Closed and Proposed source statuses excluded. These source flags do not prove present-day access. |
| [Facilities](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Park_Facilities/FeatureServer/0) | 8,823 | **8,822** public-designated records added privately, using the same visitor filter. Unknown source types remain Other. |
| [Camping](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Parks_Camping/FeatureServer/0) | 66 | **66** private campsite/campground records. Source designation is not a reservation or camping authorization. |
| [Public park points](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Park_Points_(public_view)/FeatureServer/0) | 248 | **248** private park locators. |
| [Temporary trail closures](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Parks_Temporary_Trail_Closure/FeatureServer/0) | 4 | Separate dated private snapshot; never merged into the durable map as current conditions. |
| [Beach status](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Parks_Beach_Status/FeatureServer/0) | 74 | Separate dated private snapshot with the same current-conditions exclusion. |
| [2025–2026 snowmobile trail view](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/2025_2026_Snowmobile_Data_view/FeatureServer/1) | 2,911 | Previous-season private reference, excluded from the durable map and current route/access claims. Layer 0 is a club-locator companion, not this trail dataset. |

New York's private map now has **41,273** features: **14,454 DEC**, **25,633 selected OPRHP**, and **1,186 iOverlander**. The composer preserves existing DEC geometry, private narratives and IDs, checks every OPRHP receipt, and produces a checksum-pinned search index. All 5,289 preserved profiles are checked against retained DEC geometry before rebinding. Re-running the composer does not duplicate agency records. The private mobile staging result has **41,599** features when the 326 public records are added locally. Public New York remains **326** records.

## Visitor-scope decisions

The agency names alone do not establish that their fire, forest inventory, assistance or planning layers describe places to visit. These candidate roles are closed as outside the currently verified visitor dataset scope, rather than imported as fabricated POIs. This is a scoped dataset decision, not a claim that those states have no forests or visitor lands.

| Role | Evidence and disposition |
| --- | --- |
| Arizona DFFM forestry lead | [DFFM mission/programs](https://dffm.az.gov/about): fire, forestry protection and assistance. No verified DFFM visitor-estate feed identified. State Parks, federal and PAD-US visitor sources remain separate. |
| Nevada NDF forestry lead | [NDF GIS services](https://forestry.nv.gov/gis-mapping) describe natural-resource/fire planning and assistance hubs. No verified forestry visitor-estate feed identified. An agency-confirmed recreation layer would reopen the candidate. |
| New Mexico forestry lead | [Forestry Division programs](https://www.emnrd.nm.gov/sfd/) concern forest health, restoration and assistance; the State Parks Division publishes recreation information separately. No verified forestry visitor-estate feed identified. |
| Two South Dakota forestry leads | [DANR Forestry programs](https://danr.sd.gov/Conservation/Forestry/default.aspx) cover forest health, assistance, education and planning. No verified forestry visitor-estate feed identified. Existing Parks/federal visitor layers remain separate. |
| Minnesota Forest Stand Inventory | Non-visitor inventory geometry excluded intentionally. The approved hiking/campground derivatives remain public. |
| Kansas forestry raster | The linked land-cover research is not visitor data; the [Kansas Forest Service explains there are no public state forests](https://www.k-state.edu/news/articles/2025/04/kansas-forest-service-protects-sustains-enhances-community-tree-resources.html). Parks visitor feeds remain separate. |
| Nebraska forestry raster | The linked land-cover research is not visitor data. [Forest Service statutory duties](https://nebraskalegislature.gov/laws/statutes.php?statute=85-161) concern forestry services; Game and Parks visitor layers remain separate. |

## Remaining provider dependencies

Acquisition failures are resolved for the named available feeds. Public promotion of the private additions still needs an affirmative source-specific grant; an available query endpoint or a general disclaimer does not supply that grant. North Carolina's current full inventory and Louisiana's campground/facility geometry remain coverage dependencies. Existing public federal/PAD-US coverage is retained, but is not relabeled as an exact agency inventory.

The following request text is prepared for review; **no messages have been sent**:

> Please confirm permission for the exact datasets listed in this report to be republished in a noncommercial outdoor reference application, in public GitHub source packages, modified GeoJSON/search indexes and offline SQLite catalogs, with attribution and separate source notices. Please identify third-party components and any restrictions on downstream redistribution or derivative geometry. For NY State Parks polygons, please explicitly address the no-edit/no-redistribution terms. Temporary condition feeds would need approved refresh/expiry rules and would not be presented as current from an expired snapshot.

For NCFS, additionally request updated state-forest boundary/locator geometry covering the current ten-forest directory, including Dan River and the Rendezvous Mountain manager transfer. For LDAF, request an official Indian Creek campground, campsite, access and visitor-facility export rather than substituting the Alexander WMA outline. For MFC, request confirmation of current visitor access and public redistribution of the three named forest boundary subsets. Record resulting grants by exact URL/version before public promotion.

## Rebuild and verification

```text
node tools/acquire-public-state-agency.mjs mi-dnr-hiking
node tools/build-public-state-packages.mjs MI
python tools/build-state-loader.py --states MI --workers 2
node tools/report-public-state-packages.mjs
node tools/stage-private-agency-resolutions.mjs --state MD
node tools/stage-private-agency-resolutions.mjs --state NC
node tools/stage-private-agency-resolutions.mjs --state LA
node tools/stage-provisional-agency-children.mjs --state FL --max-features 200000
node tools/stage-private-mississippi-forests.mjs
node tools/stage-private-new-york-oprhp.mjs
node tools/build-private-state-agency-ioverlander.mjs MD
node tools/build-private-state-agency-ioverlander.mjs NC
node tools/build-private-state-agency-ioverlander.mjs LA
node tools/build-private-state-agency-ioverlander.mjs FL
node tools/build-private-state-agency-ioverlander.mjs MS
node tools/package-private-new-york-agencies.mjs
node tools/report-private-state-packages.mjs
node tools/report-provisional-agency-status.mjs
node tools/stage-private-mobile-map.mjs --input "PrivateData/catalogs/US/New York/current"
node tools/verify-public-state-packages.mjs
python tools/verify-state-loader.py
```

Private acquisition receipts and complete sources remain Git-ignored. Only aggregate status, exact source URLs, review policy, tooling and eligible public package data are pushed. Rebuilds require the corresponding private local source files; a clean public checkout cannot reconstruct private catalogs.

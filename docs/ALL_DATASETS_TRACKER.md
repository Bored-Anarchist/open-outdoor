# Complete outdoor dataset tracker

**Public packaging update (2026-09-28):** All **50 states**, including New York, now use the private system's GeoJSON/checksum-manifest structure with public search indexes and **169 app-parser-validated import parts**. The packages contain **757,622 features**, **77,013 POIs**, and **138,872 eligible direct agency features** in 12 states. See the [current inventory](PUBLIC_STATE_PACKAGE_INVENTORY_2026-09-27.md) and [format/rebuild guide](PUBLIC_STATE_PACKAGE_FORMAT.md). The older acquisition-stage notes below are superseded where they say no agency data are public, categories are unmapped, or parts have not been validated. Permission-held data stay private; dated references do not establish current access.

**Remaining-gap review (2026-09-28):** Michigan's 9,460 hiking records are publicly licensed and packaged. Recovered MD/FL/LA/NC feeds, Mississippi's three state forests and all eight OPRHP feeds are now acquired privately; selected OPRHP visitor records are integrated into New York's private map. Scope exclusions and remaining source-license/current-coverage dependencies are recorded in the [resolution report](STATE_AGENCY_GAP_RESOLUTION_2026-09-28.md). OSM POI/trail extracts remain deferred by request. Earlier acquisition-failure and not-acquired statements below are historical.

**State loader update:** Complete public states can now be installed through the dedicated [offline state package loader](STATE_PACKAGE_LOADER.md), with local PMTiles display, indexed catalog search/details and checksum-verified activation/rollback. Manual GeoJSON import limits remain unchanged. The [unsigned iOS build](https://github.com/Bored-Anarchist/open-outdoor/actions/runs/36369753027) passed for code commit `dbd9bcd8aae2ac2aa4dafaa40bd05494ae420b7e`. Physical phone acceptance and production catalog trust integration remain pending.

**Snapshot:** 2026-09-26. This is the single index of every registered non-New-York state source role, all shipped state-package source families, the shipped New York source records, the selected AR/ID/SD layer plan, the identified New York OPRHP candidates, and the remaining map asset manifests. Repeated URLs remain repeated where two agency roles use the same dataset. A candidate or catalog entry is not a shipped layer or release approval.

**Inventory counts:** 50 state packages; 9 national source families; 9 New York package source records; 212 registry source-role entries (98 primary agency, 44 non-OSM supplements, 70 OSM fallbacks); 19 selected AR/ID/SD plan rows; 8 OPRHP service candidates; two offline basemap manifests, one derived hike-profile manifest, one connected style manifest, and a proposed New York OSM extract. Rights findings remain in the [agency rights matrix](STATE_AGENCY_REDISTRIBUTION_RIGHTS_2026-09-26.md), [three-state rights check](ID_AR_SD_REDISTRIBUTION_RIGHTS_2026-09-26.md), and [New York audit](NYS_AGENCY_SOURCE_COVERAGE_AUDIT.md).

**Feed connectors:** The [gated agency feed connector](STATE_AGENCY_FEED_CONNECTORS.md) exposes these registry entries and selected three-state layers as source definitions. Exact ArcGIS layers and direct downloads require a source-specific private approval before feature or file acquisition. No agency records are included in public packages by that code.

**Private state packages:** The [verified private package inventory](PRIVATE_STATE_PACKAGE_INVENTORY_2026-09-27.md) records 50 active packages: 43 agency+iOverlander, New York DEC+iOverlander, and six iOverlander-only packages for CA, CT, MA, MI, MN, and NE. Florida includes 76 converted forest polygons, Oklahoma includes 44 historical state-park points, and New York includes 5,289 verified DEC elevation profiles. See the [integration report](PRIVATE_PACKAGE_INTEGRATION_2026-09-27.md). Private package files remain Git-ignored.

## POI-system gate

The 50 public packages contain **77,013 POI entries**. **20,540 (26.7%)** retain Other because their source type is unknown, infrastructure, or an amenity without an iOverlander legend category. Raw source categories and bounded visitor amenities remain available. Camping types, parking, drinking water, dump stations, lodging and visitor attractions are normalized to the app taxonomy. These are package entries, not deduplicated national entities.

**Import status:** every one of the **169 parts** passed the actual app parser's byte, feature, coordinate, geometry and normalized-size checks. Full package files can exceed import limits. The app's five-dataset/50 MiB combined-store limits still apply; select parts within those limits. Complete states use the separate SQLite loader; native phone acceptance remains pending.

### State package POI and import status

| State | POI entries | Other | Direct agency features | App import parts |
| --- | ---: | ---: | ---: | --- |
| AL | 307 | 120 | 0 | 2 validated parts |
| AK | 1,602 | 483 | 0 | 23 validated parts |
| AZ | 4,186 | 1,766 | 0 | 4 validated parts |
| AR | 424 | 191 | 227 | 2 validated parts |
| CA | 6,402 | 2,030 | 15 | 12 validated parts |
| CO | 5,950 | 1,226 | 1,209 | 7 validated parts |
| CT | 385 | 269 | 14,731 | 3 validated parts |
| DE | 0 | 0 | 0 | 1 validated parts |
| FL | 1,812 | 1,225 | 0 | 3 validated parts |
| GA | 517 | 122 | 0 | 2 validated parts |
| HI | 78 | 31 | 0 | 1 validated parts |
| ID | 4,845 | 172 | 0 | 8 validated parts |
| IL | 131 | 1 | 0 | 2 validated parts |
| IN | 65 | 0 | 0 | 1 validated parts |
| IA | 0 | 0 | 0 | 1 validated parts |
| KS | 16 | 1 | 0 | 1 validated parts |
| KY | 743 | 188 | 0 | 2 validated parts |
| LA | 128 | 15 | 0 | 1 validated parts |
| ME | 111 | 44 | 0 | 1 validated parts |
| MD | 694 | 390 | 0 | 1 validated parts |
| MA | 4,952 | 3,110 | 49,787 | 8 validated parts |
| MI | 597 | 12 | 9,460 | 4 validated parts |
| MN | 966 | 8 | 7,872 | 4 validated parts |
| MS | 711 | 348 | 0 | 1 validated parts |
| MO | 206 | 28 | 0 | 1 validated parts |
| MT | 10,241 | 546 | 0 | 8 validated parts |
| NE | 16 | 0 | 74 | 1 validated parts |
| NV | 1,253 | 373 | 6,686 | 5 validated parts |
| NH | 324 | 22 | 0 | 1 validated parts |
| NJ | 102 | 41 | 0 | 3 validated parts |
| NM | 1,920 | 386 | 0 | 4 validated parts |
| NY | 81 | 0 | 0 | 1 validated parts |
| NC | 2,675 | 1,351 | 6 | 3 validated parts |
| ND | 54 | 4 | 0 | 1 validated parts |
| OH | 69 | 1 | 0 | 1 validated parts |
| OK | 284 | 62 | 0 | 1 validated parts |
| OR | 5,329 | 1,250 | 0 | 7 validated parts |
| PA | 377 | 120 | 0 | 2 validated parts |
| RI | 1 | 0 | 0 | 1 validated parts |
| SC | 190 | 38 | 0 | 1 validated parts |
| SD | 311 | 27 | 0 | 2 validated parts |
| TN | 2,167 | 999 | 0 | 2 validated parts |
| TX | 1,145 | 416 | 0 | 2 validated parts |
| UT | 4,214 | 1,016 | 48,130 | 10 validated parts |
| VT | 133 | 3 | 0 | 1 validated parts |
| VA | 1,467 | 625 | 675 | 3 validated parts |
| WA | 2,593 | 316 | 0 | 5 validated parts |
| WV | 520 | 76 | 0 | 1 validated parts |
| WI | 196 | 1 | 0 | 2 validated parts |
| WY | 5,523 | 1,087 | 0 | 5 validated parts |

## Shipped national source families in every state manifest

| Source ID | Dataset | Stage | POI-system role |
| --- | --- | --- | --- |
| usgs-pad-us-fee-managers | [usgs-pad-us-fee-managers](https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Fee_Managers_PADUS/FeatureServer/0) | Shipped in applicable state packages | Land/line context; not a POI point feed |
| nps-public-trails | [nps-public-trails](https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails_Geographic/FeatureServer/0) | Shipped in applicable state packages | Land/line context; not a POI point feed |
| nps-public-points-of-interest | [nps-public-points-of-interest](https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_POIs_Geographic/FeatureServer/0) | Shipped in applicable state packages | Point feed; category mapping needed |
| usfs-national-forest-system-trails | [usfs-national-forest-system-trails](https://apps.fs.usda.gov/ArcX/rest/services/EDW/EDW_TrailNFSPublishWithDataStatus_01/MapServer/0) | Shipped in applicable state packages | Land/line context; not a POI point feed |
| usfs-recreation-sites | [usfs-recreation-sites](https://apps.fs.usda.gov/ArcX/rest/services/EDW/EDW_RecInfraRecreationSites_02/MapServer/0) | Shipped in applicable state packages | Point feed; category mapping needed |
| usfs-mvum-roads | [usfs-mvum-roads](https://apps.fs.usda.gov/ArcX/rest/services/EDW/EDW_MVUM_02/MapServer/1) | Shipped in applicable state packages | Land/line context; not a POI point feed |
| usfs-mvum-trails | [usfs-mvum-trails](https://apps.fs.usda.gov/ArcX/rest/services/EDW/EDW_MVUM_02/MapServer/2) | Shipped in applicable state packages | Land/line context; not a POI point feed |
| blm-surface-management-agency | [blm-surface-management-agency](https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_LimitedScale/MapServer/1) | Shipped in applicable state packages | Land/line context; not a POI point feed |
| blm-public-recreation-sites | [blm-public-recreation-sites](https://gis.blm.gov/arcgis/rest/services/recreation/BLM_Natl_Recreation_Offline/FeatureServer/2) | Shipped in applicable state packages | Point feed; category mapping needed |

## Shipped New York package sources

The current public manifest lists the NYS civil boundary and federal feeds. DEC records and 5,289 trail-derived profiles are packaged in the active ignored PrivateData catalog; the private mobile loader verifies their map binding. Public redistribution remains held; see the [New York audit](NYS_AGENCY_SOURCE_COVERAGE_AUDIT.md).

| Source ID | Dataset | Stage |
| --- | --- | --- |
| nys-boundary | [nys-boundary](https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Civil_Boundaries/FeatureServer/0) | In existing New York package; rights and freshness vary |
| nps-parks-ny | [nps-parks-ny](https://developer.nps.gov/api/v1/parks?stateCode=NY) | In existing New York package; rights and freshness vary |
| nps-campgrounds-ny | [nps-campgrounds-ny](https://developer.nps.gov/api/v1/campgrounds?stateCode=NY) | In existing New York package; rights and freshness vary |
| nps-alerts-ny | [nps-alerts-ny](https://developer.nps.gov/api/v1/alerts?stateCode=NY) | In existing New York package; rights and freshness vary |
| usfs-surface-ownership-ny | [usfs-surface-ownership-ny](https://apps.fs.usda.gov/ArcX/rest/services/EDW/EDW_SurfaceOwnership_01/MapServer/0) | In existing New York package; rights and freshness vary |
| usfs-recreation-sites-ny | [usfs-recreation-sites-ny](https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecInfraRecreationSites_02/MapServer/0) | In existing New York package; rights and freshness vary |
| usfs-mvum-roads-ny | [usfs-mvum-roads-ny](https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_02/MapServer/1) | In existing New York package; rights and freshness vary |
| usfs-mvum-trails-ny | [usfs-mvum-trails-ny](https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_02/MapServer/2) | In existing New York package; rights and freshness vary |
| blm-managed-lands-ny | [blm-managed-lands-ny](https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_LimitedScale/MapServer/1) | In existing New York package; rights and freshness vary |

## Registered parks, forestry, and OSM source roles

These are the complete source roles in `config/us-state-forestry-agencies.json` outside New York. An API or download candidate still needs layer-level POI/route/land classification, category mapping, rights, completeness, and currentness review. A catalog or information page needs an exact dataset before import. OSM rows are community fallbacks under ODbL; they do not become agency-verified by spatial join.

| State | Agency role | Dataset or lead | Source type | Stage |
| --- | --- | --- | --- | --- |
| AL | parks | [Alabama State Parks and Forestry trails layer](https://conservationgis.alabama.gov/adcnrweb/rest/services/DCNRTrails/MapServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| AL | forestry | [Alabama Forestry Commission StateLandTrail FeatureServer](https://gis.forestry.alabama.gov/arcgis/rest/services/Hosted/StateLandTrail/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| AK | parks | [Alaska DPOR Park_Boundary_Facility FeatureServer](https://arcgis.dnr.alaska.gov/arcgis/rest/services/DPOR/Park_Boundary_Facility/FeatureServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| AK | forestry | [Alaska Division of Forestry State Forest Boundary layer](https://services1.arcgis.com/7HDiw78fcUiM2BWn/ArcGIS/rest/services/State_Forest_Boundary_Public_View_2/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| AK | forestry | [OpenStreetMap Alaska outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/alaska-latest.osm.pbf) | download | OSM fallback; no public agency import |
| AZ | parks | [Arizona Statewide Trails 2022 FeatureServer](https://services7.arcgis.com/EQeZILY2rwa3o0JM/arcgis/rest/services/2022_11_22_Statewide_Trails/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| AZ | forestry | [Arizona DFFM GIS Open Data / FITS](https://gis-dffm.hub.arcgis.com/) | catalog | Primary candidate; no public agency import; private staging tracked separately |
| AZ | forestry | [OpenStreetMap Arizona outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/arizona-latest.osm.pbf) | download | OSM fallback; no public agency import |
| AR | parks | [Arkansas State Parks hosted StateParks FeatureServer layer](https://gis.ardot.gov/hosting/rest/services/Hosted/StateParks/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| AR | parks | [Arkansas Statewide Trails FeatureServer layer 22](https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Environment/FeatureServer/22) | api | Supplemental candidate; no public agency import |
| AR | parks | [Arkansas outdoor recreation facilities layer 24](https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Location/FeatureServer/24) | api | Supplemental candidate; no public agency import |
| AR | parks | [OpenStreetMap Arkansas outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/arkansas-latest.osm.pbf) | download | OSM fallback; no public agency import |
| AR | forestry | [Arkansas Outdoor Recreational Facilities layer 24 (AFC subset)](https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Location/FeatureServer/24) | api | Public dated derivative included; exact source receipt and selection in state manifest |
| AR | forestry | [Arkansas Statewide Trails FeatureServer layer 22](https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Environment/FeatureServer/22) | api | Supplemental candidate; no public agency import |
| AR | forestry | [OpenStreetMap Arkansas outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/arkansas-latest.osm.pbf) | download | OSM fallback; no public agency import |
| CA | parks | [California State Parks GIS downloads and live feature services](https://www.parks.ca.gov/?page_id=29682) | download | Primary candidate; no public agency import; private staging tracked separately |
| CA | forestry | [CAL FIRE State Demonstration Forests 2024 geodatabase ZIP](https://34c031f8-c9fd-4018-8c5a-4159cdff6b0d-cdn-endpoint.azureedge.net/-/media/calfire-website/what-we-do/fire-resource-assessment-program---frap/gis-data/stateforests241gdb.zip?hash=993C3D06E549F0308BF78E026D3F3655&rev=0f5f76e0dcd447bd9eee2395eba3c13b) | download | Public dated derivative included; exact source receipt and selection in state manifest |
| CA | forestry | [OpenStreetMap California outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/california-latest.osm.pbf) | download | OSM fallback; no public agency import |
| CO | parks | [Colorado State Parks Trails public-domain dataset](https://data.colorado.gov/Recreation/Trails-in-Colorado-State-Parks/qqnv-7jrr) | download | Public dated derivative included; exact source receipt and selection in state manifest |
| CO | parks | [Colorado CPW Trail Segments FeatureServer layer 2](https://services5.arcgis.com/ttNGmDvKQA7oeDQ3/ArcGIS/rest/services/CPWAdminData/FeatureServer/2) | api | Supplemental candidate; no public agency import |
| CO | parks | [OpenStreetMap Colorado outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/colorado-latest.osm.pbf) | download | OSM fallback; no public agency import |
| CO | forestry | [Colorado CPW Managed Properties (public access) layer 5: State Forest State Park](https://services5.arcgis.com/ttNGmDvKQA7oeDQ3/ArcGIS/rest/services/CPWAdminData/FeatureServer/5) | api | Primary candidate; no public agency import; private staging tracked separately |
| CO | forestry | [OpenStreetMap Colorado outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/colorado-latest.osm.pbf) | download | OSM fallback; no public agency import |
| CT | parks | [Connecticut DEEP Property FeatureServer layer](https://services1.arcgis.com/FjPcSmEFuDYlIdKC/arcgis/rest/services/Connecticut_DEEP_Property/FeatureServer/0) | api | Public dated derivative included; exact source receipt and selection in state manifest |
| CT | parks | [Connecticut DEEP Trails Set line layer](https://services1.arcgis.com/FjPcSmEFuDYlIdKC/arcgis/rest/services/DEEP_Trails_Set/FeatureServer/3) | api | Supplemental candidate; no public agency import |
| CT | parks | [Connecticut DEEP Property Access Locations](https://ct-deep-gis-open-data-website-ctdeep.hub.arcgis.com/datasets/CTDEEP::deep-property-access-locations/explore) | catalog | Supplemental candidate; no public agency import |
| CT | parks | [OpenStreetMap Connecticut outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/connecticut-latest.osm.pbf) | download | OSM fallback; no public agency import |
| CT | forestry | [Connecticut DEEP Property FeatureServer layer](https://services1.arcgis.com/FjPcSmEFuDYlIdKC/arcgis/rest/services/Connecticut_DEEP_Property/FeatureServer/0) | api | Public dated derivative included; exact source receipt and selection in state manifest |
| CT | forestry | [Connecticut DEEP Trails Set line layer](https://services1.arcgis.com/FjPcSmEFuDYlIdKC/arcgis/rest/services/DEEP_Trails_Set/FeatureServer/3) | api | Supplemental candidate; no public agency import |
| CT | forestry | [Connecticut DEEP Property Access Locations](https://ct-deep-gis-open-data-website-ctdeep.hub.arcgis.com/datasets/CTDEEP::deep-property-access-locations/explore) | catalog | Supplemental candidate; no public agency import |
| CT | forestry | [OpenStreetMap Connecticut outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/connecticut-latest.osm.pbf) | download | OSM fallback; no public agency import |
| DE | parks | [Delaware DNREC Managed Lands polygons layer 0](https://enterprise.firstmaptest.delaware.gov/arcgis/rest/services/Society/DE_State_Lands/MapServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| DE | parks | [Delaware Trails and Pathways MapServer layer 28](https://enterprise.firstmaptest.delaware.gov/arcgis/rest/services/Transportation/DE_Multimodal/MapServer/28) | api | Supplemental candidate; no public agency import |
| DE | parks | [OpenStreetMap Delaware outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/delaware-latest.osm.pbf) | download | OSM fallback; no public agency import |
| DE | forestry | [Delaware State Forest polygons layer 0](https://enterprise.firstmaptest.delaware.gov/arcgis/rest/services/Biota/DE_Forestry/MapServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| DE | forestry | [Delaware Trails and Pathways MapServer layer 28](https://enterprise.firstmaptest.delaware.gov/arcgis/rest/services/Transportation/DE_Multimodal/MapServer/28) | api | Supplemental candidate; no public agency import |
| DE | forestry | [OpenStreetMap Delaware outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/delaware-latest.osm.pbf) | download | OSM fallback; no public agency import |
| FL | parks | [Florida DEP State Parks PARKS_BOUNDARIES MapServer](https://ca.dep.state.fl.us/arcgis/rest/services/OpenData/PARKS_BOUNDARIES/MapServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| FL | forestry | [Florida State Forest boundaries (March 2025) ZIP](https://fgdl.org/zips/geospatial_data/current/state_forests_mar25.zip) | download | Primary candidate; no public agency import; private staging tracked separately |
| FL | forestry | [Florida Existing Trails FeatureServer layer 3](https://cadev.dep.state.fl.us/arcgis/rest/services/OpenData/OGT/MapServer/3) | api | Supplemental candidate; no public agency import |
| FL | forestry | [OpenStreetMap Florida outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/florida-latest.osm.pbf) | download | OSM fallback; no public agency import |
| GA | parks | [Georgia DNR Managed Lands dataset metadata/download record](https://data.georgiaspatial.org/data/statewide/dnr/fed_lands/dnr20a.html) | download | Primary candidate; no public agency import; private staging tracked separately |
| GA | parks | [OpenStreetMap Georgia outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/georgia-latest.osm.pbf) | download | OSM fallback; no public agency import |
| GA | forestry | [Georgia Public Lands managed-lands metadata and download](https://data.georgiaspatial.org/data/statewide/dnr/fed_lands/dnr20a.html) | download | Primary candidate; no public agency import; private staging tracked separately |
| GA | forestry | [Georgia DNR Conservation Lands layer 134 (GFC-owned public subset)](https://services6.arcgis.com/9QlSLDqa0P1cHLhu/ArcGIS/rest/services/Georgia_Conservation_Lands_23_proof_v2/FeatureServer/134) | api | Supplemental candidate; no public agency import |
| GA | forestry | [OpenStreetMap Georgia outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/georgia-latest.osm.pbf) | download | OSM fallback; no public agency import |
| HI | parks | [Hawaii State Parks MapServer State Parks layer 16](https://geodata.hawaii.gov/arcgis/rest/services/Infrastructure/MapServer/16) | api | Primary candidate; no public agency import; private staging tracked separately |
| HI | parks | [Hawaii State Parks Campsites MapServer layer 31](https://geodata.hawaii.gov/arcgis/rest/services/Infrastructure/MapServer/31) | api | Supplemental candidate; no public agency import |
| HI | parks | [OpenStreetMap Hawaii outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/hawaii-latest.osm.pbf) | download | OSM fallback; no public agency import |
| HI | forestry | [Hawaii DOFAW Reserves polygons layer 1](https://geodata.hawaii.gov/arcgis/rest/services/Terrestrial/MapServer/1) | api | Primary candidate; no public agency import; private staging tracked separately |
| HI | forestry | [OpenStreetMap Hawaii outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/hawaii-latest.osm.pbf) | download | OSM fallback; no public agency import |
| ID | parks | [Idaho IDPR Parks and Facilities FeatureServer layer 0](https://services1.arcgis.com/CNPdEkvnGl65jCX8/arcgis/rest/services/IDPR_Parks_and_Facilities/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| ID | parks | [Idaho Recreation Trails FeatureServer layer 128](https://services1.arcgis.com/CNPdEkvnGl65jCX8/arcgis/rest/services/Idaho_Recreation_Trails/FeatureServer/128) | api | Supplemental candidate; no public agency import |
| ID | parks | [OpenStreetMap Idaho outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/idaho-latest.osm.pbf) | download | OSM fallback; no public agency import |
| ID | forestry | [Idaho IDL Forest Action Plan datasets MapServer](https://gis1.idl.idaho.gov/arcgis/rest/services/Portal/Forest_Action_Plan_Datasets/MapServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| ID | forestry | [Idaho Department of Lands Trails FeatureServer layer 2](https://gis1.idl.idaho.gov/arcgis/rest/services/Portal/IDLTrails/FeatureServer/2) | api | Supplemental candidate; no public agency import |
| ID | forestry | [OpenStreetMap Idaho outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/idaho-latest.osm.pbf) | download | OSM fallback; no public agency import |
| IL | parks | [Illinois DNR Properties MapServer layer 11](https://maps.dnr.illinois.gov/geoservices/rest/services/BaseLayers/MapServer/11) | api | Primary candidate; no public agency import; private staging tracked separately |
| IL | parks | [OpenStreetMap Illinois outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/illinois-latest.osm.pbf) | download | OSM fallback; no public agency import |
| IL | forestry | [Illinois DNR Properties MapServer layer 11](https://maps.dnr.illinois.gov/geoservices/rest/services/BaseLayers/MapServer/11) | api | Primary candidate; no public agency import; private staging tracked separately |
| IL | forestry | [OpenStreetMap Illinois outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/illinois-latest.osm.pbf) | download | OSM fallback; no public agency import |
| IN | parks | [Indiana DNR ManagedLands_DNR_Open FeatureServer layer](https://gisdata.in.gov/server/rest/services/Hosted/ManagedLands_DNR_Open/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| IN | parks | [Indiana AllOpenTrails FeatureServer layer 0](https://gisdata.in.gov/server/rest/services/Hosted/Trails_AGOL_RO/FeatureServer/0) | api | Supplemental candidate; no public agency import |
| IN | parks | [OpenStreetMap Indiana outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/indiana-latest.osm.pbf) | download | OSM fallback; no public agency import |
| IN | forestry | [Indiana DNR ManagedLands_DNR_Open FeatureServer layer](https://gisdata.in.gov/server/rest/services/Hosted/ManagedLands_DNR_Open/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| IN | forestry | [Indiana AllOpenTrails FeatureServer layer 0](https://gisdata.in.gov/server/rest/services/Hosted/Trails_AGOL_RO/FeatureServer/0) | api | Supplemental candidate; no public agency import |
| IN | forestry | [OpenStreetMap Indiana outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/indiana-latest.osm.pbf) | download | OSM fallback; no public agency import |
| IA | parks | [Iowa DNR State_Parks MapServer](https://programs.iowadnr.gov/geospatial/rest/services/Recreation/State_Parks/MapServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| IA | forestry | [Iowa DNR State_Parks recreation MapServer](https://programs.iowadnr.gov/geospatial/rest/services/Recreation/State_Parks/MapServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| KS | parks | [KDWP Spatial Directory Kansas Public Land layer 4 (state park subset)](https://services1.arcgis.com/q2CglofYX6ACNEeu/arcgis/rest/services/KDWP_Spatial_Directory_WFL1/FeatureServer/4) | api | Primary candidate; no public agency import; private staging tracked separately |
| KS | parks | [OpenStreetMap Kansas outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/kansas-latest.osm.pbf) | download | OSM fallback; no public agency import |
| KS | forestry | [High-resolution land cover of Kansas (2015), RDS-2017-0025](https://www.fs.usda.gov/rds/archive/catalog/RDS-2017-0025) | download | Primary candidate; no public agency import; private staging tracked separately |
| KS | forestry | [OpenStreetMap Kansas outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/kansas-latest.osm.pbf) | download | OSM fallback; no public agency import |
| KY | parks | [Kentucky State Parks boundaries MapServer layer 8](https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_State_Parks_Features_WGS84WM/MapServer/8) | api | Primary candidate; no public agency import; private staging tracked separately |
| KY | parks | [Kentucky State Parks visitor features MapServer](https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_State_Parks_Features_WGS84WM/MapServer) | api | Supplemental candidate; no public agency import |
| KY | parks | [OpenStreetMap Kentucky outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/kentucky-latest.osm.pbf) | download | OSM fallback; no public agency import |
| KY | forestry | [Kentucky State Forests MapServer](https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_StateForests_WGS84WM/MapServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| KY | forestry | [OpenStreetMap Kentucky outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/kentucky-latest.osm.pbf) | download | OSM fallback; no public agency import |
| LA | parks | [Louisiana State Parks Boundary File FeatureServer layer 4 (2021 snapshot)](https://services6.arcgis.com/1fGAZVgZnPx4zcNH/ArcGIS/rest/services/Fidelis/FeatureServer/4) | api | Primary candidate; no public agency import; private staging tracked separately |
| LA | parks | [OpenStreetMap Louisiana outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/louisiana-latest.osm.pbf) | download | OSM fallback; no public agency import |
| LA | forestry | [USFS Science Tree Canopy Cover 2025.6 (2025 annual data)](https://data.fs.usda.gov/geodata/rastergateway/treecanopycover/) | download | Primary candidate; no public agency import; private staging tracked separately |
| LA | forestry | [OpenStreetMap Louisiana outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/louisiana-latest.osm.pbf) | download | OSM fallback; no public agency import |
| ME | parks | [Maine BPL Properties Points for MaineFoliage layer 0](https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/BPL_Properties_Points_for_MaineFoliage/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| ME | parks | [OpenStreetMap Maine outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/maine-latest.osm.pbf) | download | OSM fallback; no public agency import |
| ME | forestry | [Maine Conserved Lands layer 0 (BPL public reserved lands)](https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/Maine_Conserved_Lands_All/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| ME | forestry | [OpenStreetMap Maine outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/maine-latest.osm.pbf) | download | OSM fallback; no public agency import |
| MD | parks | [Maryland DNR Campsites MapServer layer 0](https://dnr.geodata.md.gov/dnrdata/rest/services/AIMS/AIMStrailDataRO/MapServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| MD | parks | [Maryland DNR Owned Properties MapServer layer 14](https://dnr.geodata.md.gov/dnrdata/rest/services/AIMS/AIMStrailDataRO/MapServer/14) | api | Supplemental candidate; no public agency import |
| MD | forestry | [Maryland DNR Trail Atlas 2016 MapServer](https://dnr.geodata.md.gov/dnrdata/rest/services/AIMS/Trail_Atlas_2016/MapServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| MD | forestry | [OpenStreetMap Maryland outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/maryland-latest.osm.pbf) | download | OSM fallback; no public agency import |
| MA | parks | [MassGIS DCR Roads & Trails download](https://www.mass.gov/info-details/massgis-data-department-of-conservation-and-recreation-roads-trails) | download | Public dated derivative included; exact source receipt and selection in state manifest |
| MA | forestry | [MassGIS Protected and Recreational OpenSpace downloads/services](https://www.mass.gov/info-details/massgis-data-protected-and-recreational-openspace) | download | Public dated derivative included; exact source receipt and selection in state manifest |
| MA | forestry | [MassGIS DCR Roads & Trails download](https://www.mass.gov/info-details/massgis-data-department-of-conservation-and-recreation-roads-trails) | download | Supplemental candidate; no public agency import |
| MA | forestry | [OpenStreetMap Massachusetts outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/massachusetts-latest.osm.pbf) | download | OSM fallback; no public agency import |
| MI | parks | [Michigan DNR Michigan Trails - Find Your Path downloads](https://www.michigan.gov/dnr/places/state-trails) | download | Public dated derivative included; exact source receipt and selection in state manifest |
| MI | forestry | [Michigan DNR Michigan Trails - Find Your Path downloads](https://www.michigan.gov/dnr/places/state-trails) | download | Public dated derivative included; exact source receipt and selection in state manifest |
| MN | parks | [Minnesota DNR State Park Trails and Roads dataset](https://gisdata.mn.gov/dataset/trans-state-park-trails-roads) | download | Public dated derivative included; exact source receipt and selection in state manifest |
| MN | forestry | [Minnesota DNR Forest Stand Inventory dataset](https://gisdata.mn.gov/dataset/biota-dnr-forest-stand-inventory) | download | Primary candidate; no public agency import; private staging tracked separately |
| MN | forestry | [Minnesota State Forest Campgrounds GIS download](https://gisdata.mn.gov/dataset/struc-state-forest-campgrounds) | download | Supplemental candidate; no public agency import |
| MN | forestry | [OpenStreetMap Minnesota outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/minnesota-latest.osm.pbf) | download | OSM fallback; no public agency import |
| MS | parks | [Mississippi MDWFP PARKS MapServer](https://arcgis.mdwfp.com/arcgis/rest/services/Public/PARKS/MapServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| MS | forestry | [Mississippi Forestry Commission ArcGIS Portal](https://arcsrv.mfc.ms.gov/portal/sharing/rest/portals/self) | catalog | Primary candidate; no public agency import; private staging tracked separately |
| MS | forestry | [OpenStreetMap Mississippi outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/mississippi-latest.osm.pbf) | download | OSM fallback; no public agency import |
| MO | parks | [Missouri State Parks Boundaries FeatureServer](https://gis.dnr.mo.gov/server/rest/services/parks/Missouri_State_Parks_Boundaries/FeatureServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| MO | parks | [Missouri State Parks Trail Routes MapServer layer 3](https://gis.dnr.mo.gov/server/rest/services/sphs_trails/SPHS_trails_public/MapServer/3) | api | Supplemental candidate; no public agency import |
| MO | parks | [OpenStreetMap Missouri outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/missouri-latest.osm.pbf) | download | OSM fallback; no public agency import |
| MO | forestry | [Missouri Department of Conservation Conservation Area Boundaries layer 5](https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/MDC_Administrative_Areas/FeatureServer/5) | api | Primary candidate; no public agency import; private staging tracked separately |
| MO | forestry | [Missouri Department of Conservation Camping Sites MapServer layer 0](https://gisblue.mdc.mo.gov/arcgis/rest/services/Infrastructure/Camping/MapServer/0) | api | Supplemental candidate; no public agency import |
| MO | forestry | [OpenStreetMap Missouri outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/missouri-latest.osm.pbf) | download | OSM fallback; no public agency import |
| MT | parks | [Montana FWP State Parks land boundary MapServer layer 5](https://fwp-gis.mt.gov/arcgis/rest/services/fwplnd/fwpLands/MapServer/5) | api | Primary candidate; no public agency import; private staging tracked separately |
| MT | parks | [OpenStreetMap Montana outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/montana-latest.osm.pbf) | download | OSM fallback; no public agency import |
| MT | forestry | [Montana DNRC Trust Lands Public Access layer 1](https://gis.dnrc.mt.gov/arcgis/rest/services/TLMD/AccessMap/FeatureServer/1) | api | Primary candidate; no public agency import; private staging tracked separately |
| MT | forestry | [OpenStreetMap Montana outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/montana-latest.osm.pbf) | download | OSM fallback; no public agency import |
| NE | parks | [Nebraska Game and Parks Park_Areas FeatureServer](https://services5.arcgis.com/IOshH1zLrIieqrNk/arcgis/rest/services/Park_Areas/FeatureServer) | api | Public dated derivative included; exact source receipt and selection in state manifest |
| NE | forestry | [High-resolution land cover of Nebraska (2014), RDS-2019-0038](https://www.fs.usda.gov/rds/archive/catalog/RDS-2019-0038) | download | Primary candidate; no public agency import; private staging tracked separately |
| NE | forestry | [OpenStreetMap Nebraska outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/nebraska-latest.osm.pbf) | download | OSM fallback; no public agency import |
| NV | parks | [Nevada Division of State Parks NDSP State Park Boundaries FeatureServer](https://arcgis.water.nv.gov/arcgis/rest/services/Hosted/NDSP_State_Park_Bondaries/FeatureServer/1) | api | Primary candidate; no public agency import; private staging tracked separately |
| NV | parks | [Nevada SCORP nonmotorized trails master FeatureServer](https://arcgis.water.nv.gov/arcgis/rest/services/Hosted/SCORP_NonMoto_Trails_Master/FeatureServer/0) | api | Supplemental candidate; no public agency import |
| NV | forestry | [Nevada Division of Forestry GIS Services and NNRFIP](https://forestry.nv.gov/gis-mapping) | catalog | Primary candidate; no public agency import; private staging tracked separately |
| NV | forestry | [OpenStreetMap Nevada outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/nevada-latest.osm.pbf) | download | OSM fallback; no public agency import |
| NH | parks | [NH State Parks and State Forests FeatureServer layer 4](https://maps.dot.nh.gov/arcgis_server/rest/services/Boundaries/NHDOT_BOUNDARIES_Parks_Forest/FeatureServer/4) | api | Primary candidate; no public agency import; private staging tracked separately |
| NH | parks | [New Hampshire Recreational Trails and Trailhead-Parking FeatureServer](https://services8.arcgis.com/hg1B9Egwk1I5p300/ArcGIS/rest/services/NH_Recreational_Trails/FeatureServer) | api | Supplemental candidate; no public agency import |
| NH | parks | [OpenStreetMap New Hampshire outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/new-hampshire-latest.osm.pbf) | download | OSM fallback; no public agency import |
| NH | forestry | [NH State Parks and State Forests FeatureServer layer 4](https://maps.dot.nh.gov/arcgis_server/rest/services/Boundaries/NHDOT_BOUNDARIES_Parks_Forest/FeatureServer/4) | api | Primary candidate; no public agency import; private staging tracked separately |
| NH | forestry | [New Hampshire Recreational Trails and Trailhead-Parking FeatureServer](https://services8.arcgis.com/hg1B9Egwk1I5p300/ArcGIS/rest/services/NH_Recreational_Trails/FeatureServer) | api | Supplemental candidate; no public agency import |
| NH | forestry | [OpenStreetMap New Hampshire outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/new-hampshire-latest.osm.pbf) | download | OSM fallback; no public agency import |
| NJ | parks | [NJ State Park Service Parks and Forests trail system download](https://www.nj.gov/dep/gis/digidownload/zips/OpenData/Land_use_trails.zip) | download | Primary candidate; no public agency import; private staging tracked separately |
| NJ | forestry | [NJDEP Open Space MapServer layer 65](https://mapsdep.nj.gov/arcgis/rest/services/Features/Land/MapServer/65) | api | Primary candidate; no public agency import; private staging tracked separately |
| NJ | forestry | [NJDEP State Park trails and open-space points MapServer](https://mapsdep.nj.gov/arcgis/rest/services/Applications/DEP_Trails/MapServer) | api | Supplemental candidate; no public agency import |
| NJ | forestry | [OpenStreetMap New Jersey outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/new-jersey-latest.osm.pbf) | download | OSM fallback; no public agency import |
| NM | parks | [New Mexico State Parks RGIS boundary layer (34 polygons; 2023 edits)](https://nhnm-gisweb.unm.edu/arcgis/rest/services/NMEDB/NM_State_Parks/MapServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| NM | parks | [OpenStreetMap New Mexico outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/new-mexico-latest.osm.pbf) | download | OSM fallback; no public agency import |
| NM | forestry | [New Mexico Forestry Division GIS and Maps](https://www.emnrd.nm.gov/sfd/gis-and-maps/) | catalog | Primary candidate; no public agency import; private staging tracked separately |
| NM | forestry | [OpenStreetMap New Mexico outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/new-mexico-latest.osm.pbf) | download | OSM fallback; no public agency import |
| NC | parks | [North Carolina State Parks Points layer 0](https://services6.arcgis.com/nRIB86xC7kq6wavB/arcgis/rest/services/NC_State_Parks_Points/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| NC | parks | [OpenStreetMap North Carolina outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/north-carolina-latest.osm.pbf) | download | OSM fallback; no public agency import |
| NC | forestry | [NC Forest Action Plan 2020 GIS data layers](https://www.ncmhtd.com/ncfs/ncfap/) | download | Primary candidate; no public agency import; private staging tracked separately |
| NC | forestry | [OpenStreetMap North Carolina outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/north-carolina-latest.osm.pbf) | download | OSM fallback; no public agency import |
| ND | parks | [North Dakota GIS Hub State Parks FeatureServer layer 0](https://services1.arcgis.com/GOcSXpzwBHyk2nog/ArcGIS/rest/services/NDGISHUB_State_Parks/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| ND | parks | [OpenStreetMap North Dakota outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/north-dakota-latest.osm.pbf) | download | OSM fallback; no public agency import |
| ND | forestry | [North Dakota State Forest MapServer layer](https://gis.dmr.nd.gov/dmrpublicservices/rest/services/State_Forest/MapServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| ND | forestry | [OpenStreetMap North Dakota outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/north-dakota-latest.osm.pbf) | download | OSM fallback; no public agency import |
| OH | parks | [ODNR Trails, Waypoints, and POI MapServer](https://gis2.ohiodnr.gov/ArcGIS/rest/services/OIT_Services/Trails_WayPoints_POI/MapServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| OH | forestry | [ODNR Trails, Waypoints, and POI MapServer](https://gis2.ohiodnr.gov/ArcGIS/rest/services/OIT_Services/Trails_WayPoints_POI/MapServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| OK | parks | [Oklahoma DOT State Parks KML (52 location placemarks; 2018)](https://www.odot.org/maps/state/KML/stateparks.kml) | download | Primary candidate; no public agency import; private staging tracked separately |
| OK | parks | [OpenStreetMap Oklahoma outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/oklahoma-latest.osm.pbf) | download | OSM fallback; no public agency import |
| OK | forestry | [Oklahoma Forestry Services EcoInventory FeatureServer layer 68](https://services3.arcgis.com/yrIZ0Nv0mSGTWJsH/arcgis/rest/services/Eco_Inventory_view/FeatureServer/68) | api | Primary candidate; no public agency import; private staging tracked separately |
| OK | forestry | [OpenStreetMap Oklahoma outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/oklahoma-latest.osm.pbf) | download | OSM fallback; no public agency import |
| OR | parks | [Oregon State Parks FeatureServer layer 0](https://maps.prd.state.or.us/arcgis/rest/services/Land_ownership/Oregon_State_Parks/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| OR | parks | [OpenStreetMap Oregon outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/oregon-latest.osm.pbf) | download | OSM fallback; no public agency import |
| OR | forestry | [Oregon Department of Forestry Forestry Managed Lands dataset](https://geohub.oregon.gov/datasets/oregon-geo::forestry-managed-lands) | download | Primary candidate; no public agency import; private staging tracked separately |
| OR | forestry | [OpenStreetMap Oregon outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/oregon-latest.osm.pbf) | download | OSM fallback; no public agency import |
| PA | parks | [PA DCNR State Parks hiking trails layer 4](https://www.gis.dcnr.pa.gov/agsprod/rest/services/Parks/State_Parks/MapServer/4) | api | Primary candidate; no public agency import; private staging tracked separately |
| PA | parks | [PA DCNR State Park Boundaries MapServer layer 9](https://www.gis.dcnr.pa.gov/agsprod/rest/services/Parks/State_Parks/MapServer/9) | api | Supplemental candidate; no public agency import |
| PA | forestry | [PA DCNR Bureau of Forestry State_Forests MapServer](https://www.gis.dcnr.pa.gov/agsprod/rest/services/BOF/State_Forests/MapServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| RI | parks | [RIDEM Conserved_Land_in_RI_v2 MapServer state conservation land layer](https://risegis.ri.gov/hosting/rest/services/RIDEM/Conserved_Land_in_RI_v2/MapServer/3) | api | Primary candidate; no public agency import; private staging tracked separately |
| RI | parks | [RIDEM Outdoor Recreation Map FeatureServer](https://risegis.ri.gov/hosting/rest/services/RIDEM/Outdoor_Recreation_Map_v4/FeatureServer) | api | Supplemental candidate; no public agency import |
| RI | parks | [OpenStreetMap Rhode Island outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/rhode-island-latest.osm.pbf) | download | OSM fallback; no public agency import |
| RI | forestry | [RIDEM Conserved_Land_in_RI_v2 MapServer state conservation land layer](https://risegis.ri.gov/hosting/rest/services/RIDEM/Conserved_Land_in_RI_v2/MapServer/3) | api | Primary candidate; no public agency import; private staging tracked separately |
| RI | forestry | [RIDEM Outdoor Recreation Map FeatureServer](https://risegis.ri.gov/hosting/rest/services/RIDEM/Outdoor_Recreation_Map_v4/FeatureServer) | api | Supplemental candidate; no public agency import |
| RI | forestry | [OpenStreetMap Rhode Island outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/rhode-island-latest.osm.pbf) | download | OSM fallback; no public agency import |
| SC | parks | [South Carolina State Parks FeatureServer layer](https://services.arcgis.com/ycIuRaoIC4UuCDAS/ArcGIS/rest/services/SC_State_Parks/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| SC | parks | [OpenStreetMap South Carolina outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/south-carolina-latest.osm.pbf) | download | OSM fallback; no public agency import |
| SC | forestry | [SCDOT Government Property MapServer layer 5 (SCFC forest subset)](https://gis.scdot.org/hosting/rest/services/Government_Property_RO/MapServer/5) | api | Primary candidate; no public agency import; private staging tracked separately |
| SC | forestry | [OpenStreetMap South Carolina outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/south-carolina-latest.osm.pbf) | download | OSM fallback; no public agency import |
| SD | parks | [South Dakota GFP Recreational Trails MapServer layer 0](https://ert.gfp.sd.gov/arcgis/rest/services/SD_Public/RecreationalTrails/MapServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| SD | forestry | [South Dakota GIS Portal](https://sdgis.sd.gov/portal/home/) | catalog | Primary candidate; no public agency import; private staging tracked separately |
| SD | forestry | [South Dakota DANR Forestry](https://danr.sd.gov/Conservation/Forestry/default.aspx) | info | Supplemental candidate; no public agency import |
| SD | forestry | [OpenStreetMap South Dakota outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/south-dakota-latest.osm.pbf) | download | OSM fallback; no public agency import |
| TN | parks | [Tennessee Natural Areas and State Parks FeatureServer](https://services7.arcgis.com/lpTX3280urZ21frb/ArcGIS/rest/services/TN_Natural_Areas_and_State_Parks_WFL1/FeatureServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| TN | parks | [TDEC State Park Boundaries FeatureServer layer 0](https://services5.arcgis.com/bPacKTm9cauMXVfn/arcgis/rest/services/TN_State_Parks_Boundaries/FeatureServer/0) | api | Supplemental candidate; no public agency import |
| TN | forestry | [Tennessee Division of Forestry State Forest Boundaries layer 0](https://services.arcgis.com/lvPBAGXeSupVUvx2/ArcGIS/rest/services/Tennessee_State_Forest_Boundaries/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| TN | forestry | [Tennessee Statewide Trails Points Public layer 0](https://services1.arcgis.com/YuVBSS7Y1of2Qud1/arcgis/rest/services/Tennessee_Statewide_Trails_Points_Public/FeatureServer/0) | api | Supplemental candidate; no public agency import |
| TN | forestry | [OpenStreetMap Tennessee outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/tennessee-latest.osm.pbf) | download | OSM fallback; no public agency import |
| TX | parks | [Texas State Parks Trails MapServer layer 0](https://tpwd.texas.gov/arcgis/rest/services/Parks/TexasStateParksTrails/MapServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| TX | parks | [Texas Parks and Wildlife State Park Boundaries ZIP](https://tpwd.texas.gov/gis/data/baselayers/state-park-boundaries-zip/view) | download | Supplemental candidate; no public agency import |
| TX | forestry | [Texas A&M Forest Service Public Lands layer 4: state forest tracts](https://services5.arcgis.com/ELI1iJkCzTIagHkp/arcgis/rest/services/Public_Lands/FeatureServer/4) | api | Primary candidate; no public agency import; private staging tracked separately |
| TX | forestry | [OpenStreetMap Texas outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/texas-latest.osm.pbf) | download | OSM fallback; no public agency import |
| UT | parks | [Utah State Park Management Areas layer 0](https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Utah_State_Park_Management_Areas/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| UT | parks | [Utah Trails and Pathways FeatureServer layer 0](https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/TrailsAndPathways/FeatureServer/0) | api | Supplemental candidate; no public agency import |
| UT | parks | [OpenStreetMap Utah outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/utah-latest.osm.pbf) | download | OSM fallback; no public agency import |
| UT | forestry | [Utah FFSL Sovereign Lands view layer 0](https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Utah_Sovereign_Lands_view/FeatureServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| UT | forestry | [Utah Trails and Pathways FeatureServer layer 0](https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/TrailsAndPathways/FeatureServer/0) | api | Supplemental candidate; no public agency import |
| UT | forestry | [OpenStreetMap Utah outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/utah-latest.osm.pbf) | download | OSM fallback; no public agency import |
| VT | parks | [Vermont ANR Atlas FPR MapServer](https://anrmaps.vermont.gov/arcgis/rest/services/map_services/MAP_ANR_ANRATLASFPR_WM_NOCACHE/MapServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| VT | forestry | [Vermont ANR Atlas FPR MapServer](https://anrmaps.vermont.gov/arcgis/rest/services/map_services/MAP_ANR_ANRATLASFPR_WM_NOCACHE/MapServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| VA | parks | [Virginia State Parks SP_Trails FeatureServer layer 0](https://services1.arcgis.com/PxUNqSbaWFvFgHnJ/ArcGIS/rest/services/SP_Trails/FeatureServer/0) | api | Public dated derivative included; exact source receipt and selection in state manifest |
| VA | parks | [Virginia State Parks SP Boundary FeatureServer layer 3](https://services1.arcgis.com/PxUNqSbaWFvFgHnJ/ArcGIS/rest/services/SP_Boundary/FeatureServer/3) | api | Supplemental candidate; no public agency import |
| VA | parks | [Virginia State Parks SP_Trails FeatureServer layer 0](https://services1.arcgis.com/PxUNqSbaWFvFgHnJ/ArcGIS/rest/services/SP_Trails/FeatureServer/0) | api | Supplemental candidate; no public agency import |
| VA | parks | [Virginia State Trails FeatureServer layer 0](https://services1.arcgis.com/PxUNqSbaWFvFgHnJ/ArcGIS/rest/services/Virginia_State_Trails/FeatureServer/0) | api | Supplemental candidate; no public agency import |
| VA | parks | [OpenStreetMap Virginia outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/virginia-latest.osm.pbf) | download | OSM fallback; no public agency import |
| VA | forestry | [Virginia Department of Forestry State Forest map downloads](https://www.dof.virginia.gov/education-and-recreation/state-forests/) | download | Primary candidate; no public agency import; private staging tracked separately |
| VA | forestry | [Virginia State Trails FeatureServer layer 0](https://services1.arcgis.com/PxUNqSbaWFvFgHnJ/ArcGIS/rest/services/Virginia_State_Trails/FeatureServer/0) | api | Supplemental candidate; no public agency import |
| VA | forestry | [OpenStreetMap Virginia outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/virginia-latest.osm.pbf) | download | OSM fallback; no public agency import |
| WA | parks | [Washington State Parks ParkBoundaries FeatureServer layer 2](https://services5.arcgis.com/4LKAHwqnBooVDUlX/arcgis/rest/services/ParkBoundaries/FeatureServer/2) | api | Primary candidate; no public agency import; private staging tracked separately |
| WA | parks | [Washington State Parks Open Campsites and Open Trails FeatureServer](https://services2.arcgis.com/6Miy5NqQWjMYTGFY/arcgis/rest/services/WA_State_Parks_WFL1/FeatureServer) | api | Supplemental candidate; no public agency import |
| WA | parks | [OpenStreetMap Washington outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/washington-latest.osm.pbf) | download | OSM fallback; no public agency import |
| WA | forestry | [Washington DNR Recreation Sites MapServer](https://gis.dnr.wa.gov/site2/rest/services/Recreation/DNR_Recreation_Sites/MapServer) | api | Primary candidate; no public agency import; private staging tracked separately |
| WV | parks | [West Virginia State_Parks public lands MapServer layer](https://gis.transportation.wv.gov/arcgis/rest/services/Boundaries/MapServer/10) | api | Primary candidate; no public agency import; private staging tracked separately |
| WV | parks | [West Virginia publicly accessible recreational trails MapServer](https://services.wvgis.wvu.edu/arcgis/rest/services/Applications/trails_trailService/MapServer) | api | Supplemental candidate; no public agency import |
| WV | parks | [OpenStreetMap West Virginia outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/west-virginia-latest.osm.pbf) | download | OSM fallback; no public agency import |
| WV | forestry | [West Virginia Division of Forestry State Forest dataset downloads](https://wvgis.wvu.edu/data/dataset.php?ID=58) | download | Primary candidate; no public agency import; private staging tracked separately |
| WV | forestry | [West Virginia publicly accessible recreational trails MapServer](https://services.wvgis.wvu.edu/arcgis/rest/services/Applications/trails_trailService/MapServer) | api | Supplemental candidate; no public agency import |
| WV | forestry | [OpenStreetMap West Virginia outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/west-virginia-latest.osm.pbf) | download | OSM fallback; no public agency import |
| WI | parks | [Wisconsin State Trails MapServer layer 0](https://dnrmaps.wi.gov/arcgis/rest/services/PR_TRAILS/PR_STATE_TRAIL_DISS_WTM_Ext/MapServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| WI | parks | [Wisconsin DNR WSPS Properties MapServer layer 0](https://dnrmaps.wi.gov/arcgis2/rest/services/PR_Recreation/PR_WSPS_Property_Info_WTM_Ext/MapServer/0) | api | Supplemental candidate; no public agency import |
| WI | forestry | [Wisconsin DNR WSPS Properties MapServer layer 0](https://dnrmaps.wi.gov/arcgis2/rest/services/PR_Recreation/PR_WSPS_Property_Info_WTM_Ext/MapServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| WI | forestry | [OpenStreetMap Wisconsin outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/wisconsin-latest.osm.pbf) | download | OSM fallback; no public agency import |
| WY | parks | [Wyoming State Parks WyoStateParks MapServer layer 26](https://gis2.statelands.wyo.gov/arcgis/rest/services/WyoStateParks/MapServer/26) | api | Primary candidate; no public agency import; private staging tracked separately |
| WY | parks | [OpenStreetMap Wyoming outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/wyoming-latest.osm.pbf) | download | OSM fallback; no public agency import |
| WY | forestry | [Wyoming OSLI StateOwnership MapServer layer 0 (active surface ownership)](https://gis2.statelands.wyo.gov/arcgis/rest/services/StateOwnership/MapServer/0) | api | Primary candidate; no public agency import; private staging tracked separately |
| WY | forestry | [OpenStreetMap Wyoming outdoor routes and POIs state extract](https://download.geofabrik.de/north-america/us/wyoming-latest.osm.pbf) | download | OSM fallback; no public agency import |

## Selected AR/ID/SD agency layer plan

These rows repeat the selected plan for visibility. No selected agency layer is in a shipped state package. The [package tracker](STATE_DATA_PACKAGE_TRACKER.md#planned-arkansas-idaho-and-south-dakota-agency-inputs) has filters, counts, dates, and gates.

| State / manager | Exact dataset | Planned POI-system use | Rights and gate |
| --- | --- | --- | --- |
| AR / State Parks | [StateParks layer 0](https://gis.ardot.gov/hosting/rest/services/Hosted/StateParks/FeatureServer/0) | Park polygons; retain `name`, `park_num`, and boundary provenance. | Candidate; item has no affirmative redistribution license. Confirm offline/public copying with publisher. |
| AR / State Parks and Natural Heritage | [Arkansas Trails layer 22](https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Environment/FeatureServer/22) | Partner trail lines; retain `data_source`, `begin_date`, `edit_date`, and park/manager match. | Candidate; confirm both steward/host reuse terms and route currency. |
| AR / State Parks | [Outdoor Recreational Facilities layer 24](https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Location/FeatureServer/24) | Point facilities filtered to `owner='ASP'`; retain `last_verified_date` and category/type. | **Rights supported:** [publisher metadata says no access/use limitations](https://gis.arkansas.gov/metadata/HTML/asdi.location.OUTDOOR_RECREATIONAL_FACILITIES_export.html). Hold public import until current point locations/status and duplicates are reconciled with Parks. |
| AR / Forestry Division | [Outdoor Recreational Facilities layer 24](https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Location/FeatureServer/24) | Filter `owner='AFC'`; 45 Poison Springs campsites and two boat ramps. | **Rights supported:** same [unrestricted-use dataset metadata](https://gis.arkansas.gov/metadata/HTML/asdi.location.OUTDOOR_RECREATIONAL_FACILITIES_export.html). Hold public import until sites, permits, and forest coverage are confirmed. |
| AR / community supplement | [Arkansas OSM state extract](https://download.geofabrik.de/north-america/us/arkansas-latest.osm.pbf) | Filter routes, campgrounds, trailheads, and visitor POIs; retain OSM provenance and check against land manager. | Planned fallback under [ODbL](https://www.openstreetmap.org/copyright); attribution and database share-alike obligations apply. |
| ID / Parks and Recreation | [IDPR Parks and Facilities layer 0](https://services1.arcgis.com/CNPdEkvnGl65jCX8/arcgis/rest/services/IDPR_Parks_and_Facilities/FeatureServer/0) | Park/trail discovery points; exclude generic welcome marker. | Candidate; reconcile current park list and acquire authoritative boundaries and reuse terms. |
| ID / Parks and Recreation | [Idaho Recreation Trails routes layer 128](https://services1.arcgis.com/CNPdEkvnGl65jCX8/arcgis/rest/services/Idaho_Recreation_Trails/FeatureServer/128) | Lines with manager, route type, and status filters; not all IDPR-operated. | Candidate; noncommercial and attribution terms fit reference use, but public offline redistribution needs confirmation. |
| ID / Parks and Recreation | [Idaho Recreation Trails POIs layer 130](https://services1.arcgis.com/CNPdEkvnGl65jCX8/arcgis/rest/services/Idaho_Recreation_Trails/FeatureServer/130) | Visitor POIs as a separate feed; manager and type filters. | Candidate; same item terms and offline redistribution gate as routes; audit fields before import. |
| ID / Parks and Recreation | [Emergency Route Closures layer 127](https://services1.arcgis.com/CNPdEkvnGl65jCX8/arcgis/rest/services/Idaho_Recreation_Trails/FeatureServer/127) | Time-sensitive closure overlay; retain event dates and refresh independently. | Candidate for refreshed feed; same rights gate. Never imply offline snapshot is live status. |
| ID / Parks and Recreation | [Area Restrictions layer 123](https://services1.arcgis.com/CNPdEkvnGl65jCX8/arcgis/rest/services/Idaho_Recreation_Trails/FeatureServer/123) | Restriction geometry and dates; keep distinct from route access. | Candidate for refreshed feed; same rights gate. Verify restriction authority and dates. |
| ID / Department of Lands | [State Surface Ownership layer 0](https://gis1.idl.idaho.gov/arcgis/rest/services/State_Ownership/FeatureServer/0) | Land polygons; select `OWNERTYPE` for IDL endowment and retain other state owners separately. | Candidate; public download/disclaimer does not expressly grant Git/offline redistribution. |
| ID / Department of Lands | [IDL Public Recreation feature layer 0](https://gis1.idl.idaho.gov/arcgis/rest/services/Portal/IDLPublicRecreation/MapServer/0) | Parking, trailhead, camping, and other point types; filter status. | Candidate; confirm IDL offline redistribution and current feature status. |
| ID / Department of Lands | [IDL Public Recreation travel layer 1](https://gis1.idl.idaho.gov/arcgis/rest/services/Portal/IDLPublicRecreation/MapServer/1) | Public travel lines; filter jurisdiction, trail type, and status. | Candidate; IDL Trails is a fallback comparison, not an automatic duplicate import. Confirm offline redistribution. |
| ID / Department of Lands | [IDL Public Recreation area layer 3](https://gis1.idl.idaho.gov/arcgis/rest/services/Portal/IDLPublicRecreation/MapServer/3) | Area polygons; classify access and restriction types before display. | Candidate; confirm IDL offline redistribution and current access. |
| ID / community supplement | [Idaho OSM state extract](https://download.geofabrik.de/north-america/us/idaho-latest.osm.pbf) | Filter routes, campgrounds, trailheads, and visitor POIs; retain OSM provenance and check against land manager. | Planned fallback under [ODbL](https://www.openstreetmap.org/copyright); attribution and database share-alike obligations apply. |
| SD / Game, Fish and Parks | [SD Parks and Rec Areas layer 1](https://ert.gfp.sd.gov/arcgis/rest/services/SD_Public/ReferenceLayers_LandStewardship/MapServer/1) | Park/recreation/nature/lakeside polygons, separated by `Class`. | Candidate; service item has empty `licenseInfo`. Confirm public offline redistribution and park-directory match. |
| SD / Game, Fish and Parks | [Recreational Trails layer 0](https://ert.gfp.sd.gov/arcgis/rest/services/SD_Public/RecreationalTrails/MapServer/0) | Hiking and paddle lines, classified by activity. | Candidate; service item has empty `licenseInfo`. Confirm public offline redistribution and current routes. |
| SD / DANR Forestry | [DANR Forestry program reference](https://danr.sd.gov/Conservation/Forestry/default.aspx) | No agency-managed public-land or visitor dataset selected. Keep existing federal/PAD-US context under its own steward. | Source gap; do not misattribute other state or federal layers to DANR. |
| SD / community supplement | [South Dakota OSM state extract](https://download.geofabrik.de/north-america/us/south-dakota-latest.osm.pbf) | Filter routes, campgrounds, trailheads, and visitor POIs; retain OSM provenance and check against land manager. | Planned fallback under [ODbL](https://www.openstreetmap.org/copyright); attribution and database share-alike obligations apply. |

## New York OPRHP candidates

These sources are not bundled. The [New York audit](NYS_AGENCY_SOURCE_COVERAGE_AUDIT.md) records coverage, vintage, and redistribution concerns.

| Agency | Dataset | Direct source | Canonical role to assess |
| --- | --- | --- | --- |
| NYS OPRHP | Park polygons | [Park polygons](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NYS_Park_Polygons/FeatureServer/0) | land-unit |
| NYS OPRHP | Park trails | [Park trails](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Parks_Trails/FeatureServer/0) | trail |
| NYS OPRHP | Park facilities | [Park facilities](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Park_Facilities/FeatureServer) | place candidate |
| NYS OPRHP | Park camping | [Park camping](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Parks_Camping/FeatureServer) | place candidate |
| NYS OPRHP | Park points public view | [Park points public view](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Park_Points_%28public_view%29/FeatureServer) | place candidate |
| NYS OPRHP | Temporary trail closures | [Temporary trail closures](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Parks_Temporary_Trail_Closure/FeatureServer) | condition/restriction |
| NYS OPRHP | Beach status | [Beach status](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/NY_State_Parks_Beach_Status/FeatureServer) | condition |
| NYS OPRHP | 2025–26 snowmobile view | [2025–26 snowmobile view](https://services.arcgis.com/1xFZPtKn1wKC6POA/ArcGIS/rest/services/2025_2026_Snowmobile_Data_view/FeatureServer) | seasonal trail/condition |

## Other map and derived datasets

| Asset / source | Stage | POI-system status |
| --- | --- | --- |
| [World overview PMTiles manifest](../packages/map/src/assets/world-basemap.manifest.json) · [Protomaps source](https://build.protomaps.com/20260910.pmtiles) | Bundled OSM/Natural Earth map context | Cartographic POIs are not canonical place records. |
| [US/Canada regional PMTiles manifest](../packages/map/src/assets/us-canada-basemap.manifest.json) · [Protomaps source](https://build.protomaps.com/20260910.pmtiles) | Bundled OSM/Natural Earth map context | Cartographic POIs are not agency inventory. |
| [New York hike profiles manifest](../packages/map/src/assets/new-york-hikes.manifest.json) · [Mapzen terrain source](https://registry.opendata.aws/terrain-tiles/) | 0 public trail profiles after moving DEC derivatives to PrivateData | The preserved 5,289 DEC trail profiles are verified and packaged in the active private catalog, with their original provenance retained in the private archive. |
| [OpenFreeMap Liberty style manifest](../packages/map/src/assets/openfreemap-liberty.manifest.json) · [style source](https://tiles.openfreemap.org/styles/liberty) | Connected-only map style | Online cartography, not a validated POI inventory. |
| [New York Geofabrik OSM extract](https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf) | Proposed detailed-basemap/visitor-feature candidate | Not in a shipped state overlay; apply ODbL and tag-to-taxonomy mapping before separate POI use. |

## Maintenance rule

Regenerate this file with `node tools/build-dataset-tracker.mjs` when the registry, shipped package manifests/indexes, or selected three-state plan changes. Update the hard-coded OPRHP candidate list in that script when the New York audit changes. Historical validation snapshots retain their original observations; current decisions belong in the linked audits.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const registryPath = join(root, 'config/us-state-forestry-agencies.json');
const trackerPath = join(root, 'docs/STATE_DATA_PACKAGE_TRACKER.md');
const auditPath = join(root, 'docs/STATE_AGENCY_SOURCE_AUDIT.md');
const outdoorUseAuditPath = join(root, 'docs/STATE_AGENCY_OUTDOOR_USE_AUDIT.md');

// Each row is parks [name, url, kind, audit note], then forestry [name, url, kind, audit note].
// "catalog" means an official portal/tool identifies a useful dataset or layer, but a direct data endpoint may remain unresolved.
// "info" means an agency map or information page was found, but not a reusable statewide feed.
const sources = {
  AL: [
    ['Alabama State Parks and Forestry trails layer', 'https://conservationgis.alabama.gov/adcnrweb/rest/services/DCNRTrails/MapServer/0', 'api', 'Query layer is a polyline trail network with name, mileage, trail type/use (hiking, biking, horseback, ORV), tract, and State Park or Forest fields; GeoJSON is supported. It is a usable route source, but does not supply campsite/amenity points, current closures, permission, or published refresh/terms.'],
    ['Alabama Forestry Commission StateLandTrail FeatureServer', 'https://gis.forestry.alabama.gov/arcgis/rest/services/Hosted/StateLandTrail/FeatureServer/0', 'api', 'Query layer is a line feature service with trail/land-management project attributes, year, type, ownership, name, and GIS length. Its coded types mix trails with operational lines (for example BMP/building/cemetery-related records); filter and validate each feature before treating it as a visitor route.'],
  ],
  AK: [
    ['Alaska DPOR Park_Boundary_Facility FeatureServer', 'https://arcgis.dnr.alaska.gov/arcgis/rest/services/DPOR/Park_Boundary_Facility/FeatureServer', 'api', 'Direct service includes park facilities, trails, and park boundaries; boundaries are management representations, not survey lines.'],
    ['Alaska Division of Forestry State Forest Boundary layer', 'https://services1.arcgis.com/7HDiw78fcUiM2BWn/ArcGIS/rest/services/State_Forest_Boundary_Public_View_2/FeatureServer/0', 'api', 'Direct agency forest boundary feature layer; validate proposed boundaries and access separately.'],
  ],
  AZ: [
    ['Arizona Statewide Trails 2022 FeatureServer', 'https://services7.arcgis.com/EQeZILY2rwa3o0JM/arcgis/rest/services/2022_11_22_Statewide_Trails/FeatureServer/0', 'api', 'Direct feature layer from the ASPT-attributed statewide trail compilation; source item dates to 2022 and aggregates many managers, so it is not real-time.'],
    ['Arizona DFFM GIS Open Data / FITS', 'https://gis-dffm.hub.arcgis.com/', 'catalog', 'Agency GIS hub is documented as the public source for DFFM spatial data and Forestry Information Tracking System; select and validate datasets there.'],
  ],
  AR: [
    ['Arkansas State Parks hosted StateParks FeatureServer layer', 'https://gis.ardot.gov/hosting/rest/services/Hosted/StateParks/FeatureServer/0', 'api', 'Direct public feature layer attributed to Arkansas State Parks; check currentness and terms.'],
    ['Arkansas Spatial Data Infrastructure', 'https://gis.arkansas.gov/', 'catalog', 'Official statewide GIS catalog verified; an exact Forestry Division public layer was not located in this audit.'],
  ],
  CA: [
    ['California State Parks GIS downloads and live feature services', 'https://www.parks.ca.gov/?page_id=29682', 'download', 'Agency publishes park boundaries, routes, buildings, structures, day-use areas, campgrounds, parking, and entry points as downloads and live services; its page lists September 2026 vintages and monthly updates. Free distribution is allowed for personal/public-sector use with attribution; commercial use requires prior approval, and the agency disclaims accuracy, completeness, and timeliness warranties.'],
    ['CAL FIRE FRAP GIS mapping and data', 'https://www.fire.ca.gov/what-we-do/fire-resource-assessment-program/gis-mapping-and-data-analytics', 'catalog', 'Agency GIS/data catalog for forest assessment and fire/resource layers; select an individual dataset and check its vintage and lineage.'],
  ],
  CO: [
    ['Colorado State Parks Trails public-domain dataset', 'https://data.colorado.gov/Recreation/Trails-in-Colorado-State-Parks/qqnv-7jrr', 'download', 'Named Colorado Information Marketplace dataset of trails in Colorado State Parks, provided by DNR/CPW and exposed through download/API options. Useful route layer; verify trail-use fields, actual downloadable format, current coverage, and terms against dataset metadata before ingest.'],
    ['Colorado State Forest Service Data & Tools / GIS Open Data Portal', 'https://csfs.colostate.edu/data/', 'catalog', 'Official CSFS portal provides searchable, streamable forest and wildfire datasets; select and validate the relevant resource.'],
  ],
  CT: [
    ['Connecticut DEEP Property FeatureServer layer', 'https://services1.arcgis.com/FjPcSmEFuDYlIdKC/arcgis/rest/services/Connecticut_DEEP_Property/FeatureServer/0', 'api', 'Direct DEEP polygon layer includes parks, forests, wildlife and other DEEP properties; portal metadata reports a 2025 update and CC0.'],
    ['Connecticut DEEP Property FeatureServer layer', 'https://services1.arcgis.com/FjPcSmEFuDYlIdKC/arcgis/rest/services/Connecticut_DEEP_Property/FeatureServer/0', 'api', 'Same department-managed property layer covers State Forests and State Parks; it is a land layer, not a complete trail or operations feed.'],
  ],
  DE: [
    ['Delaware DNREC Play Outside recreation finder', 'https://playoutside.dnrec.delaware.gov/', 'info', 'Official public visitor map searches statewide campgrounds, pedestrian/biking/horse/beach-vehicle trails, boat ramps, restrooms, showers, picnic pavilions, fishing piers, and other facilities. Useful to a visitor; it prints maps/PDFs but this audit did not verify a reusable bulk API or download.'],
    ['Delaware Forest Service maps and public recreation information', 'https://agriculture.delaware.gov/forest-service/maps/', 'info', 'Official forest-service map page is the agency visitor source for state forest trails/access and site maps; maps are static/site-specific, not a verified statewide route/POI feed. Pair with the DNREC Play Outside visitor map for statewide facilities and confirm current forest rules.'],
  ],
  FL: [
    ['Florida DEP State Parks PARKS_BOUNDARIES MapServer', 'https://ca.dep.state.fl.us/arcgis/rest/services/OpenData/PARKS_BOUNDARIES/MapServer', 'api', 'Direct service contains boundaries, trails, roads, facilities, and management zones; boundary layer metadata says September 1, 2017, so freshness must be resolved.'],
    ['Florida State Forest boundaries (March 2025) ZIP', 'https://fgdl.org/zips/geospatial_data/current/state_forests_mar25.zip', 'download', 'Florida Forest Service boundary layer distributed by FGDL; map metadata identifies STATE_FORESTS_MAR25 as current through March 2025. Generalized administrative boundaries only: not surveyed/legal parcels and excludes internal features.'],
  ],
  GA: [
    ['Georgia DNR Managed Lands dataset metadata/download record', 'https://data.georgiaspatial.org/data/statewide/dnr/fed_lands/dnr20a.html', 'download', 'DNR-managed land polygons include parks; metadata says published 2019 at 1:24,000 and warns boundaries are not legal descriptions.'],
    ['Georgia Forestry Commission ArcGIS Portal', 'https://gfcarcserver.gfc.state.ga.us/portal/sharing/rest/portals/self', 'catalog', 'Official Commission ArcGIS portal verified; locate and assess public forest, fire, and recreation datasets within the catalog.'],
  ],
  HI: [
    ['Hawaii State Parks MapServer State Parks layer 16', 'https://geodata.hawaii.gov/arcgis/rest/services/Infrastructure/MapServer/16', 'api', 'Direct park boundary layer with agency attribution; source notes boundaries are general reference and may vary from surveyed parcels.'],
    ['Hawaii DOFAW OuterSpatial visitor map and downloadable maps', 'https://dlnr.hawaii.gov/dofaw/app/', 'info', 'Official DOFAW app/map provides public forest-reserve trail and access information and campsite/visitor information; offline map files are available for selected areas. A statewide reusable vector export was not documented, and users must check current alerts, closures, and access rules in agency notices.'],
  ],
  ID: [
    ['Idaho Parks & Recreation ORFI IDPR_Managed_Land layer 19', 'https://gis2.idaho.gov/arcgis/rest/services/ADM/Orfi/MapServer/19', 'api', 'Direct queryable layer in the IDPR-built Outdoor Recreation Facility Inventory. It is a recreation inventory/managed-land layer, not a certified parcel inventory; a layer-specific edit date was not located.'],
    ['Idaho IDL Forest Action Plan datasets MapServer', 'https://gis1.idl.idaho.gov/arcgis/rest/services/Portal/Forest_Action_Plan_Datasets/MapServer', 'api', 'Direct forestry service includes forest health, fire hazard, priority landscapes, and other assessment layers; downloadable geodatabase is linked in service metadata.'],
  ],
  IL: [
    ['Illinois DNR Properties MapServer layer 11', 'https://maps.dnr.illinois.gov/geoservices/rest/services/BaseLayers/MapServer/11', 'api', 'Direct IDNR property polygons identify agency-managed units, including parks/forests. Useful only for locating land units and their manager; not trails, campsite/amenity points, public access, or camping permission.'],
    ['Illinois DNR Properties MapServer layer 11', 'https://maps.dnr.illinois.gov/geoservices/rest/services/BaseLayers/MapServer/11', 'api', 'Shared IDNR property layer provides forest land context, not an operational Forestry recreation inventory or visitor POIs; confirm State Forest feature categories and access separately.'],
  ],
  IN: [
    ['Indiana DNR ManagedLands_DNR_Open FeatureServer layer', 'https://gisdata.in.gov/server/rest/services/Hosted/ManagedLands_DNR_Open/FeatureServer/0', 'api', 'Direct statewide queryable layer includes DNR STATE PARKS and DNR FORESTRY classes but is explicitly not comprehensive for all recreation areas.'],
    ['Indiana DNR ManagedLands_DNR_Open FeatureServer layer', 'https://gisdata.in.gov/server/rest/services/Hosted/ManagedLands_DNR_Open/FeatureServer/0', 'api', 'Shared land layer includes DNR State Parks and Forestry categories; its metadata warns the overall inventory is incomplete.'],
  ],
  IA: [
    ['Iowa DNR State_Parks MapServer', 'https://programs.iowadnr.gov/geospatial/rest/services/Recreation/State_Parks/MapServer', 'api', 'Direct DNR service exposes park recreation, trails, public-area boundaries, and amenities in queryable formats.'],
    ['Iowa DNR State_Parks recreation MapServer', 'https://programs.iowadnr.gov/geospatial/rest/services/Recreation/State_Parks/MapServer', 'api', 'Same DNR service used by the Parks record exposes statewide recreation/public-area boundaries, trails, and amenities. A forest-specific filter/coverage and source ownership must be checked; do not assume every forest tract or use is represented.'],
  ],
  KS: [
    ['KDWP Ecological Review Tool public lands layer', 'https://ert.ksoutdoors.gov/help', 'catalog', 'Selected layer: KDWPpubland_PADUS_merge6May24, updated 2024-02-22; merges PAD-US with KDWP-digitized known public-land boundaries and includes state parks. Useful statewide screening layer, not a park-only/legal boundary inventory; public help names the layer but does not expose its REST/download URL.'],
    ['High-resolution land cover of Kansas (2015), RDS-2017-0025', 'https://www.fs.usda.gov/rds/archive/catalog/RDS-2017-0025', 'download', 'Kansas Forest Service and USDA Forest Service partnership; downloadable 1-meter tree-cover mapping derived from 2015 aerial photography, including narrow windbreaks. High-resolution but now dated; tree cover is not ownership or a state-forest boundary layer.'],
  ],
  KY: [
    ['Kentucky State Parks boundaries MapServer layer 8', 'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_State_Parks_Features_WGS84WM/MapServer/8', 'api', 'Direct queryable state park polygon layer attributed to the Kentucky Department of Parks.'],
    ['Kentucky State Forests MapServer', 'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_StateForests_WGS84WM/MapServer', 'api', 'Direct queryable forest boundary layer attributed to the Kentucky Department of Forestry.'],
  ],
  LA: [
    ['Louisiana State Parks Boundary File FeatureServer layer 4 (2021 snapshot)', 'https://services6.arcgis.com/1fGAZVgZnPx4zcNH/ArcGIS/rest/services/Fidelis/FeatureServer/4', 'api', 'Closest exportable statewide park geometry located: 27 queryable polygons, data last edited 2021-07-29, hosted outside State Parks, and with no refresh schedule or redistribution/legal-boundary terms. The records include blank names and non-park facilities (for example, a WLF field office and boat storage), so filter and reconcile before use. LDWF’s State Parks MapServer currently has no layers to query or export. Treat this as a dated candidate, not a clean current inventory.'],
    ['USFS Science Tree Canopy Cover 2025.6 (2025 annual data)', 'https://data.fs.usda.gov/geodata/rastergateway/treecanopycover/', 'download', 'Strongest current statewide spatial forest-cover dataset found: USFS 30-meter annual tree-canopy cover through 2025, released in the 2025.6 product suite in 2026, with standard-error/uncertainty data. It covers all ownerships and measures canopy, not LDAF-managed tracts or forestry activity. For statewide forest-resource statistics, the USFS also publishes a 2025 Louisiana FIA annual snapshot; no public LDAF operational GIS inventory was found.'],
  ],
  ME: [
    ['Maine Bureau of Parks and Lands GIS/Mapping', 'https://www.maine.gov/dacf/parks/about/gis_mapping.shtml', 'catalog', 'Agency says its maintained GIS database covers all State Parks and Public Lands, including infrastructure, amenities, natural resources, roads, and trails, with field staff collecting updates. This is useful visitor-data evidence, but the page does not itself provide a public statewide download/API; obtain the exact layer/export and current access rules before using it as a POI feed.'],
    ['Maine GeoLibrary open geospatial catalog', 'https://mainegeolibrary-maine.hub.arcgis.com/', 'catalog', 'Official statewide portal hosts agency datasets; a Maine Forest Service-specific direct layer was not resolved in this audit.'],
  ],
  MD: [
    ['Maryland DNR Campsites MapServer layer 0', 'https://dnr.geodata.md.gov/dnrdata/rest/services/AIMS/AIMStrailDataRO/MapServer/0', 'api', 'Direct queryable/GeoJSON point layer of campsites on DNR-owned lands, with campsite name, land unit, ADA status, comments, and site/loop fields. Metadata explicitly says it omits some DNR camping amenities; verify current status and reservations/closures separately.'],
    ['Maryland DNR Trail Atlas 2016 MapServer', 'https://dnr.geodata.md.gov/dnrdata/rest/services/AIMS/Trail_Atlas_2016/MapServer', 'api', 'DNR service exposes land trails and visitor access/amenity layers for public lands and forests, but the service is explicitly branded 2016. It is a useful route/POI lead only until its layer edit dates, current coverage, and download terms are validated.'],
  ],
  MA: [
    ['MassGIS DCR Roads & Trails download', 'https://www.mass.gov/info-details/massgis-data-department-of-conservation-and-recreation-roads-trails', 'download', 'Direct DCR roads/trails download; page dates this layer to June 2015, so it is a candidate source rather than a currentness guarantee.'],
    ['MassGIS Protected and Recreational OpenSpace downloads/services', 'https://www.mass.gov/info-details/massgis-data-protected-and-recreational-openspace', 'download', 'Download/API options cover state/town forests and recreation lands but combine multiple owners; use ownership/steward fields to isolate DCR and inspect vintage.'],
  ],
  MI: [
    ['Michigan DNR Michigan Trails - Find Your Path downloads', 'https://www.michigan.gov/dnr/places/state-trails', 'download', 'Official DNR visitor source provides statewide trail maps and GIS downloads (including shapefile/GPX for available systems) and trail details/amenities. Download scope is trail-system-specific and includes multiple route classes; check each file’s steward, permitted uses, access status, and date.'],
    ['Michigan DNR Michigan Trails - Find Your Path downloads', 'https://www.michigan.gov/dnr/places/state-trails', 'download', 'DNR statewide trail portal includes state-forest recreation routes and downloadable trail files; not a complete inventory of forest campsites/facilities. Check route ownership and status by trail system.'],
  ],
  MN: [
    ['Minnesota DNR State Park Trails and Roads dataset', 'https://gisdata.mn.gov/dataset/trans-state-park-trails-roads', 'download', 'Named DNR trail/road dataset distributed through Minnesota Geospatial Commons; check source metadata, license, and coverage.'],
    ['Minnesota DNR Forest Stand Inventory dataset', 'https://gisdata.mn.gov/dataset/biota-dnr-forest-stand-inventory', 'download', 'DNR identifies this downloadable stand polygon inventory as covering lands administered or managed by the agency.'],
  ],
  MS: [
    ['Mississippi MDWFP PARKS MapServer', 'https://arcgis.mdwfp.com/arcgis/rest/services/Public/PARKS/MapServer', 'api', 'Direct MDWFP REST service includes park point features; inspect all layers and whether a boundary layer is available.'],
    ['Mississippi Forestry Commission ArcGIS Portal', 'https://arcsrv.mfc.ms.gov/portal/sharing/rest/portals/self', 'catalog', 'Official public Forestry Commission ArcGIS Portal is available; find and review public forestry datasets there.'],
  ],
  MO: [
    ['Missouri State Parks Boundaries FeatureServer', 'https://gis.dnr.mo.gov/server/rest/services/parks/Missouri_State_Parks_Boundaries/FeatureServer', 'api', 'Direct DNR service includes state parks/historic sites and related lands; inspect layer-specific attribution and geometry age.'],
    ['Missouri Department of Conservation Conservation Area Boundaries layer 5', 'https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/MDC_Administrative_Areas/FeatureServer/5', 'api', 'Direct MDC managed-area polygons include public-access attributes; a forest-resources inventory is a separate layer/catalog search.'],
  ],
  MT: [
    ['Montana FWP State Parks land boundary MapServer layer 5', 'https://fwp-gis.mt.gov/arcgis/rest/services/fwplnd/fwpLands/MapServer/5', 'api', 'Direct FWP park-land polygons provide destination/manager context only; no trails, campsites, facilities, visitor conditions, or access permission are established by this layer.'],
    ['Montana DNRC Maps and Data', 'https://prod-dnrc.mt.gov/Directors-Office/maps-and-data', 'catalog', 'Official DNRC maps/data page and REST services are available; an exact public Forestry and Trust Lands feature layer was not confirmed.'],
  ],
  NE: [
    ['Nebraska Game and Parks Park_Areas FeatureServer', 'https://services5.arcgis.com/IOshH1zLrIieqrNk/arcgis/rest/services/Park_Areas/FeatureServer', 'api', 'Official NGPC service describes park areas, park activities/amenities, and reference trail-network layers for the state park system; supports query/format conversion. Park polygons and associated layers are useful for discovery, but independently verify which child layers expose geometry, dates, closures, and camping capacity.'],
    ['High-resolution land cover of Nebraska (2014), RDS-2019-0038', 'https://www.fs.usda.gov/rds/archive/catalog/RDS-2019-0038', 'download', 'USDA Forest Service Research Data Archive provides 1-meter rural land-cover/tree-cover data derived from 2014 NAIP imagery; developed with Nebraska forestry/agroforestry partners. Excludes cities and towns and is a 2014 snapshot, not a current Nebraska Forest Service stand or ownership inventory.'],
  ],
  NV: [
    ['Nevada SCORP nonmotorized trails master FeatureServer', 'https://arcgis.water.nv.gov/arcgis/rest/services/Hosted/SCORP_NonMoto_Trails_Master/FeatureServer/0', 'api', 'Statewide queryable line inventory for nonmotorized trails assembled for Nevada SCORP from federal, state, and local agency sources. Useful hiking/biking route coverage, but mixed stewards and compilation purpose mean it is not a live Nevada State Parks inventory; verify route status and access with the land manager.'],
    ['Nevada Division of Forestry GIS Services and NNRFIP', 'https://forestry.nv.gov/gis-mapping', 'catalog', 'Agency GIS page links to statewide natural-resource/fire portal and public DCNR data hub; exact public forestry layer not resolved.'],
  ],
  NH: [
    ['NH State Parks and State Forests FeatureServer layer 4', 'https://maps.dot.nh.gov/arcgis_server/rest/services/Boundaries/NHDOT_BOUNDARIES_Parks_Forest/FeatureServer/4', 'api', 'Direct queryable combined boundary layer is attributed to GRANIT; confirm agency stewardship and update schedule.'],
    ['NH State Parks and State Forests FeatureServer layer 4', 'https://maps.dot.nh.gov/arcgis_server/rest/services/Boundaries/NHDOT_BOUNDARIES_Parks_Forest/FeatureServer/4', 'api', 'Same combined layer represents state parks and state forests; it is served by NHDOT/GRANIT rather than the two agencies.'],
  ],
  NJ: [
    ['NJ State Park Service Parks and Forests trail system download', 'https://www.nj.gov/dep/gis/digidownload/zips/OpenData/Land_use_trails.zip', 'download', 'Direct NJDEP download includes official recreational trails on Park Service lands; metadata describes a 2025 edition.'],
    ['NJDEP Open Space MapServer layer 65', 'https://mapsdep.nj.gov/arcgis/rest/services/Features/Land/MapServer/65', 'api', 'Direct queryable DEP fee-simple open-space polygons include parks, forests, historic sites, and other lands; vintage and accuracy vary, notably for older parcels.'],
  ],
  NM: [
    ['New Mexico State Parks RGIS boundary layer (34 polygons; 2023 edits)', 'https://nhnm-gisweb.unm.edu/arcgis/rest/services/NMEDB/NM_State_Parks/MapServer/0', 'api', 'Best statewide downloadable park-boundary layer located: developed by the State Land Office with State Parks, reviewed by State Parks, and edited in 2023. RGIS metadata still dates completeness to January 2009, warns that generalized boundaries may omit or overstate areas, and forbids legal/ownership use. Pair approximate geometry with EMNRD’s current Find a Park directory; no current complete statewide geodatabase was found.'],
    ['New Mexico Forestry Division GIS and Maps', 'https://www.emnrd.nm.gov/sfd/gis-and-maps/', 'catalog', 'Official page publishes forestry maps and forest-treatment viewer; its treatment layer is partner compiled, so confirm download endpoint and steward.'],
  ],
  NC: [
    ['North Carolina OneMap statewide geospatial catalog', 'https://www.nconemap.gov/', 'catalog', 'Official state data portal is the discovery route for State Parks layers; exact current agency dataset was not verified in this audit.'],
    ['NC Forest Action Plan 2020 GIS data layers', 'https://www.ncmhtd.com/ncfs/ncfap/', 'download', 'NC Forest Service geospatial viewer page offers a roughly 445-MB zipped file geodatabase, including forest ownership/species, tree canopy, forest types, easements, and stewardship priority layers. Statewide planning data with 2020 vintage, not a live operational inventory.'],
  ],
  ND: [
    ['North Dakota Recreation Asset Viewer', 'https://www.parkrec.nd.gov/business/planning/rec-assets', 'info', 'Official public inventory/map covers park sites, trails, camp/tent/RV assets and visitor amenities; useful for discovering attractions, but a bulk export/API for all viewer features was not confirmed. Check site-level current operations and reservations.'],
    ['North Dakota State Forest MapServer layer', 'https://gis.dmr.nd.gov/dmrpublicservices/rest/services/State_Forest/MapServer/0', 'api', 'Direct queryable North Dakota State Forest polygon layer; confirm steward and update metadata.'],
  ],
  OH: [
    ['ODNR Trails, Waypoints, and POI MapServer', 'https://gis2.ohiodnr.gov/ArcGIS/rest/services/OIT_Services/Trails_WayPoints_POI/MapServer', 'api', 'Exact public ODNR route service: layer 2 Trails, layer 1 waypoints, and layer 0 points of interest; query formats include GeoJSON. Useful hiking/recreation routes and visitor points on ODNR lands. Feature coverage is not a complete campground/amenity inventory; verify managing unit, allowed use, and closure status.'],
    ['ODNR Trails, Waypoints, and POI MapServer', 'https://gis2.ohiodnr.gov/ArcGIS/rest/services/OIT_Services/Trails_WayPoints_POI/MapServer', 'api', 'Same queryable ODNR visitor layer includes route lines, waypoints, and POI points on state-managed forest/park lands. It does not establish campsite completeness or live status; retain ODNR steward and route-use attributes.'],
  ],
  OK: [
    ['Oklahoma DOT State Parks KML (52 location placemarks; 2018)', 'https://www.odot.org/maps/state/KML/stateparks.kml', 'download', 'Official ODOT KML has 52 points: 45 park-symbol features and 7 other federal recreation/refuge sites; its HTTP Last-Modified date is 2018-08-10. OTRD’s current parks page reports 38 parks. This older mixed-site point file has no park boundaries and should be reconciled against OTRD’s current listings, not treated as a current park inventory. The OTRD 2019 CSV is only names/addresses. No current OTRD GIS API or bulk export was found.'],
    ['Oklahoma Forestry Services EcoInventory FeatureServer layer 68', 'https://services3.arcgis.com/yrIZ0Nv0mSGTWJsH/arcgis/rest/services/Eco_Inventory_view/FeatureServer/68', 'api', 'OFS GIS metadata identifies this as its EcoInventory point layer (10,578 features; data process dated 2022); it is not a forest-boundary layer and must be checked for currentness and terms.'],
  ],
  OR: [
    ['Oregon State Parks FeatureServer layer 0', 'https://maps.prd.state.or.us/arcgis/rest/services/Land_ownership/Oregon_State_Parks/FeatureServer/0', 'api', 'Queryable OPRD polygon layer represents approximate real-property boundaries for lands owned or managed by State Parks and returns GeoJSON. Useful for managed-land discovery only; it does not identify trails, campsite/amenity locations, public access, or current camping rules. Pair with park-specific visitor maps/reservation data.'],
    ['Oregon Department of Forestry Forestry Managed Lands dataset', 'https://geohub.oregon.gov/datasets/oregon-geo::forestry-managed-lands', 'download', 'Direct agency dataset covers Board of Forestry and Common School lands; catalog reports June 2023 data vintage.'],
  ],
  PA: [
    ['PA DCNR State Parks hiking trails layer 4', 'https://www.gis.dcnr.pa.gov/agsprod/rest/services/Parks/State_Parks/MapServer/4', 'api', 'Direct queryable State Park Hiking Trails line layer; suitable for route display/navigation after checking layer edits, trail-use fields, route completeness, closures, and access notices.'],
    ['PA DCNR Bureau of Forestry State_Forests MapServer', 'https://www.gis.dcnr.pa.gov/agsprod/rest/services/BOF/State_Forests/MapServer', 'api', 'Official forestry service exposes State Forest Hiking Trails Access (1), State Forest Hiking Trails (2), Wild & Natural Areas (3), State Forests (4), and ADA access (8). Strong route/access candidates; confirm field-level details, update history, closures, and camping/amenity coverage separately.'],
  ],
  RI: [
    ['RIDEM Conserved_Land_in_RI_v2 MapServer state conservation land layer', 'https://risegis.ri.gov/hosting/rest/services/RIDEM/Conserved_Land_in_RI_v2/MapServer/3', 'api', 'Direct queryable State Conservation Land layer from RIDEM; land coverage is not a trail/amenity feed.'],
    ['RIDEM Conserved_Land_in_RI_v2 MapServer state conservation land layer', 'https://risegis.ri.gov/hosting/rest/services/RIDEM/Conserved_Land_in_RI_v2/MapServer/3', 'api', 'Shared RIDEM layer covers state-managed conservation land; verify which sites are forests versus parks and access status.'],
  ],
  SC: [
    ['South Carolina State Parks FeatureServer layer', 'https://services.arcgis.com/ycIuRaoIC4UuCDAS/ArcGIS/rest/services/SC_State_Parks/FeatureServer/0', 'api', 'Queryable state-park polygon layer; service description says its source shapefile was received from South Carolina Department of Parks, Recreation & Tourism staff on 2022-03-16. This is an agency-sourced snapshot, with no published update cadence or use terms located.'],
    ['South Carolina Forestry Commission State Lands visitor maps', 'https://www.scfc.gov/state-lands/', 'info', 'Official State Lands information links forest-by-forest visitor maps and access information; no current statewide public route/POI API or download was verified. Use individual map sheets only with current site rules and closures.'],
  ],
  SD: [
    ['South Dakota GFP Recreational Trails MapServer layer 0', 'https://ert.gfp.sd.gov/arcgis/rest/services/SD_Public/RecreationalTrails/MapServer/0', 'api', 'Direct queryable public route layer includes recreational trails (including hiking and water-trail categories) associated with the state park system. Useful routes, not campsite/amenity or live closure data; verify feature classes and access at the park.'],
    ['South Dakota GIS Hub', 'https://sdgis.sd.gov/', 'catalog', 'Official statewide GIS data portal is the discovery route for DANR forestry layers; an exact Forestry dataset was not confirmed.'],
  ],
  TN: [
    ['Tennessee Natural Areas and State Parks FeatureServer', 'https://services7.arcgis.com/lpTX3280urZ21frb/ArcGIS/rest/services/TN_Natural_Areas_and_State_Parks_WFL1/FeatureServer', 'api', 'Queryable state park/natural-area service includes visitor points, cabins (1), campsites (2), trails (3), scenic rivers (4), and boundaries (6). Direct visitor-use source; inspect last edits, attribute definitions, terms, and current closures/reservations before integration.'],
    ['Tennessee Division of Forestry State Forest maps', 'https://www.tn.gov/agriculture/forests/state-forests.html', 'info', 'Official forest pages publish downloadable public-use maps forest by forest, showing boundaries, routes/trails, parking, designated vehicle/use classes, and some campsites. Useful offline visitor maps, not a statewide vector feed; trail rules, permit/camping rules, forest-specific gaps, and active closures must be read from current agency pages/maps.'],
  ],
  TX: [
    ['Texas State Parks Trails MapServer layer 0', 'https://tpwd.texas.gov/arcgis/rest/services/Parks/TexasStateParksTrails/MapServer/0', 'api', 'Direct public query layer of Texas State Park trails with names, activity/use type, and mileage; GeoJSON queries are available. Useful routes, but TPWD describes updates as periodic rather than real-time; confirm current trail status and closures with the park.'],
    ['Texas A&M Forest Service Texas Forest Information and GIS services', 'https://tfsgis.tfs.tamu.edu/arcgis/rest/services', 'catalog', 'Official TFS REST directory verified but does not expose a clearly named statewide public forest layer in its root listing; inspect service folders and terms.'],
  ],
  UT: [
    ['Utah State Parks GIS maps and data', 'https://stateparks.utah.gov/resources/gis-maps-and-data/', 'catalog', 'Official park GIS page links web maps; use the State Geographic Information Datasource to find downloadable park datasets.'],
    ['Utah FFSL GIS & Mapping / Central Index', 'https://ffsl.utah.gov/about/maps/', 'catalog', 'Agency GIS page links to Utah DNR Central Index; exact current downloadable Forestry layer was not selected in this audit.'],
  ],
  VT: [
    ['Vermont ANR Atlas FPR MapServer', 'https://anrmaps.vermont.gov/arcgis/rest/services/map_services/MAP_ANR_ANRATLASFPR_WM_NOCACHE/MapServer', 'api', 'Direct REST service includes State Park, Reserve Forest, managed lands, trails, roads, and facilities.'],
    ['Vermont ANR Atlas FPR MapServer', 'https://anrmaps.vermont.gov/arcgis/rest/services/map_services/MAP_ANR_ANRATLASFPR_WM_NOCACHE/MapServer', 'api', 'Shared agency MapServer covers FPR-managed forests and parks; its parks layers include trails, roads, and visitor facilities. Review layer-level update cadence and use limits before integrating either agency record.'],
  ],
  VA: [
    ['Virginia State Parks park-specific GIS/Avenza map downloads', 'https://www.dcr.virginia.gov/state-parks/document/data/', 'download', 'Direct agency map files are park-specific PDFs/GeoPDFs, not a verified statewide vector layer.'],
    ['Virginia Department of Forestry State Forest map downloads', 'https://www.dof.virginia.gov/education-and-recreation/state-forests/', 'download', 'Agency offers forest-specific offline maps, generally PDFs/Avenza maps; no statewide public vector API was verified.'],
  ],
  WA: [
    ['Washington State Parks PARKS - Park Boundaries item', 'https://www.arcgis.com/home/item.html?id=3385b003af5248e59c1fa68e1411c446', 'catalog', 'Agency-maintained feature layer item reports monthly-or-more-frequent revisions and a June 2026 update; retrieve its linked feature service from the item.'],
    ['Washington DNR Recreation Sites MapServer', 'https://gis.dnr.wa.gov/site2/rest/services/Recreation/DNR_Recreation_Sites/MapServer', 'api', 'Direct DNR service includes recreation-site locations such as campgrounds, trails, trailheads, day-use, toilets, and water access with site type/name, status, amenities, and activities. Strong visitor POI source for DNR-managed lands; confirm current operating status and camping rules in live DNR notices.'],
  ],
  WV: [
    ['West Virginia State_Parks public lands MapServer layer', 'https://gis.transportation.wv.gov/arcgis/rest/services/Boundaries/MapServer/10', 'api', 'Direct queryable parks layer cites WV DNR; validate dataset lineage and intended use.'],
    ['West Virginia Division of Forestry State Forest dataset downloads', 'https://wvgis.wvu.edu/data/dataset.php?ID=58', 'download', 'State Forestry-origin state forest dataset available as geodatabase/shapefile; WVGISTC record says revised in 2022 for PAD-US.'],
  ],
  WI: [
    ['Wisconsin State Trails MapServer layer 0', 'https://dnrmaps.wi.gov/arcgis/rest/services/PR_TRAILS/PR_STATE_TRAIL_DISS_WTM_Ext/MapServer/0', 'api', 'Direct DNR polyline layer of Wisconsin State Trails, one dissolved line per trail in most cases, with property name and agency information URL fields; query supports GeoJSON. It omits the Ice Age and North Country national scenic trails and the generalized Lake Michigan Water Trail route; does not provide local trail detail, campsite points, or live closures.'],
    ['Wisconsin DNR WSPS Properties MapServer layer 0', 'https://dnrmaps.wi.gov/arcgis2/rest/services/PR_Recreation/PR_WSPS_Property_Info_WTM_Ext/MapServer/0', 'api', 'Same DNR property boundary layer may identify state forests and other managed units, but it is not a forestry trail/recreation inventory and explicitly omits trails; use the State Trails visitor map as a separate route lead.'],
  ],
  WY: [
    ['Wyoming State Parks WyoStateParks MapServer layer 26', 'https://gis2.statelands.wyo.gov/arcgis/rest/services/WyoStateParks/MapServer/26', 'api', 'Direct GeoJSON-capable polygon layer with county, facility, site type, and acreage fields. It identifies State Parks managed units, not individual campgrounds, trailheads, amenities, access permission, or live operating status.'],
    ['Wyoming OSLI StateOwnership MapServer layer 0 (active surface ownership)', 'https://gis2.statelands.wyo.gov/arcgis/rest/services/StateOwnership/MapServer/0', 'api', 'Best current ownership base located to derive a forested trust-land layer: OSLI-maintained polygons support paged GeoJSON queries and expose IsActive, SurfaceOwnership, FundCode, and update-date fields. Filter SurfaceOwnership = Y and IsActive = 1, then select trust-beneficiary fund codes (such as Common School or University Land trust). This is a broader state-property inventory, not a WSFD forestry inventory. Intersect the relevant trust parcels with USFS 2025.6 30-meter canopy cover for an approximate forest-cover layer; WSFD manages about 263,000 forested trust acres, but no exact public management-boundary export was found. The linked Forest Action Plan map is a 2015 planning analysis.'],
  ],
};

const kindLabel = {
  api: 'Direct GIS API',
  download: 'Direct dataset/download page',
  catalog: 'Official GIS catalog or agency map tool',
  info: 'Agency maps or information page',
};

function statusFor(kind) {
  if (kind === 'api') return 'Direct GIS API found; verify completeness, terms, and freshness before integration.';
  if (kind === 'download') return 'Downloadable dataset found; verify steward, scope, terms, and data vintage before integration.';
  if (kind === 'catalog') return 'Official catalog/tool or named layer found; verify endpoint, scope, terms, and freshness before integration.';
  return 'Agency maps/information found; a statewide reusable GIS API/download was not verified.';
}

const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const states = registry.states.filter((state) => state.code !== 'NY');
if (states.length !== 49 || Object.keys(sources).length !== 49) {
  throw new Error(`Expected 49 non-NY source rows; registry=${states.length}, audit=${Object.keys(sources).length}`);
}

for (const state of states) {
  const pair = sources[state.code];
  if (!pair || pair.length !== 2) throw new Error(`Missing source pair for ${state.code}`);
  const [parks, forestry] = pair;
  for (const [prefix, source, statusField] of [
    ['parks', parks, 'parksLayerStatus'],
    ['forestry', forestry, 'forestryLayerStatus'],
  ]) {
    state[`${prefix}DataSourceName`] = source[0];
    state[`${prefix}DataSourceUrl`] = source[1];
    state[`${prefix}DataSourceType`] = source[2];
    state[`${prefix}DataSourceNotes`] = source[3];
    state[statusField] = statusFor(source[2]);
  }
}

registry.schemaVersion = 3;
registry.stateAgencyLayerStatusGuide.remaining_49_audited = 'Direct source, official portal, or information-only discovery result is recorded for each parks and forestry agency in docs/STATE_AGENCY_SOURCE_AUDIT.md. Discovery is not integration or a rights/currentness approval.';
const registryHeader = JSON.stringify({ ...registry, states: [] }, null, 2)
  .replace(/,\n  "states": \[\]\n\}\s*$/, '');
const registryText = `${registryHeader},\n  "states": [\n${registry.states.map((state) => `    ${JSON.stringify(state)}`).join(',\n')}\n  ]\n}\n`;
await writeFile(registryPath, registryText, 'utf8');

const counts = { api: 0, download: 0, catalog: 0, info: 0 };
for (const pair of Object.values(sources)) for (const source of pair) counts[source[2]]++;
const agencyRows = states.map((state) => {
  const sourceCell = (prefix) => {
    const url = state[`${prefix}DataSourceUrl`];
    const name = state[`${prefix}DataSourceName`];
    const kind = state[`${prefix}DataSourceType`];
    const notes = state[`${prefix}DataSourceNotes`];
    return `[${name}](${url})<br>${kindLabel[kind]}<br>${notes} | ${state[`${prefix}LayerStatus`]}`;
  };
  return `| ${state.code} | ${state.name} | [${state.parksAgency}](${state.parksAgencyUrl}) | ${sourceCell('parks')} | [${state.forestryAgency}](${state.agencyUrl}) | ${sourceCell('forestry')} |`;
});

const deepDives = [
  ['FL', 1, 'Recent state-forest boundary candidate with a March 2025 vintage. Generalized administrative polygons; not a surveyed/legal parcel source or a facilities/trails feed.'],
  ['ID', 0, 'IDPR-built, queryable ORFI managed-land layer. Its specific edit date and completeness are unclear, so verify park-by-park coverage before treating it as a full title inventory.'],
  ['KS', 0, 'KDWP names this protected-lands layer in its ERT help as updated 2024-02-22 and merged from PAD-US plus KDWP digitized boundaries. It includes parks but is not park-only; public help does not reveal a direct REST/export URL.'],
  ['KS', 1, 'KFS-USFS 1-meter rural tree-cover work is high resolution and includes windbreaks, but depicts 2015 cover rather than current forest ownership or state-held forest boundaries.'],
  ['LA', 0, 'The closest exportable statewide park geometry is a 27-polygon ArcGIS layer last edited 2021-07-29, hosted outside State Parks without a published refresh schedule or terms. It includes blank-named records and non-park property (including WLF field/boat-storage facilities). The LDWF State Parks MapServer has no queryable layers; the 2021 layer needs filtering and agency confirmation.'],
  ['LA', 1, 'The USFS 2025.6 Tree Canopy Cover release supplies annual 30-meter canopy through 2025 plus standard-error data, making it a strong current forest-cover raster. It covers every ownership and is not LDAF’s tract, treatment, or operations inventory; the annual 2025 FIA snapshot adds statewide statistical estimates, not parcel geometry.'],
  ['NE', 1, 'The 1-meter Nebraska tree-cover layer uses 2014 rural imagery and excludes urban areas. It is detailed but dated and does not map Nebraska Forest Service program holdings or operational stands.'],
  ['NM', 0, 'The RGIS 34-polygon layer was developed with the State Land Office and reviewed by State Parks, with 2023 edits. Its metadata says complete only as of January 2009, warns that generalized polygons can omit or overstate park areas, and prohibits legal/ownership use. The official Find a Park page is the current operational inventory, but no current complete boundary download was found.'],
  ['NC', 1, 'NC Forest Service offers a statewide 2020 Forest Action Plan geodatabase (about 445 MB zipped) with ownership/species, canopy, forest type, easement, and priority layers. Useful planning data, not a live operations feed.'],
  ['OK', 0, 'ODOT’s official KML has 52 point placemarks (45 park-symbol sites and 7 federal recreation/refuge sites) and was last modified 2018-08-10. It has no park boundaries; OTRD’s current page reports 38 parks. Reconcile the older mixed-site locator against the agency’s active listings. The OTRD CSV is names/addresses only, last updated 2019-10-31; no current bulk GIS/API was found.'],
  ['SC', 0, 'The feature service traces to a shapefile received from SC Parks, Recreation & Tourism staff on 2022-03-16. It is a usable boundary snapshot, but no refresh cadence or redistribution terms were found.'],
  ['WY', 1, 'OSLI’s GIS-maintained StateOwnership MapServer exposes surface ownership, active status, fund code, and update fields in queryable GeoJSON. Filter active state surface parcels and trust-beneficiary funds, then intersect with USFS 2025.6 canopy for an approximate forested-trust-land layer. OSLI does not tag WSFD’s approximately 263,000 forested acres or management stands; its linked WSFD Forest Action Plan web map is a 2015 coarse planning analysis, not a current management-boundary export.'],
];
const deepDiveRows = deepDives.map(([stateCode, agencyIndex, finding]) => {
  const state = states.find((candidate) => candidate.code === stateCode);
  const source = sources[stateCode][agencyIndex];
  const agency = agencyIndex === 0 ? state.parksAgency : state.forestryAgency;
  return `| ${stateCode} | ${agency} | [${source[0]}](${source[1]}) | ${finding} |`;
});

// Outdoor-use classifications describe the recorded sources' visitor utility
// and readiness. A lead or site map does not equal a reusable POI feed.
const outdoorUseAssignments = {
  visitor_feature_candidate: [
    'AL:parks', 'AL:forestry',
    'AK:parks', 'AZ:parks', 'CA:parks', 'FL:parks', 'IA:parks', 'MA:parks',
    'IA:forestry', 'MD:parks', 'MI:parks', 'MI:forestry',
    'MN:parks', 'MS:parks', 'NE:parks', 'NV:parks', 'NJ:parks',
    'OH:parks', 'OH:forestry', 'PA:parks', 'PA:forestry', 'SD:parks', 'TN:parks', 'TX:parks', 'WA:forestry', 'WI:parks',
    'VT:parks', 'VT:forestry',
  ],
  visitor_source_lead: [
    'CO:parks', 'DE:parks', 'HI:forestry', 'ME:parks', 'MD:forestry', 'ND:parks', 'OK:parks',
  ],
  destination_land_context: [
    'AR:parks', 'AK:forestry', 'CT:parks', 'CT:forestry', 'FL:forestry',
    'GA:parks', 'HI:parks', 'ID:parks', 'IN:parks', 'IN:forestry', 'KS:parks',
    'IL:parks', 'IL:forestry', 'KY:parks', 'KY:forestry', 'LA:parks', 'MA:forestry',
    'MT:parks', 'MO:parks', 'MO:forestry', 'NH:parks', 'NH:forestry',
    'NJ:forestry', 'NM:parks', 'ND:forestry', 'OR:parks', 'OR:forestry',
    'RI:parks', 'RI:forestry', 'SC:parks', 'WA:parks', 'WI:forestry',
    'WV:parks', 'WV:forestry', 'WY:parks', 'WY:forestry',
  ],
  forest_resource_context: [
    'CA:forestry', 'ID:forestry', 'KS:forestry', 'LA:forestry', 'MN:forestry',
    'NE:forestry', 'NC:forestry', 'NM:forestry', 'OK:forestry',
  ],
  site_map_only: ['DE:forestry', 'SC:forestry', 'TN:forestry', 'VA:parks', 'VA:forestry'],
  unresolved_dataset: [
    'AZ:forestry', 'AR:forestry', 'CO:forestry', 'GA:forestry', 'ME:forestry',
    'MS:forestry', 'MT:forestry', 'NV:forestry', 'NC:parks', 'SD:forestry',
    'TX:forestry', 'UT:parks', 'UT:forestry',
  ],
};
const outdoorUseDescriptions = {
  visitor_feature_candidate: {
    label: 'Visitor features identified',
    utility: 'The recorded source identifies at least one concrete visitor route, campsite, trailhead, or facility class. It is a plausible hiking/camping map input, subject to the coverage and source-specific limits in the direct-source audit.',
    gap: 'Confirm feature geometry and fields, coverage, refresh date, terms, and whether access, camping permission, and closures are explicitly represented before import.',
  },
  visitor_source_lead: {
    label: 'Visitor information lead; not data-ready',
    utility: 'The agency provides useful visitor-facing map or GIS information, but a reusable, current data extract or sufficiently described layer is not established.',
    gap: 'Resolve a stable public data endpoint/export and verify geometry, attributes, coverage, update cadence, and terms before treating it as an app POI or route feed.',
  },
  destination_land_context: {
    label: 'Destination / land-context candidate',
    utility: 'Park, forest, managed-land, or open-space geometry can help users discover a land unit and manager or orient on a basemap.',
    gap: 'Land geometry is not a campground, trail, trailhead, amenity, access permission, or camping rule. Pair it with visitor features and current agency rules.',
  },
  forest_resource_context: {
    label: 'Forest / planning context',
    utility: 'Canopy, forest stands, fire, forest health, or assessment data may describe the landscape or resource-management context.',
    gap: 'These are not visitor POIs, maintained trails, recreation facilities, current conditions, or permission/access records.',
  },
  site_map_only: {
    label: 'Visitor-use map only',
    utility: 'Agency-published site maps can show trails, access points, parking, campsites, or use rules and may work offline.',
    gap: 'The maps are site-specific static documents, not a statewide searchable vector layer or POI feed; check their edition date and current rules/closures.',
  },
  unresolved_dataset: {
    label: 'Visitor-use dataset not established',
    utility: 'The recorded source is a broad forestry/resource catalog or lacks enough feature detail to establish a useful camping/hiking dataset.',
    gap: 'Resolve a named public dataset/layer, geometry, visitor-relevant fields, coverage, update cadence, and reuse terms. Do not treat the portal itself as a POI dataset.',
  },
};
const outdoorUseByAgency = new Map();
for (const [classification, agencyKeys] of Object.entries(outdoorUseAssignments)) {
  for (const agencyKey of agencyKeys) {
    if (outdoorUseByAgency.has(agencyKey)) throw new Error(`Duplicate outdoor-use classification for ${agencyKey}`);
    outdoorUseByAgency.set(agencyKey, classification);
  }
}
if (outdoorUseByAgency.size !== states.length * 2) {
  throw new Error(`Expected ${states.length * 2} outdoor-use classifications; found ${outdoorUseByAgency.size}`);
}
for (const state of states) {
  for (const prefix of ['parks', 'forestry']) {
    const key = `${state.code}:${prefix}`;
    if (!outdoorUseByAgency.has(key)) throw new Error(`Missing outdoor-use classification for ${key}`);
  }
}
const outdoorUseCounts = Object.fromEntries(
  Object.keys(outdoorUseDescriptions).map((classification) => [classification, outdoorUseAssignments[classification].length]),
);
function positiveFeatureText(note) {
  // Exclude sentences that negate, omit, or limit feature coverage so a caveat
  // such as "does not include campsites" is not counted as positive evidence.
  return String(note ?? '').split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/\b(?:no|not|does not|doesn't|omits?|exclude[sd]?|excluding|without|isn't|is not|lack|lacks|not include[sd]?)\b/i.test(sentence))
    .join(' ');
}
const visitorSourceNotes = states.flatMap((state) => ['parks', 'forestry']
  .filter((prefix) => ['visitor_feature_candidate', 'visitor_source_lead'].includes(outdoorUseByAgency.get(`${state.code}:${prefix}`)))
  .map((prefix) => positiveFeatureText(state[`${prefix}DataSourceNotes`] ?? '')));
const visitorFeatureMentionCounts = {
  camping: visitorSourceNotes.filter((note) => /campground|camping area|campsite/i.test(note)).length,
  trails: visitorSourceNotes.filter((note) => /trail/i.test(note)).length,
  facilities: visitorSourceNotes.filter((note) => /facilit|amenit|picnic|parking|entry point/i.test(note)).length,
  points: visitorSourceNotes.filter((note) => /\bpoints?\b|\bpoi\b|placemark/i.test(note)).length,
};
function documentedFeatureEvidence(note) {
  const positiveNote = positiveFeatureText(note);
  const evidence = [];
  if (/campground|camping area|campsite/i.test(positiveNote)) evidence.push('campgrounds/camping areas');
  if (/trail/i.test(positiveNote)) evidence.push('trails');
  if (/route/i.test(positiveNote)) evidence.push('routes');
  if (/\broads?\b/i.test(positiveNote)) evidence.push('roads');
  if (/facilit|amenit|picnic|parking|entry point|building|structure/i.test(positiveNote)) evidence.push('visitor facilities/parking/entries');
  if (/\bpoints?\b|\bpoi\b|placemark/i.test(positiveNote)) evidence.push('visitor/location points');
  return [...new Set(evidence)].join(', ');
}
const outdoorUseRows = states.flatMap((state) => ['parks', 'forestry'].map((prefix) => {
  const classification = outdoorUseByAgency.get(`${state.code}:${prefix}`);
  const description = outdoorUseDescriptions[classification];
  const agency = prefix === 'parks' ? state.parksAgency : state.forestryAgency;
  const source = sources[state.code][prefix === 'parks' ? 0 : 1];
  const type = kindLabel[source[2]];
  const sourceCell = `[${source[0]}](${source[1]})<br>${type}`;
  const featureEvidence = ['visitor_feature_candidate', 'visitor_source_lead'].includes(classification)
    ? documentedFeatureEvidence(source[3])
    : '';
  const evidenceText = featureEvidence
    ? ` Source notes name: ${featureEvidence}.`
    : '';
  return `| ${state.code} | ${prefix === 'parks' ? 'Parks' : 'Forestry'} | [${agency}](${prefix === 'parks' ? state.parksAgencyUrl : state.agencyUrl}) | ${sourceCell} | **${description.label}.** ${description.utility}${evidenceText} | ${description.gap} |`;
}));

const outdoorUseAudit = [
  '# State Agency Outdoor Dataset Use Audit',
  '',
  '**Audit date:** 2026-09-25',
  '**Scope:** 49 states other than New York; all 98 parks and forestry agency source records in the agency registry.',
  '**Evidence level:** The source records were checked against agency portals and live service descriptions where available. These are conservative fit/readiness judgments, not a full 98-source field-by-field validation of every record, reuse license, geometry, freshness, closure, or access rule.',
  '**Question:** Does the recorded agency source help someone find or navigate campsites, trails, trailheads, visitor facilities, or the land manager—and what is still missing before it can be treated as an iOverlander-style POI or route source?',
  '',
  '## Finding',
  '',
  `- ${outdoorUseCounts.visitor_feature_candidate} sources describe visitor locations/routes/facilities directly enough to be candidate hiking/camping inputs; this is a content-fit result, not a rights, schema, freshness, completeness, or integration approval.`,
  `- ${outdoorUseCounts.visitor_source_lead} more source records identify likely visitor data but still need the exact public dataset/layer selected.`,
  `- ${outdoorUseCounts.destination_land_context} records describe or point to park/forest/open-space land context only; they do not establish trails, amenities, campgrounds, or permission to enter/camp.`,
  `- ${outdoorUseCounts.forest_resource_context} records are forest/resource/planning data rather than visitor POIs.`,
  `- ${outdoorUseCounts.site_map_only} records provide site-specific static maps but not a statewide queryable visitor dataset.`,
  `- ${outdoorUseCounts.unresolved_dataset} records do not establish an exact visitor-use dataset from the source information currently in the registry.`,
  `- Within the ${visitorSourceNotes.length} visitor-feature candidates/leads, positive source descriptions mention campground/camping features in ${visitorFeatureMentionCounts.camping} record(s), trails in ${visitorFeatureMentionCounts.trails}, facilities/amenities in ${visitorFeatureMentionCounts.facilities}, and visitor points in ${visitorFeatureMentionCounts.points}. These are overlapping text references; a mention in a visitor lead is not field-level confirmation.`,
  '',
  '## Fit criteria',
  '',
  '- **Direct visitor-feature candidate:** the recorded API/download description identifies at least one potentially useful location or route class, such as campgrounds, recreation points, trails, roads, parking, amenities, or park facilities. Before import, verify actual geometry, field quality, update date, coverage, terms, and any access/status attributes.',
  '- **Visitor information lead:** an official visitor map, database, viewer, or GIS description is useful for discovery, but a current reusable download/API or enough layer detail to use it as an app feed is not established.',
  '- **Destination / land context:** a park, forest, protected-land, or open-space boundary identifies where a managed land unit is. It is not itself a camping or hiking POI and cannot prove public entry or overnight use.',
  '- **Forest / planning context:** forest cover, stands, health, wildfire, or action-plan data help describe a landscape but do not tell visitors where to camp or hike.',
  '- **Site-specific offline map:** a park/forest PDF or GeoPDF can help with local orientation but is not a statewide structured layer for search or POI matching.',
  '- **Visitor-use dataset not established:** no named public visitor feed or sufficiently described visitor layer is recorded for this agency. Do not treat unrelated forest-resource layers as substitutes.',
  '',
  '## Agency-by-agency results',
  '',
  '| State | Agency role | Agency | Recorded source | Visitor usefulness and evidence | Gap before POI/route use |',
  '| --- | --- | --- | --- | --- | --- |',
  ...outdoorUseRows,
  '',
  '## What a useful camping / hiking layer still needs',
  '',
  '- Prioritize established campground and individual campsite locations, trail lines and trailheads, water, toilets/showers, dump stations, parking, shelters, and usable visitor access details when those records are published by a land manager.',
  '- For trails, retain the trail-use class, surface/accessibility, seasonal status, managing unit, source date, and source link where available. A drawn endpoint is not automatically a verified trailhead.',
  '- For campsites, separate campground or designated-site geometry from informal/wild camping reports; do not infer dispersed-camping permission from a forest or public-land boundary.',
  '- Keep closures, fire rules, operating status, fees/reservations, and other time-sensitive conditions tied to an authoritative, refreshable source. Do not infer them from ownership or static maps.',
  '- State parks/forestry agencies do not normally provide the full iOverlander service mix (fuel, propane, repairs, shops, lodging, community reports). Keep those categories sourced separately and do not claim this audit covers them.',
  '',
  '## Package implication',
  '',
  'The existing 49-state packages already contain national/state-managed land records from PAD-US plus NPS trails/POIs, USFS trails/recreation sites/MVUM, and BLM recreation records where those sources return data. The state-agency register is an additional-source audit: direct agency records have not been integrated into those packages yet. Keep broad land polygons as land units, route features as trails/roads, and amenity/campground points as places, with source lineage retained. The [package tracker](STATE_DATA_PACKAGE_TRACKER.md) describes the current layers and limits.',
  '',
  'The fit labels reflect the recorded agency source and the reviewed feature descriptions. They remain conservative where a portal, old map, or land-only layer is all that is public. See the [49-state direct-source audit](STATE_AGENCY_SOURCE_AUDIT.md) for source dates, completeness caveats, and stewardship notes. New York is covered separately in the [NYS agency source coverage audit](NYS_AGENCY_SOURCE_COVERAGE_AUDIT.md).',
  '',
].join('\n');
await writeFile(outdoorUseAuditPath, outdoorUseAudit, 'utf8');

const audit = [
  '# State Agency Direct-Source Coverage Audit',
  '',
  '**Audit date:** 2026-09-25',
  '**Scope:** The parks and forestry agencies identified in [`config/us-state-forestry-agencies.json`](../config/us-state-forestry-agencies.json) for the 49 states other than New York (98 agency-source checks).',
  '**Finding:** A source-discovery result is recorded for every agency. This is not a claim that data have been integrated, are complete, are current, or may be redistributed.',
  '**Visitor usefulness:** A separate [outdoor dataset use audit](STATE_AGENCY_OUTDOOR_USE_AUDIT.md) assesses all 98 records against camping, hiking, visitor facilities, and POI/route needs.',
  '',
  '## Coverage summary',
  '',
  `- ${counts.api} direct GIS API endpoints were identified.`,
  `- ${counts.download} dataset/download endpoints or download pages were identified; some are partner/federal proxies rather than agency-maintained products.`,
  `- ${counts.catalog} official data catalogs/tools were identified; exact layers or direct API/download endpoints may still need resolution.`,
  `- ${counts.info} agency map/information pages were identified; a statewide reusable dataset/API was not verified in this audit.`,
  '- API and download entries may still be partial, stale, generalized, or subject to limits; each notes a specific known caveat where found.',
  '',
  '## Deep dive: 12 prior information-only agency gaps',
  '',
  'A specific dataset or named GIS layer is now recorded for each of the 12 prior information-only entries. For this audit, a reliable current-use candidate needs a traceable steward, suitable geometry/scope, and a defensible vintage or refresh path. Source discovery does not certify these conditions. Louisiana and Wyoming forestry use the best current USFS tree-cover proxy found, not an agency-maintained forest inventory. Oklahoma still lacks a usable statewide park geometry source in the public material located.',
  '',
  '| State | Agency | Best dataset/layer found | Reliability and scope finding |',
  '| --- | --- | --- | --- |',
  ...deepDiveRows,
  '',
  '## State-by-state agency sources',
  '',
  '| Code | State | Parks agency | Parks source and audit finding | Parks status | Forestry agency | Forestry source and audit finding | Forestry status |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...agencyRows,
  '',
  '## Use and integration notes',
  '',
  '- A public REST endpoint proves that a service can be queried; it does not establish completeness, legal access, permission to redistribute, or acceptable offline use. Review item metadata, terms, source fields, edit dates, and geometry scope before integration.',
  '- Download pages may include stale snapshots or mixed-owner layers. The audit notes explicit vintage warnings found during discovery. Do not infer that a property is publicly accessible from ownership or a map label.',
  '- Entries marked **Official GIS catalog or data portal** are discovery paths, not selected dataset records. Search for the named agency and topic, then record the exact layer URL, license, update date, and coverage before adding it to a package.',
  '- Entries marked **Agency maps or information page** are a documented discovery gap. The public-facing material found during this search did not establish a direct statewide reusable GIS source.',
  '- Current rules, closures, fire restrictions, camping permission, and operational status require separate, refreshable agency sources and should not be inferred from durable boundary layers.',
  '',
  '## References and New York',
  '',
  '- This audit covers the remaining 49 states. New York is separately documented in the [NYS Agency Source Coverage Audit](NYS_AGENCY_SOURCE_COVERAGE_AUDIT.md).',
  '- Agency names and official landing pages come from the state agency roster in the registry; per-source links above point to the discovered API, download, catalog, or information resource.',
  '',
].join('\n');
await writeFile(auditPath, audit, 'utf8');

const tracker = await readFile(trackerPath, 'utf8');
const sectionStart = tracker.indexOf('## State parks and forestry agency tracking');
const sectionEnd = tracker.indexOf('## Acceptance / follow-up', sectionStart);
if (sectionStart < 0 || sectionEnd < 0) throw new Error('Could not locate agency section in tracker');
const trackingSection = [
  '## State parks and forestry agency tracking',
  '',
  'The table links each identified agency to its discovered direct source, official catalog, or public map/information page. The [outdoor dataset use audit](STATE_AGENCY_OUTDOOR_USE_AUDIT.md) classifies all 98 records for camping/hiking and POI/route relevance. Full source notes and known limitations are in the [49-state agency source audit](STATE_AGENCY_SOURCE_AUDIT.md). New York remains in the [NYS agency source coverage audit](NYS_AGENCY_SOURCE_COVERAGE_AUDIT.md). Source discovery does not mean data have been integrated or rights/currentness have been approved.',
  '',
  '| Code | State | Parks agency | Parks source | Parks status | Forestry agency | Forestry source | Forestry status |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...agencyRows,
  '',
].join('\n');
const nextTracker = `${tracker.slice(0, sectionStart)}${trackingSection}${tracker.slice(sectionEnd)}`;
await writeFile(trackerPath, nextTracker, 'utf8');
console.log(`Wrote source records for ${states.length} states (${states.length * 2} agencies): ${JSON.stringify(counts)}`);

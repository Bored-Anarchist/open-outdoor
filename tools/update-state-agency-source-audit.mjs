import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const registryPath = join(root, 'config/us-state-forestry-agencies.json');
const trackerPath = join(root, 'docs/STATE_DATA_PACKAGE_TRACKER.md');
const auditPath = join(root, 'docs/STATE_AGENCY_SOURCE_AUDIT.md');

// Each row is parks [name, url, kind, audit note], then forestry [name, url, kind, audit note].
// "catalog" means an official discovery portal was verified, but a specific public layer was not.
// "info" means an agency map or information page was found, but not a reusable statewide feed.
const sources = {
  AL: [
    ['Alabama State Parks GIS StateParks MapServer', 'https://conservationgis.alabama.gov/adcnrweb/rest/services/StateParks/MapServer', 'api', 'Direct queryable parks service; inspect its layers and reuse terms before integration.'],
    ['Alabama Forestry Commission StateProperty MapServer', 'https://gis.forestry.alabama.gov/arcgis/rest/services/AFCEnterprise/StateProperty/MapServer', 'api', 'Direct agency service includes state property and state forest layers; validate layer scope and terms.'],
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
    ['California State Parks GIS downloads and live feature services', 'https://www.parks.ca.gov/?page_id=29682', 'download', 'Agency publishes park boundaries, routes, buildings, structures, day-use, campgrounds, parking, and entry points; page reports monthly updates and gives terms.'],
    ['CAL FIRE FRAP GIS mapping and data', 'https://www.fire.ca.gov/what-we-do/fire-resource-assessment-program/gis-mapping-and-data-analytics', 'catalog', 'Agency GIS/data catalog for forest assessment and fire/resource layers; select an individual dataset and check its vintage and lineage.'],
  ],
  CO: [
    ['Colorado Parks and Wildlife Maps & GIS data', 'https://cpw.state.co.us/maps-and-gis', 'catalog', 'Official CPW GIS data page describes park/SWA boundaries, trails, and facilities; individual service and dataset terms remain to be selected.'],
    ['Colorado State Forest Service Data & Tools / GIS Open Data Portal', 'https://csfs.colostate.edu/data/', 'catalog', 'Official CSFS portal provides searchable, streamable forest and wildfire datasets; select and validate the relevant resource.'],
  ],
  CT: [
    ['Connecticut DEEP Property FeatureServer layer', 'https://services1.arcgis.com/FjPcSmEFuDYlIdKC/arcgis/rest/services/Connecticut_DEEP_Property/FeatureServer/0', 'api', 'Direct DEEP polygon layer includes parks, forests, wildlife and other DEEP properties; portal metadata reports a 2025 update and CC0.'],
    ['Connecticut DEEP Property FeatureServer layer', 'https://services1.arcgis.com/FjPcSmEFuDYlIdKC/arcgis/rest/services/Connecticut_DEEP_Property/FeatureServer/0', 'api', 'Same department-managed property layer covers State Forests and State Parks; it is a land layer, not a complete trail or operations feed.'],
  ],
  DE: [
    ['DNREC Open Data / outdoors and recreation catalog', 'https://dnrec.delaware.gov/dnrec-open-data/', 'catalog', 'Official agency catalog lists natural areas and open-space inventory; the direct Managed Lands REST layer located during audit is hosted on FirstMap Test, so a production endpoint was not verified.'],
    ['DNREC Open Data / outdoors and recreation catalog', 'https://dnrec.delaware.gov/dnrec-open-data/', 'catalog', 'Official agency catalog is the discovery route for forestry-related managed lands; do not use the FirstMap Test Managed Lands layer as a production source.'],
  ],
  FL: [
    ['Florida DEP State Parks PARKS_BOUNDARIES MapServer', 'https://ca.dep.state.fl.us/arcgis/rest/services/OpenData/PARKS_BOUNDARIES/MapServer', 'api', 'Direct service contains boundaries, trails, roads, facilities, and management zones; boundary layer metadata says September 1, 2017, so freshness must be resolved.'],
    ['Florida Forest Service agency maps and GIS information', 'https://www.fdacs.gov/Forest-Wildfire/Florida-Forest-Service', 'info', 'Agency information page found; an exact current public forestry boundary/API export was not verified here. DEP publishes a separate managed-lands service that may help discovery.'],
  ],
  GA: [
    ['Georgia DNR Managed Lands dataset metadata/download record', 'https://data.georgiaspatial.org/data/statewide/dnr/fed_lands/dnr20a.html', 'download', 'DNR-managed land polygons include parks; metadata says published 2019 at 1:24,000 and warns boundaries are not legal descriptions.'],
    ['Georgia Forestry Commission ArcGIS Portal', 'https://gfcarcserver.gfc.state.ga.us/portal/sharing/rest/portals/self', 'catalog', 'Official Commission ArcGIS portal verified; locate and assess public forest, fire, and recreation datasets within the catalog.'],
  ],
  HI: [
    ['Hawaii State Parks MapServer State Parks layer 16', 'https://geodata.hawaii.gov/arcgis/rest/services/Infrastructure/MapServer/16', 'api', 'Direct park boundary layer with agency attribution; source notes boundaries are general reference and may vary from surveyed parcels.'],
    ['Hawaii DOFAW Forest Reserve GIS/data reference', 'https://dlnr.hawaii.gov/forestry/frs/permitting/research/', 'catalog', 'DOFAW identifies forest reserves, trails, and roads as available through the State Geospatial Data Portal; the exact DOFAW dataset URL remains to be selected.'],
  ],
  ID: [
    ['Idaho State Parks Interactive Map', 'https://parksandrecreation.idaho.gov/elementor-48425/', 'info', 'Agency public interactive map found; no direct statewide park feature service or downloadable vector layer was verified.'],
    ['Idaho IDL Forest Action Plan datasets MapServer', 'https://gis1.idl.idaho.gov/arcgis/rest/services/Portal/Forest_Action_Plan_Datasets/MapServer', 'api', 'Direct forestry service includes forest health, fire hazard, priority landscapes, and other assessment layers; downloadable geodatabase is linked in service metadata.'],
  ],
  IL: [
    ['Illinois DNR ArcGIS REST services and Open Data portal', 'https://geoservices3.dnr.illinois.gov/arcgis/rest/services', 'catalog', 'Official IDNR service directory includes a Forestry folder; current park-property layer was not confirmed. A legacy DNR Properties metadata record is dated 2004.'],
    ['Illinois DNR Forestry REST service folder', 'https://geoservices3.dnr.illinois.gov/arcgis/rest/services/Forestry', 'catalog', 'Official forestry service folder is present; identify the public statewide layers and verify update dates before use.'],
  ],
  IN: [
    ['Indiana DNR ManagedLands_DNR_Open FeatureServer layer', 'https://gisdata.in.gov/server/rest/services/Hosted/ManagedLands_DNR_Open/FeatureServer/0', 'api', 'Direct statewide queryable layer includes DNR STATE PARKS and DNR FORESTRY classes but is explicitly not comprehensive for all recreation areas.'],
    ['Indiana DNR ManagedLands_DNR_Open FeatureServer layer', 'https://gisdata.in.gov/server/rest/services/Hosted/ManagedLands_DNR_Open/FeatureServer/0', 'api', 'Shared land layer includes DNR State Parks and Forestry categories; its metadata warns the overall inventory is incomplete.'],
  ],
  IA: [
    ['Iowa DNR State_Parks MapServer', 'https://programs.iowadnr.gov/geospatial/rest/services/Recreation/State_Parks/MapServer', 'api', 'Direct DNR service exposes park recreation, trails, public-area boundaries, and amenities in queryable formats.'],
    ['Iowa DNR GIS Analysis & Support / web services', 'https://www.iowadnr.gov/programs-services/gis-analysis-support', 'catalog', 'DNR states public GIS is distributed through Iowa GeoData and DNR web services; find forestry inventory or tract layers in those catalogs.'],
  ],
  KS: [
    ['Kansas Department of Wildlife and Parks maps/data', 'https://ksoutdoors.com/', 'info', 'Agency visitor and mapping information located; a direct statewide State Parks GIS export/API was not verified.'],
    ['Kansas Forest Service', 'https://www.kansasforests.org/', 'info', 'Agency forestry information located; no direct public statewide forest GIS dataset or download was verified.'],
  ],
  KY: [
    ['Kentucky State Parks boundaries MapServer layer 8', 'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_State_Parks_Features_WGS84WM/MapServer/8', 'api', 'Direct queryable state park polygon layer attributed to the Kentucky Department of Parks.'],
    ['Kentucky State Forests MapServer', 'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_StateForests_WGS84WM/MapServer', 'api', 'Direct queryable forest boundary layer attributed to the Kentucky Department of Forestry.'],
  ],
  LA: [
    ['Louisiana State Parks visitor maps and information', 'https://www.lastateparks.com/', 'info', 'Agency visitor information found; no direct public statewide State Parks GIS dataset/API was verified.'],
    ['Louisiana Office of Forestry', 'https://www.ldaf.la.gov/forestry', 'info', 'Agency information found; no direct public statewide forestry GIS dataset/API was verified. Louisiana State Lands downloads are a separate steward and do not substitute for Forestry layers.'],
  ],
  ME: [
    ['Maine Bureau of Parks and Lands GIS/Mapping', 'https://www.maine.gov/dacf/parks/about/gis_mapping.shtml', 'catalog', 'Agency confirms it maintains park/public-land GIS layers; browse the Maine GeoLibrary for public datasets and verify which layers are downloadable.'],
    ['Maine GeoLibrary open geospatial catalog', 'https://mainegeolibrary-maine.hub.arcgis.com/', 'catalog', 'Official statewide portal hosts agency datasets; a Maine Forest Service-specific direct layer was not resolved in this audit.'],
  ],
  MD: [
    ['Maryland DNR Geospatial Products and Services / GIS data download', 'https://dnr.maryland.gov/ccs/pages/gis.aspx', 'catalog', 'DNR page explicitly offers GIS downloads and maps for State Parks, State Forests, trails, and other resources; select per-layer download or request restricted data.'],
    ['Maryland DNR Geospatial Products and Services / GIS data download', 'https://dnr.maryland.gov/ccs/pages/gis.aspx', 'catalog', 'Same DNR geospatial source covers parks and forest lands; exact inventory item and currentness must be checked in the download catalog.'],
  ],
  MA: [
    ['MassGIS DCR Roads & Trails download', 'https://www.mass.gov/info-details/massgis-data-department-of-conservation-and-recreation-roads-trails', 'download', 'Direct DCR roads/trails download; page dates this layer to June 2015, so it is a candidate source rather than a currentness guarantee.'],
    ['MassGIS Protected and Recreational OpenSpace downloads/services', 'https://www.mass.gov/info-details/massgis-data-protected-and-recreational-openspace', 'download', 'Download/API options cover state/town forests and recreation lands but combine multiple owners; use ownership/steward fields to isolate DCR and inspect vintage.'],
  ],
  MI: [
    ['Michigan DNR Maps and Data / Michigan GIS Open Data Portal', 'https://www.michigan.gov/dnr/managing-resources/maps', 'catalog', 'Agency maps point to statewide GIS datasets; exact public park boundary and trails resources should be selected from the Michigan GIS Open Data Portal.'],
    ['Michigan DNR Maps and Data / Michigan GIS Open Data Portal', 'https://www.michigan.gov/dnr/managing-resources/maps', 'catalog', 'DNR maps include State Forest and recreation layers; discover the exact public data records in the linked state portal.'],
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
    ['Montana FWP GIS data and downloads', 'https://mslservices.mt.gov/Geographic_Information/Data/', 'catalog', 'Official state GIS download catalog includes FWP managed lands such as State Parks; choose current FWP record and inspect terms.'],
    ['Montana DNRC Maps and Data', 'https://prod-dnrc.mt.gov/Directors-Office/maps-and-data', 'catalog', 'Official DNRC maps/data page and REST services are available; an exact public Forestry and Trust Lands feature layer was not confirmed.'],
  ],
  NE: [
    ['Nebraska Game and Parks Commission Spatial Data Portal', 'https://www.nebraska.gov/government/open-data/', 'catalog', 'State portal entry confirms NGPC provides a public GIS data platform; search it for park boundaries, trails, and facilities.'],
    ['Nebraska Forest Service', 'https://nfs.unl.edu/', 'info', 'Agency forestry information found; a public statewide forestry data API/download was not located. Search NGPC/State GIS catalogs only as discovery leads, not as Forest Service data.'],
  ],
  NV: [
    ['Nevada State Parks / DCNR Data Hub', 'https://parks.nv.gov/', 'catalog', 'Agency site links into Nevada DCNR public GIS data hub; exact current state park dataset should be selected there.'],
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
    ['New Mexico State Parks maps and information', 'https://www.emnrd.nm.gov/spd/', 'info', 'Agency visitor maps/information found; no direct statewide State Parks data API/download was verified.'],
    ['New Mexico Forestry Division GIS and Maps', 'https://www.emnrd.nm.gov/sfd/gis-and-maps/', 'catalog', 'Official page publishes forestry maps and forest-treatment viewer; its treatment layer is partner compiled, so confirm download endpoint and steward.'],
  ],
  NC: [
    ['North Carolina OneMap statewide geospatial catalog', 'https://www.nconemap.gov/', 'catalog', 'Official state data portal is the discovery route for State Parks layers; exact current agency dataset was not verified in this audit.'],
    ['North Carolina Forest Service', 'https://www.ncforestservice.gov/', 'info', 'Agency information and maps located; a public statewide forestry vector API/download was not verified.'],
  ],
  ND: [
    ['ND Parks Recreation Asset Viewer and GIS Hub', 'https://www.parkrec.nd.gov/business/planning/rec-assets', 'catalog', 'Official park viewer covers parks, trails, amenities, and facilities; use the linked ND GIS Hub to identify direct export/API records.'],
    ['North Dakota State Forest MapServer layer', 'https://gis.dmr.nd.gov/dmrpublicservices/rest/services/State_Forest/MapServer/0', 'api', 'Direct queryable North Dakota State Forest polygon layer; confirm steward and update metadata.'],
  ],
  OH: [
    ['ODNR Ohio_POI MapServer layer 0 and GIS data catalog', 'https://gis2.ohiodnr.gov/arcgis/rest/services/OIT_Services/Ohio_POI/MapServer/0', 'api', 'Direct queryable points include park and forestry divisions but metadata says the inventory is incomplete; ODNR catalog lists separate agency trails.'],
    ['ODNR Ohio_POI MapServer layer 0 and GIS data catalog', 'https://apps.ohiodnr.gov/gims/response.asp?category=Select&county=Statewide', 'catalog', 'ODNR GIS catalog exposes separate Parks/Forestry trails and points, while the public POI layer is explicitly incomplete.'],
  ],
  OK: [
    ['Oklahoma State Parks map and park information', 'https://www.travelok.com/at/state_parks', 'info', 'Official state parks map and visitor information found; no direct statewide State Parks vector download/API was verified.'],
    ['Oklahoma Forestry Services EcoInventory FeatureServer layer 68', 'https://services3.arcgis.com/yrIZ0Nv0mSGTWJsH/arcgis/rest/services/Eco_Inventory_view/FeatureServer/68', 'api', 'OFS GIS metadata identifies this as its EcoInventory point layer (10,578 features; data process dated 2022); it is not a forest-boundary layer and must be checked for currentness and terms.'],
  ],
  OR: [
    ['Oregon State Parks dataset', 'https://data.oregon.gov/dataset/State-Parks/xcg5-4ykx', 'download', 'State dataset is offered through Oregon Open Data formats; inspect steward, last update, and terms before use.'],
    ['Oregon Department of Forestry Forestry Managed Lands dataset', 'https://geohub.oregon.gov/datasets/oregon-geo::forestry-managed-lands', 'download', 'Direct agency dataset covers Board of Forestry and Common School lands; catalog reports June 2023 data vintage.'],
  ],
  PA: [
    ['PA DCNR Bureau of Forestry StateForests FeatureServer', 'https://www.gis.dcnr.state.pa.us/agsprod/rest/services/BOF/StateForests/FeatureServer', 'api', 'Direct DCNR service contains state forest land, state parks, and game lands; queryable API.'],
    ['PA DCNR Bureau of Forestry StateForests FeatureServer', 'https://www.gis.dcnr.state.pa.us/agsprod/rest/services/BOF/StateForests/FeatureServer', 'api', 'Same agency service distinguishes state park and forest land; DCNR also published a field-surveyed state park trail inventory.'],
  ],
  RI: [
    ['RIDEM Conserved_Land_in_RI_v2 MapServer state conservation land layer', 'https://risegis.ri.gov/hosting/rest/services/RIDEM/Conserved_Land_in_RI_v2/MapServer/3', 'api', 'Direct queryable State Conservation Land layer from RIDEM; land coverage is not a trail/amenity feed.'],
    ['RIDEM Conserved_Land_in_RI_v2 MapServer state conservation land layer', 'https://risegis.ri.gov/hosting/rest/services/RIDEM/Conserved_Land_in_RI_v2/MapServer/3', 'api', 'Shared RIDEM layer covers state-managed conservation land; verify which sites are forests versus parks and access status.'],
  ],
  SC: [
    ['South Carolina State Parks visitor maps and information', 'https://southcarolinaparks.com/', 'info', 'Agency visitor maps found; no direct statewide parks API/download was verified.'],
    ['South Carolina Forestry Commission GIS layer inventory', 'https://dc.statelibrary.sc.gov/bitstreams/069a4c87-080a-4334-9f1a-fbe89e9c3809/download', 'catalog', 'State GIS Council inventory lists State Forest boundaries, roads, facilities, and operational layers, but a public download/service endpoint was not verified.'],
  ],
  SD: [
    ['South Dakota GFP land stewardship MapServer', 'https://ert.gfp.sd.gov/arcgis/rest/services/SD_Public/ReferenceLayers_LandStewardship/MapServer/1', 'api', 'Direct queryable layer includes SD parks and recreation areas; other land layers are in the same service.'],
    ['South Dakota GIS Hub', 'https://sdgis.sd.gov/', 'catalog', 'Official statewide GIS data portal is the discovery route for DANR forestry layers; an exact Forestry dataset was not confirmed.'],
  ],
  TN: [
    ['Tennessee State Parks Public Data Portal Search API', 'https://gis.tnstateparks.com/api/search/definition/', 'api', 'Official OGC API Records catalog and geoservice endpoints support searching collections and querying feature layers; select a collection before use.'],
    ['Tennessee State Downloadable GIS Data portal', 'https://geodata.tn.gov/', 'catalog', 'Authoritative state catalog has agriculture, recreation, and environmental categories; identify and verify TDA Forestry records.'],
  ],
  TX: [
    ['TPWD State Park Boundaries and statewide trail KMZ', 'https://tpwd.texas.gov/gis/data/baselayers/state-park-boundaries-zip/view', 'download', 'Direct boundary ZIP is dated January 30, 2015; TPWD also publishes statewide park-trail KMZ and says it is periodically updated.'],
    ['Texas A&M Forest Service Texas Forest Information and GIS services', 'https://tfsgis.tfs.tamu.edu/arcgis/rest/services', 'catalog', 'Official TFS REST directory verified but does not expose a clearly named statewide public forest layer in its root listing; inspect service folders and terms.'],
  ],
  UT: [
    ['Utah State Parks GIS maps and data', 'https://stateparks.utah.gov/resources/gis-maps-and-data/', 'catalog', 'Official park GIS page links web maps; use the State Geographic Information Datasource to find downloadable park datasets.'],
    ['Utah FFSL GIS & Mapping / Central Index', 'https://ffsl.utah.gov/about/maps/', 'catalog', 'Agency GIS page links to Utah DNR Central Index; exact current downloadable Forestry layer was not selected in this audit.'],
  ],
  VT: [
    ['Vermont ANR Atlas FPR MapServer', 'https://anrmaps.vermont.gov/arcgis/rest/services/map_services/MAP_ANR_ANRATLASFPR_WM_NOCACHE/MapServer', 'api', 'Direct REST service includes State Park, Reserve Forest, managed lands, trails, roads, and facilities.'],
    ['Vermont ANR Atlas FPR MapServer', 'https://anrmaps.vermont.gov/arcgis/rest/services/map_services/MAP_ANR_ANRATLASFPR_WM_NOCACHE/MapServer', 'api', 'Shared agency service covers FPR-managed forests and parks; layer-level update cadence and use limits should be reviewed.'],
  ],
  VA: [
    ['Virginia State Parks park-specific GIS/Avenza map downloads', 'https://www.dcr.virginia.gov/state-parks/document/data/', 'download', 'Direct agency map files are park-specific PDFs/GeoPDFs, not a verified statewide vector layer.'],
    ['Virginia Department of Forestry State Forest map downloads', 'https://www.dof.virginia.gov/education-and-recreation/state-forests/', 'download', 'Agency offers forest-specific offline maps, generally PDFs/Avenza maps; no statewide public vector API was verified.'],
  ],
  WA: [
    ['Washington State Parks PARKS - Park Boundaries item', 'https://www.arcgis.com/home/item.html?id=3385b003af5248e59c1fa68e1411c446', 'catalog', 'Agency-maintained feature layer item reports monthly-or-more-frequent revisions and a June 2026 update; retrieve its linked feature service from the item.'],
    ['Washington DNR GIS Open Data Portal', 'https://data-wadnr.opendata.arcgis.com/', 'catalog', 'Agency portal supports data search/download/stream for forest inventory, management, transport, and fire layers; choose exact public records.'],
  ],
  WV: [
    ['West Virginia State_Parks public lands MapServer layer', 'https://gis.transportation.wv.gov/arcgis/rest/services/Boundaries/MapServer/10', 'api', 'Direct queryable parks layer cites WV DNR; validate dataset lineage and intended use.'],
    ['West Virginia Division of Forestry State Forest dataset downloads', 'https://wvgis.wvu.edu/data/dataset.php?ID=58', 'download', 'State Forestry-origin state forest dataset available as geodatabase/shapefile; WVGISTC record says revised in 2022 for PAD-US.'],
  ],
  WI: [
    ['Wisconsin DNR GIS Open Data Portal', 'https://data-wi-dnr.opendata.arcgis.com/', 'catalog', 'Official DNR portal includes Parks and Recreation datasets; select exact park boundary, trail, and facility records.'],
    ['Wisconsin DNR GIS Open Data Portal', 'https://data-wi-dnr.opendata.arcgis.com/', 'catalog', 'Same portal exposes a Forestry category and downloadable/streamable DNR data; select current forest records.'],
  ],
  WY: [
    ['Wyoming State Parks WyoStateParks MapServer layer 26', 'https://gis2.statelands.wyo.gov/arcgis/rest/services/WyoStateParks/MapServer/26', 'api', 'Direct queryable service represents Wyoming State Parks; confirm division stewardship and layer metadata.'],
    ['Wyoming State Forestry Division Forest Action Plan maps', 'https://wsfd.wyo.gov/', 'info', 'Agency publishes a Forest Action Plan interactive map and forest information; a direct public statewide forest GIS download/API was not verified.'],
  ],
};

const kindLabel = {
  api: 'Direct GIS API',
  download: 'Agency data/download page',
  catalog: 'Official GIS catalog or data portal',
  info: 'Agency maps or information page',
};

function statusFor(kind) {
  if (kind === 'api') return 'Direct GIS API found; verify completeness, terms, and freshness before integration.';
  if (kind === 'download') return 'Agency download found; verify scope, terms, and data vintage before integration.';
  if (kind === 'catalog') return 'Official catalog found; select the exact dataset and verify terms/freshness before integration.';
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

const audit = [
  '# State Agency Direct-Source Coverage Audit',
  '',
  '**Audit date:** 2026-09-25',
  '**Scope:** The parks and forestry agencies identified in [`config/us-state-forestry-agencies.json`](../config/us-state-forestry-agencies.json) for the 49 states other than New York (98 agency-source checks).',
  '**Finding:** A source-discovery result is recorded for every agency. This is not a claim that data have been integrated, are complete, are current, or may be redistributed.',
  '',
  '## Coverage summary',
  '',
  `- ${counts.api} direct GIS API endpoints were identified.`,
  `- ${counts.download} agency data/download pages or dataset downloads were identified.`,
  `- ${counts.catalog} official data catalogs/portals were identified where an exact dataset still needs to be selected.`,
  `- ${counts.info} agency map/information pages were identified; a statewide reusable dataset/API was not verified in this audit.`,
  '- API and download entries may still be partial, stale, generalized, or subject to limits; each notes a specific known caveat where found.',
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
  'The table links each identified agency to its discovered direct source, official catalog, or public map/information page. Full source notes and known limitations are in the [49-state agency source audit](STATE_AGENCY_SOURCE_AUDIT.md). New York remains in the [NYS agency source coverage audit](NYS_AGENCY_SOURCE_COVERAGE_AUDIT.md). Source discovery does not mean data have been integrated or rights/currentness have been approved.',
  '',
  '| Code | State | Parks agency | Parks source | Parks status | Forestry agency | Forestry source | Forestry status |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...agencyRows,
  '',
].join('\n');
const nextTracker = `${tracker.slice(0, sectionStart)}${trackingSection}${tracker.slice(sectionEnd)}`;
await writeFile(trackerPath, nextTracker, 'utf8');
console.log(`Wrote source records for ${states.length} states (${states.length * 2} agencies): ${JSON.stringify(counts)}`);

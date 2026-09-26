#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = join(root, 'config/us-state-forestry-agencies.json');
const trackerPath = join(root, 'docs/STATE_DATA_PACKAGE_TRACKER.md');
const defaultOutput = join(root, 'packages/map/src/assets/state-packages/US');
const PAGE_SIZE = 100;
const MAX_RETRIES = 5;
const GEOMETRY_PRECISION = 5;
const SIMPLIFICATION_DEGREES = 0.00003;
const GENERATED_AT = new Date().toISOString();

const API = {
  census:
    'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query',
  padus:
    'https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Fee_Managers_PADUS/FeatureServer/0',
  npsTrails:
    'https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails_Geographic/FeatureServer/0',
  npsPois:
    'https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_POIs_Geographic/FeatureServer/0',
  usfsTrails:
    'https://apps.fs.usda.gov/ArcX/rest/services/EDW/EDW_TrailNFSPublishWithDataStatus_01/MapServer/0',
  usfsRecreation:
    'https://apps.fs.usda.gov/ArcX/rest/services/EDW/EDW_RecInfraRecreationSites_02/MapServer/0',
  usfsMvumRoads:
    'https://apps.fs.usda.gov/ArcX/rest/services/EDW/EDW_MVUM_02/MapServer/1',
  usfsMvumTrails:
    'https://apps.fs.usda.gov/ArcX/rest/services/EDW/EDW_MVUM_02/MapServer/2',
  blmSma:
    'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_LimitedScale/MapServer/1',
  blmRecreation:
    'https://gis.blm.gov/arcgis/rest/services/recreation/BLM_Natl_Recreation_Offline/FeatureServer/2',
};

const DATA_SOURCES = [
  {
    key: 'usgsPadus',
    id: 'usgs-pad-us-fee-managers',
    label: 'USGS PAD-US fee managers',
    agency: 'U.S. Geological Survey, Gap Analysis Project',
    endpoint: API.padus,
    pageSize: 50,
    geometryPrecision: 4,
    simplificationDegrees: 0.00015,
    query: (state) => ({
      where: "State_Nm='" + state.code + "' AND FeatClass='Fee' AND (Own_Type IN ('FED','STAT','TERR','LOC','DIST') OR Mang_Type IN ('FED','STAT','TERR','LOC','DIST'))",
    }),
    fields:
      'OBJECTID,FeatClass,Category,Own_Type,Own_Name,Loc_Own,Mang_Type,Mang_Name,Loc_Mang,Des_Tp,Loc_Ds,Unit_Nm,Loc_Nm,State_Nm,Agg_Src,GIS_Src,Src_Date,GIS_Acres,Pub_Access,Access_Src,Access_Dt,Date_Est,Comments',
    terms: 'https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-download',
    attribution: ['U.S. Geological Survey Gap Analysis Project', 'PAD-US data providers and state stewards'],
    mapper: padusFeature,
  },
  {
    key: 'npsTrails',
    id: 'nps-public-trails',
    label: 'NPS public trails',
    agency: 'National Park Service',
    endpoint: API.npsTrails,
    spatial: true,
    fields:
      'OBJECTID,TRLFEATTYPE,TRLNAME,TRLALTNAME,TRLSTATUS,TRLSURFACE,TRLTYPE,TRLCLASS,TRLUSE,PUBLICDISPLAY,DATAACCESS,ACCESSNOTES,ORIGINATOR,UNITCODE,UNITNAME,UNITTYPE,GROUPCODE,GROUPNAME,REGIONCODE,SOURCEDATE,OPENTOPUBLIC,SEASONAL,SEASDESC,MAINTAINER,NOTES,FEATUREID,MAPSOURCE',
    terms: 'https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails_Geographic/FeatureServer/0/iteminfo',
    attribution: ['National Park Service'],
    mapper: npsTrailFeature,
  },
  {
    key: 'npsPois',
    id: 'nps-public-points-of-interest',
    label: 'NPS public points of interest',
    agency: 'National Park Service',
    endpoint: API.npsPois,
    spatial: true,
    fields:
      'OBJECTID,POINAME,POIALTNAME,POITYPE,POISTATUS,PUBLICDISPLAY,DATAACCESS,ACCESSNOTES,ORIGINATOR,UNITCODE,UNITNAME,UNITTYPE,GROUPCODE,GROUPNAME,REGIONCODE,SOURCEDATE,OPENTOPUBLIC,SEASONAL,SEASDESC,MAINTAINER,NOTES,FEATUREID,MAPSOURCE',
    terms: 'https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_POIs_Geographic/FeatureServer/0/iteminfo',
    attribution: ['National Park Service'],
    mapper: npsPoiFeature,
  },
  {
    key: 'usfsTrails',
    id: 'usfs-national-forest-system-trails',
    label: 'USFS National Forest System trails',
    agency: 'U.S. Department of Agriculture, Forest Service',
    endpoint: API.usfsTrails,
    pageSize: 50,
    spatial: true,
    fields:
      'OBJECTID,trail_name,trail_type,trail_cn,admin_org,managing_org,security_id,attributesubset,national_trail_designation,trail_class,accessibility_status,trail_surface,surface_firmness,typical_trail_grade,typical_tread_width,special_mgmt_area,terra_motorized,snow_motorized,water_motorized,allowed_terra_use,hiker_pedestrian_managed,hiker_pedestrian_accpt,hiker_pedestrian_disc,hiker_pedestrian_restricted,bicycle_managed,bicycle_accpt,bicycle_disc,motorcycle_managed,motorcycle_accpt,atv_managed,atv_accpt,trail_no,gis_miles,e_bike_class1_managed,e_bike_class1_accpt,globalid',
    terms: 'https://data.fs.usda.gov/geodata/edw/datasets.php',
    attribution: ['U.S. Department of Agriculture, Forest Service'],
    mapper: usfsTrailFeature,
  },
  {
    key: 'usfsRecreation',
    id: 'usfs-recreation-sites',
    label: 'USFS recreation sites',
    agency: 'U.S. Department of Agriculture, Forest Service',
    endpoint: API.usfsRecreation,
    spatial: true,
    fields:
      'OBJECTID,site_cn,region,site_id,site_name,site_type,activity_type_list,service_type_list,seasonal_operational_status,op_status_reason,development_status,development_scale,site_contact_notes,recarea_name,recarea_description,official_designation,fee_charged,fee_type,fee_description,operational_hours,open_season,best_season,busiest_season,maximum_elevation,minimum_elevation,important_info,restrictions,directions,latitude,longitude,states_spanned,infra_last_update,edw_last_modify,globalid',
    terms: 'https://data.fs.usda.gov/geodata/edw/datasets.php',
    attribution: ['U.S. Department of Agriculture, Forest Service'],
    mapper: usfsRecreationFeature,
  },
  {
    key: 'usfsMvumRoads',
    id: 'usfs-mvum-roads',
    label: 'USFS motor vehicle use map roads',
    agency: 'U.S. Department of Agriculture, Forest Service',
    endpoint: API.usfsMvumRoads,
    pageSize: 200,
    geometryPrecision: 4,
    simplificationDegrees: 0.00015,
    spatial: true,
    fields:
      'OBJECTID,rte_cn,id,name,bmp,emp,seg_length,gis_miles,mvum_symbol_name,jurisdiction,operationalmaintlevel,surfacetype,system,seasonal,passengervehicle,passengervehicle_datesopen,highclearancevehicle,highclearancevehicle_datesopen,truck,bus,motorhome,fourwd_gt50inches,atv,motorcycle,adminorg,districtname,forestname,routestatus,globalid',
    terms: 'https://data.fs.usda.gov/geodata/edw/datasets.php',
    attribution: ['U.S. Department of Agriculture, Forest Service'],
    mapper: usfsMvumRoadFeature,
  },
  {
    key: 'usfsMvumTrails',
    id: 'usfs-mvum-trails',
    label: 'USFS motor vehicle use map trails',
    agency: 'U.S. Department of Agriculture, Forest Service',
    endpoint: API.usfsMvumTrails,
    pageSize: 200,
    geometryPrecision: 4,
    simplificationDegrees: 0.00015,
    spatial: true,
    fields:
      'OBJECTID,rte_cn,id,name,bmp,emp,seg_length,gis_miles,mvum_symbol_name,jurisdiction,seasonal,passengervehicle,passengervehicle_datesopen,highclearancevehicle,highclearancevehicle_datesopen,truck,bus,motorhome,fourwd_gt50inches,atv,motorcycle,adminorg,districtname,forestname,trailstatus,trailsystem,trailclass,globalid',
    terms: 'https://data.fs.usda.gov/geodata/edw/datasets.php',
    attribution: ['U.S. Department of Agriculture, Forest Service'],
    mapper: usfsMvumTrailFeature,
  },
  {
    key: 'blmSma',
    id: 'blm-surface-management-agency',
    label: 'BLM surface management agency boundaries',
    agency: 'U.S. Department of the Interior, Bureau of Land Management',
    endpoint: API.blmSma,
    pageSize: 50,
    geometryPrecision: 4,
    simplificationDegrees: 0.00015,
    query: (state) => ({ where: "ADMIN_ST='" + state.code + "' AND ADMIN_AGENCY_CODE='BLM'" }),
    fields:
      'OBJECTID,SMA_ID,ADMIN_DEPT_CODE,ADMIN_AGENCY_CODE,ADMIN_UNIT_NAME,ADMIN_UNIT_TYPE,HOLD_ID,HOLD_DEPT_CODE,HOLD_AGENCY_CODE,ADMIN_ST,FAU_ID',
    terms: 'https://www.blm.gov/services/geospatial/GISData',
    attribution: ['U.S. Department of the Interior, Bureau of Land Management'],
    mapper: blmFeature,
  },
  {
    key: 'blmRecreationSites',
    id: 'blm-public-recreation-sites',
    label: 'BLM public recreation sites',
    agency: 'U.S. Department of the Interior, Bureau of Land Management',
    endpoint: API.blmRecreation,
    spatial: true,
    fields:
      'OBJECTID,FET_TYPE,FET_SUBTYPE,FET_NAME,ADM_UNIT_CD,ADMIN_ST,DESCRIPTION,WEB_LINK,UNIT_NAME,SOURCE,WEB_DISPLAY',
    terms: 'https://gis.blm.gov/arcgis/rest/services/recreation/BLM_Natl_Recreation_Offline/FeatureServer/2',
    attribution: ['U.S. Department of the Interior, Bureau of Land Management'],
    mapper: blmRecreationFeature,
  },
];

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseArguments(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`invalid argument near ${name ?? '<end>'}`);
    }
    parsed.set(name.slice(2), value);
  }
  return parsed;
}

function dateString(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.valueOf()) ? parsed.toISOString() : String(value);
  }
  const valueString = String(value);
  const parsed = new Date(valueString);
  return Number.isFinite(parsed.valueOf()) ? parsed.toISOString() : valueString;
}

function stableId(source, feature, properties) {
  const nativeId =
    feature.id ??
    properties.OBJECTID ??
    properties.objectid ??
    properties.globalid ??
    properties.GLOBALID ??
    properties.FEATUREID ??
    properties.FEATURE_ID;
  const id = nativeId ?? sha256(stableJson({ properties, geometry: feature.geometry })).slice(0, 20);
  return `${source.id}:${String(id)}`;
}

function normalizedFeature(source, feature, state) {
  const input = feature.properties ?? {};
  const mapped = source.mapper(input, state);
  if (!mapped.name || !feature.geometry || typeof feature.geometry.type !== 'string') return null;
  const id = stableId(source, feature, input);
  const properties = {
    id,
    name: mapped.name,
    kind: mapped.kind,
    category: mapped.category,
    origin: 'public-catalog',
    sourceId: source.id,
    sourceUrl: source.endpoint,
    publicUse: mapped.publicUse,
    ...(mapped.unit ? { unit: mapped.unit } : {}),
    ...(mapped.sourceUpdated ? { sourceUpdated: mapped.sourceUpdated } : {}),
    details: mapped.details,
  };
  return { type: 'Feature', id, geometry: feature.geometry, properties };
}

function padusFeature(properties) {
  const accessCodes = {
    OA: 'PAD-US reports open access; verify current manager conditions and restrictions.',
    RA: 'PAD-US reports restricted access; confirm permits and seasonal rules with the manager.',
    XA: 'PAD-US reports access is not open to the public.',
    UA: 'PAD-US access is unknown; verify with the land manager.',
  };
  return {
    kind: 'land',
    category: 'public-land',
    name: properties.Unit_Nm ?? properties.Mang_Name ?? 'Public land unit',
    unit: properties.Mang_Name ?? properties.Own_Name ?? null,
    sourceUpdated: dateString(properties.Src_Date),
    publicUse:
      accessCodes[properties.Pub_Access] ??
      'PAD-US does not report an access classification; verify with the land manager.',
    details: {
      manager: properties.Mang_Name,
      managerType: properties.Mang_Type,
      localManager: properties.Loc_Mang,
      owner: properties.Own_Name,
      ownerType: properties.Own_Type,
      designation: properties.Des_Tp,
      localDesignation: properties.Loc_Ds,
      sourceAccessCode: properties.Pub_Access,
      accessSource: properties.Access_Src,
      accessDate: dateString(properties.Access_Dt),
      acres: properties.GIS_Acres,
      established: properties.Date_Est,
      stateCode: properties.State_Nm,
      originalGisSource: properties.GIS_Src,
      sourceAggregator: properties.Agg_Src,

    },
  };
}

function npsTrailFeature(properties) {
  return {
    kind: 'trail',
    category: 'trail',
    name: properties.TRLNAME ?? properties.MAPLABEL ?? properties.TRLALTNAME,
    unit: properties.UNITNAME ?? null,
    sourceUpdated: dateString(properties.SOURCEDATE),
    publicUse: publicStatus(properties.OPENTOPUBLIC, properties.PUBLICDISPLAY, properties.DATAACCESS),
    details: {
      alternateName: properties.TRLALTNAME,
      trailType: properties.TRLTYPE,
      featureType: properties.TRLFEATTYPE,
      status: properties.TRLSTATUS,
      class: properties.TRLCLASS,
      surface: properties.TRLSURFACE,
      uses: properties.TRLUSE,
      seasonal: properties.SEASONAL,
      seasonDescription: properties.SEASDESC,
      accessNotes: properties.ACCESSNOTES,
      npsUnitCode: properties.UNITCODE,
      npsUnitType: properties.UNITTYPE,
      maintainer: properties.MAINTAINER,
      sourceOriginator: properties.ORIGINATOR,
    },
  };
}

function npsPoiFeature(properties) {
  return {
    kind: 'poi',
    category: String(properties.POITYPE ?? 'outdoor').toLowerCase().replaceAll(' ', '_'),
    name: properties.POINAME ?? properties.MAPLABEL ?? properties.POIALTNAME,
    unit: properties.UNITNAME ?? null,
    sourceUpdated: dateString(properties.SOURCEDATE),
    publicUse: publicStatus(properties.OPENTOPUBLIC, properties.PUBLICDISPLAY, properties.DATAACCESS),
    details: {
      alternateName: properties.POIALTNAME,
      poiType: properties.POITYPE,
      status: properties.POISTATUS,
      seasonal: properties.SEASONAL,
      seasonDescription: properties.SEASDESC,
      accessNotes: properties.ACCESSNOTES,
      npsUnitCode: properties.UNITCODE,
      npsUnitType: properties.UNITTYPE,
      maintainer: properties.MAINTAINER,
      sourceOriginator: properties.ORIGINATOR,
    },
  };
}

function usfsTrailFeature(properties) {
  return {
    kind: 'trail',
    category: 'trail',
    name: properties.trail_name ?? properties.trail_no ?? properties.trail_cn,
    unit: properties.admin_org ?? properties.managing_org ?? null,
    sourceUpdated: null,
    publicUse: 'USFS visitor trail; confirm current closures and local use restrictions.',
    details: {
      trailNumber: properties.trail_no,
      trailType: properties.trail_type,
      trailClass: properties.trail_class,
      nationalTrailDesignation: properties.national_trail_designation,
      accessibility: properties.accessibility_status,
      surface: properties.trail_surface,
      surfaceFirmness: properties.surface_firmness,
      typicalGrade: properties.typical_trail_grade,
      typicalTreadWidth: properties.typical_tread_width,
      managedUses: properties.allowed_terra_use,
      hikerAccess: properties.hiker_pedestrian_managed,
      bicycleAccess: properties.bicycle_managed,
      motorizedAccess: properties.terra_motorized,
      snowAccess: properties.snow_motorized,
      waterAccess: properties.water_motorized,
      miles: properties.gis_miles,
      attributesAvailable: properties.attributesubset,
      managingOrganization: properties.managing_org,
      securityId: properties.security_id,
    },
  };
}

function usfsRecreationFeature(properties) {
  return {
    kind: 'poi',
    category: String(properties.site_type ?? 'recreation').toLowerCase().replaceAll(' ', '_'),
    name: properties.site_name ?? properties.recarea_name,
    unit: properties.official_designation ?? properties.recarea_name ?? null,
    sourceUpdated: dateString(properties.edw_last_modify ?? properties.infra_last_update),
    publicUse: 'USFS recreation site; verify current season, fees, access and closures.',
    details: {
      siteId: properties.site_id,
      siteType: properties.site_type,
      activities: properties.activity_type_list,
      services: properties.service_type_list,
      seasonalStatus: properties.seasonal_operational_status,
      operationalStatusReason: properties.op_status_reason,
      developmentStatus: properties.development_status,
      developmentScale: properties.development_scale,
      recreationArea: properties.recarea_name,
      description: properties.recarea_description,
      feesCharged: properties.fee_charged,
      feeType: properties.fee_type,
      feeDescription: properties.fee_description,
      hours: properties.operational_hours,
      season: properties.open_season,
      bestSeason: properties.best_season,
      busiestSeason: properties.busiest_season,
      importantInformation: properties.important_info,
      restrictions: properties.restrictions,
      directions: properties.directions,
      elevationRangeMeters: [properties.minimum_elevation, properties.maximum_elevation],
      siteContactNotes: properties.site_contact_notes,
    },
  };
}

function usfsMvumRoadFeature(properties) {
  return {
    kind: 'road',
    category: 'road',
    name: properties.name ?? properties.id ?? properties.rte_cn,
    unit: properties.forestname ?? properties.adminorg ?? null,
    sourceUpdated: null,
    publicUse: 'USFS motor-vehicle route; access is vehicle-specific and may be seasonal.',
    details: {
      routeId: properties.rte_cn,
      jurisdiction: properties.jurisdiction,
      surfaceType: properties.surfacetype,
      maintenanceLevel: properties.operationalmaintlevel,
      seasonal: properties.seasonal,
      passengerVehicle: properties.passengervehicle,
      passengerVehicleDates: properties.passengervehicle_datesopen,
      highClearanceVehicle: properties.highclearancevehicle,
      highClearanceDates: properties.highclearancevehicle_datesopen,
      fourWheelDrive: properties.fourwd_gt50inches,
      atv: properties.atv,
      motorcycle: properties.motorcycle,
      miles: properties.gis_miles,
      forest: properties.forestname,
      rangerDistrict: properties.districtname,
      routeStatus: properties.routestatus,
    },
  };
}

function usfsMvumTrailFeature(properties) {
  return {
    kind: 'trail',
    category: 'trail',
    name: properties.name ?? properties.id ?? properties.rte_cn,
    unit: properties.forestname ?? properties.adminorg ?? null,
    sourceUpdated: null,
    publicUse: 'USFS motorized-use trail; vehicle access is limited and may be seasonal.',
    details: {
      routeId: properties.rte_cn,
      jurisdiction: properties.jurisdiction,
      seasonal: properties.seasonal,
      passengerVehicle: properties.passengervehicle,
      passengerVehicleDates: properties.passengervehicle_datesopen,
      highClearanceVehicle: properties.highclearancevehicle,
      highClearanceDates: properties.highclearancevehicle_datesopen,
      atv: properties.atv,
      motorcycle: properties.motorcycle,
      miles: properties.gis_miles,
      forest: properties.forestname,
      rangerDistrict: properties.districtname,
      trailStatus: properties.trailstatus,
      trailSystem: properties.trailsystem,
      trailClass: properties.trailclass,
    },
  };
}

function blmFeature(properties) {
  return {
    kind: 'land',
    category: 'public-land',
    name: properties.ADMIN_UNIT_NAME ?? properties.SMA_ID ?? 'BLM surface-management area',
    unit: properties.ADMIN_UNIT_TYPE ?? null,
    sourceUpdated: null,
    publicUse: 'BLM surface-management boundary; verify parcel ownership and access with BLM.',
    details: {
      stateCode: properties.ADMIN_ST,
      administrativeUnitType: properties.ADMIN_UNIT_TYPE,
      departmentCode: properties.ADMIN_DEPT_CODE,
      agencyCode: properties.ADMIN_AGENCY_CODE,
      holdingAgencyCode: properties.HOLD_AGENCY_CODE,
      surfaceManagementId: properties.SMA_ID,
      federalAdminUnitId: properties.FAU_ID,
    },
  };
}

function blmRecreationFeature(properties) {
  return {
    kind: 'poi',
    category: String(properties.FET_SUBTYPE ?? 'recreation').toLowerCase().replaceAll(' ', '_'),
    name: properties.FET_NAME ?? properties.UNIT_NAME,
    unit: properties.UNIT_NAME ?? properties.ADM_UNIT_CD ?? null,
    sourceUpdated: null,
    publicUse: 'BLM public recreation site; verify current access, closures, fire rules and facilities with BLM.',
    details: {
      featureType: properties.FET_TYPE,
      featureSubtype: properties.FET_SUBTYPE,
      administrativeUnitCode: properties.ADM_UNIT_CD,
      stateCode: properties.ADMIN_ST,
      description: properties.DESCRIPTION,
      sourceRecord: properties.SOURCE,
      webLink: properties.WEB_LINK,
      publicDisplay: properties.WEB_DISPLAY,
    },
  };
}

function publicStatus(open, display, access) {
  if (String(open ?? '').toUpperCase() === 'Y') return 'Source marks this feature open to public; verify current conditions.';
  if (String(display ?? '').toUpperCase() === 'Y') return 'Included in the source public display; verify current access.';
  if (String(access ?? '').toUpperCase() === 'PUBLIC') return 'Source classifies this feature as public; verify current conditions.';
  return 'Public source feature; access conditions are not specified in this record.';
}

function boundsForGeometry(geometry) {
  const bounds = [180, 90, -180, -90];
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      bounds[0] = Math.min(bounds[0], value[0]);
      bounds[1] = Math.min(bounds[1], value[1]);
      bounds[2] = Math.max(bounds[2], value[0]);
      bounds[3] = Math.max(bounds[3], value[1]);
      return;
    }
    for (const child of value) visit(child);
  };
  visit(geometry?.coordinates);
  return bounds[0] <= bounds[2] && bounds[1] <= bounds[3] ? bounds : null;
}

function toForm(parameters) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value === undefined || value === null) continue;
    form.set(key, typeof value === 'string' ? value : String(value));
  }
  return form;
}

async function requestJson(url, parameters, label) {
  const form = toForm(parameters);
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'Open Outdoor state data package acquisition',
        },
        body: form,
        signal: AbortSignal.timeout(600_000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`${label} HTTP ${response.status}: ${text.slice(0, 300)}`);
      const result = JSON.parse(text);
      if (result?.error) {
        const status = Number(result.error.code);
        const message = `${label} ArcGIS error ${status}: ${result.error.message ?? ''}`;
        if (![429, 502, 503, 504].includes(status) || attempt === MAX_RETRIES - 1) {
          throw new Error(message);
        }
      } else {
        return result;
      }
    } catch (error) {
      if (attempt === MAX_RETRIES - 1) throw error;
    }
    await new Promise((resume) => setTimeout(resume, 1_000 * 2 ** attempt));
  }
  throw new Error(`${label} retry loop ended unexpectedly`);
}

async function fetchStateBoundary(state) {
  const result = await requestJson(
    API.census,
    {
      where: `STUSAB='${state.code}'`,
      outFields: 'GEOID,STUSAB,NAME',
      outSR: 4326,
      returnGeometry: true,
      f: 'json',
    },
    `${state.code} Census boundary`,
  );
  if (!Array.isArray(result.features) || result.features.length !== 1 || !result.spatialReference) {
    throw new Error(`${state.code} Census boundary response is incomplete`);
  }
  return {
    geometry: {
      ...result.features[0].geometry,
      spatialReference: result.spatialReference,
    },
    properties: result.features[0].attributes,
  };
}

async function fetchSource(source, state, boundary) {
  const query = source.query?.(state) ?? {
    where: '1=1',
    geometry: JSON.stringify(boundary.geometry),
    geometryType: 'esriGeometryPolygon',
    inSR: String(boundary.geometry.spatialReference.wkid),
    spatialRel: 'esriSpatialRelIntersects',
  };
  const inventory = await requestJson(
    `${source.endpoint}/query`,
    {
      ...query,
      returnIdsOnly: true,
      returnGeometry: false,
      f: 'json',
    },
    `${state.code} ${source.id} inventory`,
  );
const inventoryIds = inventory.objectIds ?? [];
  if (!Array.isArray(inventoryIds)) {
    throw new Error(state.code + ' ' + source.id + ' response has invalid objectIds');
  }
  const objectIds = [...new Set(inventoryIds)].sort((left, right) => left - right);
  const sourceFeatures = [];
  const pageSize = source.pageSize ?? PAGE_SIZE;
  for (let offset = 0; offset < objectIds.length; offset += pageSize) {
    const pageIds = objectIds.slice(offset, offset + pageSize);
    const page = await requestJson(
      `${source.endpoint}/query`,
      {
        ...query,
        objectIds: pageIds.join(','),
        outFields: source.fields,
        outSR: 4326,
        geometryPrecision: source.geometryPrecision ?? GEOMETRY_PRECISION,
        maxAllowableOffset: source.simplificationDegrees ?? SIMPLIFICATION_DEGREES,
        returnGeometry: true,
        f: 'geojson',
      },
      `${state.code} ${source.id} page ${Math.floor(offset / pageSize) + 1}`,
    );
    if (!Array.isArray(page.features) || page.exceededTransferLimit) {
      throw new Error(`${state.code} ${source.id} returned an incomplete page`);
    }
    sourceFeatures.push(...page.features);
  }
  if (sourceFeatures.length > objectIds.length) {
    throw new Error(
      `${state.code} ${source.id} returned more features than its ${objectIds.length}-ID inventory: ${sourceFeatures.length}`,
    );
  }
  const normalized = sourceFeatures
    .map((feature) => normalizedFeature(source, feature, state))
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    features: normalized,
    receipt: {
      id: source.id,
      name: source.label,
      agency: source.agency,
      url: source.endpoint,
      terms: source.terms,
      attribution: source.attribution,
      fields: source.fields.split(','),
      geometryPrecision: source.geometryPrecision ?? GEOMETRY_PRECISION,
      simplificationDegrees: source.simplificationDegrees ?? SIMPLIFICATION_DEGREES,
      queriedAt: GENERATED_AT,
      inventoryFeatureCount: objectIds.length,
      sourceFeatureCount: sourceFeatures.length,
      unreturnedFeatureCount: objectIds.length - sourceFeatures.length,
      packagedFeatureCount: normalized.length,
      filteredFeatureCount: sourceFeatures.length - normalized.length,
      packagedFeatureSha256: sha256(JSON.stringify(normalized)),
    },
  };
}

function buildIndex(features) {
  return {
    schemaVersion: 1,
    features: features.map((feature) => ({
      id: feature.id,
      bounds: boundsForGeometry(feature.geometry),
      properties: {
        id: feature.properties.id,
        name: feature.properties.name,
        kind: feature.properties.kind,
        category: feature.properties.category,
        sourceId: feature.properties.sourceId,
        sourceUpdated: feature.properties.sourceUpdated,
        publicUse: feature.properties.publicUse,
        unit: feature.properties.unit,
      },
    })),
  };
}

function packageManifest(state, receipts, geojsonBytes, indexBytes, features) {
  const padusFeatures = features.filter((feature) => feature.properties.sourceId === 'usgs-pad-us-fee-managers');
  const stateManagedFeatures = padusFeatures.filter(
    (feature) =>
      feature.properties.details.ownerType === 'STAT' ||
      feature.properties.details.managerType === 'STAT',
  );
  const forestryNamedFeatures = stateManagedFeatures.filter((feature) =>
    /forest|forestry|woodland|timber/i.test(
      String(feature.properties.name ?? '') + ' ' +
      String(feature.properties.unit ?? '') + ' ' +
      String(feature.properties.details.manager ?? ''),
    ),
  );
  return {
    schemaVersion: 1,
    packageId: `outdoor-${state.code.toLowerCase()}`,
    state: { code: state.code, fips: state.fips, name: state.name },
    generatedAt: GENERATED_AT,
    classification: 'SOURCE_REDISTRIBUTABLE',
    distribution: 'public',
    coordinateReferenceSystem: 'EPSG:4326',
    geometryProcessing: 'Source-specific simplification parameters are recorded in each source receipt.',
    featureCount: features.length,
    artifacts: {
      geojson: { file: 'outdoors.geojson', bytes: geojsonBytes.length, sha256: sha256(geojsonBytes) },
      index: { file: 'index.json', bytes: indexBytes.length, sha256: sha256(indexBytes) },
    },
    coverage: {
      extent: 'State polygon and intersecting national-agency features; cross-border features may be present in more than one adjacent state package.',
      content:
        'Federal and state-managed protected lands from the PAD-US Fee inventory; NPS public trails and visitor points; USFS visitor trails, recreation sites, MVUM roads and trails; BLM surface-management areas and public recreation sites where present.',
      limitations: [
        'PAD-US 4.1 is a periodic protected-area inventory and can lag individual land managers; original GIS and aggregator lineage are retained per feature when supplied.',
        'State-owned and state-managed PAD-US records form the statewide forest and park land baseline. State agency links are retained for current information; state-specific trails, roads, recreation sites, rules and closures are not represented unless present in a named source layer.',
        'A land or recreation feature does not establish current access, permission to enter, camping legality, or current operating status.',
        'USFS MVUM roads and trails describe motorized-use designations; they do not represent all non-motorized trails or current travel conditions.',
      ],
    },
    stateForestry: {
      agency: state.forestryAgency,
      agencyUrl: state.agencyUrl,
      includedLayer:
        'State-owned or state-managed public land records in PAD-US; owner and manager types, names, source GIS, aggregator source, and public-access classification are retained per feature.',
      stateManagedPadusFeatureCount: stateManagedFeatures.length,
      forestNamedPadusFeatureCount: forestryNamedFeatures.length,
      sourceLineageFields: ['Own_Name', 'Own_Type', 'Mang_Name', 'Mang_Type', 'GIS_Src', 'Agg_Src'],
      directAgencyLayerIncluded: false,
      followUp:
        'Identify and rights-review direct agency GIS layers for forest tracts, trails, roads, facilities, rules, and closures where available.',
    },
    rights: {
      licenseBasis:
        'USGS PAD-US 4.1 public data release; official NPS, USDA Forest Service Enterprise Data, and BLM map-service records. Per-source attribution and use terms are recorded below.',
      offlineStorage: true,
      redistribution: true,
      derivation: true,
      reviewState:
        'National source terms and public-use basis recorded; state land records retain PAD-US source lineage. Direct state-layer review remains open.',
      attribution: [...new Set(receipts.flatMap((receipt) => receipt.attribution))].sort(),
      sourceTerms: receipts.map(({ id, terms }) => ({ id, url: terms })),
    },
    sources: receipts,
    disclaimers: [
      'Map display is informational and is not a legal access, property, camping, closure, fire, or safety determination.',
      'Confirm current rules and conditions with the responsible land manager before travel.',
    ],
  };
}

function trackerRow(state, manifest, relativeDirectory) {
  const byId = new Map(manifest.sources.map((source) => [source.id, source.packagedFeatureCount]));
  const total = manifest.featureCount.toLocaleString('en-US');
  const sourceNames = manifest.sources
    .filter((source) => source.packagedFeatureCount > 0)
    .map((source) => source.name)
    .join(', ');
  const zeroSources = manifest.sources
    .filter((source) => source.packagedFeatureCount === 0)
    .map((source) => source.name)
    .join(', ');
  const counts = [
    `PAD-US ${byId.get('usgs-pad-us-fee-managers') ?? 0}`,
    `NPS trails ${byId.get('nps-public-trails') ?? 0}`,
    `NPS POIs ${byId.get('nps-public-points-of-interest') ?? 0}`,
    `USFS trails ${byId.get('usfs-national-forest-system-trails') ?? 0}`,
    `USFS sites ${byId.get('usfs-recreation-sites') ?? 0}`,
    `MVUM roads ${byId.get('usfs-mvum-roads') ?? 0}`,
    `MVUM trails ${byId.get('usfs-mvum-trails') ?? 0}`,
'BLM land ' + (byId.get('blm-surface-management-agency') ?? 0),
    'BLM recreation ' + (byId.get('blm-public-recreation-sites') ?? 0),
  ].join('; ');
  const sourceIssues = manifest.sources
    .filter((source) => (source.unreturnedFeatureCount ?? 0) > 0 || (source.filteredFeatureCount ?? 0) > 0)
    .map((source) => `${source.id}: ${source.unreturnedFeatureCount ?? 0} unavailable IDs, ${source.filteredFeatureCount ?? 0} filtered features`);
  const status = `Package built${sourceIssues.length ? `; source reconciliation: ${sourceIssues.join(', ')}` : ''}; direct state forestry GIS and state-run recreation layers still need state-specific integration.`;
  return `| ${state.code} | ${state.name} | ${state.forestryAgency} | [${relativeDirectory.replaceAll('\\', '/')}/outdoors.geojson](${relativeDirectory.replaceAll('\\', '/')}/outdoors.geojson) | ${total} | ${counts} | ${status} | ${sourceNames || 'No source features'}${zeroSources ? ` (0 results: ${zeroSources})` : ''} |`;
}

async function writeTracker(states, packageRows) {
  const rows = states.map((state) => {
    const row = packageRows.get(state.code);
    return row ?? `| ${state.code} | ${state.name} | ${state.forestryAgency} | — | — | — | Not acquired | Not queried |`;
  });
  const agencyRows = registry.states.map((state) => {
    const parksAgency = `[${state.parksAgency}](${state.parksAgencyUrl})`;
    const forestryAgency = `[${state.forestryAgency}](${state.agencyUrl})`;
    return `| ${state.code} | ${state.name} | ${parksAgency} | ${state.parksLayerStatus} | ${forestryAgency} | ${state.forestryLayerStatus} |`;
  });
  const content = [
    '# State Outdoor Data Package Tracker',
    '',
    '**Scope:** the 49 states other than New York. Each state is produced as its own GeoJSON, search index, and source manifest package.',
    '',
    '## Build policy',
    '',
    '- The app already has the detailed New York overlay. This tracker covers the other 49 states.',
    '- Each package uses USGS PAD-US state-managed/public-land inventory with per-feature source lineage, NPS public trails and POIs, USFS trails/recreation/MVUM layers, and BLM surface-management boundaries where present.',
    '- A state package is an independently importable GeoJSON overlay; it is not added to the default app binary.',
    '- Every access, season, closure, or recreation status remains source-attributed and must be confirmed with the managing agency. Ownership alone is never treated as permission to enter or camp.',
    '- The forestry agency is identified per state. Direct agency GIS sources for forest tracts, trails, roads, facilities, rules, and closures are a tracked follow-up because there is no shared nationwide state-forestry service.',
    '- Empty federal layers are recorded as zero-result coverage; missing layers are not fabricated.',
    '',
    '## State-by-state progress',
    '',
    '| Code | State | State forestry agency | Package | Features | Source counts | Status / remaining work | Non-empty source inventory |',
    '| --- | --- | --- | --- | ---: | --- | --- | --- |',
    ...rows,
    '',
    '## State parks and forestry agency tracking',
    '',
    'These links identify the state agencies responsible for parks and forestry. Agency identification does not mean the agency\'s GIS layers have been acquired. For every state, discover relevant GIS sources, review dataset terms and rights, assess coverage, and record source metadata before integration. New York agency sources have been inventoried and coverage-audited in the [NYS agency source coverage audit](NYS_AGENCY_SOURCE_COVERAGE_AUDIT.md); layer integration and rights decisions remain open as recorded there.',
    '',
    '| Code | State | Parks agency and official page | Parks data status | Forestry agency and official page | Forestry data status |',
    '| --- | --- | --- | --- | --- | --- |',
    ...agencyRows,
    '',
    '## Acceptance / follow-up',
    '',
    '- Per-state direct forestry and state parks/trails/roads/facility sources: discover, rights-review, and integrate as tracked above.',
    '- Rights terms have been recorded for the national public datasets; state-specific dataset terms are required before a direct layer is added.',
    '- Camping rules, seasonal closures, fire restrictions, and current conditions are intentionally not inferred from land ownership or this snapshot.',
    '- Refresh packages using `pnpm map:acquire:states`; the script rewrites this tracker after every completed state package.',
    '',
  ].join('\n');
  await writeFile(trackerPath, content, 'utf8');
}

async function loadExistingTrackerRows(states) {
  const rows = new Map();
  for (const state of states) {
    const manifestPath = join(defaultOutput, state.code, 'manifest.json');
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      const relativeDirectory = `packages/map/src/assets/state-packages/US/${state.code}`;
      rows.set(state.code, trackerRow(state, manifest, relativeDirectory));
    } catch {
      // A package not yet acquired stays visibly marked as not acquired.
    }
  }
  return rows;
}

async function buildPackage(state, outputRoot) {
  const boundary = await fetchStateBoundary(state);
  const packageSources = [];
  for (const source of DATA_SOURCES) {
    console.log(state.code + ': querying ' + source.id);
    const acquired = await fetchSource(source, state, boundary);
    packageSources.push(acquired);
    console.log(state.code + ': ' + source.id + ' packaged ' + acquired.receipt.packagedFeatureCount + ' features');
  }
  const byId = new Map();
  for (const source of packageSources) {
    for (const feature of source.features) byId.set(feature.id, feature);
  }
  const features = [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
  const collection = { type: 'FeatureCollection', features };
  const geojsonBytes = Buffer.from(JSON.stringify(collection) + '\n', 'utf8');
  const index = buildIndex(features);
  const indexBytes = Buffer.from(JSON.stringify(index) + '\n', 'utf8');
  const receipts = packageSources.map(({ receipt }) => receipt);
  const manifest = packageManifest(state, receipts, geojsonBytes, indexBytes, features);
  const manifestBytes = Buffer.from(`${JSON.stringify(stableValue(manifest), null, 2)}\n`, 'utf8');
  const outputDirectory = join(outputRoot, state.code);
  await mkdir(outputDirectory, { recursive: true });
  const writeArtifact = async (filename, bytes) => {
    const target = join(outputDirectory, filename);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, target);
  };
  await Promise.all([
    writeArtifact('outdoors.geojson', geojsonBytes),
    writeArtifact('index.json', indexBytes),
    writeArtifact('manifest.json', manifestBytes),
  ]);
  return { manifest, outputDirectory };
}

const args = parseArguments(process.argv.slice(2));
const requestedStates = new Set(
  (args.get('states') ?? '')
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean),
);
const outputRoot = resolve(root, args.get('output') ?? defaultOutput);
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const states = registry.states.filter((state) => state.code !== 'NY');
if (states.length !== 49) throw new Error(`expected 49 additional states, found ${states.length}`);
const selectedStates = requestedStates.size
  ? states.filter((state) => requestedStates.has(state.code))
  : states;
if (selectedStates.length !== requestedStates.size && requestedStates.size > 0) {
  const found = new Set(selectedStates.map((state) => state.code));
  const missing = [...requestedStates].filter((code) => !found.has(code));
  throw new Error(`unknown or excluded state code(s): ${missing.join(', ')}`);
}
const packageRows = await loadExistingTrackerRows(states);
await writeTracker(states, packageRows);
for (const state of selectedStates) {
  console.log(`${state.code} ${state.name}: acquiring official source layers`);
  const { manifest, outputDirectory } = await buildPackage(state, outputRoot);
  const relativeDirectory = outputDirectory.startsWith(root)
    ? outputDirectory.slice(root.length + 1)
    : outputDirectory;
  packageRows.set(state.code, trackerRow(state, manifest, relativeDirectory));
  await writeTracker(states, packageRows);
  console.log(
    `${state.code} ${state.name}: ${manifest.featureCount.toLocaleString()} features, ` +
      `${(manifest.artifacts.geojson.bytes / 1024 / 1024).toFixed(2)} MiB GeoJSON, ` +
      `${manifest.sources.length} source receipts -> ${outputDirectory}`,
  );
}
console.log(`state package acquisition complete for ${selectedStates.length} state(s)`);

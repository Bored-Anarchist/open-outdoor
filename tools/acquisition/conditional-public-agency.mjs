// Exact conditional sources approved for this noncommercial visitor-data distribution.
export const conditionalPublicPolicies = {
  'mn-dnr-hiking': {
    state: 'MN',
    basisUrl: 'https://gisdata.mn.gov/dataset/trans-state-park-trails-roads',
    url: 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_dnr/trans_state_park_trails_roads/FeatureServer/0',
    where:
      '(use_hike=1 OR use_hiking=1 OR use_selfgu=1 OR use_accpat=1 OR use_wntrhi=1) AND (use_abando IS NULL OR use_abando<>1)',
    fields: [
      'objectid',
      'trail_name',
      'road_name',
      'public_use',
      'use_hike',
      'use_hiking',
      'lengthmile',
    ],
    conditions:
      'MNDNR credited filtered visitor derivative. Reference only; do not use for navigation or legal boundaries/access. Entire source datasets are not redistributed. No MNDNR endorsement.',
  },
  'mn-dnr-campgrounds': {
    state: 'MN',
    basisUrl: 'https://gisdata.mn.gov/dataset/struc-state-forest-campgrounds',
    url: 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_dnr/struc_state_forest_campgrounds/FeatureServer/1',
    where: "site_type LIKE '%Camp%'",
    fields: ['objectid', 'facility_name', 'site_type', 'state_forest', 'pat_admin_unit'],
    conditions:
      'MNDNR credited filtered campground derivative. Reference only; do not use for navigation or legal boundaries/access. Entire source datasets are not redistributed. No MNDNR endorsement.',
  },
  'va-dcr-trails': {
    state: 'VA',
    basisUrl:
      'https://services1.arcgis.com/PxUNqSbaWFvFgHnJ/ArcGIS/rest/services/SP_Trails/FeatureServer/0',
    url: 'https://services1.arcgis.com/PxUNqSbaWFvFgHnJ/ArcGIS/rest/services/SP_Trails/FeatureServer/0',
    conditions:
      'Noncommercial redistribution only; redistribution for profit is prohibited. Credit Virginia Department of Conservation and Recreation. Source data retain their separate terms, outside the project code license.',
  },
  'va-dcr-boundaries': {
    state: 'VA',
    basisUrl:
      'https://services1.arcgis.com/PxUNqSbaWFvFgHnJ/ArcGIS/rest/services/SP_Boundary/FeatureServer/3',
    url: 'https://services1.arcgis.com/PxUNqSbaWFvFgHnJ/ArcGIS/rest/services/SP_Boundary/FeatureServer/3',
    conditions:
      'Noncommercial redistribution only; redistribution for profit is prohibited. Credit Virginia Department of Conservation and Recreation. Source data retain their separate terms, outside the project code license.',
  },
};

export function conditionalPublicPolicy(source) {
  const policy = conditionalPublicPolicies[source.id];
  if (
    !policy ||
    source.distributionScope !== 'noncommercial' ||
    source.state !== policy.state ||
    source.url !== policy.url ||
    source.basisUrl !== policy.basisUrl ||
    source.where !== policy.where ||
    JSON.stringify(source.fields) !== JSON.stringify(policy.fields)
  )
    return null;
  return policy;
}

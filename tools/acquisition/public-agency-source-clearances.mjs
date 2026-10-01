// Exact dataset license decisions; these do not clear an agency's other content.
export const publicAgencySourceClearances = {
  'mi-dnr-hiking': {
    state: 'MI',
    basisUrl: 'https://www.michigan.gov/dnr/places/state-trails',
    url: 'https://gisagodnr.state.mi.us/arcgis/rest/services/DNR/DNRTrailsOPENDATA/FeatureServer/2',
    termsUrl:
      'https://gisagodnr.state.mi.us/arcgis/rest/services/DNR/DNRTrailsOPENDATA/FeatureServer/info/iteminfo?f=json',
    rightsClearance: 'dataset-specific-public-record-license-2026-09-28',
  },
  'nc-spo-forest-additions': {
    state: 'NC',
    basisUrl: 'https://www.doa.nc.gov/divisions/state-property',
    url: 'https://services3.arcgis.com/zMTrRjxZirPAKsKd/arcgis/rest/services/State_Owned_Land_NC_Latest_02/FeatureServer/0',
    termsUrl:
      'https://www.arcgis.com/sharing/rest/content/items/e60514c3b78542ef9902e3d7f7a671c1/data?f=json',
    rightsClearance: 'dataset-specific-public-use-policy-2026-09-28',
    where:
      "DeptName='AGRICULTURE' AND DivName='FOREST SERVICE' AND ComplexName IN ('FR SHOEBUCKLE FOREST','FR BACKBONE RIDGE STATE FOREST')",
  },
};

export function publicAgencySourceClearance(source) {
  const review = publicAgencySourceClearances[source.id];
  return review && Object.entries(review).every(([key, value]) => source[key] === value)
    ? review
    : null;
}

export function verifyPublicAgencySourceLicense(source, licenseText, termsText = '') {
  if (source.id === 'nc-spo-forest-additions') {
    if (
      !publicAgencySourceClearance(source) ||
      !/Written release agreements.*not required and will not be issued/is.test(
        licenseText.replace(/<[^>]+>/g, ' '),
      ) ||
      !/www\.nconemap\.gov\/pages\/terms/i.test(licenseText) ||
      !/free and unrestricted use policy/i.test(termsText)
    )
      throw new Error('Exact North Carolina property dataset public use policy not confirmed');
    return;
  }
  if (
    !publicAgencySourceClearance(source) ||
    !/no restrictions on the use, reproduction, or distribution of this dataset/i.test(
      licenseText.replace(/<[^>]+>/g, ' '),
    )
  )
    throw new Error('Exact Michigan dataset reproduction/distribution license not confirmed');
}

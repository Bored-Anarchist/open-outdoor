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
};

export function publicAgencySourceClearance(source) {
  const review = publicAgencySourceClearances[source.id];
  return review && Object.entries(review).every(([key, value]) => source[key] === value)
    ? review
    : null;
}

export function verifyPublicAgencySourceLicense(source, licenseText) {
  if (
    !publicAgencySourceClearance(source) ||
    !/no restrictions on the use, reproduction, or distribution of this dataset/i.test(
      licenseText.replace(/<[^>]+>/g, ' '),
    )
  )
    throw new Error('Exact Michigan dataset reproduction/distribution license not confirmed');
}

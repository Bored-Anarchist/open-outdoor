/** Reject a composition that would silently replace newer or richer NPS records. */
export function assertNpsSnapshotUsable(snapshot, previousFeatures) {
  const previous = previousFeatures.filter((f) =>
    String(f.properties?.sourceId).startsWith('nps-'),
  );
  const date = Date.parse(snapshot.retrievedAt);
  if (!Number.isFinite(date)) throw new Error('NPS acquisition date required');
  if (previous.some((f) => Date.parse(f.properties.sourceUpdated) > date))
    throw new Error(
      'NPS snapshot predates the packaged records; reacquire or explicitly retain NPS',
    );
  const hasDetails = previous.some((f) =>
    ['description', 'directionsInfo', 'amenities', 'openingHours', 'fees'].some(
      (key) => f.properties[key]?.length,
    ),
  );
  if (
    hasDetails &&
    [...snapshot.parks, ...snapshot.campgrounds, ...snapshot.alerts].some(
      (item) => !Object.hasOwn(item, 'visitorDetails'),
    )
  )
    throw new Error('NPS snapshot omits visitor details; reacquire or explicitly retain NPS');
}

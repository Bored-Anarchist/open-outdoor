export function privateEnrichmentDocument(state, publicSha256, matches) {
  return {
    schemaVersion: 1,
    state,
    classification: 'PRIVATE_USER',
    publicDistribution: false,
    publicSha256,
    features: matches
      .filter((m) => m.privateSourceId === 'private-ioverlander')
      .map((m) => ({
        publicId: m.publicId,
        privateId: m.privateId,
        properties: m.feature.properties,
      })),
  };
}
export function composePrivateStateView(publicCollection, privateCollection, enrichments) {
  if (
    enrichments.classification !== 'PRIVATE_USER' ||
    enrichments.publicDistribution !== false ||
    !Array.isArray(enrichments.features)
  )
    throw new Error('Private-only enrichment document required');
  const aliases = new Map();
  for (const reference of enrichments.features) {
    if (!aliases.has(reference.publicId)) aliases.set(reference.publicId, []);
    aliases.get(reference.publicId).push(reference);
  }
  const publicIds = new Set(publicCollection.features.map((f) => f.id));
  for (const id of aliases.keys())
    if (!publicIds.has(id))
      throw new Error('Private enrichment target missing from public package');
  const features = publicCollection.features.map((source) => {
    const feature = structuredClone(source),
      references = aliases.get(source.id);
    if (references) {
      feature.properties = {
        ...feature.properties,
        origin: 'private-catalog',
        publicDistribution: false,
        privateReferences: structuredClone(references),
        communityDescription: references
          .map((r) => r.properties.communityDescription)
          .filter(Boolean)
          .join('\n\n'),
        communityCheckIns: references.flatMap((r) => r.properties.communityCheckIns ?? []),
        communityCheckInCount: references.reduce(
          (n, r) => n + (r.properties.communityCheckInCount ?? 0),
          0,
        ),
      };
    }
    return feature;
  });
  return {
    type: 'FeatureCollection',
    classification: 'PRIVATE_USER',
    publicDistribution: false,
    features: [...features, ...structuredClone(privateCollection.features)],
  };
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attachVisitorReferences,
  validateVisitorEvidence,
} from '../packages/private-state-visitor-references.mjs';

const feature = {
  id: 'test-place',
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-92.47, 31.11] },
  properties: {
    sourceId: 'private-ioverlander',
    name: 'Indian Creek Recreation Area',
    category: 'campsite',
    communityDescription: 'Preserve me',
  },
};
const reference = {
  reviewedAt: '2026-09-28',
  sourceEvidence: [{ url: 'https://example.invalid/agency', sha256: 'example' }],
  profiles: [
    {
      id: 'example',
      state: 'LA',
      name: feature.properties.name,
      matchSourceId: 'private-ioverlander',
      matchBounds: [-92.6, 31, -92.3, 31.3],
      agency: 'Agency',
      description: 'Agency visitor reference',
      amenities: ['Boat launch'],
      mapReferences: [{ name: 'Map', url: 'https://example.invalid/map.png' }],
    },
  ],
};

test('agency visitor information preserves community geometry, IDs and narratives without inventing facility points', () => {
  const result = attachVisitorReferences([feature], reference, 'LA');
  assert.equal(result.features.length, 1);
  const enriched = result.features[0];
  assert.deepEqual(enriched.geometry, feature.geometry);
  assert.equal(enriched.id, feature.id);
  assert.equal(enriched.properties.communityDescription, 'Preserve me');
  assert.equal(enriched.properties.category, 'campsite');
  assert.equal(enriched.properties.agencyVisitorReference.currentConditions, false);
  assert.equal(enriched.properties.agencyVisitorReference.publicDistribution, false);
  assert.equal(
    enriched.properties.agencyVisitorReference.mapReferences[0].format,
    'raster-reference',
  );
  assert.equal(feature.properties.description, undefined);
  assert.throws(() => attachVisitorReferences([feature, feature], reference, 'LA'), /exactly one/);
  assert.throws(
    () =>
      attachVisitorReferences(
        [{ ...feature, geometry: { type: 'Point', coordinates: [0, 0] } }],
        reference,
        'LA',
      ),
    /exactly one/,
  );
  assert.throws(() => attachVisitorReferences([feature], reference, 'NC'), /state mismatch/);
});

test('changed official facts stop visitor enrichment instead of retaining unsupported claims', () => {
  const evidence = {
    url: 'https://example.invalid/agency',
    requiredPatterns: ['3 beach areas', '4 bath houses'],
  };
  validateVisitorEvidence(evidence, '<p>3 beach areas</p><p>4 bath houses</p>');
  assert.throws(
    () => validateVisitorEvidence(evidence, '2 beach areas; 4 bath houses'),
    /evidence changed/,
  );
});

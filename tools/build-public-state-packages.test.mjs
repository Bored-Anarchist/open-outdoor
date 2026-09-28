import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePublicFeature,
  publicAgencyFeature,
  splitImportParts,
} from './build-public-state-packages.mjs';

const feature = (id, category = 'campground') => ({
  type: 'Feature',
  id,
  geometry: { type: 'Point', coordinates: [-73, 42] },
  properties: {
    id,
    kind: 'poi',
    name: 'Synthetic fixture',
    category,
    sourceId: 'synthetic-public',
    origin: 'public-catalog',
  },
});
test('agency labels prefer the described facility type over an opaque numeric category', () => {
  const source = {
    id: 'ar-historical-facilities',
    name: 'Historical facilities',
    url: 'https://example.invalid/24',
    sourceUpdated: 'Historical',
  };
  const result = publicAgencyFeature(
    source,
    {
      ...feature('x'),
      properties: {
        objectid: 23,
        fname: 'Synthetic parking area',
        fcat: 2,
        ftype: 'Parking Area',
        fdescrip: 'Paved',
      },
    },
    0,
  );
  assert.equal(result.properties.name, 'Synthetic parking area');
  assert.equal(result.properties.sourceCategory, 'Parking Area');
  assert.equal(result.properties.category, 'shorterm_parking');
});
test('public packages reject private narratives and held New York sources', () => {
  const allowed = new Set(['synthetic-public', 'nys-dec-poi']);
  assert.throws(
    () =>
      normalizePublicFeature(
        {
          ...feature('a'),
          properties: { ...feature('a').properties, communityDescription: 'private' },
        },
        allowed,
      ),
    /boundary/,
  );
  assert.throws(
    () =>
      normalizePublicFeature(
        { ...feature('a'), properties: { ...feature('a').properties, sourceId: 'nys-dec-poi' } },
        allowed,
      ),
    /boundary/,
  );
  assert.throws(
    () =>
      normalizePublicFeature(
        { ...feature('a'), properties: { ...feature('a').properties, origin: 'private-catalog' } },
        allowed,
      ),
    /boundary/,
  );
});
test('mapping preserves original type and does not infer access from campsite category', () => {
  const f = normalizePublicFeature(
    {
      ...feature('b', 'primitive_campsite'),
      properties: { ...feature('b', 'primitive_campsite').properties, publicUse: 'Unknown' },
    },
    new Set(['synthetic-public']),
  );
  assert.equal(f.properties.category, 'wild_campsite');
  assert.equal(f.properties.sourceCategory, 'primitive_campsite');
  assert.equal(f.properties.publicUse, 'Unknown');
});
test('parts honor coordinate and feature limits and preserve every ID', () => {
  const input = [feature('a'), feature('b'), feature('c')];
  const parts = splitImportParts(input, { features: 2, positions: 2, bytes: 10000 });
  assert.deepEqual(
    parts.map((p) => p.length),
    [2, 1],
  );
  assert.deepEqual(
    parts.flat().map((f) => f.id),
    ['a', 'b', 'c'],
  );
});
test('oversized multipart geometry is separated without losing coordinates', () => {
  const f = {
    ...feature('line'),
    geometry: {
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
        [
          [2, 2],
          [3, 3],
        ],
      ],
    },
    properties: { ...feature('line').properties, kind: 'trail' },
  };
  const parts = splitImportParts([f], { features: 10, positions: 2, bytes: 10000 });
  assert.equal(parts.length, 2);
  assert.equal(parts.flat()[0].properties.parentFeatureId, 'line');
  assert.deepEqual(
    parts.flat().map((f) => f.geometry.coordinates),
    f.geometry.coordinates,
  );
});
test('visitor selection excludes maintenance points and retains parking', () => {
  const s = {
    id: 'ma-dcr-points',
    name: 'MassGIS',
    url: 'https://example.invalid/0',
    sourceUpdated: '2015-06',
  };
  assert.equal(
    publicAgencyFeature(
      s,
      { ...feature('x'), properties: { OBJECTID: 1, TYPE: 'Road Damage' } },
      0,
    ),
    null,
  );
  const f = publicAgencyFeature(
    s,
    { ...feature('x'), properties: { OBJECTID: 2, TYPE: 'Parking Area' } },
    0,
  );
  assert.equal(f.properties.category, 'shorterm_parking');
  assert.equal(f.properties.origin, 'public-catalog');
});

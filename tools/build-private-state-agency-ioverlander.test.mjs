import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ioverlanderFeature, pointInGeometry } from './build-private-state-agency-ioverlander.mjs';

test('state boundary filtering excludes holes and neighboring tiles', () => {
  const boundary = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [4, 4],
        [6, 4],
        [6, 6],
        [4, 6],
        [4, 4],
      ],
    ],
  };
  assert.equal(pointInGeometry([2, 2], boundary), true);
  assert.equal(pointInGeometry([5, 5], boundary), false);
  assert.equal(pointInGeometry([12, 5], boundary), false);
});

test('private iOverlander conversion omits contributor identities', () => {
  const feature = ioverlanderFeature({
    guid: 'example-guid',
    id: 42,
    name: 'Camp',
    category: 'campsite',
    longitude: -86,
    latitude: 33,
    deleted: false,
    contributor_id: 'private-person',
    check_ins: [{ comment: 'Open', visited_at: '2026-09-01', contributor_id: 'another-person' }],
  });
  assert.ok(feature);
  assert.equal(feature.geometry.type, 'Point');
  assert.equal(feature.properties.communityCheckIns[0].comment, 'Open');
  assert.equal(JSON.stringify(feature).includes('private-person'), false);
  assert.equal(JSON.stringify(feature).includes('another-person'), false);
});

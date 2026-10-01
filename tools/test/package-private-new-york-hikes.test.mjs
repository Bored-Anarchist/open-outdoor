import assert from 'node:assert/strict';
import test from 'node:test';
import { hikeRouteDetails, withHikeElevations } from '../../packages/shared/src/hike-route.ts';
import { verifyPrivateHikeProfiles } from '../packages/package-private-new-york-hikes.mjs';

const feature = {
  id: 'trail-1',
  properties: { sourceId: 'nys-dec-trails' },
  geometry: {
    type: 'LineString',
    coordinates: [
      [-74, 42],
      [-74.001, 42.001],
      [-74.002, 42],
    ],
  },
};
const collection = { type: 'FeatureCollection', features: [feature] };
const route = hikeRouteDetails(feature.geometry);
const profile = withHikeElevations(
  route,
  route.samples.map((_, i) => 100 + i),
  'terrain-model',
);

test('preserved elevations match every packaged DEC route sample and statistic', () => {
  assert.equal(verifyPrivateHikeProfiles({ 'trail-1': profile }, collection), 1);
  assert.throws(() => verifyPrivateHikeProfiles({}, collection), /IDs do not exactly match/);
  assert.throws(
    () => verifyPrivateHikeProfiles({ 'trail-1': profile, extra: profile }, collection),
    /IDs do not exactly match/,
  );
  assert.throws(
    () => verifyPrivateHikeProfiles({ 'trail-1': { ...profile, ascentM: 9999 } }, collection),
    /no longer matches/,
  );
  const changed = {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: [
        [-74, 42],
        [-74.001, 42.003],
        [-74.002, 42],
      ],
    },
  };
  assert.throws(
    () => verifyPrivateHikeProfiles({ 'trail-1': profile }, { ...collection, features: [changed] }),
    /invalid preserved|no longer matches/,
  );
});

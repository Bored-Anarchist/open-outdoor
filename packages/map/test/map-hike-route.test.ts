import { expect, it } from 'vitest';
import { hikeRouteDetails } from '@open-outdoor/shared/hike-route';
import type { OutdoorFeatureSummary, ImportedMapDataset } from '../src';
import { mapHikeRoute } from '../../../apps/mobile/mapHikeRoute';

const feature = {
  id: 'synthetic-private-trail',
  properties: { kind: 'trail', origin: 'private-catalog' },
} as OutdoorFeatureSummary;
const geometry = {
  type: 'LineString' as const,
  coordinates: [
    [-74, 42, 100],
    [-74.01, 42.01, 150],
  ],
};
const route = hikeRouteDetails(geometry);
const bundle = { sourceSha256: 'synthetic-hash', hikes: { [feature.id]: route } };
it('loads a verified private bundled trail profile without treating it as a manual import', () => {
  expect(mapHikeRoute(feature, [], null, bundle, bundle.sourceSha256)).toBe(route);
  expect(mapHikeRoute(feature, [], null, bundle, 'different-catalog')).toBeNull();
});
it('uses visible imported or selected state geometry before bundled profiles', () => {
  const other = {
    ...geometry,
    coordinates: [
      [-75, 43, 200],
      [-75.01, 43.01, 250],
    ],
  };
  const dataset = {
    visible: true,
    collection: { features: [{ id: feature.id, geometry: other }] },
  } as ImportedMapDataset;
  expect(mapHikeRoute(feature, [dataset], null, bundle, bundle.sourceSha256)?.start).toEqual([
    -75, 43,
  ]);
  expect(
    mapHikeRoute(feature, [{ ...dataset, visible: false }], null, bundle, bundle.sourceSha256),
  ).toBe(route);
  expect(
    mapHikeRoute(feature, [], { summary: feature, geometry: other }, bundle, bundle.sourceSha256)
      ?.start,
  ).toEqual([-75, 43]);
});

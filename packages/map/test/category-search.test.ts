import { expect, it } from 'vitest';
import {
  searchOutdoorFeatureIndex,
  type OutdoorFeatureIndex,
  type OutdoorFeatureSummary,
} from '../src';

const feature = (id: string, category: string, kind = 'poi') =>
  ({
    id,
    properties: { name: 'Synthetic place', unit: 'Synthetic park', category, kind },
    bounds: [-74, 42, -74, 42],
  }) as OutdoorFeatureSummary;

it('filters categories before limiting local search and excludes non-place geometry', () => {
  const index: OutdoorFeatureIndex = {
    schemaVersion: 1,
    features: [
      ...Array.from({ length: 35 }, (_, i) => feature(`camp-${i}`, 'CAMPSITE')),
      feature('spring', 'water'),
      feature('trail', 'water', 'trail'),
    ],
  };
  expect(
    searchOutdoorFeatureIndex(index, 'Synthetic', 30, 'water').map((entry) => entry.id),
  ).toEqual(['spring']);
  expect(searchOutdoorFeatureIndex(index, 'Synthetic', 2, 'campsite')).toHaveLength(2);
  expect(searchOutdoorFeatureIndex(index, 'Synthetic', 50, 'all')).toHaveLength(37);
});

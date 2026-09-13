import { describe, expect, it } from 'vitest';
import {
  ioverlanderCategoryDefinition,
  ioverlanderCategoryDefinitions,
  ioverlanderCategoryIds,
  normalizeIoverlanderCategory,
} from '../src/ioverlander';

describe('iOverlander category system', () => {
  it('provides one display definition for every category identifier', () => {
    expect(ioverlanderCategoryDefinitions.map((definition) => definition.id)).toEqual(
      ioverlanderCategoryIds,
    );
    expect(new Set(ioverlanderCategoryDefinitions.map((definition) => definition.label)).size).toBe(
      ioverlanderCategoryIds.length,
    );
  });

  it('retains source identifiers and supports the historical parking spelling', () => {
    expect(normalizeIoverlanderCategory('wild_campsite')).toBe('wild_campsite');
    expect(normalizeIoverlanderCategory('shortterm_parking')).toBe('shorterm_parking');
    expect(normalizeIoverlanderCategory('not-a-category')).toBe('other');
    expect(ioverlanderCategoryDefinition('campsite').label).toBe('Established Campground');
  });
});

import { describe, expect, it } from 'vitest';
import { publicPoiCategory } from '../src/public-poi-category';

describe('public source POI categories', () => {
  it('keeps developed and primitive camping distinct', () => {
    expect(publicPoiCategory('group_campground')).toBe('campsite');
    expect(publicPoiCategory('campsite_-_primitive_-_non_reservable_-_no_fee')).toBe(
      'wild_campsite',
    );
    expect(publicPoiCategory('backcountry_campsite')).toBe('wild_campsite');
  });
  it('maps traveler services without classifying untreated water as drinking water', () => {
    expect(publicPoiCategory('parking_lot')).toBe('shorterm_parking');
    expect(publicPoiCategory('water_-_drinking/potable')).toBe('water');
    expect(publicPoiCategory('spring')).toBe('other');
    expect(publicPoiCategory('vault_toilet')).toBe('other');
    expect(publicPoiCategory('dump_station')).toBe('sanitation_dump');
    expect(publicPoiCategory('trail_head')).toBe('tourist_attraction');
  });
  it('preserves the legend and fails unknown source types to Other', () => {
    expect(publicPoiCategory('overnight-prohibited')).toBe('overnight-prohibited');
    expect(publicPoiCategory('future_source_type')).toBe('other');
  });
});

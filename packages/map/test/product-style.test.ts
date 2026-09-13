import { describe, expect, it } from 'vitest';
import { appearances } from '@open-outdoor/shared';
import { campingLegend, createProductMapStyle } from '../src/product-style';

describe('T-E2E-001-D02 WP-501 offline map design', () => {
  it.each(appearances)(
    '%s orders context below safety, active track and user position',
    (appearance) => {
      const style = createProductMapStyle(appearance);
      const document = style.document as {
        version: number;
        layers: { id: string; paint: Record<string, unknown> }[];
        sources: Record<string, Record<string, unknown>>;
      };
      expect(document.version).toBe(8);
      const ids = document.layers.map((layer) => layer.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const [lower, upper] of [
        ['background', 'land'],
        ['water', 'trail'],
        ['trail', 'place'],
        ['place', 'closures'],
        ['closures', 'active-recording'],
        ['active-recording', 'user-location'],
      ])
        expect(ids.indexOf(lower!)).toBeLessThan(ids.indexOf(upper!));
      expect(ids.at(-1)).toBe('user-location');
      expect(ids).toContain('selected-halo');
      expect(ids).toContain('active-halo');
      expect(
        document.layers.find((layer) => layer.id === 'selected-route')!.paint['line-dasharray'],
      ).toEqual([3, 1]);
      expect(
        document.layers.find((layer) => layer.id === 'active-recording')!.paint['line-dasharray'],
      ).toBeUndefined();
      expect(document.sources.places).toMatchObject({
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 13,
      });
      expect(JSON.stringify(style)).not.toMatch(/https?:|mapbox:|glyphs|sprite"/);
      expect(style.fonts).toEqual([]);
      expect(style.sprites).toEqual([]);
    },
  );
  it('retains all seven camping statuses with text explanations and unique legend marks', () => {
    expect(campingLegend.map((entry) => entry.id).sort()).toEqual(
      [
        'generally-eligible',
        'verified-allowed',
        'restricted',
        'permit-required',
        'prohibited',
        'temporary-closure',
        'unknown',
      ].sort(),
    );
    expect(new Set(campingLegend.map((entry) => entry.mark)).size).toBe(7);
    expect(campingLegend.find((entry) => entry.id === 'unknown')!.explanation).toContain(
      'No access permission',
    );
  });
  it('preserves caller-supplied canonical data without duplicating pins or mutating it', () => {
    const places = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'canonical-place',
          properties: { name: 'Synthetic' },
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
      ],
    };
    const before = JSON.stringify(places);
    const first = createProductMapStyle('light', { places });
    expect(JSON.stringify(first)).toContain('canonical-place');
    expect(JSON.stringify(places)).toBe(before);
    expect(createProductMapStyle('light', { places })).toEqual(first);
  });
});

import { describe, expect, it } from 'vitest';
import {
  createOfflineVectorBasemapStyle,
  createTieredOfflineVectorBasemapStyle,
} from '../src/outdoor-map';

describe('offline vector basemap style source', () => {
  it('uses the selected local archive maximum zoom', () => {
    const overview = createOfflineVectorBasemapStyle(
      'file:///bundle/overview-z9.pmtiles',
      'file:///bundle/NotoSans-Variable.ttf',
      [],
      9,
    );
    expect(overview.sources['offline-basemap']?.url).toBe(
      'pmtiles://file:///bundle/overview-z9.pmtiles',
    );
    expect(overview.sources['offline-basemap']?.maxzoom).toBe(9);
    expect(JSON.stringify(overview)).not.toMatch(/https?:\/\//);
  });

  it.each([-1, 9.5, 23, Number.NaN])('rejects invalid maximum zoom %s', (maximumZoom) => {
    expect(() =>
      createOfflineVectorBasemapStyle(
        'file:///bundle/map.pmtiles',
        'file:///bundle/font.ttf',
        [],
        maximumZoom,
      ),
    ).toThrow(/maximum zoom/);
  });

  it.each([
    ['https://example.invalid/map.pmtiles', 'file:///bundle/font.ttf'],
    ['http://example.invalid/map.pmtiles', 'file:///bundle/font.ttf'],
    ['asset://map.pmtiles', 'file:///bundle/font.ttf'],
    ['file://', 'file:///bundle/font.ttf'],
    ['file:///map.pmtiles\nhttps://example.invalid', 'file:///bundle/font.ttf'],
    ['file:///bundle/map.pmtiles', 'https://example.invalid/font.ttf'],
  ])('rejects non-file archive or font source %s', (archiveUri, fontUri) => {
    expect(() => createOfflineVectorBasemapStyle(archiveUri, fontUri, [], 9)).toThrow(
      /local file URLs/,
    );
  });

  it('keeps the world source visible beneath regional and installed detail tiers', () => {
    const style = createTieredOfflineVectorBasemapStyle({
      worldArchiveUri: 'file:///bundle/world-z6.pmtiles',
      regionalArchiveUri: 'file:///bundle/us-canada-z7-z9.pmtiles',
      installedArchiveUri: 'file:///maps/new-york-z12.pmtiles',
      fontUri: 'file:///bundle/font.ttf',
      sourceLayers: [
        { id: 'background', type: 'background' },
        { id: 'roads', type: 'line', source: 'offline-basemap', minzoom: 5 },
        {
          id: 'places',
          type: 'symbol',
          source: 'offline-basemap',
          layout: { 'text-field': ['get', 'name'], 'icon-image': 'marker' },
        },
      ],
      worldMaximumZoom: 6,
      regionalMinimumZoom: 7,
      regionalMaximumZoom: 9,
      installedMaximumZoom: 12,
    });

    expect(style.sources['offline-world']).toMatchObject({ minzoom: 0, maxzoom: 6 });
    expect(style.sources['offline-regional']).toMatchObject({ minzoom: 7, maxzoom: 9 });
    expect(style.sources['offline-installed']).toMatchObject({ minzoom: 10, maxzoom: 12 });
    expect(style.layers.map((layer) => layer.id)).toEqual([
      'background',
      'roads',
      'roads-regional',
      'roads-installed',
      'places',
      'places-regional',
      'places-installed',
    ]);
    expect(style.layers.find((layer) => layer.id === 'roads')?.source).toBe('offline-world');
    expect(style.layers.find((layer) => layer.id === 'roads-regional')?.minzoom).toBe(7);
    expect(style.layers.find((layer) => layer.id === 'roads-installed')?.minzoom).toBe(10);
    expect(style.layers.find((layer) => layer.id === 'places')?.layout).not.toHaveProperty(
      'icon-image',
    );
    expect(JSON.stringify(style)).not.toMatch(/https?:\/\//);
  });

  it('rejects gaps, overlaps, and incomplete installed tier settings', () => {
    const valid = {
      worldArchiveUri: 'file:///bundle/world.pmtiles',
      regionalArchiveUri: 'file:///bundle/regional.pmtiles',
      fontUri: 'file:///bundle/font.ttf',
      sourceLayers: [],
      worldMaximumZoom: 6,
      regionalMinimumZoom: 7,
      regionalMaximumZoom: 9,
    };
    expect(() =>
      createTieredOfflineVectorBasemapStyle({ ...valid, regionalMinimumZoom: 6 }),
    ).toThrow(/ordered and non-overlapping/);
    expect(() =>
      createTieredOfflineVectorBasemapStyle({ ...valid, regionalMinimumZoom: 8 }),
    ).toThrow(/ordered and non-overlapping/);
    expect(() =>
      createTieredOfflineVectorBasemapStyle({ ...valid, installedMaximumZoom: 12 }),
    ).toThrow(/requires an installed archive/);
    expect(() =>
      createTieredOfflineVectorBasemapStyle({
        ...valid,
        installedArchiveUri: 'file:///maps/detail.pmtiles',
        installedMaximumZoom: 9,
      }),
    ).toThrow(/add detail/);
  });
});

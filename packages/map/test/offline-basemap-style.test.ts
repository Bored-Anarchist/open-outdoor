import { describe, expect, it } from 'vitest';
import { createOfflineVectorBasemapStyle } from '../src/outdoor-map';

describe('offline vector basemap style source', () => {
  it('uses the selected local archive maximum zoom', () => {
    const overview = createOfflineVectorBasemapStyle(
      'file:///bundle/new-york-overview-z9.pmtiles',
      'file:///bundle/NotoSans-Variable.ttf',
      [],
      9,
    );
    expect(overview.sources['offline-basemap']?.url).toBe(
      'pmtiles://file:///bundle/new-york-overview-z9.pmtiles',
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
});

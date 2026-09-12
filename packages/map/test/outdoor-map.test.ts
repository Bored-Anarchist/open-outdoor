import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  OutdoorMapAdapter,
  createOfflineVectorBasemapStyle,
  createOutdoorMapStyle,
  featureBounds,
  geometryPositions,
  searchOutdoorFeatureIndex,
  searchOutdoorFeatures,
  segmentedTrack,
  type OutdoorBaseMapStyle,
  type OutdoorCollection,
  type OutdoorFeatureIndex,
} from '../src/outdoor-map';
const bytes = readFileSync('packages/map/src/assets/new-york-outdoors.geojson');
const collection = JSON.parse(bytes.toString()) as OutdoorCollection;
const indexBytes = readFileSync('packages/map/src/assets/new-york-outdoors.index.json');
const index = JSON.parse(indexBytes.toString()) as OutdoorFeatureIndex;
const manifest = JSON.parse(
  readFileSync('packages/map/src/assets/new-york-outdoors.manifest.json', 'utf8'),
);
const basemapBytes = readFileSync('packages/map/src/assets/openfreemap-liberty.json');
const basemap = JSON.parse(basemapBytes.toString()) as OutdoorBaseMapStyle;
const basemapManifest = JSON.parse(
  readFileSync('packages/map/src/assets/openfreemap-liberty.manifest.json', 'utf8'),
);
const offlineBasemapBytes = readFileSync('packages/map/src/assets/new-york-overview-z9.pmtiles');
const offlineFontBytes = readFileSync('packages/map/src/assets/NotoSans-Variable.ttf');
const offlineBasemapManifest = JSON.parse(
  readFileSync('packages/map/src/assets/new-york-basemap.manifest.json', 'utf8'),
);
describe('real offline New York map', () => {
  it('ships the complete checksum-pinned source inventories with rights/attribution', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.sha256);
    expect(bytes.length).toBe(manifest.bytes);
    expect(bytes.length).toBeLessThan(24 * 1024 * 1024);
    expect(createHash('sha256').update(indexBytes).digest('hex')).toBe(manifest.indexSha256);
    expect(indexBytes.length).toBe(manifest.indexBytes);
    expect(index.features).toHaveLength(collection.features.length);
    expect(collection.features.length).toBe(manifest.featureCount);
    expect(collection.features.length).toBeGreaterThan(9000);
    expect(new Set(collection.features.map((f) => f.id)).size).toBe(collection.features.length);
    expect(
      manifest.rights.offlineStorage &&
        manifest.rights.redistribution &&
        manifest.rights.derivedData,
    ).toBe(true);
    expect(manifest.rights.attribution).toHaveLength(3);
    for (const source of manifest.sources) {
      expect(collection.features.filter((f) => f.properties.sourceId === source.id)).toHaveLength(
        source.featureCount,
      );
      expect(source.pages.reduce((n: number, p: any) => n + p.count, 0)).toBe(source.featureCount);
    }
  });
  it('contains valid geographic geometries and only approved public fields', () => {
    for (const f of collection.features) {
      expect(['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString', 'Point']).toContain(
        f.geometry.type,
      );
      expect(Object.keys(f.properties).sort()).toEqual(
        ['id', 'kind', 'name', 'sourceId', 'unit', 'category', 'publicUse', 'sourceUpdated'].sort(),
      );
      const [w, s, e, n] = featureBounds(f);
      expect(w).toBeGreaterThan(-80);
      expect(e).toBeLessThan(-71);
      expect(s).toBeGreaterThan(40);
      expect(n).toBeLessThan(46);
    }
  }, 15_000);
  it('finds real named trails without synthetic preserve substitution', () => {
    expect(searchOutdoorFeatures(collection, 'Slide').length).toBeGreaterThan(0);
    expect(
      searchOutdoorFeatures(collection, 'Slide').some((f) => f.properties.kind === 'trail'),
    ).toBe(true);
    expect(searchOutdoorFeatures(collection, '')).toEqual([]);
    expect(searchOutdoorFeatures(collection, 'a', 100)).toHaveLength(50);
    expect(searchOutdoorFeatureIndex(index, 'Slide').map((feature) => feature.id)).toEqual(
      searchOutdoorFeatures(collection, 'Slide').map((feature) => feature.id),
    );
    expect(index.features.every((feature) => feature.bounds.length === 4)).toBe(true);
    expect(collection.features.some((f) => f.properties.name === 'Hemlock Loop')).toBe(false);
  });
  it('loads bundled geography and all base layers as one atomic native style', () => {
    const style = createOutdoorMapStyle(collection);
    expect(style.sources.outdoors.data).toBe(collection);
    expect(style.layers.map((layer) => layer.id)).toEqual([
      'background',
      'state-fill',
      'state-outline',
      'dec-land',
      'dec-land-outline',
      'dec-road',
      'dec-trail',
      'dec-poi',
      'dec-camping',
    ]);
    expect(
      style.layers.slice(1).every((layer) => 'source' in layer && layer.source === 'outdoors'),
    ).toBe(true);
  });
  it('puts stored outdoor overlays over a pinned full vector basemap and below labels', () => {
    expect(createHash('sha256').update(basemapBytes).digest('hex')).toBe(basemapManifest.sha256);
    expect(basemap.layers).toHaveLength(basemapManifest.layerCount);
    expect(basemap.sources.openmaptiles?.attribution).toContain('OpenStreetMap');
    const style = createOutdoorMapStyle('file:///new-york-outdoors.geojson', basemap);
    const ids = style.layers.map((layer) => layer.id);
    expect(style.sources).toHaveProperty('openmaptiles');
    expect(style.sources.outdoors.data).toBe('file:///new-york-outdoors.geojson');
    expect(ids).not.toContain('state-fill');
    expect(ids.indexOf('dec-land')).toBeGreaterThan(ids.indexOf('background'));
    expect(ids.indexOf('dec-trail')).toBeLessThan(
      style.layers.findIndex((layer) => layer.type === 'symbol'),
    );
    expect(ids.indexOf('dec-camping')).toBeLessThan(
      style.layers.findIndex((layer) => layer.type === 'symbol'),
    );
    expect(collection.features.filter((feature) => feature.properties.kind === 'poi')).toHaveLength(
      4560,
    );
    expect(
      collection.features.filter((feature) =>
        ['PRIMITIVE CAMPSITE', 'CAMPSITE', 'ACCESSIBLE CAMPSITE', 'CAMPGROUND', 'LEAN-TO'].includes(
          feature.properties.category,
        ),
      ).length,
    ).toBeGreaterThan(2500);
  });
  it('ships a checksum-pinned statewide overview and local font with no network resources', () => {
    expect(offlineBasemapBytes.length).toBe(offlineBasemapManifest.archive.bytes);
    expect(createHash('sha256').update(offlineBasemapBytes).digest('hex')).toBe(
      offlineBasemapManifest.archive.sha256,
    );
    expect(createHash('sha256').update(offlineFontBytes).digest('hex')).toBe(
      offlineBasemapManifest.font.sha256,
    );
    expect(offlineBasemapManifest.maximumZoom).toBe(9);
    expect(offlineBasemapManifest.offline).toBe(true);
    const localBasemap = createOfflineVectorBasemapStyle(
      'file:///bundle/new-york-overview-z9.pmtiles',
      'file:///bundle/NotoSans-Variable.ttf',
      [
        { id: 'background', type: 'background' },
        {
          id: 'place-label',
          type: 'symbol',
          source: 'offline-basemap',
          layout: { 'text-field': ['get', 'name'], 'icon-image': 'marker' },
        },
        {
          id: 'icon-only',
          type: 'symbol',
          source: 'offline-basemap',
          layout: { 'icon-image': 'arrow' },
        },
      ],
      offlineBasemapManifest.maximumZoom,
    );
    const serialized = JSON.stringify(localBasemap);
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(localBasemap.sources['offline-basemap']?.url).toBe(
      'pmtiles://file:///bundle/new-york-overview-z9.pmtiles',
    );
    expect(localBasemap.sources['offline-basemap']?.maxzoom).toBe(9);
    expect(localBasemap['font-faces']).toEqual({
      'Open Outdoor Noto Sans': 'file:///bundle/NotoSans-Variable.ttf',
    });
    expect(localBasemap.layers.map(({ id }) => id)).toEqual(['background', 'place-label']);
    expect(localBasemap.layers[1]?.layout).not.toHaveProperty('icon-image');
    expect(() =>
      createOfflineVectorBasemapStyle(
        'https://example.invalid/map.pmtiles',
        'file:///font.ttf',
        [],
      ),
    ).toThrow(/local file URLs/);
  });
  it('keeps camera and selection across remounts, without update loops', () => {
    const adapter = new OutdoorMapAdapter();
    let updates = 0;
    const unsubscribe = adapter.subscribe(() => updates++);
    adapter.moveCamera({ center: [-74, 42], zoom: 12 });
    adapter.moveCamera({ center: [-74, 42], zoom: 12 });
    adapter.setSelectedFeature('test');
    expect(updates).toBe(2);
    expect(adapter.getSnapshot().camera.zoom).toBe(12);
    expect(adapter.getSnapshot().selectedFeatureId).toBe('test');
    unsubscribe();
    adapter.setSelectedFeature(null);
    expect(updates).toBe(2);
  });
  it('never joins paused/recovered recording segments or mutates the input', () => {
    const points: [number, number][] = [
      [-74, 42],
      [-74.1, 42.1],
      [-74.2, 42.2],
      [-74.3, 42.3],
    ];
    const adapter = new OutdoorMapAdapter();
    adapter.setActiveTrack(points, [2]);
    points[0]![0] = -75;
    const state = adapter.getSnapshot();
    expect(state.activeTrack[0]![0]).toBe(-74);
    const line = segmentedTrack(state.activeTrack, state.trackBreaks);
    expect(line.features).toHaveLength(2);
    expect(line.features[0]!.geometry.coordinates).toHaveLength(2);
    expect(segmentedTrack([[-74, 42]]).features).toHaveLength(0);
    expect(() => adapter.setActiveTrack(points, [100])).toThrow();
    expect(() => geometryPositions([NaN, 42])).toThrow();
  });
});

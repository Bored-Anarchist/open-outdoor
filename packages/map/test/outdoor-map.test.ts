import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  OutdoorMapAdapter,
  featureBounds,
  geometryPositions,
  searchOutdoorFeatures,
  segmentedTrack,
  type OutdoorCollection,
} from '../src/outdoor-map';
const bytes = readFileSync('packages/map/src/assets/new-york-outdoors.json');
const collection = JSON.parse(bytes.toString()) as OutdoorCollection;
const manifest = JSON.parse(
  readFileSync('packages/map/src/assets/new-york-outdoors.manifest.json', 'utf8'),
);
describe('real offline New York map', () => {
  it('ships the complete checksum-pinned source inventories with rights/attribution', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.sha256);
    expect(bytes.length).toBe(manifest.bytes);
    expect(bytes.length).toBeLessThan(24 * 1024 * 1024);
    expect(collection.features.length).toBe(manifest.featureCount);
    expect(collection.features.length).toBeGreaterThan(9000);
    expect(new Set(collection.features.map((f) => f.id)).size).toBe(collection.features.length);
    expect(
      manifest.rights.offlineStorage &&
        manifest.rights.redistribution &&
        manifest.rights.derivedData,
    ).toBe(true);
    expect(manifest.rights.attribution).toHaveLength(2);
    for (const source of manifest.sources) {
      expect(collection.features.filter((f) => f.properties.sourceId === source.id)).toHaveLength(
        source.featureCount,
      );
      expect(source.pages.reduce((n: number, p: any) => n + p.count, 0)).toBe(source.featureCount);
    }
  });
  it('contains valid geographic geometries and only approved public fields', () => {
    for (const f of collection.features) {
      expect(['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']).toContain(
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
  });
  it('finds real named trails without synthetic preserve substitution', () => {
    expect(searchOutdoorFeatures(collection, 'Slide').length).toBeGreaterThan(0);
    expect(
      searchOutdoorFeatures(collection, 'Slide').some((f) => f.properties.kind === 'trail'),
    ).toBe(true);
    expect(searchOutdoorFeatures(collection, '')).toEqual([]);
    expect(searchOutdoorFeatures(collection, 'a', 100)).toHaveLength(50);
    expect(collection.features.some((f) => f.properties.name === 'Hemlock Loop')).toBe(false);
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

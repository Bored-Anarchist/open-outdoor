import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import {
  mergeStateSummaries,
  statePackageMapStyle,
  type InstalledStatePackage,
  type OutdoorFeatureSummary,
} from '../src';

const state: InstalledStatePackage = {
  state: 'CA',
  name: 'California',
  schemaVersion: 1,
  channel: 'public',
  sha256: 'a'.repeat(64),
  featureCount: 66000,
  installedBytes: 100000000,
  generatedAt: '2026-09-27',
  maximumZoom: 10,
  bounds: [-125, 32, -114, 42],
  tilesUri: 'file:///protected/CA.pmtiles',
  visible: true,
  canRollback: false,
  attribution: 'Public agencies',
  notices: 'Informational source snapshot',
};

describe('state catalogs', () => {
  it('produces valid MapLibre sources, filters and style expressions', () => {
    const require = createRequire(import.meta.url);
    const styleSpec = createRequire(require.resolve('maplibre-gl/package.json'))(
      '@maplibre/maplibre-gl-style-spec',
    );
    const style = statePackageMapStyle([state], 'water', 'site-1');
    expect(
      styleSpec.validateStyleMin({
        version: 8,
        glyphs: 'file:///fonts/{fontstack}/{range}.pbf',
        sources: style.sources,
        layers: style.layers,
      }),
    ).toEqual([]);
  });
  it('keeps whole states as local vector sources, without sending GeoJSON to the map', () => {
    const result = statePackageMapStyle([state]);
    expect(result.sources['state-CA']).toEqual({
      type: 'vector',
      url: 'pmtiles://file:///protected/CA.pmtiles',
      attribution: 'Public agencies',
    });
    expect(JSON.stringify(result)).not.toContain('FeatureCollection');
    expect(result.selectionLayers).toContain('state-CA-poi');
  });
  it('excludes hidden states and refuses network sources', () => {
    expect(statePackageMapStyle([{ ...state, visible: false }]).sources).toEqual({});
    expect(() =>
      statePackageMapStyle([{ ...state, tilesUri: 'https://example.com/map.pmtiles' }]),
    ).toThrow(/local files/);
    expect(() => statePackageMapStyle([{ ...state, state: '../private' }])).toThrow();
  });
  it('applies category, selection and marker-detail controls to state layers', () => {
    const result = statePackageMapStyle([state], 'water', 'water-1', 'fewer');
    const poi = result.layers.find((layer) => layer.id === 'state-CA-poi')!;
    expect(poi.minzoom).toBe(8);
    expect(JSON.stringify(poi.filter)).toContain('water');
    expect(
      JSON.stringify(result.layers.find((layer) => layer.id === 'state-CA-selection-point')),
    ).toContain('water-1');
  });
  it('deduplicates overlapping state and bundled records while preserving public/private identity', () => {
    const publicFeature = {
      id: 'nps-shared',
      properties: { name: 'Federal site' },
    } as OutdoorFeatureSummary;
    const privateFeature = {
      id: 'private-place-1',
      properties: { name: 'Private place' },
    } as OutdoorFeatureSummary;
    const result = mergeStateSummaries(
      [publicFeature, privateFeature],
      [publicFeature, publicFeature],
    );
    expect(result).toEqual([publicFeature, privateFeature]);
  });
});

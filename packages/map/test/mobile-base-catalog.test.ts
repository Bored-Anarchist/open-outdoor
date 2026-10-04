import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  createOutdoorMapStyle,
  OutdoorMapAdapter,
  searchOutdoorFeatureIndex,
} from '../src/outdoor-map';

vi.mock('../../../packages/map/src/assets/base-outdoors.geojson', () => ({ default: 1 }));
import {
  mobileMapDataIndex,
  mobileMapDataMetadata,
  mobileHikeData,
} from '../../../apps/mobile/mapData.public';

it('starts a stock build without a preinstalled state catalog or hike profiles', () => {
  const source = readFileSync('apps/mobile/mapData.public.ts', 'utf8');
  expect(source).not.toMatch(/new-york-outdoors|new-york-hikes|\.private-map-data/);
  expect(mobileMapDataMetadata.featureCount).toBe(0);
  expect(mobileMapDataMetadata.sources).toEqual([]);
  expect(mobileMapDataMetadata.hasPrivateData).toBe(false);
  expect(mobileHikeData.hikes).toEqual({});
  expect(searchOutdoorFeatureIndex(mobileMapDataIndex, 'New York')).toEqual([]);
  const bytes = readFileSync('packages/map/src/assets/base-outdoors.geojson');
  const collection = JSON.parse(bytes.toString('utf8'));
  expect(bytes.length).toBeLessThan(128);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(mobileMapDataMetadata.sha256);
  expect(mobileHikeData.sourceSha256).toBe(mobileMapDataMetadata.sha256);
  expect(collection).toEqual({ type: 'FeatureCollection', features: [] });
  expect(createOutdoorMapStyle(collection).sources.outdoors.data).toEqual(collection);
});

it('opens the base map on a broad overview instead of a New York starter region', () => {
  const camera = new OutdoorMapAdapter().getSnapshot().camera;
  expect(camera).toEqual({ center: [-98, 39], zoom: 3 });
});

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hikeRouteDetails, type HikeRouteDetails } from '@open-outdoor/shared/hike-route';
import type { OutdoorCollection } from '../src/outdoor-map';
const asset = readFileSync(new URL('../src/assets/new-york-hikes.json', import.meta.url));
const manifest = JSON.parse(
  readFileSync(new URL('../src/assets/new-york-hikes.manifest.json', import.meta.url), 'utf8'),
);
const profileData = JSON.parse(asset.toString());
const mapBytes = readFileSync(new URL('../src/assets/new-york-outdoors.geojson', import.meta.url));
const map = JSON.parse(mapBytes.toString()) as OutdoorCollection;

describe('bundled public offline hike profiles', () => {
  it('pins profiles to the public geometry and records terrain provenance', () => {
    expect(createHash('sha256').update(asset).digest('hex')).toBe(manifest.sha256);
    expect(asset.length).toBe(manifest.bytes);
    expect(asset.length).toBeLessThan(8 * 1024 * 1024);
    expect(createHash('sha256').update(mapBytes).digest('hex')).toBe(profileData.sourceSha256);
    expect(manifest.sourceSha256).toBe(profileData.sourceSha256);
    expect(manifest.classification).toBe('SOURCE_REDISTRIBUTABLE');
    expect(manifest.attribution).toContain('U.S. Geological Survey');
    expect(manifest.termsUrls.length).toBeGreaterThan(0);
    expect(
      manifest.tiles.every(
        (tile: { sha256: string; url: string }) =>
          /^[a-f0-9]{64}$/.test(tile.sha256) &&
          tile.url.startsWith('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/'),
      ),
    ).toBe(true);
  });
  it('covers public mapped trails with finite bounded profiles and matching endpoints and length', () => {
    const trails = map.features.filter((feature) => feature.properties.kind === 'trail');
    expect(Object.keys(profileData.hikes)).toHaveLength(trails.length);
    expect(trails).toHaveLength(manifest.featureCount);
    for (const feature of trails) {
      if (feature.geometry.type !== 'LineString' && feature.geometry.type !== 'MultiLineString')
        throw Error('Expected trail line');
      expect(feature.properties.origin).not.toBe('private-catalog');
      const hike = profileData.hikes[feature.id] as HikeRouteDetails;
      const mapped = hikeRouteDetails(feature.geometry);
      expect(hike.distanceM).toBe(mapped.distanceM);
      expect(hike.start).toEqual(mapped.start);
      expect(hike.end).toEqual(mapped.end);
      expect(hike.samples.length).toBeLessThanOrEqual(128);
      expect(
        hike.samples.every((sample) =>
          sample.every((value) => value === null || Number.isFinite(value)),
        ),
      ).toBe(true);
      expect(hike.ascentM === undefined || hike.ascentM >= 0).toBe(true);
    }
  });
});

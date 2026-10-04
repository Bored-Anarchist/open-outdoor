import { expect, it } from 'vitest';
import coverage from '../src/assets/regional-basemap-coverage.json';
import manifest from '../src/assets/us-canada-basemap.manifest.json';
import { regionalBasemapCoversViewport } from '../src/regional-basemap';

it('uses the exact coverage of the pinned regional archive', () => {
  expect(coverage.archiveSha256).toBe(manifest.archive.sha256);
  for (const center of [
    [-73.12, 42.87],
    [-155.1, 19.7],
    [-66.1, 18.4],
    [144.8, 13.5],
    [-170.7, -14.3],
    [-123.1, 49.3],
  ]) {
    const [x, y] = center as [number, number];
    expect(regionalBasemapCoversViewport([x - 0.01, y - 0.01, x + 0.01, y + 0.01], 15)).toBe(true);
  }
});

it('falls back for unavailable tiles, overview zoom and invalid bounds', () => {
  expect(regionalBasemapCoversViewport([139.6, 35.6, 139.8, 35.8], 10)).toBe(false);
  expect(regionalBasemapCoversViewport([-180, -85, 180, 85], 9)).toBe(false);
  expect(regionalBasemapCoversViewport([-74, 42, -73, 43], 6)).toBe(false);
  expect(regionalBasemapCoversViewport([-74, 44, -73, 43], 9)).toBe(false);
  expect(regionalBasemapCoversViewport([NaN, 42, -73, 43], 9)).toBe(false);
});

it('normalizes equivalent wrapped longitudes without losing dateline coverage', () => {
  expect(regionalBasemapCoversViewport([-170.71, -14.31, -170.69, -14.29], 15)).toBe(
    regionalBasemapCoversViewport([189.29, -14.31, 189.31, -14.29], 15),
  );
  expect(regionalBasemapCoversViewport([179, 51, -179, 53], 9)).toBe(
    regionalBasemapCoversViewport([179, 51, 181, 53], 9),
  );
});

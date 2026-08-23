import { describe, expect, it } from 'vitest';
import {
  RouteFileError,
  exportGeoJson,
  importGeoJson,
  importGpx,
  privacyFirstExportOptions,
  trimSensitiveEndpoints,
} from '../src/index.js';

const gpx =
  '<?xml version="1.0"?><gpx><trk><name>Private hike</name><trkseg>' +
  '<trkpt lat="41" lon="-74"><time>2026-08-23T12:00:00Z</time></trkpt>' +
  '<trkpt lat="41" lon="-73.99"><time>2026-08-23T12:01:00Z</time></trkpt>' +
  '</trkseg></trk></gpx>';

describe('WP-106 route import/export privacy', () => {
  it('imports GPX as private and rejects entity-bearing XML', () => {
    expect(importGpx(gpx)).toMatchObject({ name: 'Private hike', private: true });
    expect(() =>
      importGpx('<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///etc/passwd">]><gpx/>'),
    ).toThrow(RouteFileError);
  });

  it('round trips GeoJSON without exporting private metadata by default', () => {
    const route = importGeoJson(
      JSON.stringify({
        type: 'Feature',
        properties: { name: 'Secret route' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-74, 41],
            [-73.99, 41],
            [-73.98, 41],
            [-73.97, 41],
          ],
        },
      }),
    );
    const exported = JSON.parse(
      exportGeoJson(route, { ...privacyFirstExportOptions, endpointTrimM: 0 }),
    ) as { properties: Record<string, unknown> };
    expect(exported.properties).toEqual({});
  });

  it('trims both sensitive endpoints', () => {
    const trimmed = trimSensitiveEndpoints(
      [
        [-74, 41],
        [-73.999, 41],
        [-73.998, 41],
        [-73.997, 41],
        [-73.996, 41],
      ],
      80,
    );
    expect(trimmed.length).toBeLessThan(5);
    expect(trimmed.length).toBeGreaterThanOrEqual(2);
  });
});

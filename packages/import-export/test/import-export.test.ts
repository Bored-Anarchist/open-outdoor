import { describe, expect, it } from 'vitest';
import { geodesicDistanceM } from '@open-outdoor/tracking';
import {
  RouteFileError,
  exportGeoJson,
  importGeoJson,
  importGpx,
  privacyFirstExportOptions,
  trimSensitiveEndpoints,
  removePhotoMetadata,
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
    expect(trimmed.length).toBeGreaterThanOrEqual(2);
    expect(geodesicDistanceM([-74, 41], trimmed[0] ?? [-74, 41])).toBeCloseTo(80, 1);
    expect(geodesicDistanceM(trimmed.at(-1) ?? [-73.996, 41], [-73.996, 41])).toBeCloseTo(80, 1);
  });
  it('removes JPEG EXIF metadata rather than only returning a policy flag', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xda, 0x00,
      0x02, 0xff, 0xd9,
    ]);
    const sanitized = removePhotoMetadata(jpeg, 'image/jpeg');
    expect(new TextDecoder().decode(sanitized.bytes)).not.toContain('Exif');
    expect(sanitized.removedMetadata).toBe(true);
  });
  it('removes metadata between JPEG scans and discards data after EOI', () => {
    const scan = [0xff, 0xda, 0, 2, 1, 0xff, 0, 2, 0xff, 0xd0, 3];
    const exif = [0xff, 0xe1, 0, 8, 69, 120, 105, 102, 0, 0];
    const jpeg = new Uint8Array([0xff, 0xd8, ...scan, ...exif, ...scan, 0xff, 0xd9, ...exif]);
    expect(removePhotoMetadata(jpeg, 'image/jpeg').bytes).toEqual(
      new Uint8Array([0xff, 0xd8, ...scan, ...scan, 0xff, 0xd9]),
    );
  });
  it('handles a one-MiB JPEG scan without spreading pixels into function arguments', () => {
    const jpeg = new Uint8Array(1024 * 1024);
    jpeg.set([0xff, 0xd8, 0xff, 0xda, 0, 2]);
    jpeg.set([0xff, 0xd9], jpeg.length - 2);
    const sanitized = removePhotoMetadata(jpeg, 'image/jpeg').bytes;
    expect(sanitized.length).toBe(jpeg.length);
    expect(sanitized.every((value, index) => value === jpeg[index])).toBe(true);
  });
  it('handles a one-MiB PNG chunk without spreading pixels into function arguments', () => {
    const dataLength = 1024 * 1024;
    const png = new Uint8Array(8 + 12 + dataLength + 12);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    new DataView(png.buffer).setUint32(8, dataLength);
    png.set(new TextEncoder().encode('IDAT'), 12);
    png.set(new TextEncoder().encode('IEND'), png.length - 8);
    const sanitized = removePhotoMetadata(png, 'image/png').bytes;
    expect(sanitized.length).toBe(png.length);
    expect(sanitized.every((value, index) => value === png[index])).toBe(true);
  });
  it('rejects truncated JPEG scans without certifying them as sanitized', () => {
    expect(() =>
      removePhotoMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 1]), 'image/jpeg'),
    ).toThrow(RouteFileError);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  fitCrc,
  importFit,
  importCsv,
  importKml,
  importSelectedFile,
  stageSelectedFile,
  type ImportFormat,
  type PrivateImportSink,
} from '../src/index.js';

const text = (value: string) => new TextEncoder().encode(value);
const selection = (format: ImportFormat, value: string | Uint8Array) => ({
  format,
  bytes: typeof value === 'string' ? text(value) : value,
  fileName: `synthetic.${format}`,
  importedAt: '2026-09-09T00:00:00Z',
  userSelected: true as const,
  lawfullyObtained: true as const,
});
const gpx =
  '<gpx><trk><name>Example</name><trkseg><trkpt lat="41" lon="-74"/><trkpt lat="42" lon="-73"/></trkseg></trk><wpt lat="40" lon="-75"><name>Camp</name></wpt></gpx>';
const kml =
  '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>A &amp; B</name><LineString><coordinates>-74,41,0 -73,42,0</coordinates></LineString></Placemark><Placemark><Point><coordinates>-75,40</coordinates></Point></Placemark></Document></kml>';
const geojson = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [-74, 41],
          [-73, 42],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Camp' },
      geometry: { type: 'Point', coordinates: [-75, 40] },
    },
  ],
});

// Independently laid-out FIT record fixture, including compressed timestamp rollover.
function fit(little = true, compressed = false, developer = false): Uint8Array {
  const data: number[] = [
    developer ? 0x60 : 0x40,
    0,
    little ? 0 : 1,
    ...(little ? [20, 0] : [0, 20]),
    3,
    253,
    4,
    0x86,
    0,
    4,
    0x85,
    1,
    4,
    0x85,
  ];
  if (developer) data.push(1, 0, 2, 0);
  for (let index = 0; index < 2; index++) {
    data.push(compressed && index ? 0x81 : 0);
    const record = new Uint8Array(compressed && index ? 8 : 12);
    const view = new DataView(record.buffer);
    const offset = compressed && index ? 0 : 4;
    if (offset) view.setUint32(0, 31 + index, little);
    view.setInt32(offset, Math.round(((41 + index) * 2 ** 31) / 180), little);
    view.setInt32(offset + 4, Math.round(((-74 + index) * 2 ** 31) / 180), little);
    data.push(...record);
    if (developer) data.push(1, 2);
  }
  const bytes = new Uint8Array(14 + data.length + 2);
  const view = new DataView(bytes.buffer);
  bytes.set([14, 0x20, 0, 0], 0);
  view.setUint32(4, data.length, true);
  bytes.set(text('.FIT'), 8);
  view.setUint16(12, fitCrc(bytes.subarray(0, 12)), true);
  bytes.set(data, 14);
  view.setUint16(bytes.length - 2, fitCrc(bytes.subarray(0, -2)), true);
  return bytes;
}

describe('WP-403 selected private imports', () => {
  it.each([
    ['gpx', gpx],
    ['kml', kml],
    ['geojson', geojson],
    ['csv', 'longitude,latitude,name\r\n-74,41,"A, B"\r\n-73,42,"A ""quote"""'],
    ['fit', fit()],
  ] as const)('imports %s with private provenance', (format, value) => {
    const result = importSelectedFile(selection(format, value));
    expect(result.private).toBe(true);
    expect(result.routes[0]?.private).toBe(true);
    expect(result.routes[0]?.coordinates).toHaveLength(2);
    expect(result.provenance).toMatchObject({
      sourceFormat: format,
      classification: 'PRIVATE_USER',
      acquisitionMode: 'user-export',
      parserVersion: '1.0.0',
    });
  });
  it('retains all features and GPX segment boundaries instead of silently truncating or joining', () => {
    expect(importSelectedFile(selection('geojson', geojson)).places).toHaveLength(1);
    const result = importSelectedFile(
      selection(
        'gpx',
        gpx.replace(
          '</trk>',
          '<trkseg><trkpt lat="10" lon="10"/><trkpt lat="11" lon="11"/></trkseg></trk>',
        ),
      ),
    );
    expect(result.routes).toHaveLength(2);
    expect(result.places[0]?.name).toBe('Camp');
  });
  it('maps lawful account exports with explicit CSV columns and no network access', () => {
    const network = vi.spyOn(globalThis, 'fetch');
    try {
      const alltrails = importSelectedFile({ ...selection('gpx', gpx), provider: 'alltrails' });
      expect(alltrails.provenance.provider).toBe('alltrails');
      const account = {
        ...selection('csv', 'Title,Lat,Lon\nSynthetic,41,-74'),
        provider: 'ioverlander' as const,
      };
      expect(() => importSelectedFile(account)).toThrow(/mapping/);
      const result = importSelectedFile({
        ...account,
        csvMapping: { name: 'Title', latitude: 'Lat', longitude: 'Lon', geometry: 'places' },
      });
      expect(result.places).toEqual([{ name: 'Synthetic', coordinate: [-74, 41] }]);
      expect(result.provenance.classification).toBe('PRIVATE_USER');
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });
  it('stages only whole validated batches into a private sink with source checksum', async () => {
    const sink: PrivateImportSink = {
      classification: 'PRIVATE_USER',
      insertBatch: vi.fn(async () => {}),
    };
    const result = await stageSelectedFile(selection('kml', kml), sink);
    expect(result.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sink.insertBatch).toHaveBeenCalledOnce();
    await expect(stageSelectedFile(selection('kml', '<kml>'), sink)).rejects.toThrow();
    expect(sink.insertBatch).toHaveBeenCalledOnce();
    await expect(
      stageSelectedFile(selection('kml', kml), {
        ...sink,
        classification: 'PUBLIC_SYNTHETIC',
      } as unknown as PrivateImportSink),
    ).rejects.toThrow(/private/);
  });
  it.each([
    '<!DOCTYPE kml><kml/>',
    '<kml><Placemark></kml>',
    '<kml><NetworkLink><Link/></NetworkLink></kml>',
    '<kml><Placemark><Point><coordinates>NaN,41</coordinates></Point></Placemark></kml>',
    '<kml/><kml/>',
  ])('rejects unsafe or malformed KML', (input) => {
    expect(() => importKml(input)).toThrow();
  });
  it.each([
    'longitude,latitude\n,41\n-73,42',
    'longitude,latitude\n-74,91\n-73,42',
    'longitude,latitude\n"-74,41',
    'longitude,latitude\n-74,41,extra',
    'longitude,latitude,latitude\n-74,41,41',
  ])('rejects malformed CSV', (input) => {
    expect(() => importCsv(input)).toThrow();
  });
  it('enforces bytes, aggregate points, provenance, selection and UTF-8', () => {
    expect(() =>
      importSelectedFile(selection('gpx', gpx), { maximumBytes: 10, maximumPoints: 10 }),
    ).toThrow(/byte limit/);
    expect(() =>
      importSelectedFile(selection('geojson', geojson), { maximumBytes: 10000, maximumPoints: 2 }),
    ).toThrow(/point limit/);
    expect(() =>
      importSelectedFile({ ...selection('gpx', gpx), lawfullyObtained: false } as never),
    ).toThrow(/selection/);
    expect(() =>
      importSelectedFile({ ...selection('gpx', gpx), fileName: '../secret.gpx' }),
    ).toThrow(/provenance/);
    expect(() => importSelectedFile(selection('csv', new Uint8Array([0xff])))).toThrow(/UTF-8/);
    expect(() =>
      importSelectedFile(selection('gpx', gpx), { maximumBytes: NaN, maximumPoints: 10 }),
    ).toThrow(/limits/);
  });
  it.each([true, false])(
    'decodes FIT endianness %s, developer fields and compressed timestamps',
    (little) => {
      const result = importFit(fit(little, true, true));
      expect(result.coordinates[0]?.[0]).toBeCloseTo(-74, 5);
      expect(result.coordinates[1]?.[1]).toBeCloseTo(42, 5);
      expect(result.timestamps).toEqual(['1989-12-31T00:00:31.000Z', '1989-12-31T00:00:33.000Z']);
    },
  );
  it('rejects corrupt and truncated FIT, validates header CRC, and bounds points', () => {
    expect(fitCrc(text('123456789'))).toBe(0xbb3d);
    const corrupt = fit();
    corrupt[20] = 99;
    expect(() => importFit(corrupt)).toThrow(/CRC/);
    expect(() => importFit(fit().subarray(0, 20))).toThrow(/length/);
    expect(() => importFit(fit(), { maximumBytes: 10000, maximumPoints: 1 })).toThrow(
      /point limit/,
    );
    const header = fit();
    header[12] = header[12]! ^ 1;
    expect(() => importFit(header)).toThrow(/header CRC/);
    const invalidData = fit();
    invalidData[14] = 0;
    new DataView(invalidData.buffer).setUint16(
      invalidData.length - 2,
      fitCrc(invalidData.subarray(0, -2)),
      true,
    );
    expect(() => importFit(invalidData)).toThrow(/precedes definition/);
  });
});

it('rejects mixed unsupported geometry without silently discarding records', () => {
  expect(() =>
    importSelectedFile(
      selection('kml', kml.replace('</Document>', '<Placemark><Polygon/></Placemark></Document>')),
    ),
  ).toThrow(/unsupported KML/);
  const document = JSON.parse(geojson) as { features: unknown[] };
  document.features.push({ type: 'FeatureCollection', features: [] });
  expect(() => importSelectedFile(selection('geojson', JSON.stringify(document)))).toThrow(
    /unsupported GeoJSON/,
  );
  expect(importSelectedFile(selection('gpx', gpx)).routes[0]?.name).toBe('Example');
});

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertReproducibleBasemap,
  buildNewYorkBasemap,
  type BuildNewYorkBasemapInput,
} from '../src/index.js';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function fixture(): BuildNewYorkBasemapInput {
  const extractBytes = new TextEncoder().encode('synthetic pinned New York OSM extract');
  const compilerExecutableBytes = new TextEncoder().encode('synthetic pinned tile compiler');
  return {
    extract: {
      locator: 'https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf',
      sha256: sha256(extractBytes),
      sourceTimestamp: '2026-08-31T00:00:00.000Z',
      boundary: [-80, 40, -71, 46],
      provider: 'Geofabrik GmbH',
      licenseId: 'ODbL-1.0',
      attribution: ['© OpenStreetMap contributors', 'Extract provided by Geofabrik'],
      offlineRedistributionAllowed: true,
    },
    extractBytes,
    compiler: {
      name: 'planetiler',
      version: '0.9.0',
      executableSha256: sha256(compilerExecutableBytes),
    },
    compilerExecutableBytes,
    compile: () => new TextEncoder().encode('deterministic synthetic MBTiles archive'),
    profile: {
      id: 'new-york-outdoor-v1',
      regionId: 'us-ny',
      schemaVersion: 1,
      styleVersion: 1,
      statewideMinimumZoom: 0,
      statewideMaximumZoom: 14,
      highDetailAreas: [
        {
          id: 'adirondack-high-peaks',
          bounds: [-74.3, 43.8, -73.6, 44.4],
          minimumZoom: 15,
          maximumZoom: 16,
        },
      ],
      layers: ['background', 'land', 'water', 'road', 'trail', 'place'],
    },
    style: {
      document: {
        version: 8,
        sprite: 'asset://basemap/sprites/outdoor',
        glyphs: 'asset://basemap/fonts/{fontstack}/{range}.pbf',
        sources: { basemap: { type: 'vector', url: 'mbtiles://new-york.mbtiles' } },
      },
      sprites: [
        {
          id: 'outdoor-sprites',
          path: 'assets/basemap/sprites/outdoor',
          licenseId: 'CC0-1.0',
          attribution: 'Open Outdoor original symbols',
        },
      ],
      fonts: [
        {
          id: 'noto-sans',
          path: 'assets/basemap/fonts/noto-sans',
          licenseId: 'OFL-1.1',
          attribution: 'Noto Sans © Google',
        },
      ],
    },
    checksum: { sha256 },
  };
}

describe('WP-301 self-generated New York basemap', () => {
  it('T-REL-002-C10 records reproducible source, compiler, coverage, local assets, and attribution', () => {
    const first = buildNewYorkBasemap(fixture());
    const second = buildNewYorkBasemap(fixture());
    expect(first).toMatchObject({
      regionId: 'us-ny',
      archive: { format: 'mbtiles' },
      profile: { statewideMaximumZoom: 14 },
    });
    expect(first.profile.highDetailAreas[0]).toMatchObject({ maximumZoom: 16 });
    expect(first.attribution).toEqual(
      expect.arrayContaining(['© OpenStreetMap contributors', 'Extract provided by Geofabrik']),
    );
    expect(() => assertReproducibleBasemap(first, second)).not.toThrow();
  });

  it('fails closed on tile-server acquisition, checksum drift, remote style assets, or missing rights', () => {
    const input = fixture();
    expect(() =>
      buildNewYorkBasemap({
        ...input,
        extract: { ...input.extract, locator: 'https://tile.openstreetmap.org/1/1/1.png' },
      }),
    ).toThrow(/never OSM tile servers/);
    expect(() =>
      buildNewYorkBasemap({
        ...input,
        extract: { ...input.extract, sha256: '0'.repeat(64) },
      }),
    ).toThrow(/checksum/);
    expect(() =>
      buildNewYorkBasemap({
        ...input,
        style: { ...input.style, document: { glyphs: 'https://example.invalid/fonts.pbf' } },
      }),
    ).toThrow(/network resource/);
    expect(() =>
      buildNewYorkBasemap({
        ...input,
        extract: { ...input.extract, offlineRedistributionAllowed: false },
      }),
    ).toThrow(/rights/);
    expect(() =>
      buildNewYorkBasemap({
        ...input,
        compiler: { ...input.compiler, executableSha256: '1'.repeat(64) },
      }),
    ).toThrow(/compiler executable checksum/);
  });
});

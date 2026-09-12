import { describe, expect, it } from 'vitest';
import {
  isLocalFileUri,
  resolveOfflineBasemapSource,
  type OfflineBasemapSourceManifest,
} from '../src/offline-basemap-source';

const overviewManifest: OfflineBasemapSourceManifest = {
  schemaVersion: 1,
  regionId: 'us-ny',
  minimumZoom: 0,
  maximumZoom: 9,
  archive: {
    format: 'pmtiles',
    bytes: 14_000_000,
    sha256: 'a'.repeat(64),
  },
};

const installedManifest: OfflineBasemapSourceManifest = {
  ...overviewManifest,
  maximumZoom: 12,
  archive: {
    format: 'pmtiles',
    bytes: 134_642_224,
    sha256: 'B'.repeat(64),
  },
};

const overview = {
  uri: 'file:///bundle/new-york-overview-z9.pmtiles',
  manifest: overviewManifest,
};

function installed(
  change: Partial<{
    uri: string;
    manifest: OfflineBasemapSourceManifest;
    verification: { bytes: number; sha256: string };
  }> = {},
) {
  return {
    uri: 'file:///documents/MapPacks/new-york-z12.pmtiles',
    manifest: installedManifest,
    verification: {
      bytes: installedManifest.archive.bytes,
      sha256: installedManifest.archive.sha256.toLocaleLowerCase(),
    },
    ...change,
  };
}

describe('offline basemap source resolver', () => {
  it('uses the bundled overview when no installed pack exists', () => {
    expect(resolveOfflineBasemapSource({ overview })).toEqual({
      ...overview,
      kind: 'overview',
    });
  });

  it('selects a compatible installed pack only after byte and SHA-256 verification', () => {
    const source = resolveOfflineBasemapSource({ overview, installed: installed() });
    expect(source.kind).toBe('installed');
    expect(source.uri).toContain('new-york-z12.pmtiles');
    expect(source.manifest.maximumZoom).toBe(12);
    expect(source).not.toHaveProperty('installedRejection');
  });

  it.each([
    ['not-local', installed({ uri: 'https://example.invalid/new-york.pmtiles' })],
    ['incompatible-region', installed({ manifest: { ...installedManifest, regionId: 'us-vt' } })],
    ['incompatible-schema', installed({ manifest: { ...installedManifest, schemaVersion: 2 } })],
    [
      'byte-length-mismatch',
      installed({
        verification: {
          bytes: installedManifest.archive.bytes - 1,
          sha256: installedManifest.archive.sha256,
        },
      }),
    ],
    [
      'checksum-mismatch',
      installed({
        verification: {
          bytes: installedManifest.archive.bytes,
          sha256: 'c'.repeat(64),
        },
      }),
    ],
    [
      'invalid-manifest',
      installed({
        manifest: {
          ...installedManifest,
          archive: { ...installedManifest.archive, sha256: 'not-a-checksum' },
        },
      }),
    ],
  ] as const)('falls back to the overview when an installed pack is %s', (reason, candidate) => {
    const source = resolveOfflineBasemapSource({ overview, installed: candidate });
    expect(source.kind).toBe('overview');
    expect(source.uri).toBe(overview.uri);
    expect(source.installedRejection).toBe(reason);
  });

  it.each([
    'https://example.invalid/map.pmtiles',
    'http://example.invalid/map.pmtiles',
    'pmtiles://file:///map.pmtiles',
    'asset://map.pmtiles',
    'file://',
    'file:///map.pmtiles\nhttps://example.invalid',
  ])('rejects a non-local or malformed overview URI: %s', (uri) => {
    expect(() => resolveOfflineBasemapSource({ overview: { ...overview, uri } })).toThrow(
      /local file URL/,
    );
  });

  it.each([
    [{ ...overviewManifest, schemaVersion: 0 }, 'schema version'],
    [{ ...overviewManifest, regionId: ' ' }, 'region'],
    [{ ...overviewManifest, minimumZoom: 10 }, 'zoom range'],
    [
      { ...overviewManifest, archive: { ...overviewManifest.archive, bytes: 0 } },
      'archive byte length',
    ],
    [
      { ...overviewManifest, archive: { ...overviewManifest.archive, sha256: 'abc' } },
      'archive checksum',
    ],
  ] as const)('fails closed for an invalid bundled overview manifest', (manifest, problem) => {
    expect(() => resolveOfflineBasemapSource({ overview: { ...overview, manifest } })).toThrow(
      problem,
    );
  });

  it('recognizes absolute iOS and Windows file URLs only', () => {
    expect(isLocalFileUri('file:///var/mobile/map.pmtiles')).toBe(true);
    expect(isLocalFileUri('file:///C:/Map%20Packs/map.pmtiles')).toBe(true);
    expect(isLocalFileUri('/var/mobile/map.pmtiles')).toBe(false);
    expect(isLocalFileUri('https://example.invalid/map.pmtiles')).toBe(false);
  });
});

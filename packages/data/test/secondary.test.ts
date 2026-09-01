import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CanonicalSourceIdRegistry,
  RawArtifactStore,
  SECONDARY_SOURCE_REGISTRY,
  assertSecondarySourceReady,
  buildSecondaryCoverageReport,
  createSecondaryConnector,
  elevationProductToPublicPackArtifact,
  getSecondarySource,
  runConnector,
  type GeoJsonSourceFeature,
  type SecondaryFetchResult,
  type SecondaryFetcher,
} from '../src/index.js';

const now = '2026-08-31T12:00:00.000Z';
const encoder = new TextEncoder();

async function rawStore(): Promise<RawArtifactStore> {
  return new RawArtifactStore({
    root: await mkdtemp(join(tmpdir(), 'open-outdoor-secondary-')),
    boundary: 'public',
  });
}

function jsonResult(payload: unknown): SecondaryFetchResult {
  return {
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: encoder.encode(JSON.stringify(payload)),
    redirectCount: 0,
  };
}

describe('WP-210 secondary official-source connectors', () => {
  it('T-INT-003-C06 independently registers reviewed public rights and external secrets', async () => {
    expect(SECONDARY_SOURCE_REGISTRY).toHaveLength(6);
    for (const source of SECONDARY_SOURCE_REGISTRY) {
      expect(() => assertSecondarySourceReady(source, now)).not.toThrow();
      expect(source.endpoint).toMatch(/^https:\/\//);
      expect(source.manifest).toMatchObject({
        lifecycle: 'active',
        authorization: 'authorized',
        classification: 'SOURCE_REDISTRIBUTABLE',
        rights: {
          offlineStorage: true,
          derivedData: true,
          distribution: { public: true },
        },
      });
      expect(source.licenseId).not.toBe('');
      expect(source.manifest.rights.attribution.length).toBeGreaterThan(0);
    }
    expect(getSecondarySource('ridb-facilities-ny').manifest.secretNames).toEqual(['RIDB_API_KEY']);
    expect(getSecondarySource('nps-parks-ny').manifest.secretNames).toEqual(['NPS_API_KEY']);
    const fixture = JSON.parse(
      await readFile(
        new URL('../../../fixtures/public/data-platform/secondary-alpha.json', import.meta.url),
        'utf8',
      ),
    ) as { readonly classification: string; readonly containsProductionData: boolean };
    expect(fixture).toEqual(
      expect.objectContaining({
        classification: 'PUBLIC_SYNTHETIC',
        containsProductionData: false,
      }),
    );
  });

  it('T-INT-003-C07 pages RIDB deterministically and sends its API key only in headers', async () => {
    const source = { ...getSecondarySource('ridb-facilities-ny'), pageSize: 2 };
    const seen: { url: string; headers: Readonly<Record<string, string>> }[] = [];
    const records = [1, 2, 3].map((id) => ({
      FacilityID: String(id),
      FacilityName: `Synthetic RIDB ${id}`,
      FacilityTypeDescription: 'Facility',
      FacilityLatitude: 43 + id / 100,
      FacilityLongitude: -74 - id / 100,
      LastUpdatedDate: now,
    }));
    const fetcher: SecondaryFetcher = async (url, headers) => {
      seen.push({ url, headers });
      const parsed = new URL(url);
      const limit = Number(parsed.searchParams.get('limit'));
      const offset = Number(parsed.searchParams.get('offset'));
      return jsonResult({
        METADATA: { RESULTS: { TOTAL_COUNT: 3 } },
        RECDATA: limit === 1 ? [] : records.slice(offset, offset + limit),
      });
    };
    const result = await runConnector(
      createSecondaryConnector({
        source,
        fetcher,
        rawStore: await rawStore(),
        ids: new CanonicalSourceIdRegistry(),
        secrets: { RIDB_API_KEY: 'fixture-key' },
        now: () => now,
      }),
      'secondary-ridb',
      now,
    );
    expect(result.quarantine).toEqual([]);
    expect(result.emitted.flatMap((batch) => batch.records)).toHaveLength(3);
    expect(result.emitted.map((batch) => batch.records[0]?.source.sourcePartition)).toEqual([
      'page-0000',
      'page-0001',
    ]);
    expect(seen.every((request) => request.headers.apikey === 'fixture-key')).toBe(true);
    expect(seen.every((request) => !request.url.includes('fixture-key'))).toBe(true);
  });

  it('T-INT-003-C08 normalizes NPS alerts and USGS 3DEP product metadata', async () => {
    const nps = getSecondarySource('nps-alerts-ny');
    const npsFetcher: SecondaryFetcher = async (url, headers) => {
      expect(headers['X-Api-Key']).toBe('nps-fixture-key');
      const discovery = new URL(url).searchParams.get('limit') === '1';
      return jsonResult({
        total: '1',
        data: discovery
          ? []
          : [
              {
                id: 'alert-1',
                title: 'Synthetic closure',
                category: 'Closure',
                parkCode: 'sara',
                lastIndexedDate: now,
              },
            ],
      });
    };
    const npsResult = await runConnector(
      createSecondaryConnector({
        source: nps,
        fetcher: npsFetcher,
        rawStore: await rawStore(),
        ids: new CanonicalSourceIdRegistry(),
        secrets: { NPS_API_KEY: 'nps-fixture-key' },
        now: () => now,
      }),
      'secondary-nps',
      now,
    );
    expect(npsResult.quarantine).toEqual([]);
    expect(npsResult.emitted[0]?.records[0]).toMatchObject({
      recordType: 'restriction',
      properties: { authority: 'National Park Service alert' },
    });

    const dep = getSecondarySource('usgs-3dep-ny');
    const depFetcher: SecondaryFetcher = async (url) => {
      const discovery = new URL(url).searchParams.get('limit') === '1';
      return jsonResult({
        total: 1,
        items: discovery
          ? []
          : [
              {
                sourceId: 'dem-1',
                title: 'Synthetic 1 meter DEM',
                downloadURL: 'https://prd-tnm.s3.amazonaws.com/synthetic/dem-1.tif',
                sizeInBytes: 1024,
                boundingBox: { minX: -75, minY: 42, maxX: -74, maxY: 43 },
                resolution: 1,
                verticalDatum: 'NAVD 88',
                publicationDate: now,
              },
            ],
      });
    };
    const depResult = await runConnector(
      createSecondaryConnector({
        source: dep,
        fetcher: depFetcher,
        rawStore: await rawStore(),
        ids: new CanonicalSourceIdRegistry(),
        now: () => now,
      }),
      'secondary-3dep',
      now,
    );
    expect(depResult.quarantine).toEqual([]);
    expect(depResult.emitted[0]?.elevationProducts[0]).toMatchObject({
      resolutionMeters: 1,
      verticalDatum: 'orthometric_navd88',
      bounds: [-75, 42, -74, 43],
    });
    const product = depResult.emitted[0]?.elevationProducts[0];
    expect(product && elevationProductToPublicPackArtifact(product, 'a'.repeat(64))).toMatchObject({
      kind: 'elevation-tile',
      contentChecksum: 'a'.repeat(64),
      classification: 'SOURCE_REDISTRIBUTABLE',
      metadata: { resolutionMeters: 1, verticalDatum: 'orthometric_navd88' },
    });
  });

  it('T-INT-003-C09 rejects unpinned OSM and maps a checksum-pinned dated extract', async () => {
    const source = getSecondarySource('osm-geofabrik-ny');
    const payload = encoder.encode('synthetic pbf fixture');
    const checksum = createHash('md5').update(payload).digest('hex');
    const fetcher: SecondaryFetcher = async () => ({
      status: 200,
      contentType: 'application/octet-stream',
      body: payload,
      redirectCount: 0,
    });
    const features: readonly GeoJsonSourceFeature[] = [
      {
        type: 'Feature',
        id: 'way/1',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-74, 43],
            [-73.9, 43.1],
          ],
        },
        properties: { tags: { name: 'Synthetic Path', highway: 'path' } },
      },
      {
        type: 'Feature',
        id: 'node/2',
        geometry: { type: 'Point', coordinates: [-74, 43] },
        properties: { tags: { name: 'Synthetic Parking', amenity: 'parking' } },
      },
      {
        type: 'Feature',
        id: 'relation/3',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-75, 42],
              [-74, 42],
              [-74, 43],
              [-75, 43],
              [-75, 42],
            ],
          ],
        },
        properties: { tags: { name: 'Synthetic Forest', operator: 'Fixture' } },
      },
    ];
    const result = await runConnector(
      createSecondaryConnector({
        source,
        fetcher,
        rawStore: await rawStore(),
        ids: new CanonicalSourceIdRegistry(),
        pinnedBulkLocator: 'https://download.geofabrik.de/north-america/us/new-york-260831.osm.pbf',
        pinnedBulkChecksum: checksum,
        osmDecoder: async () => features,
        now: () => now,
      }),
      'secondary-osm',
      now,
    );
    expect(result.quarantine).toEqual([]);
    expect(result.emitted[0]?.records.map((record) => record.recordType)).toEqual([
      'trail',
      'place',
      'land-unit',
    ]);
    const unpinned = createSecondaryConnector({
      source,
      fetcher,
      rawStore: await rawStore(),
      ids: new CanonicalSourceIdRegistry(),
      pinnedBulkLocator: source.endpoint,
      osmDecoder: async () => features,
      now: () => now,
    });
    const denied = await runConnector(unpinned, 'secondary-osm-unpinned', now);
    expect(denied.emitted).toEqual([]);
    expect(denied.quarantine[0]?.detail).toMatch(/checksum-pinned/);
  });

  it('T-REL-002-C03 reports family gaps, source freshness, geometry, and elevation coverage', () => {
    const report = buildSecondaryCoverageReport(now, []);
    expect(report.missingFamilies).toEqual(['ridb', 'nps', 'osm', '3dep']);
    expect(report.staleSourceIds).toHaveLength(SECONDARY_SOURCE_REGISTRY.length);
    expect(report.sources.every((source) => source.recordCount === 0)).toBe(true);
  });
});

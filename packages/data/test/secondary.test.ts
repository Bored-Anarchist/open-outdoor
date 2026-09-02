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

function storedZip(entries: Readonly<Record<string, Uint8Array>>): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name, 'utf8');
    const body = Buffer.from(value);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(body.byteLength, 18);
    local.writeUInt32LE(body.byteLength, 22);
    local.writeUInt16LE(nameBytes.byteLength, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(body.byteLength, 20);
    central.writeUInt32LE(body.byteLength, 24);
    central.writeUInt16LE(nameBytes.byteLength, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBytes);
    localOffset += local.byteLength + nameBytes.byteLength + body.byteLength;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(central.byteLength, 12);
  end.writeUInt32LE(localOffset, 16);
  return new Uint8Array(Buffer.concat([...localParts, central, end]));
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
    expect(getSecondarySource('ridb-facilities-ny')).toMatchObject({
      adapter: 'ridb-json-zip',
      endpoint: 'https://ridb.recreation.gov/downloads/RIDBFullExport_V1_JSON.zip',
      manifest: { secretNames: [] },
    });
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

  it('T-INT-003-C07 range-fetches the RIDB bulk archive and deterministically selects New York facilities without a key', async () => {
    const source = getSecondarySource('ridb-facilities-ny');
    const seen: { url: string; headers: Readonly<Record<string, string>> }[] = [];
    const facilities = [3, 1, 2].map((id) => ({
      FacilityID: String(id),
      FacilityName: `Synthetic RIDB ${id}`,
      FacilityTypeDescription: 'Facility',
      FacilityLatitude: 43 + id / 100,
      FacilityLongitude: -74 - id / 100,
      LastUpdatedDate: now,
    }));
    const archive = storedZip({
      'Facilities_API_v1.json': encoder.encode(JSON.stringify({ RECDATA: facilities })),
      'FacilityAddresses_API_v1.json': encoder.encode(
        JSON.stringify({
          RECDATA: [
            { FacilityID: '1', AddressStateCode: 'NY' },
            { FacilityID: '2', AddressStateCode: 'NJ' },
            { FacilityID: '3', AddressStateCode: 'NY' },
          ],
        }),
      ),
    });
    const fetcher: SecondaryFetcher = async (url, headers) => {
      seen.push({ url, headers });
      const range = headers.Range;
      expect(range).toBeDefined();
      let body: Uint8Array;
      if (range === 'bytes=-65536') {
        body = archive.slice(Math.max(0, archive.byteLength - 65_536));
      } else {
        const match = /^bytes=(\d+)-(\d+)$/.exec(range ?? '');
        expect(match).not.toBeNull();
        const start = Number(match?.[1]);
        const end = Number(match?.[2]);
        body = archive.slice(start, Math.min(end + 1, archive.byteLength));
      }
      return {
        status: 206,
        contentType: 'application/zip',
        body,
        redirectCount: 0,
      };
    };
    const result = await runConnector(
      createSecondaryConnector({
        source,
        fetcher,
        rawStore: await rawStore(),
        ids: new CanonicalSourceIdRegistry(),
        now: () => now,
      }),
      'secondary-ridb',
      now,
    );
    expect(result.quarantine).toEqual([]);
    const emitted = result.emitted.flatMap((batch) => batch.records);
    expect(emitted.map((record) => record.source.externalId)).toEqual(['1', '3']);
    expect(emitted.every((record) => record.source.sourcePartition === 'new-york-daily-json')).toBe(
      true,
    );
    expect(seen).toHaveLength(4);
    expect(seen.every((request) => request.url === source.endpoint)).toBe(true);
    expect(seen.every((request) => request.headers.apikey === undefined)).toBe(true);
    expect(seen.every((request) => request.headers.Range?.startsWith('bytes='))).toBe(true);
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

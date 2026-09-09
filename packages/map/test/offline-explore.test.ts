import { describe, expect, it } from 'vitest';
import type { CampingEvaluation, CanonicalRecord } from '@open-outdoor/data';
import { OfflineExploreIndex, type OfflineBundleCoverage } from '../src/index.js';

const source = {
  sourceId: 'nys-dec-outdoor',
  externalId: 'fixture',
  sourcePartition: 'page-0000',
  connectorVersion: '1.0.0',
  parserVersion: '1.0.0',
  normalizerVersion: '1.0.0',
};

function envelope(id: string, externalId: string) {
  return {
    schemaVersion: '1.0.0' as const,
    id,
    source: { ...source, externalId },
    retrievedAt: '2026-08-02T00:00:00.000Z',
    sourceUpdatedAt: '2026-08-01T00:00:00.000Z',
    geometryQuality: null,
    fieldProvenance: {
      name: {
        sourceField: 'NAME',
        sourceValue: externalId,
        observedAt: '2026-08-01T00:00:00.000Z',
        transformation: 'trim',
      },
    },
    rights: {
      policyId: 'nys-open-data',
      distribution: 'public' as const,
      attribution: ['New York State DEC'],
    },
    validation: { state: 'valid' as const, reasonCodes: [] },
    contentChecksum: 'a'.repeat(64),
    tombstone: false,
    classification: 'public-reference' as const,
  };
}

const landId = '00000000-0000-4000-8000-000000000101';
const trailId = '00000000-0000-4000-8000-000000000102';
const placeId = '00000000-0000-4000-8000-000000000103';

const records: readonly CanonicalRecord[] = [
  {
    ...envelope(landId, 'adirondack-land'),
    recordType: 'land-unit',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-74.1, 44],
          [-73.8, 44],
          [-73.8, 44.2],
          [-74.1, 44.2],
          [-74.1, 44],
        ],
      ],
    },
    properties: {
      name: 'Adirondack Fixture Forest',
      ownership: 'State Public',
      manager: 'New York State DEC',
      areaSquareMeters: 100000,
      baseRule: 'Camping requires current rule evidence',
    },
  },
  {
    ...envelope(trailId, 'hemlock-loop'),
    recordType: 'trail',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-73.901, 44.099],
        [-73.9, 44.1],
        [-73.899, 44.101],
      ],
    },
    properties: {
      name: 'Hemlock Loop',
      trailKind: 'system',
      rawTrailKind: 'Foot Trail',
      lengthMeters: 4800,
      fingerprint: 'hemlock-loop-v1',
    },
  },
  {
    ...envelope(placeId, 'hemlock-trailhead'),
    recordType: 'place',
    geometry: { type: 'Point', coordinates: [-73.9, 44.1] },
    properties: {
      name: 'Hemlock Trailhead',
      category: 'trailhead',
      rawCategory: 'Parking / Trailhead',
      entrances: [[-73.9, 44.1]],
      elevation: { meters: 515, verticalDatum: 'orthometric_navd88' },
    },
  },
  {
    ...envelope('00000000-0000-4000-8000-000000000104', 'seasonal-closure'),
    recordType: 'restriction',
    geometry: null,
    properties: {
      name: 'Seasonal nesting closure',
      interval: {
        start: '2026-08-15T00:00:00.000Z',
        end: '2026-09-15T00:00:00.000Z',
        quality: 'known',
      },
      scope: 'Adirondack Fixture Forest',
      authority: 'New York State DEC',
      relationship: 'independent',
      relatedRecordId: landId,
    },
  },
  {
    ...envelope('00000000-0000-4000-8000-000000000105', 'trail-photo'),
    recordType: 'media-asset',
    geometry: null,
    properties: {
      subjectId: landId,
      mediaType: 'image',
      contentUrl: 'https://example.invalid/rights-excluded.jpg',
      perceptualHash: null,
    },
  },
];

const camping: CampingEvaluation = {
  evaluatorVersion: '1.0.0',
  status: 'temporary-closure',
  evaluatedAt: '2026-09-01T12:00:00.000Z',
  winningRuleId: 'seasonal-closure',
  reasonCodes: ['emergency-closure'],
  considered: [],
  conflicts: [],
  access: { status: 'closed', reasonCodes: ['access-closed'], winningDirectiveId: 'access-1' },
  inputVersions: ['seasonal-closure:1'],
};

const coverage: OfflineBundleCoverage = {
  bundleId: 'new-york-product-mvp',
  contentVersion: 2,
  origin: 'public-catalog',
  regionId: 'us-ny',
  bounds: [-79.7624, 40.4774, -71.7517, 45.0159],
  generatedAt: '2026-08-02T00:00:00.000Z',
  dataAsOf: '2026-08-01T00:00:00.000Z',
  entityTypes: ['land-unit', 'trail', 'place', 'restriction', 'media-asset'],
  offlineFeatures: ['text-search', 'spatial-search', 'details', 'filters'],
  attribution: ['New York State DEC'],
  sourceFreshness: {
    'nys-dec-outdoor': {
      dataAsOf: '2026-08-01T00:00:00.000Z',
      staleAfterSeconds: 14 * 24 * 60 * 60,
    },
  },
};

describe('WP-304 offline explore, search, and details', () => {
  it('T-E2E-001-C01 performs text, spatial, and facet filtering with no network capability', () => {
    const index = new OfflineExploreIndex(records, coverage, '2026-09-01T12:00:00.000Z', {
      [landId]: camping,
    });
    expect(index.capabilities).toMatchObject({
      networkRequired: false,
      textSearch: true,
      spatialSearch: true,
      liveVerification: false,
      turnByTurn: false,
      rerouting: false,
    });
    expect(index.search({ text: 'hemlock' }).map(({ id }) => id)).toEqual([trailId, placeId]);
    expect(
      index.search({
        near: { coordinate: [-73.9, 44.1], maximumDistanceMeters: 100 },
        categories: ['trailhead'],
      }),
    ).toEqual([expect.objectContaining({ id: placeId, recordType: 'place', distanceMeters: 0 })]);
    expect(
      index.search({
        near: { coordinate: [-73.95, 44.1], maximumDistanceMeters: 100 },
        recordTypes: ['land-unit'],
      }),
    ).toEqual([expect.objectContaining({ id: landId, distanceMeters: 0 })]);
    expect(
      index.search({ campingStatuses: ['temporary-closure'], ownership: ['State Public'] }),
    ).toEqual([
      expect.objectContaining({
        id: landId,
        campingStatus: 'temporary-closure',
        freshness: 'stale',
      }),
    ]);
  });

  it('T-E2E-001-C02 exposes land/trail/place provenance, freshness, restrictions, and unavailable content', () => {
    const index = new OfflineExploreIndex(records, coverage, '2026-09-01T12:00:00.000Z', {
      [landId]: camping,
    });
    const details = index.details(landId);
    expect(details).toMatchObject({
      id: landId,
      recordType: 'land-unit',
      bundle: { bundleId: 'new-york-product-mvp', origin: 'public-catalog', contentVersion: 2 },
      source: { sourceId: 'nys-dec-outdoor', attribution: ['New York State DEC'] },
      freshness: { status: 'stale', liveVerificationAvailable: false },
      camping: { status: 'temporary-closure' },
    });
    expect(details?.provenance).toContainEqual(
      expect.objectContaining({
        field: 'name',
        evidence: expect.objectContaining({ sourceField: 'NAME' }),
      }),
    );
    expect(details?.restrictions).toContainEqual(
      expect.objectContaining({ name: 'Seasonal nesting closure', kind: 'restriction' }),
    );
    expect(details?.media).toContainEqual(
      expect.objectContaining({ availability: 'unavailable-offline', contentUrl: null }),
    );
    expect(details?.unavailableOffline).toContain('rights-excluded media');
    expect(index.details('missing')).toBeNull();
  });

  it('keeps private user records out of the read-only reference index', () => {
    const privateRecord = { ...records[0], classification: 'private-user' as const };
    expect(
      () => new OfflineExploreIndex([privateRecord], coverage, '2026-09-01T12:00:00.000Z'),
    ).toThrow(/private user records/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  applyManualReviewDecisions,
  federalNewYorkAppFeatures,
  manualReviewDecisionsFromCsv,
  processIoverlanderPrivateData,
} from '../src/ioverlander-private.js';

const generatedAt = '2026-09-13T12:00:00.000Z';

function place(
  id: number,
  guidSuffix: number,
  name: string,
  longitude: number,
  latitude: number,
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    id,
    guid: `10000000-0000-4000-8000-${guidSuffix.toString().padStart(12, '0')}`,
    name,
    latitude,
    longitude,
    altitude: null,
    elevation: 100,
    category: 'wild_campsite',
    country: 'USA',
    date_verified: '2026-09-01 00:00:00 UTC',
    deleted: false,
    open: 'unknown',
    revision: 1,
    description: 'must not be retained',
    contributor_id: 999,
    contributors: [{ name: 'must not be retained' }],
    check_ins: [{ comment: 'must not be retained' }],
    ...overrides,
  };
}

const dec = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'boundary',
      properties: { kind: 'boundary', name: 'New York' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-76, 41],
            [-73, 41],
            [-73, 44],
            [-76, 44],
            [-76, 41],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'dec-pine',
      properties: {
        kind: 'poi',
        name: 'Pine Camp',
        category: 'PRIMITIVE CAMPSITE',
        sourceId: 'nys-dec-poi',
        sourceUpdated: '2026-08-01T00:00:00.000Z',
      },
      geometry: { type: 'Point', coordinates: [-74, 42] },
    },
  ],
};

const federal = {
  schemaVersion: 1,
  stateCode: 'NY',
  retrievedAt: generatedAt,
  usfs: {
    surfaceOwnership: [
      {
        type: 'Feature',
        id: 'usfs-surface:1',
        properties: {
          objectid: 1,
          nfslandunitname: 'Finger Lakes National Forest',
          ownerclassification: 'USDA FOREST SERVICE',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-74.4, 42.1],
              [-74.1, 42.1],
              [-74.1, 42.4],
              [-74.4, 42.4],
              [-74.4, 42.1],
            ],
          ],
        },
      },
    ],
    recreationSites: [
      {
        type: 'Feature',
        id: 'usfs-recreation:1',
        properties: {
          objectid: 1,
          site_cn: 'site-1',
          public_site_name: 'Official Forest Camp',
          site_type: 'CAMPGROUND',
          seasonal_operational_status: 'OPEN',
          edw_last_modify: Date.parse(generatedAt),
        },
        geometry: { type: 'Point', coordinates: [-74.25, 42.25] },
      },
    ],
    mvumRoads: [
      {
        type: 'Feature',
        id: 'usfs-mvum-road:1',
        properties: { objectid: 1, name: 'Forest Road 1' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-74.3, 42.2],
            [-74.2, 42.3],
          ],
        },
      },
    ],
    mvumTrails: [
      {
        type: 'Feature',
        id: 'usfs-mvum-trail:1',
        properties: { objectid: 1, name: 'Motor Trail 1' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-74.28, 42.2],
            [-74.18, 42.3],
          ],
        },
      },
    ],
  },
  blm: { managedLands: [] },
};

describe('private iOverlander processing', () => {
  it('filters to New York, removes duplicates, links DEC matches, and strips narrative PII', () => {
    const result = processIoverlanderPrivateData(
      [
        {
          name: 'n42_w75.json',
          value: {
            places: [
              place(1, 1, 'Pine Camp', -74.00001, 42.00001, { category: 'campsite' }),
              place(2, 2, 'Lake Camp', -74.5, 42.2),
              place(3, 3, 'Lake Camp', -74.50001, 42.20001, { revision: 2 }),
              place(4, 4, 'Water Stop', -74.7, 42.4, { category: 'water' }),
              place(5, 5, 'Deleted', -74.6, 42.3, { deleted: true }),
              place(6, 6, 'Canada', -74.6, 42.3, { country: 'CAN' }),
              place(7, 7, 'Outside', -80, 45),
            ],
          },
        },
      ],
      dec,
      generatedAt,
    );

    expect(result.counts).toMatchObject({
      rowsRead: 7,
      deleted: 1,
      countryNotUsa: 1,
      outsideNewYork: 1,
      privateDuplicatesRemoved: 1,
      matchedToDec: 1,
      outputPrivatePlaces: 2,
    });
    expect(result.records.map((item) => item.record.properties.name).sort()).toEqual([
      'Lake Camp',
      'Water Stop',
    ]);
    expect(result.records.map((item) => item.record.properties.category).sort()).toEqual([
      'water',
      'wild_campsite',
    ]);
    const serialized = JSON.stringify(result.records);
    expect(serialized).not.toContain('description');
    expect(serialized).not.toContain('contributor');
    expect(serialized).not.toContain('check_ins');
    expect(serialized).not.toContain('must not be retained');
  });

  it('strictly applies the rightmost Duplicate column and keeps preserving an audit trail', () => {
    const base = processIoverlanderPrivateData(
      [
        {
          name: 'n42_w75.json',
          value: {
            places: [
              place(8, 8, 'First Place', -74.6, 42.2, { category: 'water' }),
              place(9, 9, 'Second Place', -74.7, 42.3, { category: 'water' }),
            ],
          },
        },
      ],
      dec,
      generatedAt,
    );
    const [first, second] = base.records;
    const review = {
      privateId: first!.record.id,
      privateExternalId: String(first!.raw.id),
      privateName: first!.record.properties.name,
      targetId: second!.record.id,
      targetName: second!.record.properties.name,
      targetOrigin: 'private-catalog' as const,
      targetSourceId: 'private-ioverlander',
      distanceMeters: 10,
      score: 0.7,
      components: { name: 0.5, proximity: 1, category: 1 },
      algorithmVersion: '1.0.0',
      reason: 'below-link-threshold' as const,
    };
    const pending = {
      ...base,
      reviews: [review],
      counts: { ...base.counts, reviewCandidates: 1, pendingReviewCandidates: 1 },
    };
    const csv = [
      'private_id,target_id,Duplicate',
      `${review.privateId},${review.targetId},Yes`,
      '',
    ].join('\r\n');
    const applied = applyManualReviewDecisions(pending, manualReviewDecisionsFromCsv(csv));

    expect(applied.records).toHaveLength(1);
    expect(applied.privateLinks).toHaveLength(1);
    expect(applied.manualDecisions).toEqual([{ ...review, duplicate: true }]);
    expect(applied.reviews).toEqual([]);
    expect(applied.counts).toMatchObject({
      privateDuplicatesRemoved: 1,
      manualDuplicatesRemoved: 1,
      manualNonDuplicates: 0,
      pendingReviewCandidates: 0,
      outputPrivatePlaces: 1,
    });
    expect(() => manualReviewDecisionsFromCsv(csv.replace('Yes', 'Maybe'))).toThrow(/Yes or No/);
  });

  it('keeps colocated places in different iOverlander categories distinct', () => {
    const result = processIoverlanderPrivateData(
      [
        {
          name: 'n42_w75.json',
          value: {
            places: [
              place(10, 10, 'Shared Location', -74.55, 42.25, { category: 'campsite' }),
              place(11, 11, 'Shared Location', -74.55, 42.25, { category: 'restaurant' }),
            ],
          },
        },
      ],
      dec,
      generatedAt,
    );

    expect(result.records).toHaveLength(2);
    expect(result.privateLinks).toHaveLength(0);
    expect(result.records.map((item) => item.record.properties.category).sort()).toEqual([
      'campsite',
      'restaurant',
    ]);
  });

  it('deduplicates private campgrounds against official NPS campground points', () => {
    const nps = {
      schemaVersion: 1,
      stateCode: 'NY',
      retrievedAt: generatedAt,
      parks: [
        {
          id: 'park-1',
          parkCode: 'test',
          fullName: 'Test National Park',
          latitude: '42.5',
          longitude: '-74.5',
          lastIndexedDate: generatedAt,
        },
      ],
      campgrounds: [
        {
          id: 'camp-1',
          parkCode: 'test',
          name: 'Official Camp',
          latitude: '42.25',
          longitude: '-74.25',
          lastIndexedDate: generatedAt,
        },
      ],
      alerts: [],
      boundaries: [],
    };
    const result = processIoverlanderPrivateData(
      [
        {
          name: 'n42_w75.json',
          value: {
            places: [
              place(12, 12, 'Official Camp', -74.25001, 42.25001, {
                category: 'campsite',
              }),
            ],
          },
        },
      ],
      dec,
      generatedAt,
      nps,
    );

    expect(result.records).toHaveLength(0);
    expect(result.publicLinks).toHaveLength(1);
    expect(result.publicLinks[0]).toMatchObject({
      targetOrigin: 'public-catalog',
      targetSourceId: 'nps-campgrounds-ny',
    });
    expect(result.counts).toMatchObject({ matchedToDec: 0, matchedToNps: 1 });
  });

  it('deduplicates against USFS recreation sites and maps federal layers for the app', () => {
    const result = processIoverlanderPrivateData(
      [
        {
          name: 'n42_w75.json',
          value: {
            places: [
              place(13, 13, 'Official Forest Camp', -74.25001, 42.25001, {
                category: 'campsite',
              }),
            ],
          },
        },
      ],
      dec,
      generatedAt,
      undefined,
      federal,
    );

    expect(result.records).toHaveLength(0);
    expect(result.publicLinks).toHaveLength(1);
    expect(result.publicLinks[0]).toMatchObject({
      targetOrigin: 'public-catalog',
      targetSourceId: 'usfs-recreation-sites-ny',
    });
    expect(result.counts).toMatchObject({
      matchedToDec: 0,
      matchedToNps: 0,
      matchedToUsfs: 1,
    });

    const features = federalNewYorkAppFeatures(federal);
    expect(features.map((feature) => feature.properties.sourceId)).toEqual([
      'usfs-surface-ownership-ny',
      'usfs-mvum-roads-ny',
      'usfs-mvum-trails-ny',
      'usfs-recreation-sites-ny',
    ]);
    expect(features.map((feature) => feature.properties.kind)).toEqual([
      'land',
      'road',
      'trail',
      'poi',
    ]);
    expect(features.at(-1)?.properties.category).toBe('campsite');
  });
});

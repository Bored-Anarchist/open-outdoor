import { describe, expect, it } from 'vitest';
import {
  applyManualReviewDecisions,
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

describe('private iOverlander processing', () => {
  it('filters to New York, removes duplicates, links DEC matches, and strips narrative PII', () => {
    const result = processIoverlanderPrivateData(
      [
        {
          name: 'n42_w75.json',
          value: {
            places: [
              place(1, 1, 'Pine Camp', -74.00001, 42.00001),
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
});

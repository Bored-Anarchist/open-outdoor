import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RESOLUTION_THRESHOLDS,
  ENTITY_RESOLUTION_VERSION,
  EntityResolutionAudit,
  evaluateCandidatePrecision,
  generateEntityCandidates,
  scoreEntityPair,
  type CanonicalGeometry,
  type CanonicalRecord,
  type LabelledEntityPair,
  type ResolutionEvent,
} from '../src/index.js';

const id = (suffix: number): string =>
  `20000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

function fixture(
  recordType: CanonicalRecord['recordType'],
  fixtureId: string,
  name: string,
  properties: Readonly<Record<string, unknown>>,
  geometry: CanonicalGeometry | null,
): CanonicalRecord {
  return {
    schemaVersion: '1.0.0',
    recordType,
    id: fixtureId,
    source: {
      sourceId: `synthetic-${fixtureId.slice(-1)}`,
      externalId: fixtureId,
      sourcePartition: 'labelled',
      connectorVersion: '1.0.0',
      parserVersion: '1.0.0',
      normalizerVersion: '1.0.0',
    },
    retrievedAt: '2026-09-01T00:00:00.000Z',
    sourceUpdatedAt: null,
    geometry,
    geometryQuality: geometry
      ? {
          sourceCrs: 'EPSG:4326',
          sourceAxisOrder: 'longitude-latitude',
          coordinatePrecisionMeters: 1,
          flags: [],
          repair: null,
        }
      : null,
    fieldProvenance: {
      name: { sourceField: 'name', sourceValue: name, observedAt: null, transformation: null },
    },
    rights: { policyId: 'synthetic-v1', distribution: 'public', attribution: ['Synthetic'] },
    validation: { state: 'valid', reasonCodes: [] },
    contentChecksum: fixtureId.slice(-1).repeat(64),
    tombstone: false,
    classification: 'public-reference',
    properties: { name, ...properties },
  } as unknown as CanonicalRecord;
}

function labelledFixtures(): readonly CanonicalRecord[] {
  return [
    fixture(
      'place',
      id(1),
      'North Camp',
      { category: 'camp', rawCategory: null, entrances: [], elevation: null },
      { type: 'Point', coordinates: [-74, 42] },
    ),
    fixture(
      'place',
      id(2),
      'North Camp',
      { category: 'camp', rawCategory: null, entrances: [], elevation: null },
      { type: 'Point', coordinates: [-74.00001, 42.00001] },
    ),
    fixture(
      'place',
      id(3),
      'South Camp',
      { category: 'camp', rawCategory: null, entrances: [], elevation: null },
      { type: 'Point', coordinates: [-75, 43] },
    ),
    fixture(
      'trail',
      id(4),
      'Ridge Trail',
      { trailKind: 'route', rawTrailKind: null, lengthMeters: 1000, fingerprint: 'abc123' },
      {
        type: 'LineString',
        coordinates: [
          [-74, 42],
          [-73.99, 42.01],
        ],
      },
    ),
    fixture(
      'trail',
      id(5),
      'Ridge Trail',
      { trailKind: 'route', rawTrailKind: null, lengthMeters: 1001, fingerprint: 'abc123' },
      {
        type: 'LineString',
        coordinates: [
          [-74, 42],
          [-73.99, 42.01],
        ],
      },
    ),
    fixture(
      'trail',
      id(6),
      'Ridge Trail West',
      { trailKind: 'variant', rawTrailKind: null, lengthMeters: 8000, fingerprint: 'different' },
      {
        type: 'LineString',
        coordinates: [
          [-76, 44],
          [-75.9, 44.1],
        ],
      },
    ),
    fixture(
      'condition',
      id(7),
      'Seasonal mud',
      {
        interval: {
          start: '2026-04-01T00:00:00.000Z',
          end: '2026-05-01T00:00:00.000Z',
          quality: 'known',
        },
        scope: 'ridge-trail',
        authority: 'Synthetic Agency',
        relationship: 'independent',
        relatedRecordId: null,
      },
      null,
    ),
    fixture(
      'condition',
      id(8),
      'Seasonal mud',
      {
        interval: {
          start: '2026-04-01T00:00:00.000Z',
          end: '2026-05-01T00:00:00.000Z',
          quality: 'known',
        },
        scope: 'ridge-trail',
        authority: 'Synthetic Agency',
        relationship: 'revision-of',
        relatedRecordId: id(7),
      },
      null,
    ),
    fixture(
      'condition',
      id(9),
      'Winter ice',
      {
        interval: {
          start: '2026-12-01T00:00:00.000Z',
          end: '2027-03-01T00:00:00.000Z',
          quality: 'known',
        },
        scope: 'ridge-trail',
        authority: 'Other Agency',
        relationship: 'independent',
        relatedRecordId: null,
      },
      null,
    ),
    fixture(
      'media-asset',
      id(10),
      'Photo A',
      { subjectId: id(1), mediaType: 'image', contentUrl: null, perceptualHash: 'aaaa1111' },
      null,
    ),
    fixture(
      'media-asset',
      id(11),
      'Photo A resized',
      { subjectId: id(1), mediaType: 'image', contentUrl: null, perceptualHash: 'aaaa1111' },
      null,
    ),
    fixture(
      'media-asset',
      id(12),
      'Photo B',
      { subjectId: id(1), mediaType: 'image', contentUrl: null, perceptualHash: 'bbbb2222' },
      null,
    ),
  ];
}

describe('WP-204 reversible entity resolution', () => {
  it('generates deterministic entity-specific candidates and explainable scores', () => {
    const candidates = generateEntityCandidates(labelledFixtures());
    expect(candidates).toEqual(generateEntityCandidates(labelledFixtures()));
    expect(candidates.every((candidate) => candidate.score.algorithmVersion === '1.0.0')).toBe(
      true,
    );
    expect(
      candidates.find((candidate) => candidate.leftId === id(1) && candidate.rightId === id(2)),
    ).toMatchObject({ recommendation: 'link', score: { components: { name: 1, category: 1 } } });
    expect(
      candidates.find((candidate) => candidate.leftId === id(4) && candidate.rightId === id(5)),
    ).toMatchObject({ recommendation: 'link', score: { components: { fingerprint: 1 } } });
    expect(
      candidates.find((candidate) => candidate.leftId === id(7) && candidate.rightId === id(8)),
    ).toMatchObject({ recommendation: 'link', score: { components: { interval: 1 } } });
    expect(
      candidates.find((candidate) => candidate.leftId === id(10) && candidate.rightId === id(11)),
    ).toMatchObject({ recommendation: 'link', score: { components: { hash: 1 } } });
  });

  it('meets labelled precision and recall gates for place, trail, temporal, and media fixtures', async () => {
    const candidates = generateEntityCandidates(labelledFixtures());
    const labelled = JSON.parse(
      await readFile(
        new URL(
          '../../../fixtures/public/data-platform/entity-resolution-labels.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as { readonly pairs: readonly LabelledEntityPair[] };
    const report = evaluateCandidatePrecision(candidates, labelled.pairs);
    expect(report.precision).toBeGreaterThanOrEqual(0.95);
    expect(report.recall).toBeGreaterThanOrEqual(0.95);
    expect(report).toMatchObject({ falsePositive: 0, falseNegative: 0 });
  });

  it('does not compare incompatible entity types or an entity to itself', () => {
    const fixtures = labelledFixtures();
    expect(scoreEntityPair(fixtures[0]!, fixtures[0]!)).toBeNull();
    expect(scoreEntityPair(fixtures[0]!, fixtures[3]!)).toBeNull();
    expect(DEFAULT_RESOLUTION_THRESHOLDS.place).toBeGreaterThan(0.5);
  });

  it('audits link, merge, split, tombstone, and reversal without recycling an ID', () => {
    const audit = new EntityResolutionAudit();
    const link: ResolutionEvent = {
      kind: 'link',
      eventId: id(20),
      recordedAt: '2026-09-01T01:00:00.000Z',
      actorVersion: ENTITY_RESOLUTION_VERSION,
      reason: 'labelled duplicate',
      ids: [id(1), id(2)],
      score: {
        total: 1,
        components: { fixture: 1 },
        algorithmVersion: ENTITY_RESOLUTION_VERSION,
      },
    };
    const merge: ResolutionEvent = {
      kind: 'merge',
      eventId: id(21),
      recordedAt: '2026-09-01T02:00:00.000Z',
      actorVersion: ENTITY_RESOLUTION_VERSION,
      reason: 'reviewed link',
      fromIds: [id(1), id(2)],
      intoId: id(1),
    };
    const split: ResolutionEvent = {
      kind: 'split',
      eventId: id(22),
      recordedAt: '2026-09-01T03:00:00.000Z',
      actorVersion: ENTITY_RESOLUTION_VERSION,
      reason: 'later source correction',
      fromId: id(3),
      intoIds: [id(13), id(14)],
    };
    const tombstone: ResolutionEvent = {
      kind: 'tombstone',
      eventId: id(23),
      recordedAt: '2026-09-01T04:00:00.000Z',
      actorVersion: ENTITY_RESOLUTION_VERSION,
      reason: 'source retirement',
      id: id(12),
    };
    [link, merge, split, tombstone].forEach((event) => audit.append(event));
    expect(audit.state()).toMatchObject({
      links: [[id(1), id(2)]],
      tombstones: [id(2), id(3), id(12)].sort(),
    });
    expect(audit.state().remaps).toHaveLength(3);

    audit.reverse(split.eventId, '2026-09-01T05:00:00.000Z', 'correction withdrawn');
    expect(audit.state().tombstones).toEqual([id(2), id(12)].sort());
    expect(audit.state().remaps).toHaveLength(2);
    expect(audit.events).toHaveLength(5);
    expect(() => audit.append(merge)).toThrow(/immutable and unique/);
  });
});

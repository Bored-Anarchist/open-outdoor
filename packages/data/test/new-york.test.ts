import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAMPING_STATUSES,
  CanonicalSourceIdRegistry,
  NEW_YORK_SOURCE_REGISTRY,
  RawArtifactStore,
  assertNewYorkSourceReady,
  buildNewYorkCoverageReport,
  createOfficialNewYorkConnector,
  createSourcePartitionPin,
  generateEntityCandidates,
  getNewYorkSource,
  mapNewYorkPoiCategory,
  normalizeNewYorkAccessDirective,
  normalizeNewYorkFeature,
  runConnector,
  validateCompletePartitionSet,
  type GeoJsonSourceFeature,
  type ReviewedRuleDocument,
} from '../src/index.js';

const retrievedAt = '2026-08-31T12:00:00.000Z';
const encoder = new TextEncoder();

function polygonFeature(id: number, owner = 'State'): GeoJsonSourceFeature {
  return {
    type: 'Feature',
    id,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-75, 42],
          [-73, 42],
          [-73, 44],
          [-75, 44],
          [-75, 42],
        ],
      ],
    },
    properties: {
      OBJECTID: id,
      FACILITY: `Alpha ${id}`,
      OWNERCLASSIFICATION: owner,
      ADMINORGANIZATION: 'Synthetic fixture manager',
      Shape__Area: 100,
      UPDATED: retrievedAt,
    },
  };
}

function roadFeature(id: number, publicUse = 'Yes', seasonal = ''): GeoJsonSourceFeature {
  return {
    type: 'Feature',
    id,
    geometry: {
      type: 'LineString',
      coordinates: [
        [-74.2, 43.2],
        [-74.1, 43.3],
      ],
    },
    properties: {
      OBJECTID: id,
      NAME: 'Alpha Access Road',
      PUBLICUSE: publicUse,
      SEASONAL: seasonal,
      Shape__Length: 1_000,
      UPDATED: retrievedAt,
    },
  };
}

async function publicRawStore(): Promise<RawArtifactStore> {
  const root = await mkdtemp(join(tmpdir(), 'open-outdoor-ny-'));
  return new RawArtifactStore({ root, boundary: 'public' });
}

describe('WP-206 through WP-208 New York authoritative connectors', () => {
  it('T-INT-003-C01 registers active official sources with redistributable rights and attribution', async () => {
    expect(NEW_YORK_SOURCE_REGISTRY).toHaveLength(11);
    for (const source of NEW_YORK_SOURCE_REGISTRY) {
      expect(() => assertNewYorkSourceReady(source, '2026-09-01T00:00:00.000Z')).not.toThrow();
      expect(source.endpoint).toMatch(/^https:\/\//);
      expect(source.manifest).toMatchObject({
        lifecycle: 'active',
        authorization: 'authorized',
        classification: 'SOURCE_REDISTRIBUTABLE',
        rights: {
          derivedData: true,
          offlineStorage: true,
          distribution: { public: true },
        },
      });
      expect(source.attribution.length).toBeGreaterThan(0);
      expect(source.disclaimer).not.toBe('');
    }
    const fixture = JSON.parse(
      await readFile(
        new URL('../../../fixtures/public/data-platform/new-york-alpha.json', import.meta.url),
        'utf8',
      ),
    ) as { readonly classification: string; readonly origin: string };
    expect(fixture).toMatchObject({
      classification: 'PUBLIC_SYNTHETIC',
      origin: expect.stringContaining('no copied government or private records'),
    });
  });

  it('T-INT-003-C02 normalizes land, inholdings, routes, access, and the POI taxonomy', () => {
    const ids = new CanonicalSourceIdRegistry();
    const landSource = getNewYorkSource('usfs-surface-ownership-ny');
    const publicLand = normalizeNewYorkFeature(
      landSource,
      polygonFeature(1, 'Forest Service'),
      'page-0000',
      retrievedAt,
      ids,
    );
    const inholding = normalizeNewYorkFeature(
      landSource,
      polygonFeature(2, 'Private'),
      'page-0000',
      retrievedAt,
      ids,
    );
    expect(publicLand).toMatchObject({
      recordType: 'land-unit',
      properties: { ownership: 'public' },
    });
    expect(inholding).toMatchObject({
      recordType: 'land-unit',
      properties: { ownership: 'private' },
    });
    expect(publicLand.source).toMatchObject({ sourcePartition: 'page-0000' });
    const movedPartition = normalizeNewYorkFeature(
      landSource,
      polygonFeature(1, 'Forest Service'),
      'page-9999',
      retrievedAt,
      ids,
    );
    expect(movedPartition.id).toBe(publicLand.id);
    expect(
      new CanonicalSourceIdRegistry(ids.snapshot()).getOrCreate(landSource.id, '1', 'page-0001'),
    ).toBe(publicLand.id);

    const roadSource = getNewYorkSource('nys-dec-roads');
    const closed = normalizeNewYorkAccessDirective(
      roadSource,
      roadFeature(3, 'No'),
      'page-0000',
      retrievedAt,
      ids,
    );
    const seasonal = normalizeNewYorkAccessDirective(
      roadSource,
      roadFeature(4, 'Yes', 'May 1 through December 1'),
      'page-0000',
      retrievedAt,
      ids,
    );
    expect(closed?.status).toBe('closed');
    expect(seasonal?.status).toBe('restricted');
    expect(mapNewYorkPoiCategory('Primitive Campsite')).toEqual({
      category: 'camping.dispersed-site',
      rawCategory: null,
    });
    expect(mapNewYorkPoiCategory('Invented Asset')).toEqual({
      category: 'other',
      rawCategory: 'Invented Asset',
    });
  });
  it('T-INT-003-C03 discovers every ArcGIS ID, pages deterministically, and emits access', async () => {
    const source = { ...getNewYorkSource('nys-dec-roads'), pageSize: 2 };
    const fetcher = async (urlValue: string) => {
      const url = new URL(urlValue);
      const payload = url.searchParams.get('returnIdsOnly')
        ? { objectIds: [3, 1, 2] }
        : {
            type: 'FeatureCollection',
            features: (url.searchParams.get('objectIds') ?? '')
              .split(',')
              .filter(Boolean)
              .map((id) => roadFeature(Number(id))),
          };
      return {
        status: 200,
        contentType: 'application/json',
        body: encoder.encode(JSON.stringify(payload)),
        redirectCount: 0,
      };
    };
    const connector = createOfficialNewYorkConnector({
      source,
      fetcher,
      rawStore: await publicRawStore(),
      ids: new CanonicalSourceIdRegistry(),
      now: () => retrievedAt,
    });
    const result = await runConnector(connector, 'ny-roads', retrievedAt);
    expect(result.quarantine).toEqual([]);
    expect(result.emitted).toHaveLength(2);
    expect(result.emitted.flatMap((batch) => batch.records)).toHaveLength(3);
    expect(result.emitted.flatMap((batch) => batch.access)).toHaveLength(3);
    expect(
      result.emitted.flatMap((batch) =>
        batch.records.map((record) => record.source.sourcePartition),
      ),
    ).toEqual(['page-0000', 'page-0000', 'page-0001']);
    expect(generateEntityCandidates(result.emitted.flatMap((batch) => batch.records))).toHaveLength(
      3,
    );
  });

  it('T-INT-003-C04 pins complete partitions and reports geometry and source freshness', () => {
    const source = getNewYorkSource('nys-dec-lands');
    const ids = new CanonicalSourceIdRegistry();
    const records = [1, 2].map((id) =>
      normalizeNewYorkFeature(source, polygonFeature(id), `page-000${id - 1}`, retrievedAt, ids),
    );
    const pins = records.map((record, index) =>
      createSourcePartitionPin(
        source.id,
        `page-${index.toString().padStart(4, '0')}`,
        index,
        2,
        '1.0.0',
        retrievedAt,
        retrievedAt,
        encoder.encode(`partition-${index}`),
        [record],
      ),
    );
    expect(validateCompletePartitionSet(source, pins)).toEqual(pins);
    const report = buildNewYorkCoverageReport({
      generatedAt: '2026-09-01T00:00:00.000Z',
      records,
      pins,
      rejected: 0,
      duplicateCandidates: 0,
      rightsExcluded: 0,
      campingRules: [],
      statusCounts: Object.fromEntries(CAMPING_STATUSES.map((status) => [status, 0])),
    });
    expect(report).toMatchObject({
      discovered: 2,
      normalized: 2,
      geometry: { present: 2, missing: 0 },
      land: 2,
      staleSources: [],
    });
  });
  it('T-INT-003-C05 ingests only checksum-pinned human-reviewed rule directives', async () => {
    const source = getNewYorkSource('nys-dec-statewide-camping-rules');
    const payload = encoder.encode('<html>synthetic reviewed primitive camping page</html>');
    const checksum = createHash('sha256').update(payload).digest('hex');
    const reviewed: ReviewedRuleDocument = {
      sourceId: source.id,
      documentUrl: source.endpoint,
      contentChecksum: checksum,
      reviewedAt: retrievedAt,
      reviewerRole: 'data-safety-reviewer',
      directives: [
        {
          externalId: 'statewide-150-foot-rule',
          recordType: 'restriction',
          name: 'Synthetic 150-foot rule representation',
          geometry: null,
          interval: { start: '2026-01-01T00:00:00.000Z', end: null, quality: 'known' },
          scope: 'New York statewide DEC lands',
          authority: 'NYS DEC reviewed public guidance',
          relationship: 'independent',
          relatedRecordId: null,
          campingRule: {
            id: 'statewide-150-foot-rule',
            version: '1.0.0',
            kind: 'restriction',
            name: 'Synthetic 150-foot rule representation',
            authority: 'guidance',
            authorityName: 'NYS DEC',
            scope: { kind: 'statewide', landUnitId: null, geometry: null },
            activities: ['primitive-camping'],
            interval: { start: '2026-01-01T00:00:00.000Z', end: null, quality: 'known' },
            reviewedAt: retrievedAt,
            staleAfterSeconds: source.staleAfterSeconds,
            mandatory: true,
            supersedes: [],
            conflictsWith: [],
            explanation: 'Reviewed statewide restriction.',
          },
          accessDirective: null,
        },
      ],
    };
    const fetcher = async () => ({
      status: 200,
      contentType: 'text/html',
      body: payload,
      redirectCount: 0,
    });
    const connector = createOfficialNewYorkConnector({
      source,
      fetcher,
      rawStore: await publicRawStore(),
      ids: new CanonicalSourceIdRegistry(),
      reviewedDocuments: { [checksum]: reviewed },
      now: () => retrievedAt,
    });
    const result = await runConnector(connector, 'ny-rules', retrievedAt);
    expect(result.quarantine).toEqual([]);
    expect(result.emitted[0]).toMatchObject({
      records: [{ recordType: 'restriction' }],
      campingRules: [{ id: 'statewide-150-foot-rule', sourceRecordId: expect.any(String) }],
    });

    const unreviewed = createOfficialNewYorkConnector({
      source,
      fetcher,
      rawStore: await publicRawStore(),
      ids: new CanonicalSourceIdRegistry(),
      reviewedDocuments: {},
      now: () => retrievedAt,
    });
    const blocked = await runConnector(unreviewed, 'ny-unreviewed-rules', retrievedAt);
    expect(blocked.emitted).toEqual([]);
    expect(blocked.quarantine).toMatchObject([{ reason: 'parser-failure' }]);
  });
});

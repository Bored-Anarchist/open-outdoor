import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  CanonicalSourceIdRegistry,
  assertReproduciblePublicPacks,
  buildPublicPack,
  getNewYorkSource,
  getSecondarySource,
  normalizeNewYorkFeature,
  secondaryPackSource,
  type GeoJsonSourceFeature,
  type PublicPackProfile,
  type PublicPackArtifact,
  type PublicPackSourceRegistration,
} from '../src/index.js';

const generatedAt = '2026-08-31T12:00:00.000Z';

function fixture() {
  const source = getNewYorkSource('nys-dec-lands');
  const feature: GeoJsonSourceFeature = {
    type: 'Feature',
    id: 101,
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
      OBJECTID: 101,
      FACILITY: 'Synthetic Alpha Forest',
      OWNERCLASSIFICATION: 'State',
      ADMINORGANIZATION: 'Synthetic fixture manager',
      Shape__Area: 100,
      UPDATED: generatedAt,
    },
  };
  const record = normalizeNewYorkFeature(
    source,
    feature,
    'page-0000',
    generatedAt,
    new CanonicalSourceIdRegistry(),
  );
  const registration: PublicPackSourceRegistration = {
    sourceId: source.id,
    displayName: source.displayName,
    owner: source.owner,
    canonicalUrl: source.canonicalUrl,
    licenseId: 'New-York-State-Open-Data',
    disclaimer: source.disclaimer,
    manifest: source.manifest,
    allowedRecordTypes: ['land-unit'],
  };
  return { record, registration };
}

const profile: PublicPackProfile = {
  bundleId: 'new-york-public-alpha',
  contentVersion: 1,
  catalogSchemaVersion: 1,
  generatedAt,
  dataAsOf: generatedAt,
  region: {
    id: 'us-ny',
    name: 'New York',
    bounds: [-79.7624, 40.4774, -71.7517, 45.0159],
  },
  compatibleApp: { minimum: 1, maximum: 1 },
  offlineFeatures: ['catalog-search', 'record-bounds'],
  maximumCatalogBytes: 16 * 1024 * 1024,
};

describe('WP-209 rights-aware reproducible public pack', () => {
  it('T-REL-002-C01 emits byte-identical SQLite catalogs and complete public manifests', async () => {
    const root = await mkdtemp(join(tmpdir(), 'open-outdoor-pack-'));
    const { record, registration } = fixture();
    const elevationSource = secondaryPackSource(getSecondarySource('usgs-3dep-ny'));
    const elevationArtifact: PublicPackArtifact = {
      id: '00000000-0000-4000-8000-000000000002',
      sourceId: elevationSource.sourceId,
      kind: 'elevation-tile',
      locator: 'https://prd-tnm.s3.amazonaws.com/synthetic/dem-1.tif',
      contentChecksum: '0'.repeat(64),
      byteLength: 1024,
      classification: 'SOURCE_REDISTRIBUTABLE',
      sourceUpdatedAt: '2026-08-30T12:00:00.000Z',
      metadata: { resolutionMeters: 1, verticalDatum: 'orthometric_navd88' },
    };
    const unregistered = {
      ...record,
      id: '00000000-0000-4000-8000-000000000001',
      source: { ...record.source, sourceId: 'unregistered-source', externalId: 'bad-1' },
    };
    const firstInput = {
      profile,
      sources: [registration, elevationSource],
      records: [unregistered, record],
      artifacts: [elevationArtifact],
      coverage: { schemaVersion: 1, complete: true, regionId: 'us-ny' },
    };
    const firstCatalog = join(root, 'first.sqlite');
    const secondCatalog = join(root, 'second.sqlite');
    const first = await buildPublicPack({
      ...firstInput,
      catalogPath: firstCatalog,
      manifestPath: join(root, 'first.manifest.json'),
    });
    const second = await buildPublicPack({
      ...firstInput,
      catalogPath: secondCatalog,
      manifestPath: join(root, 'second.manifest.json'),
    });
    await expect(
      assertReproduciblePublicPacks(first, second, firstCatalog, secondCatalog),
    ).resolves.toBeUndefined();
    expect(first.manifest).toMatchObject({
      classification: 'SOURCE_REDISTRIBUTABLE',
      recordCount: 1,
      artifactCount: 1,
      exclusionCount: 1,
    });
    expect(first.manifest.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: registration.sourceId, recordCount: 1 }),
      ]),
    );
    expect(first.manifest.attribution).toEqual(
      expect.arrayContaining(registration.manifest.rights.attribution),
    );
    expect(
      first.manifest.sources.find((source) => source.sourceId === elevationSource.sourceId),
    ).toMatchObject({
      artifactCount: 1,
      dataAsOf: elevationArtifact.sourceUpdatedAt,
    });
    expect(first.exclusions[0]).toMatchObject({ reason: 'source-unregistered' });

    const database = new DatabaseSync(firstCatalog, { readOnly: true });
    try {
      expect(database.prepare('SELECT count(*) AS count FROM records').get()).toEqual({ count: 1 });
      expect(database.prepare('SELECT count(*) AS count FROM record_bounds').get()).toEqual({
        count: 1,
      });
      expect(
        database
          .prepare("SELECT id FROM record_search WHERE record_search MATCH 'synthetic'")
          .get(),
      ).toEqual({ id: record.id });
      expect(database.prepare('SELECT count(*) AS count FROM dbom').get()).toEqual({ count: 1 });
    } finally {
      database.close();
    }
  });

  it('T-REL-002-C02 hard-fails revoked rights and size ceilings before distribution', async () => {
    const root = await mkdtemp(join(tmpdir(), 'open-outdoor-pack-deny-'));
    const { record, registration } = fixture();
    const revoked = {
      ...registration,
      manifest: { ...registration.manifest, authorization: 'revoked' as const },
    };
    await expect(
      buildPublicPack({
        catalogPath: join(root, 'revoked.sqlite'),
        manifestPath: join(root, 'revoked.json'),
        profile,
        sources: [revoked],
        records: [record],
        coverage: {},
      }),
    ).rejects.toThrow(/rights gates/);
    await expect(
      buildPublicPack({
        catalogPath: join(root, 'oversize.sqlite'),
        manifestPath: join(root, 'oversize.json'),
        profile: { ...profile, maximumCatalogBytes: 1 },
        sources: [registration],
        records: [record],
        coverage: {},
      }),
    ).rejects.toThrow(/byte limit/);
  });
});

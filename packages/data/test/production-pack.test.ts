import { describe, expect, it } from 'vitest';
import {
  ProductionPackBuildError,
  buildProductionPack,
  type ProductionPackComponent,
  type ProductionPackProfile,
} from '../src/index.js';

const MIB = 1024 ** 2;

const rights = {
  offlineStorage: true,
  derivation: true,
  redistribution: 'public' as const,
  licenseId: 'ODbL-1.0',
  attribution: ['Synthetic source attribution'],
  termsReviewedAt: '2026-08-01T00:00:00.000Z',
  expiresAt: null,
};

const components: readonly ProductionPackComponent[] = [
  {
    artifactId: 'ny-basemap',
    kind: 'basemap',
    regionId: 'us-ny',
    detailAreaId: null,
    sourceId: 'osm-geofabrik-ny',
    entityClass: 'basemap',
    mediaClass: null,
    minimumZoom: 0,
    maximumZoom: 14,
    byteLength: 900 * MIB,
    contentChecksum: '1'.repeat(64),
    distribution: 'public',
    rights,
  },
  {
    artifactId: 'ny-trails-search',
    kind: 'catalog-search-elevation',
    regionId: 'us-ny',
    detailAreaId: null,
    sourceId: 'nys-dec-trails',
    entityClass: 'trails',
    mediaClass: null,
    minimumZoom: null,
    maximumZoom: null,
    byteLength: 400 * MIB,
    contentChecksum: '2'.repeat(64),
    distribution: 'public',
    rights,
  },
  {
    artifactId: 'ny-trail-thumbnails',
    kind: 'media',
    regionId: 'us-ny',
    detailAreaId: null,
    sourceId: 'nys-dec-trails',
    entityClass: 'trails',
    mediaClass: 'thumbnail',
    minimumZoom: null,
    maximumZoom: null,
    byteLength: 100 * MIB,
    contentChecksum: '3'.repeat(64),
    distribution: 'public',
    rights,
  },
  {
    artifactId: 'catskills-detail',
    kind: 'basemap',
    regionId: 'us-ny',
    detailAreaId: 'catskills',
    sourceId: 'osm-geofabrik-ny',
    entityClass: 'basemap',
    mediaClass: null,
    minimumZoom: 15,
    maximumZoom: 16,
    byteLength: 50 * MIB,
    contentChecksum: '4'.repeat(64),
    distribution: 'public',
    rights,
  },
];

const profile: ProductionPackProfile = {
  bundleId: 'new-york-product-mvp',
  generatedAt: '2026-09-01T12:00:00.000Z',
  distribution: 'public',
  regionIds: ['us-ny'],
  highDetailAreaIds: [],
  entityClasses: ['basemap', 'trails'],
  mediaClasses: ['thumbnail'],
  requiredKinds: ['basemap', 'catalog-search-elevation', 'media'],
};

const tools = [
  {
    name: 'open-outdoor-pack',
    version: '1.0.0',
    checksum: 'a'.repeat(64),
    licenseId: 'Apache-2.0',
  },
  { name: 'planetiler', version: '0.9.0', checksum: 'b'.repeat(64), licenseId: 'Apache-2.0' },
];

describe('WP-302 production pack builder', () => {
  it('T-REL-002-C11 applies region/detail/media selection and emits SBOM, DBOM, and exact size rows', () => {
    const result = buildProductionPack({ profile, components, tools });
    expect(result.included.map(({ artifactId }) => artifactId)).toEqual([
      'ny-basemap',
      'ny-trail-thumbnails',
      'ny-trails-search',
    ]);
    expect(result.exclusions).toContainEqual({
      artifactId: 'catskills-detail',
      reason: 'detail-not-selected',
    });
    expect(result.sizeReport.totals).toMatchObject({
      basemap: 900 * MIB,
      'catalog-search-elevation': 400 * MIB,
      media: 100 * MIB,
      combined: 1400 * MIB,
    });
    expect(result.sbom.tools).toHaveLength(2);
    expect(result.dbom.components).toHaveLength(3);
    expect(result.manifest.attribution).toEqual(['Synthetic source attribution']);
    expect(result.manifestChecksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('T-REL-002-C12 hard-fails selected incomplete rights and incomplete requested coverage', () => {
    const denied = components.map((component) =>
      component.artifactId === 'ny-trail-thumbnails'
        ? { ...component, rights: { ...component.rights, attribution: [] } }
        : component,
    );
    expect(() => buildProductionPack({ profile, components: denied, tools })).toThrow(
      ProductionPackBuildError,
    );
    try {
      buildProductionPack({ profile, components: denied, tools });
    } catch (error) {
      expect(error).toMatchObject({ code: 'RIGHTS_INCOMPLETE' });
    }
    expect(() =>
      buildProductionPack({
        profile: { ...profile, entityClasses: [...profile.entityClasses, 'camping-rules'] },
        components,
        tools,
      }),
    ).toThrow(/coverage is incomplete/);
  });

  it('T-REL-002-C13 hard-fails a component or combined size ceiling', () => {
    const oversize = components.map((component) =>
      component.artifactId === 'ny-basemap'
        ? { ...component, byteLength: 1.5 * 1024 ** 3 + 1 }
        : component,
    );
    try {
      buildProductionPack({ profile, components: oversize, tools });
      throw new Error('expected oversize pack to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'OVERSIZE' });
      expect((error as ProductionPackBuildError).details[0]).toMatch(/^basemap:/);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  InMemoryPrivateRepository,
  applyCatalogRelationshipUpdate,
  composeCatalogExperience,
  selectComposedExport,
  type CatalogReferenceFeature,
  type PrivateDatabaseSnapshot,
} from '../src/index.js';

const publicFeature: CatalogReferenceFeature = {
  id: 'trail-shared',
  catalogId: 'public-us-ny',
  catalogVersion: '2026.09',
  origin: 'public-catalog',
  rights: 'redistributable',
  kind: 'trail',
  name: 'Public Ridge',
  geometry: [[-74, 41]],
};

const privateFeature: CatalogReferenceFeature = {
  id: 'private-trail',
  catalogId: 'private:club',
  catalogVersion: '7',
  origin: 'private-catalog',
  rights: 'restricted',
  kind: 'trail',
  name: 'Club Connector',
  geometry: [[-73.9, 41.1]],
};

function fixture(): PrivateDatabaseSnapshot {
  const snapshot = new InMemoryPrivateRepository().exportSnapshot();
  return {
    ...snapshot,
    userTrails: [
      {
        id: 'user-trail',
        name: 'My Route',
        geometry: [
          [-74, 41],
          [-73.99, 41.01],
        ],
        routeForm: 'point-to-point',
        favorite: true,
        private: true,
        notes: 'never catalog-owned',
        provenance: 'user-recorded',
        revision: 1,
      },
    ],
    associations: [
      {
        id: 'association-1',
        activityId: 'activity-1',
        userTrailId: 'user-trail',
        catalogTrailId: 'retired-trail',
        state: 'review',
      },
    ],
    overlays: [
      {
        id: 'rename-public',
        catalogFeatureId: 'trail-shared',
        catalogVersion: '2026.09',
        operation: 'pin-correction',
        payload: { name: 'Corrected Ridge', longitude: -74.01, latitude: 41.02 },
      },
    ],
  };
}

describe('WP-305 composed public/private/user experience', () => {
  it('retains explicit origin, rights, and private overlays in composed queries', () => {
    const composed = composeCatalogExperience({
      publicCatalog: [publicFeature],
      privateCatalog: [privateFeature],
      privateSnapshot: fixture(),
    });
    expect(composed.origins).toEqual({
      'public-catalog': 1,
      'private-catalog': 1,
      'private-user': 1,
    });
    expect(composed.features.find(({ id }) => id === 'trail-shared')).toMatchObject({
      name: 'Corrected Ridge',
      origin: 'public-catalog',
      rights: 'redistributable',
      geometry: [[-74.01, 41.02]],
      overlayIds: ['rename-public'],
    });
  });

  it('removing the private catalog cannot remove or rewrite private user records', () => {
    const before = fixture();
    const withPrivate = composeCatalogExperience({
      publicCatalog: [publicFeature],
      privateCatalog: [privateFeature],
      privateSnapshot: before,
    });
    const withoutPrivate = composeCatalogExperience({
      publicCatalog: [publicFeature],
      privateSnapshot: before,
    });
    expect(withPrivate.features.some(({ origin }) => origin === 'private-catalog')).toBe(true);
    expect(withoutPrivate.features.some(({ origin }) => origin === 'private-catalog')).toBe(false);
    expect(withoutPrivate.features.find(({ origin }) => origin === 'private-user')?.id).toBe(
      'user-trail',
    );
    expect(before).toEqual(fixture());
  });

  it('requires explicit, rights-compatible consent for non-public export', () => {
    const features = composeCatalogExperience({
      publicCatalog: [publicFeature],
      privateCatalog: [privateFeature],
      privateSnapshot: fixture(),
    }).features;
    expect(selectComposedExport(features).map(({ id }) => id)).toEqual(['trail-shared']);
    expect(
      selectComposedExport(features, {
        includePrivateCatalog: true,
        privateUserFeatureIds: ['user-trail'],
      }).map(({ id }) => id),
    ).toEqual(['trail-shared', 'user-trail']);
  });

  it('updates remaps and explicit promotion links without mutating trail content', () => {
    const before = fixture();
    const updated = applyCatalogRelationshipUpdate(before, {
      remaps: [{ from: 'retired-trail', to: 'current-trail' }],
      promotionLinks: [
        { privateUserTrailId: 'user-trail', canonicalReferenceId: 'accepted-trail' },
      ],
    });
    expect(updated.associations[0]).toMatchObject({
      catalogTrailId: 'accepted-trail',
      state: 'resolved',
    });
    expect(updated.userTrails).toEqual(before.userTrails);
    expect(before.associations[0]?.catalogTrailId).toBe('retired-trail');
  });
});

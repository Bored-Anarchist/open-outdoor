import { assertCoordinate, type Coordinate } from '@open-outdoor/shared';
import type { PrivateDatabaseSnapshot, PrivateOverlay, TrailAssociation } from './private.js';

export type CatalogOrigin = 'public-catalog' | 'private-catalog';
export type ComposedOrigin = CatalogOrigin | 'private-user';

export interface CatalogReferenceFeature {
  readonly id: string;
  readonly catalogId: string;
  readonly catalogVersion: string;
  readonly origin: CatalogOrigin;
  readonly rights: 'redistributable' | 'restricted';
  readonly kind: 'trail' | 'poi' | 'land';
  readonly name: string;
  readonly geometry: readonly Coordinate[];
}

export interface ComposedFeature {
  readonly id: string;
  readonly canonicalId: string;
  readonly origin: ComposedOrigin;
  readonly sourceCatalogId: string | null;
  readonly sourceCatalogVersion: string | null;
  readonly rights: 'redistributable' | 'restricted' | 'private-user';
  readonly kind: 'trail' | 'poi' | 'land';
  readonly name: string;
  readonly geometry: readonly Coordinate[];
  readonly overlayIds: readonly string[];
}

export interface CompositionInput {
  readonly publicCatalog: readonly CatalogReferenceFeature[];
  readonly privateCatalog?: readonly CatalogReferenceFeature[];
  readonly privateSnapshot: PrivateDatabaseSnapshot;
}

export interface ComposedExperience {
  readonly features: readonly ComposedFeature[];
  readonly origins: Readonly<Record<ComposedOrigin, number>>;
}

function latestUserTrails(snapshot: PrivateDatabaseSnapshot) {
  const latest = new Map<string, (typeof snapshot.userTrails)[number]>();
  for (const trail of snapshot.userTrails) {
    const prior = latest.get(trail.id);
    if (prior === undefined || trail.revision > prior.revision) latest.set(trail.id, trail);
  }
  return [...latest.values()];
}

function overlaysFor(
  feature: CatalogReferenceFeature,
  overlays: readonly PrivateOverlay[],
): readonly PrivateOverlay[] {
  return overlays.filter(
    (overlay) =>
      overlay.catalogFeatureId === feature.id && overlay.catalogVersion === feature.catalogVersion,
  );
}

function applyPinCorrection(
  feature: CatalogReferenceFeature,
  overlays: readonly PrivateOverlay[],
): Pick<ComposedFeature, 'name' | 'geometry'> {
  let name = feature.name;
  let geometry = feature.geometry;
  for (const overlay of overlays) {
    if (overlay.operation !== 'pin-correction') continue;
    const correctedName = overlay.payload.name;
    if (typeof correctedName === 'string' && correctedName.trim().length > 0) {
      name = correctedName.trim();
    }
    const longitude = overlay.payload.longitude;
    const latitude = overlay.payload.latitude;
    if (typeof longitude === 'number' && typeof latitude === 'number') {
      const coordinate: Coordinate = [longitude, latitude];
      assertCoordinate(coordinate);
      geometry = [coordinate];
    }
  }
  return { name, geometry };
}

export function composeCatalogExperience(input: CompositionInput): ComposedExperience {
  const catalogFeatures = [...input.publicCatalog, ...(input.privateCatalog ?? [])];
  const keys = new Set<string>();
  const features: ComposedFeature[] = [];

  for (const feature of catalogFeatures) {
    if (feature.origin === 'public-catalog' && feature.catalogId.startsWith('private:')) {
      throw new Error('public catalog feature cannot use a private catalog identity');
    }
    feature.geometry.forEach(assertCoordinate);
    const key = `${feature.origin}:${feature.catalogId}:${feature.id}`;
    if (keys.has(key)) throw new Error(`duplicate composed feature source: ${key}`);
    keys.add(key);
    const overlays = overlaysFor(feature, input.privateSnapshot.overlays);
    if (overlays.some(({ operation }) => operation === 'hide')) continue;
    const samePlace = overlays.find(({ operation }) => operation === 'same-place');
    const target = samePlace?.payload.targetFeatureId;
    const corrected = applyPinCorrection(feature, overlays);
    features.push({
      id: feature.id,
      canonicalId: typeof target === 'string' && target.length > 0 ? target : feature.id,
      origin: feature.origin,
      sourceCatalogId: feature.catalogId,
      sourceCatalogVersion: feature.catalogVersion,
      rights: feature.rights,
      kind: feature.kind,
      name: corrected.name,
      geometry: corrected.geometry,
      overlayIds: overlays.map(({ id }) => id),
    });
  }

  for (const trail of latestUserTrails(input.privateSnapshot)) {
    trail.geometry.forEach(assertCoordinate);
    features.push({
      id: trail.id,
      canonicalId: trail.id,
      origin: 'private-user',
      sourceCatalogId: null,
      sourceCatalogVersion: null,
      rights: 'private-user',
      kind: 'trail',
      name: trail.name,
      geometry: trail.geometry,
      overlayIds: [],
    });
  }

  const ordered = features.sort((left, right) =>
    `${left.name}\u0000${left.origin}\u0000${left.id}`.localeCompare(
      `${right.name}\u0000${right.origin}\u0000${right.id}`,
    ),
  );
  return {
    features: ordered,
    origins: {
      'public-catalog': ordered.filter(({ origin }) => origin === 'public-catalog').length,
      'private-catalog': ordered.filter(({ origin }) => origin === 'private-catalog').length,
      'private-user': ordered.filter(({ origin }) => origin === 'private-user').length,
    },
  };
}

export interface ComposedExportConsent {
  readonly includePrivateCatalog?: boolean;
  readonly privateUserFeatureIds?: readonly string[];
}

export function selectComposedExport(
  features: readonly ComposedFeature[],
  consent: ComposedExportConsent = {},
): readonly ComposedFeature[] {
  const userConsent = new Set(consent.privateUserFeatureIds ?? []);
  return features.filter((feature) => {
    if (feature.origin === 'public-catalog') return feature.rights === 'redistributable';
    if (feature.origin === 'private-catalog') {
      return consent.includePrivateCatalog === true && feature.rights === 'redistributable';
    }
    return userConsent.has(feature.id);
  });
}

export interface CatalogRelationshipUpdate {
  readonly remaps: readonly { readonly from: string; readonly to: string }[];
  readonly promotionLinks: readonly {
    readonly privateUserTrailId: string;
    readonly canonicalReferenceId: string;
  }[];
}

export function applyCatalogRelationshipUpdate(
  snapshot: PrivateDatabaseSnapshot,
  update: CatalogRelationshipUpdate,
): PrivateDatabaseSnapshot {
  const remaps = new Map(update.remaps.map(({ from, to }) => [from, to]));
  if (remaps.size !== update.remaps.length || [...remaps].some(([from, to]) => !from || !to)) {
    throw new Error('catalog remaps must be unique and non-empty');
  }
  const links = new Map(
    update.promotionLinks.map(({ privateUserTrailId, canonicalReferenceId }) => [
      privateUserTrailId,
      canonicalReferenceId,
    ]),
  );
  if (links.size !== update.promotionLinks.length) {
    throw new Error('promotion links must identify each private trail at most once');
  }
  for (const privateUserTrailId of links.keys()) {
    if (!snapshot.userTrails.some(({ id }) => id === privateUserTrailId)) {
      throw new Error(`promotion link references unknown private trail: ${privateUserTrailId}`);
    }
  }
  const associations: TrailAssociation[] = snapshot.associations.map((association) => {
    const remapped =
      association.catalogTrailId === null
        ? null
        : (remaps.get(association.catalogTrailId) ?? association.catalogTrailId);
    const promoted =
      association.userTrailId === null ? undefined : links.get(association.userTrailId);
    return {
      ...association,
      catalogTrailId: promoted ?? remapped,
      state:
        promoted !== undefined || remapped !== association.catalogTrailId
          ? 'resolved'
          : association.state,
    };
  });
  return { ...structuredClone(snapshot), associations };
}

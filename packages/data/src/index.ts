import { assertCoordinate, type Coordinate } from '@open-outdoor/shared';

export * from './canonical.js';
export * from './camping.js';
export * from './connector.js';
export * from './entity-resolution.js';
export * from './ingestion.js';
export * from './new-york.js';

export interface CatalogPlace {
  readonly id: string;
  readonly name: string;
  readonly coordinate: Coordinate;
  readonly synthetic: boolean;
}

export function normalizePlace(place: CatalogPlace): CatalogPlace {
  return {
    ...place,
    id: place.id.trim().toLowerCase(),
    name: place.name.trim(),
    coordinate: assertCoordinate(place.coordinate),
  };
}

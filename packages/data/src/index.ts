import { assertCoordinate, type Coordinate } from '@open-outdoor/shared';

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

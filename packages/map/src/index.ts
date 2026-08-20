import type { Coordinate } from '@open-outdoor/shared';

export interface MapCamera {
  readonly center: Coordinate;
  readonly zoom: number;
}

export interface MapAdapter {
  readonly moveCamera: (camera: MapCamera) => void;
}

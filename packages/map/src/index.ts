import type { Coordinate } from '@open-outdoor/shared';

export interface MapCamera {
  readonly center: Coordinate;
  readonly zoom: number;
}

export interface MapCapabilities {
  readonly offline: boolean;
  readonly selection: boolean;
  readonly activeTrack: boolean;
  readonly turnByTurn: false;
  readonly rerouting: false;
}

export interface MapRoute {
  readonly id: string;
  readonly name: string;
  readonly coordinates: readonly Coordinate[];
}

export interface MapFeature {
  readonly id: string;
  readonly kind: 'trail' | 'poi' | 'land';
  readonly name: string;
  readonly coordinate: Coordinate;
  readonly origin: 'fixture' | 'public-catalog' | 'private-catalog';
}

export interface MapAdapter {
  readonly capabilities: MapCapabilities;
  readonly moveCamera: (camera: MapCamera) => void;
  readonly setSelectedRoute: (route: MapRoute | null) => void;
  readonly setActiveTrack: (coordinates: readonly Coordinate[]) => void;
  readonly queryFeatures: (coordinate: Coordinate) => readonly MapFeature[];
}

export interface OfflineMapFixture {
  readonly style: {
    readonly version: 8;
    readonly sprite: string;
    readonly glyphs: string;
    readonly sources: Readonly<Record<string, { readonly type: 'geojson'; readonly data: string }>>;
  };
  readonly features: readonly MapFeature[];
  readonly routes: readonly MapRoute[];
}

export const phase1OfflineMapFixture: OfflineMapFixture = {
  style: {
    version: 8,
    sprite: 'fixture://assets/sprites/outdoor',
    glyphs: 'fixture://assets/fonts/{fontstack}/{range}.pbf',
    sources: {
      fixture: { type: 'geojson', data: 'fixture://catalog/phase1.geojson' },
    },
  },
  features: [
    {
      id: 'poi-trailhead',
      kind: 'poi',
      name: 'Hemlock Trailhead',
      coordinate: [-74, 41],
      origin: 'fixture',
    },
    {
      id: 'land-preserve',
      kind: 'land',
      name: 'Fixture Preserve',
      coordinate: [-73.998, 41.002],
      origin: 'fixture',
    },
  ],
  routes: [
    {
      id: 'trail-hemlock-loop',
      name: 'Hemlock Loop',
      coordinates: [
        [-74, 41],
        [-73.999, 41.001],
        [-73.998, 41],
        [-74, 41],
      ],
    },
  ],
};

export class FixtureMapAdapter implements MapAdapter {
  readonly capabilities: MapCapabilities = {
    offline: true,
    selection: true,
    activeTrack: true,
    turnByTurn: false,
    rerouting: false,
  };

  camera: MapCamera = { center: [-74, 41], zoom: 13 };
  selectedRoute: MapRoute | null = null;
  activeTrack: readonly Coordinate[] = [];

  constructor(readonly fixture: OfflineMapFixture = phase1OfflineMapFixture) {}

  moveCamera(camera: MapCamera): void {
    this.camera = camera;
  }

  setSelectedRoute(route: MapRoute | null): void {
    this.selectedRoute = route;
  }

  setActiveTrack(coordinates: readonly Coordinate[]): void {
    this.activeTrack = [...coordinates];
  }

  queryFeatures(coordinate: Coordinate): readonly MapFeature[] {
    const tolerance = 0.01;
    return this.fixture.features.filter(
      (feature) =>
        Math.abs(feature.coordinate[0] - coordinate[0]) <= tolerance &&
        Math.abs(feature.coordinate[1] - coordinate[1]) <= tolerance,
    );
  }
}

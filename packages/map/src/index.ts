import type { Coordinate } from '@open-outdoor/shared';

export * from './basemap.js';
export * from './offline-explore.js';
export * from './field-readiness.js';

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

type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface OfflineMapFixture {
  readonly style: {
    readonly version: 8;
    readonly sources: Readonly<
      Record<string, { readonly type: 'geojson'; readonly data: JsonValue }>
    >;
    readonly layers: readonly {
      readonly id: string;
      readonly type: 'background' | 'fill' | 'line' | 'circle';
      readonly source?: string;
      readonly paint: Readonly<Record<string, JsonValue>>;
    }[];
  };
  readonly features: readonly MapFeature[];
  readonly routes: readonly MapRoute[];
  readonly licenses: readonly { readonly asset: string; readonly license: string }[];
}

const hemlockCoordinates: readonly Coordinate[] = [
  [-74, 41],
  [-73.999, 41.001],
  [-73.998, 41],
  [-74, 41],
];

export const phase1OfflineMapFixture: OfflineMapFixture = {
  style: {
    version: 8,
    sources: {
      fixture: {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { id: 'land-preserve', kind: 'land', name: 'Fixture Preserve' },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [-74.003, 40.997],
                    [-73.995, 40.997],
                    [-73.995, 41.004],
                    [-74.003, 41.004],
                    [-74.003, 40.997],
                  ],
                ],
              },
            },
            {
              type: 'Feature',
              properties: { id: 'trail-hemlock-loop', kind: 'trail', name: 'Hemlock Loop' },
              geometry: { type: 'LineString', coordinates: hemlockCoordinates },
            },
            {
              type: 'Feature',
              properties: { id: 'poi-trailhead', kind: 'poi', name: 'Hemlock Trailhead' },
              geometry: { type: 'Point', coordinates: [-74, 41] },
            },
          ],
        },
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f3f1e8' } },
      {
        id: 'land',
        type: 'fill',
        source: 'fixture',
        paint: { 'fill-color': '#cfe2ce', 'fill-opacity': 0.8 },
      },
      {
        id: 'trails',
        type: 'line',
        source: 'fixture',
        paint: { 'line-color': '#a72d2d', 'line-width': 4 },
      },
      {
        id: 'pois',
        type: 'circle',
        source: 'fixture',
        paint: { 'circle-color': '#173d2b', 'circle-radius': 6 },
      },
    ],
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
  routes: [{ id: 'trail-hemlock-loop', name: 'Hemlock Loop', coordinates: hemlockCoordinates }],
  licenses: [{ asset: 'phase1 synthetic fixture', license: 'CC0-1.0' }],
};

export function assertOfflineStyle(style: OfflineMapFixture['style']): void {
  const inspect = (value: JsonValue): void => {
    if (typeof value === 'string' && /^(?:https?|mapbox):/i.test(value)) {
      throw new Error(`offline map style contains a network resource: ${value}`);
    }
    if (Array.isArray(value)) value.forEach(inspect);
    else if (typeof value === 'object' && value !== null) Object.values(value).forEach(inspect);
  };
  inspect(style as unknown as JsonValue);
}

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

  constructor(readonly fixture: OfflineMapFixture = phase1OfflineMapFixture) {
    assertOfflineStyle(fixture.style);
  }

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

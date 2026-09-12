import type { Coordinate } from '@open-outdoor/shared';
import type { MapAdapter, MapCamera, MapFeature, MapRoute } from './index';
export interface OutdoorFeature {
  type: 'Feature';
  id: string;
  properties: {
    id: string;
    kind: 'boundary' | 'land' | 'road' | 'trail';
    name: string;
    sourceId: string;
    unit: string;
    category: string;
    publicUse: string;
    sourceUpdated: string;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon' | 'LineString' | 'MultiLineString';
    coordinates: unknown;
  };
}
export interface OutdoorCollection {
  type: 'FeatureCollection';
  features: OutdoorFeature[];
}
export function geometryPositions(value: unknown): Coordinate[] {
  if (!Array.isArray(value)) throw new Error('Invalid geometry');
  if (typeof value[0] === 'number') {
    if (
      value.length < 2 ||
      !Number.isFinite(value[0]) ||
      !Number.isFinite(value[1]) ||
      Math.abs(value[0]) > 180 ||
      Math.abs(value[1]) > 90
    )
      throw new Error('Invalid EPSG:4326 coordinate');
    return [[value[0], value[1]]];
  }
  return value.flatMap(geometryPositions);
}
export function featureBounds(feature: OutdoorFeature): [number, number, number, number] {
  const points = geometryPositions(feature.geometry.coordinates);
  if (!points.length) throw new Error('Empty geometry');
  let west = 180,
    south = 90,
    east = -180,
    north = -90;
  for (const [x, y] of points) {
    west = Math.min(west, x);
    south = Math.min(south, y);
    east = Math.max(east, x);
    north = Math.max(north, y);
  }
  return [west, south, east, north];
}
export function searchOutdoorFeatures(
  collection: OutdoorCollection,
  query: string,
  limit = 30,
): OutdoorFeature[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  return collection.features
    .filter(
      (f) =>
        f.properties.kind !== 'boundary' &&
        `${f.properties.name} ${f.properties.unit}`.toLocaleLowerCase().includes(term),
    )
    .slice(0, Math.min(50, Math.max(0, limit)));
}
export interface OutdoorMapSnapshot {
  camera: MapCamera;
  selectedRoute: MapRoute | null;
  activeTrack: readonly Coordinate[];
  trackBreaks: readonly number[];
  selectedFeatureId: string | null;
}
/** Observable map state. Coordinates remain local and no location sensor is started here. */
export class OutdoorMapAdapter implements MapAdapter {
  readonly capabilities = {
    offline: true,
    selection: true,
    activeTrack: true,
    turnByTurn: false,
    rerouting: false,
  } as const;
  private snapshot: OutdoorMapSnapshot = {
    camera: { center: [-74.25, 42.08], zoom: 10 },
    selectedRoute: null,
    activeTrack: [],
    trackBreaks: [],
    selectedFeatureId: null,
  };
  constructor(
    private readonly collection: OutdoorCollection = { type: 'FeatureCollection', features: [] },
  ) {}
  setSelectedFeature(id: string | null): void {
    this.update({ selectedFeatureId: id });
  }
  private readonly listeners = new Set<() => void>();
  getSnapshot = (): OutdoorMapSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(change: Partial<OutdoorMapSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const notify of this.listeners) notify();
  }
  moveCamera(camera: MapCamera): void {
    geometryPositions(camera.center);
    if (!Number.isFinite(camera.zoom) || camera.zoom < 0 || camera.zoom > 22)
      throw new Error('Invalid camera');
    if (
      Math.abs(camera.center[0] - this.snapshot.camera.center[0]) < 1e-7 &&
      Math.abs(camera.center[1] - this.snapshot.camera.center[1]) < 1e-7 &&
      Math.abs(camera.zoom - this.snapshot.camera.zoom) < 1e-7
    )
      return;
    this.update({ camera: { center: [...camera.center], zoom: camera.zoom } });
  }
  setSelectedRoute(route: MapRoute | null): void {
    if (route) route.coordinates.forEach(geometryPositions);
    this.update({ selectedRoute: route });
  }
  setActiveTrack(coordinates: readonly Coordinate[], breaks: readonly number[] = []): void {
    coordinates.forEach(geometryPositions);
    if (
      breaks.some((index) => !Number.isInteger(index) || index < 1 || index >= coordinates.length)
    )
      throw new Error('Invalid track break');
    this.update({
      activeTrack: coordinates.map((p) => [p[0], p[1]] as Coordinate),
      trackBreaks: [...breaks],
    });
  }
  queryFeatures(coordinate: Coordinate): readonly MapFeature[] {
    geometryPositions(coordinate);
    return this.collection.features
      .filter((f) => {
        const [w, s, e, n] = featureBounds(f);
        return (
          coordinate[0] >= w - 0.001 &&
          coordinate[0] <= e + 0.001 &&
          coordinate[1] >= s - 0.001 &&
          coordinate[1] <= n + 0.001
        );
      })
      .slice(0, 30)
      .map((f) => ({
        id: f.id,
        name: f.properties.name,
        kind: f.properties.kind,
        coordinate,
        origin: 'public-catalog' as const,
      }));
  }
}
export function segmentedTrack(
  coordinates: readonly Coordinate[],
  breaks: readonly number[] = [],
): {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    properties: Record<string, never>;
    geometry: { type: 'LineString'; coordinates: number[][] };
  }[];
} {
  const segments: number[][][] = [];
  let current: number[][] = [];
  coordinates.forEach((point, index) => {
    if (breaks.includes(index)) {
      if (current.length > 1) segments.push(current);
      current = [];
    }
    geometryPositions(point);
    current.push([...point]);
  });
  if (current.length > 1) segments.push(current);
  return {
    type: 'FeatureCollection',
    features: segments.map((coordinates) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    })),
  };
}
export const outdoorLayerStyles = [
  {
    id: 'state-fill',
    type: 'fill',
    filter: ['==', ['get', 'kind'], 'boundary'],
    paint: { 'fill-color': '#e9e9dd', 'fill-opacity': 1 },
  },
  {
    id: 'state-outline',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'boundary'],
    paint: { 'line-color': '#738079', 'line-width': 1 },
  },
  {
    id: 'dec-land',
    type: 'fill',
    filter: ['==', ['get', 'kind'], 'land'],
    paint: { 'fill-color': '#87b88b', 'fill-opacity': 0.62 },
  },
  {
    id: 'dec-land-outline',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'land'],
    paint: { 'line-color': '#37683f', 'line-width': 0.6 },
  },
  {
    id: 'dec-road',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'road'],
    paint: { 'line-color': '#85654b', 'line-width': 2.5 },
  },
  {
    id: 'dec-trail',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'trail'],
    paint: { 'line-color': '#205c86', 'line-width': 2 },
  },
] as const;

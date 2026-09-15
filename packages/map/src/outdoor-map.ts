import {
  ioverlanderCategoryDefinition,
  ioverlanderCategoryDefinitions,
  ioverlanderCategoryIds,
  normalizeIoverlanderCategory,
  type Coordinate,
  type IoverlanderCategory,
} from '@open-outdoor/shared';
import type { MapAdapter, MapCamera, MapFeature, MapRoute } from './index';

const LOCAL_FILE_URI = /^file:\/\/\/.+/i;

function isLocalFileUri(uri: string): boolean {
  return LOCAL_FILE_URI.test(uri) && !/[\r\n]/.test(uri);
}

export interface OutdoorFeatureProperties {
  id: string;
  kind: 'boundary' | 'land' | 'road' | 'trail' | 'poi';
  name: string;
  sourceId: string;
  unit: string;
  category: string;
  publicUse: string;
  sourceUpdated: string;
  origin?: 'public-catalog' | 'private-catalog';
  sourceUrl?: string;
  communityDescription?: string;
  communityCheckIns?: readonly {
    readonly occurredAt: string;
    readonly comment: string;
  }[];
  communityCheckInCount?: number;
}
export interface OutdoorFeature {
  type: 'Feature';
  id: string;
  properties: OutdoorFeatureProperties;
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
    | { type: 'LineString'; coordinates: number[][] }
    | { type: 'MultiLineString'; coordinates: number[][][] }
    | { type: 'Point'; coordinates: number[] };
}
export interface OutdoorCollection {
  type: 'FeatureCollection';
  features: OutdoorFeature[];
}
export interface OutdoorFeatureSummary {
  id: string;
  properties: OutdoorFeatureProperties;
  bounds: [number, number, number, number];
}
export interface OutdoorFeatureIndex {
  schemaVersion: 1;
  features: OutdoorFeatureSummary[];
}

export const outdoorPlaceFilters = ['all', ...ioverlanderCategoryIds] as const;
export type OutdoorPlaceFilter = 'all' | IoverlanderCategory;
export const outdoorMarkerDensities = ['automatic', 'fewer', 'more'] as const;
export type OutdoorMarkerDensity = (typeof outdoorMarkerDensities)[number];

const decCampingCategories = [
  'PRIMITIVE CAMPSITE',
  'CAMPSITE',
  'ACCESSIBLE CAMPSITE',
  'CAMPGROUND',
  'LEAN-TO',
] as const;

const parkingCategories = [
  'UNPAVED PARKING LOT',
  'PAVED PARKING LOT',
  'ACCESSIBLE PARKING LOT',
  'ACCESSIBLE PARKING SPACE',
  'PULL-OFF',
] as const;
const touristAttractionCategories = [
  'PICNIC SITE',
  'PICNIC PAVILION',
  'ACCESSIBLE PICNIC TABLE',
  'ACCESSIBLE PICNIC AREA',
  'DAY USE AREA',
  'SCENIC VISTA',
  'FIRE TOWER',
] as const;

function includesCategory(values: readonly string[], value: string): boolean {
  return values.includes(value);
}

export function outdoorIoverlanderCategory(category: string): IoverlanderCategory {
  const sourceCategory = category.normalize('NFC').trim().toLocaleLowerCase('en-US');
  if (ioverlanderCategoryIds.includes(sourceCategory as IoverlanderCategory)) {
    return normalizeIoverlanderCategory(sourceCategory);
  }
  const decCategory = category.normalize('NFC').trim().toLocaleUpperCase('en-US');
  if (includesCategory(decCampingCategories, decCategory)) return 'campsite';
  if (includesCategory(parkingCategories, decCategory)) return 'shorterm_parking';
  if (includesCategory(touristAttractionCategories, decCategory)) return 'tourist_attraction';
  return 'other';
}

export function outdoorPlaceIcon(category: IoverlanderCategory): string {
  return ioverlanderCategoryDefinition(category).icon;
}

function matchesPlaceFilter(category: IoverlanderCategory, filter: OutdoorPlaceFilter): boolean {
  return filter === 'all' || category === filter;
}

export interface OutdoorPlaceFeature extends Omit<OutdoorFeature, 'properties' | 'geometry'> {
  properties: OutdoorFeatureProperties & {
    ioverlanderCategory: IoverlanderCategory;
    categoryLabel: string;
    placeIcon: string;
  };
  geometry: { type: 'Point'; coordinates: number[] };
}

export interface OutdoorPlaceCollection {
  type: 'FeatureCollection';
  features: OutdoorPlaceFeature[];
}

/** Builds a point-only collection suitable for native or browser clustering. */
export function createOutdoorPlaceCollection(
  index: OutdoorFeatureIndex,
  filter: OutdoorPlaceFilter = 'all',
): OutdoorPlaceCollection {
  return {
    type: 'FeatureCollection',
    features: index.features.flatMap((feature) => {
      if (feature.properties.kind !== 'poi') return [];
      const category = outdoorIoverlanderCategory(feature.properties.category);
      if (!matchesPlaceFilter(category, filter)) return [];
      const definition = ioverlanderCategoryDefinition(category);
      const {
        communityDescription: _communityDescription,
        communityCheckIns: _communityCheckIns,
        communityCheckInCount: _communityCheckInCount,
        ...renderProperties
      } = feature.properties;
      return [
        {
          type: 'Feature' as const,
          id: feature.id,
          properties: {
            ...renderProperties,
            ioverlanderCategory: category,
            categoryLabel: definition.label,
            placeIcon: definition.icon,
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [feature.bounds[0], feature.bounds[1]],
          },
        },
      ];
    }),
  };
}

export const outdoorMarkerDensityConfig = {
  automatic: { minimumZoom: 7, clusterMaxZoom: 12, clusterRadius: 50, labelMinZoom: 14 },
  fewer: { minimumZoom: 8, clusterMaxZoom: 14, clusterRadius: 72, labelMinZoom: 16 },
  more: { minimumZoom: 6, clusterMaxZoom: 11, clusterRadius: 38, labelMinZoom: 13 },
} as const satisfies Record<
  OutdoorMarkerDensity,
  {
    readonly minimumZoom: number;
    readonly clusterMaxZoom: number;
    readonly clusterRadius: number;
    readonly labelMinZoom: number;
  }
>;

export type OutdoorZoomBand = 'regional' | 'clusters' | 'icons' | 'labels';
export function outdoorZoomPresentation(
  zoom: number,
  density: OutdoorMarkerDensity = 'automatic',
): { readonly band: OutdoorZoomBand; readonly label: string } {
  const config = outdoorMarkerDensityConfig[density];
  if (zoom < config.minimumZoom) {
    return { band: 'regional', label: 'Regional view · zoom in to see places' };
  }
  if (zoom < config.clusterMaxZoom + 1) {
    return { band: 'clusters', label: 'Area view · numbers group nearby places' };
  }
  if (zoom < config.labelMinZoom) {
    return { band: 'icons', label: 'Local view · individual place icons' };
  }
  return { band: 'labels', label: 'Site view · place names and icons' };
}

export function nextOutdoorZoom(current: number, direction: 'in' | 'out'): number {
  const rounded = Math.round(current * 10) / 10;
  return Math.min(18, Math.max(3, rounded + (direction === 'in' ? 1 : -1)));
}

export function createOutdoorPlaceLayerStyles(density: OutdoorMarkerDensity = 'automatic') {
  const config = outdoorMarkerDensityConfig[density];
  const individualMinZoom = config.clusterMaxZoom + 1;
  const categoryColor = [
    'match',
    ['get', 'ioverlanderCategory'],
    ...ioverlanderCategoryDefinitions.flatMap((definition) => [definition.id, definition.color]),
    ioverlanderCategoryDefinition('other').color,
  ];
  return [
    {
      id: 'place-clusters',
      type: 'circle',
      minzoom: config.minimumZoom,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#cf5726',
        'circle-radius': ['step', ['get', 'point_count'], 17, 10, 21, 50, 27, 200, 33],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3,
      },
    },
    {
      id: 'place-cluster-count',
      type: 'symbol',
      minzoom: config.minimumZoom,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-size': 12,
        'text-allow-overlap': true,
        'text-font': ['Open Outdoor Noto Sans'],
      },
      paint: { 'text-color': '#ffffff' },
    },
    {
      id: 'place-marker',
      type: 'circle',
      minzoom: individualMinZoom,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': categoryColor,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], individualMinZoom, 9, 17, 13],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'place-icon',
      type: 'symbol',
      minzoom: individualMinZoom,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['get', 'placeIcon'],
        'text-size': ['interpolate', ['linear'], ['zoom'], individualMinZoom, 11, 17, 15],
        'text-allow-overlap': true,
        'text-font': ['Open Outdoor Noto Sans'],
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 0.35,
      },
    },
    {
      id: 'place-label',
      type: 'symbol',
      minzoom: config.labelMinZoom,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 12,
        'text-anchor': 'top',
        'text-offset': [0, 1.25],
        'text-max-width': 16,
        'text-optional': true,
        'text-font': ['Open Outdoor Noto Sans'],
      },
      paint: {
        'text-color': '#182e36',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    },
  ] as const;
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
export function searchOutdoorFeatureIndex(
  index: OutdoorFeatureIndex,
  query: string,
  limit = 30,
): OutdoorFeatureSummary[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  return index.features
    .filter(
      (feature) =>
        feature.properties.kind !== 'boundary' &&
        (feature.properties.name + ' ' + feature.properties.unit)
          .toLocaleLowerCase()
          .includes(term),
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
        origin: f.properties.origin ?? 'public-catalog',
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
  {
    id: 'dec-poi',
    type: 'circle',
    minzoom: 12,
    filter: ['==', ['get', 'kind'], 'poi'],
    paint: {
      'circle-color': '#526f77',
      'circle-radius': 3.5,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
    },
  },
  {
    id: 'dec-camping',
    type: 'circle',
    minzoom: 9,
    filter: [
      'in',
      ['get', 'category'],
      [
        'literal',
        ['PRIMITIVE CAMPSITE', 'CAMPSITE', 'ACCESSIBLE CAMPSITE', 'CAMPGROUND', 'LEAN-TO'],
      ],
    ],
    paint: {
      'circle-color': '#c25424',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 13, 6, 16, 8],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  },
] as const;

/**
 * Builds one self-contained style so native MapLibre receives the bundled
 * geography and its layers atomically during initial style loading.
 */
export interface OutdoorBaseMapStyle {
  readonly version: 8;
  readonly sources: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly layers: readonly (Readonly<{ id: string; type: string }> &
    Readonly<Record<string, unknown>>)[];
  readonly [key: string]: unknown;
}

/**
 * Builds a native-only basemap style whose archive and font are both local
 * files. MapLibre Native 6.10+ reads PMTiles directly, and 6.18+ supports local
 * TTF font faces, so the resulting style has no network resources at any zoom
 * level.
 */
export function createOfflineVectorBasemapStyle(
  archiveUri: string,
  fontUri: string,
  sourceLayers: OutdoorBaseMapStyle['layers'],
  maximumZoom = 12,
): OutdoorBaseMapStyle {
  if (!isLocalFileUri(archiveUri) || !isLocalFileUri(fontUri)) {
    throw new Error('offline basemap archive and font must be local file URLs');
  }
  if (!Number.isInteger(maximumZoom) || maximumZoom < 0 || maximumZoom > 22) {
    throw new Error('offline basemap maximum zoom must be an integer from 0 through 22');
  }
  const layers = sourceLayers.flatMap((sourceLayer) => {
    if (sourceLayer.type !== 'symbol') return [{ ...sourceLayer }];
    const layout = { ...((sourceLayer.layout as Readonly<Record<string, unknown>>) ?? {}) };
    for (const key of Object.keys(layout)) {
      if (key.startsWith('icon-')) delete layout[key];
    }
    if (!Object.hasOwn(layout, 'text-field')) return [];
    layout['text-font'] = ['Open Outdoor Noto Sans'];
    return [{ ...sourceLayer, layout }];
  });
  return {
    version: 8,
    sources: {
      'offline-basemap': {
        type: 'vector',
        url: `pmtiles://${archiveUri}`,
        minzoom: 0,
        maxzoom: maximumZoom,
        attribution: 'Protomaps © OpenStreetMap contributors',
      },
    },
    'font-faces': {
      'Open Outdoor Noto Sans': fontUri,
    },
    layers,
  };
}

export interface TieredOfflineVectorBasemapInput {
  readonly worldArchiveUri: string;
  readonly regionalArchiveUri: string;
  readonly fontUri: string;
  readonly sourceLayers: OutdoorBaseMapStyle['layers'];
  readonly worldMaximumZoom: number;
  readonly regionalMinimumZoom: number;
  readonly regionalMaximumZoom: number;
}

function checkedZoom(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 22) {
    throw new Error(`${label} must be an integer from 0 through 22`);
  }
  return value;
}

/**
 * Composes a worldwide low-zoom archive with a higher-resolution regional
 * archive. Keeping the archives as separate sources is intentional: outside
 * the regional archive, MapLibre can continue overzooming the worldwide source
 * instead of requesting missing tiles from an archive that advertises a
 * global maximum zoom.
 */
export function createTieredOfflineVectorBasemapStyle(
  input: TieredOfflineVectorBasemapInput,
): OutdoorBaseMapStyle {
  const archiveUris = [input.worldArchiveUri, input.regionalArchiveUri];
  if (archiveUris.some((uri) => !isLocalFileUri(uri)) || !isLocalFileUri(input.fontUri)) {
    throw new Error('tiered offline basemap archives and font must be local file URLs');
  }
  const worldMaximumZoom = checkedZoom(input.worldMaximumZoom, 'world maximum zoom');
  const regionalMinimumZoom = checkedZoom(input.regionalMinimumZoom, 'regional minimum zoom');
  const regionalMaximumZoom = checkedZoom(input.regionalMaximumZoom, 'regional maximum zoom');
  if (regionalMinimumZoom !== worldMaximumZoom + 1 || regionalMinimumZoom > regionalMaximumZoom) {
    throw new Error('tiered offline basemap zoom ranges must be ordered and non-overlapping');
  }
  const sanitized = createOfflineVectorBasemapStyle(
    input.worldArchiveUri,
    input.fontUri,
    input.sourceLayers,
    worldMaximumZoom,
  );
  const layers = sanitized.layers.flatMap((layer) => {
    if (layer.type === 'background' || !Object.hasOwn(layer, 'source')) return [{ ...layer }];
    const worldLayer = { ...layer, source: 'offline-world' };
    const regionalLayer = {
      ...layer,
      id: `${layer.id}-regional`,
      source: 'offline-regional',
      minzoom: Math.max(Number(layer.minzoom ?? 0), regionalMinimumZoom),
    };
    return [worldLayer, regionalLayer];
  });

  return {
    version: 8,
    sources: {
      'offline-world': {
        type: 'vector',
        url: `pmtiles://${input.worldArchiveUri}`,
        minzoom: 0,
        maxzoom: worldMaximumZoom,
        attribution: 'Protomaps © OpenStreetMap contributors',
      },
      'offline-regional': {
        type: 'vector',
        url: `pmtiles://${input.regionalArchiveUri}`,
        minzoom: regionalMinimumZoom,
        maxzoom: regionalMaximumZoom,
        attribution: 'Protomaps © OpenStreetMap contributors',
      },
    },
    'font-faces': {
      'Open Outdoor Noto Sans': input.fontUri,
    },
    layers,
  };
}

export interface OutdoorMapStyleOptions {
  readonly includePlaces?: boolean;
}

export function createOutdoorMapStyle(
  data: OutdoorCollection | string,
  basemap?: OutdoorBaseMapStyle,
  options: OutdoorMapStyleOptions = {},
) {
  const background = {
    id: 'background',
    type: 'background' as const,
    paint: { 'background-color': '#dfe8e8' },
  };
  const contextLayers = basemap?.layers ?? [background];
  const firstLabel = contextLayers.findIndex((layer) => layer.type === 'symbol');
  const insertionIndex = firstLabel < 0 ? contextLayers.length : firstLabel;
  const overlays = outdoorLayerStyles
    .filter((layer) => basemap === undefined || layer.id !== 'state-fill')
    .filter(
      (layer) =>
        options.includePlaces !== false || (layer.id !== 'dec-poi' && layer.id !== 'dec-camping'),
    )
    .map((layer) => ({ ...layer, source: 'outdoors' as const }));
  return {
    ...(basemap ?? {}),
    version: 8 as const,
    sources: {
      ...(basemap?.sources ?? {}),
      outdoors: {
        type: 'geojson' as const,
        data,
      },
    },
    layers: [
      ...contextLayers.slice(0, insertionIndex),
      ...overlays,
      ...contextLayers.slice(insertionIndex),
    ],
  };
}

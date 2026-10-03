import { ioverlanderCategoryDefinitions } from '@open-outdoor/shared';
import {
  outdoorMarkerDensityConfig,
  type OutdoorFeatureSummary,
  type OutdoorPlaceFilter,
  type OutdoorMarkerDensity,
  type OutdoorBaseMapStyle,
} from './outdoor-map';

export interface InstalledStatePackage {
  readonly state: string;
  readonly name: string;
  readonly schemaVersion: 1;
  readonly channel: 'public';
  readonly sha256: string;
  readonly featureCount: number;
  readonly installedBytes: number;
  readonly generatedAt: string;
  readonly revision?: number;
  readonly maximumZoom: number;
  readonly bounds: [number, number, number, number];
  readonly tilesUri: string;
  readonly visible: boolean;
  readonly canRollback: boolean;
  readonly attribution: string;
  readonly notices: string;
  readonly integrityError?: boolean;
}

export function mergeStateSummaries(
  baseline: readonly OutdoorFeatureSummary[],
  states: readonly OutdoorFeatureSummary[],
): OutdoorFeatureSummary[] {
  const entries = new Map(baseline.map((feature) => [feature.id, feature]));
  for (const feature of states) entries.set(feature.id, feature);
  return [...entries.values()];
}

/** A shown NY package replaces the public NY bundle; private overlays retain their identity. */
export function bundledFeaturesForStatePackages(
  bundled: readonly OutdoorFeatureSummary[],
  packages: readonly InstalledStatePackage[],
): OutdoorFeatureSummary[] {
  if (!packages.some((entry) => entry.state === 'NY' && entry.visible && !entry.integrityError))
    return [...bundled];
  return bundled.filter(
    (feature) =>
      feature.properties.origin === 'private-catalog' ||
      /^(?:private-|nys-dec(?:-|$)|nys-oprhp(?:-|$))/.test(feature.properties.sourceId),
  );
}

export function statePackageMapStyle(
  packages: readonly InstalledStatePackage[],
  category: OutdoorPlaceFilter = 'all',
  selectedId: string | null = null,
  density: OutdoorMarkerDensity = 'automatic',
  precisePlaceIds: readonly string[] = [],
) {
  const markerConfig = outdoorMarkerDensityConfig[density];
  const sources: Record<string, { type: 'vector'; url: string; attribution: string }> = {};
  const layers: OutdoorBaseMapStyle['layers'][number][] = [];
  const selectionLayers: string[] = [];
  for (const state of packages.filter((entry) => entry.visible && !entry.integrityError)) {
    if (!/^[A-Z]{2}$/.test(state.state) || !/^file:\/\/\/[^\r\n]+$/.test(state.tilesUri))
      throw new Error('State map sources must be verified local files.');
    const id = `state-${state.state}`;
    sources[id] = {
      type: 'vector',
      url: `pmtiles://${state.tilesUri}`,
      attribution: state.attribution,
    };
    const base = { source: id, 'source-layer': 'outdoors' };
    const poiFilter = [
      'all',
      ['==', ['get', 'kind'], 'poi'],
      ['==', ['geometry-type'], 'Point'],
      ['!', ['in', ['get', 'id'], ['literal', precisePlaceIds]]],
      ...(category === 'all' ? [] : [['==', ['get', 'category'], category]]),
    ];
    const color = [
      'match',
      ['get', 'category'],
      ...ioverlanderCategoryDefinitions.flatMap((definition) => [definition.id, definition.color]),
      '#62757f',
    ];
    const styles = [
      {
        id: `${id}-area`,
        type: 'fill',
        filter: ['==', ['get', 'kind'], 'land'],
        paint: { 'fill-color': '#2e7d54', 'fill-opacity': 0.1 },
      },
      {
        id: `${id}-road`,
        type: 'line',
        minzoom: 8,
        filter: ['==', ['get', 'kind'], 'road'],
        paint: { 'line-color': '#92754b', 'line-width': 1.5 },
      },
      {
        id: `${id}-trail`,
        type: 'line',
        minzoom: 8,
        filter: ['==', ['get', 'kind'], 'trail'],
        paint: { 'line-color': '#205c86', 'line-width': 2 },
      },
      {
        id: `${id}-poi`,
        type: 'circle',
        minzoom: markerConfig.minimumZoom,
        filter: poiFilter,
        paint: {
          'circle-color': color,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 3, 14, 7],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      },
      {
        id: `${id}-label`,
        type: 'symbol',
        minzoom: markerConfig.labelMinZoom,
        filter: poiFilter,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Outdoor Noto Sans'],
          'text-size': 12,
          'text-offset': [0, 1.25],
          'text-anchor': 'top',
        },
        paint: { 'text-color': '#182e36', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      },
      {
        id: `${id}-selection`,
        type: 'line',
        filter: [
          'all',
          ['!=', ['get', 'kind'], 'poi'],
          ['==', ['get', 'id'], selectedId ?? '__none__'],
        ],
        paint: { 'line-color': '#a43913', 'line-width': 4 },
      },
      {
        id: `${id}-selection-point`,
        type: 'circle',
        filter: [
          'all',
          ['==', ['get', 'kind'], 'poi'],
          ['==', ['geometry-type'], 'Point'],
          ['!', ['in', ['get', 'id'], ['literal', precisePlaceIds]]],
          ['==', ['get', 'id'], selectedId ?? '__none__'],
        ],
        paint: {
          'circle-color': '#a43913',
          'circle-radius': 10,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      },
    ];
    layers.push(...styles.map((layer) => ({ ...base, ...layer })));
    selectionLayers.push(`${id}-poi`, `${id}-area`, `${id}-road`, `${id}-trail`);
  }
  return { sources, layers, selectionLayers };
}

/** Place state geometry below map labels and its markers above them. */
export function withStatePackageLayers(
  base: OutdoorBaseMapStyle,
  stateMap: ReturnType<typeof statePackageMapStyle>,
): OutdoorBaseMapStyle {
  const firstLabel = base.layers.findIndex((layer) => layer.type === 'symbol');
  const insertionIndex = firstLabel < 0 ? base.layers.length : firstLabel;
  const geometry = stateMap.layers.filter(
    (layer) => layer.type !== 'circle' && layer.type !== 'symbol',
  );
  const places = stateMap.layers.filter(
    (layer) => layer.type === 'circle' || layer.type === 'symbol',
  );
  return {
    ...base,
    sources: { ...base.sources, ...stateMap.sources },
    layers: [
      ...base.layers.slice(0, insertionIndex),
      ...geometry,
      ...base.layers.slice(insertionIndex),
      ...places,
    ],
  };
}

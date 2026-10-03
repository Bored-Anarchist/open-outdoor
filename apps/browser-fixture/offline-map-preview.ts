import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { layers, namedFlavor } from '@protomaps/basemaps';
import dataUrl from '../../packages/map/src/assets/new-york-outdoors.geojson?url';
import fontUrl from '../../packages/map/src/assets/NotoSans-Variable.ttf?url';
import {
  createOutdoorMapStyle,
  createOutdoorPlaceCollection,
  createOutdoorPlaceLayerStyles,
  createTieredOfflineVectorBasemapStyle,
  regionalBasemapCoversViewport,
  statePackageMapStyle,
  withStatePackageLayers,
  outdoorMarkerDensityConfig,
  type InstalledStatePackage,
  type OutdoorBaseMapStyle,
  type OutdoorFeatureSummary,
  type OutdoorPlaceFilter,
  type OutdoorMarkerDensity,
} from '@open-outdoor/map';

const tileServer = new URLSearchParams(location.search).get('tiles')!;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(tileServer))
  throw new Error('QA requires a loopback tile server');
maplibregl.setWorkerUrl(workerUrl);
const map = new maplibregl.Map({
  container: 'map',
  center: [-73.12345678, 42.87654321],
  zoom: 10,
  preserveDrawingBuffer: true,
  attributionControl: false,
  localFontFamily: 'sans-serif',
  style: { version: 8, sources: {}, layers: [] },
});
const precisePlaces: OutdoorFeatureSummary[] = await (await fetch(`${tileServer}/places`)).json();
const state = {
  state: 'NY',
  visible: true,
  tilesUri: 'file:///qa/state.pmtiles',
  attribution: 'Synthetic QA',
} as InstalledStatePackage;
const cartography = layers('offline-basemap', namedFlavor('light'), {
  lang: 'en',
}) as unknown as OutdoorBaseMapStyle['layers'];

async function show(
  center: [number, number],
  zoom: number,
  category: OutdoorPlaceFilter = 'all',
  density: OutdoorMarkerDensity = 'automatic',
  installed = true,
  selectedId: string | null = null,
) {
  map.jumpTo({ center, zoom });
  const useRegionalDetail = regionalBasemapCoversViewport(
    map.getBounds().toArray().flat() as [number, number, number, number],
    zoom,
  );
  const base = createOutdoorMapStyle(
    dataUrl,
    createTieredOfflineVectorBasemapStyle({
      worldArchiveUri: 'file:///qa/world.pmtiles',
      regionalArchiveUri: 'file:///qa/regional.pmtiles',
      fontUri: 'file:///qa/font.ttf',
      sourceLayers: cartography,
      worldMaximumZoom: 6,
      regionalMinimumZoom: 7,
      regionalMaximumZoom: 9,
      useRegionalDetail,
    }),
    { includePlaces: false },
  );
  const precise = installed && zoom >= 12 ? precisePlaces : [];
  const nativeStyle = withStatePackageLayers(
    base,
    statePackageMapStyle(
      installed ? [state] : [],
      category,
      selectedId,
      density,
      precise.map((feature) => feature.id),
    ),
  );
  const style = {
    ...nativeStyle,
    sources: { ...nativeStyle.sources },
    layers: [...nativeStyle.layers],
    'font-faces': { 'Open Outdoor Noto Sans': fontUrl },
  };
  // Browser QA reads the same local archives through a loopback bridge, while iOS uses pmtiles://file.
  for (const [id, maximumZoom, minimumZoom, archive] of [
    ['offline-world', 6, 0, 'world'],
    ['offline-regional', 9, 7, 'regional'],
    ['state-NY', 10, 5, 'state'],
  ] as const) {
    if (style.sources[id])
      style.sources[id] = {
        type: 'vector',
        tiles: [`${tileServer}/${archive}/{z}/{x}/{y}.pbf`],
        minzoom: minimumZoom,
        maxzoom: maximumZoom,
      };
  }
  const config = outdoorMarkerDensityConfig[density];
  style.sources['outdoor-places'] = {
    type: 'geojson',
    data: createOutdoorPlaceCollection({ schemaVersion: 1, features: precise }, category),
    cluster: true,
    clusterRadius: config.clusterRadius,
    clusterMaxZoom: config.clusterMaxZoom,
  };
  style.layers = [
    ...style.layers,
    ...createOutdoorPlaceLayerStyles(density).map((layer) => ({
      ...layer,
      source: 'outdoor-places',
    })),
  ];
  const idle = new Promise<void>((resolve) => map.once('idle', () => resolve()));
  map.setStyle(style as unknown as maplibregl.StyleSpecification);
  await idle;
  return { useRegionalDetail, center: map.getCenter().toArray(), zoom: map.getZoom() };
}
const errors: string[] = [];
map.on('error', (event) => errors.push(event.error.message));
(window as unknown as { offlineQA: unknown }).offlineQA = { map, show, errors, precisePlaces };
document.body.dataset.qaReady = 'true';

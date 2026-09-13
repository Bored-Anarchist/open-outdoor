import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import basemap from '../../packages/map/src/assets/openfreemap-liberty.json';
import dataUrl from '../../packages/map/src/assets/new-york-outdoors.geojson?url';
import bundledIndex from '../../packages/map/src/assets/new-york-outdoors.index.json';
import {
  createOutdoorMapStyle,
  createOutdoorPlaceCollection,
  createOutdoorPlaceLayerStyles,
  outdoorMarkerDensityConfig,
  outdoorZoomPresentation,
  type OutdoorBaseMapStyle,
  type OutdoorFeatureIndex,
  type OutdoorMarkerDensity,
  type OutdoorPlaceFilter,
} from '@open-outdoor/map';
import { ioverlanderCategoryDefinitions } from '@open-outdoor/shared';
const featureIndex = bundledIndex as unknown as OutdoorFeatureIndex;
const categorySelect = document.querySelector<HTMLSelectElement>('#place-filter')!;
for (const definition of ioverlanderCategoryDefinitions) {
  const option = document.createElement('option');
  option.value = definition.id;
  option.textContent = `${definition.icon} ${definition.label}`;
  categorySelect.appendChild(option);
}
document.querySelector('#category-key')!.textContent = ioverlanderCategoryDefinitions
  .slice(0, 7)
  .map((definition) => `${definition.icon} ${definition.label}`)
  .join(' · ');
const style = document.createElement('style');
style.textContent =
  'body{margin:0;background:#edf1eb;font-family:system-ui;color:#203b31}main{max-width:1100px;margin:24px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 6px 28px #0002}header,footer{padding:20px 26px}header strong{letter-spacing:.1em;text-transform:uppercase;font-size:12px}h1{margin:8px 0;font-size:30px}p{margin:0}.map-selectors{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-top:18px}.map-selectors label{display:grid;gap:5px;font-size:12px;font-weight:700}.map-selectors select{min-height:44px;border:2px solid #526973;border-radius:10px;background:white;color:#182e36;padding:0 38px 0 12px;font:600 15px system-ui}#zoom-readout{margin-left:auto;background:#d8eaf0;border-radius:10px;padding:10px 12px;font-weight:700}#map{height:580px}footer{font-size:13px;line-height:1.7}';
document.head.appendChild(style);
maplibregl.setWorkerUrl(workerUrl);
const connected = new URLSearchParams(location.search).get('offline') !== '1';
let placeFilter: OutdoorPlaceFilter = 'all';
let markerDensity: OutdoorMarkerDensity = 'automatic';
let placeRevision = 0;
const map = new maplibregl.Map({
  container: 'map',
  center: [-74.25, 42.08],
  zoom: 10,
  preserveDrawingBuffer: true,
  attributionControl: false,
  style: createOutdoorMapStyle(
    dataUrl,
    connected ? (basemap as unknown as OutdoorBaseMapStyle) : undefined,
    { includePlaces: false },
  ) as unknown as maplibregl.StyleSpecification,
});
(window as unknown as { __outdoorMap: maplibregl.Map }).__outdoorMap = map;
map.addControl(new maplibregl.NavigationControl());

const placeLayerIds = createOutdoorPlaceLayerStyles().map((layer) => layer.id);
function browserPlaceLayers(density: OutdoorMarkerDensity) {
  return createOutdoorPlaceLayerStyles(density)
    .filter((layer) => connected || layer.type === 'circle')
    .map((layer) => {
      if (layer.type !== 'symbol') return layer;
      return {
        ...layer,
        layout: { ...layer.layout, 'text-font': ['Noto Sans Regular'] },
      };
    });
}
function installPlaces() {
  for (const id of [...placeLayerIds].reverse()) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('outdoor-places')) map.removeSource('outdoor-places');
  const config = outdoorMarkerDensityConfig[markerDensity];
  map.addSource('outdoor-places', {
    type: 'geojson',
    data: createOutdoorPlaceCollection(featureIndex, placeFilter),
    cluster: true,
    clusterRadius: config.clusterRadius,
    clusterMaxZoom: config.clusterMaxZoom,
  });
  for (const layer of browserPlaceLayers(markerDensity)) {
    map.addLayer({ ...layer, source: 'outdoor-places' } as maplibregl.LayerSpecification);
  }
  placeRevision += 1;
  document.body.dataset.placeRevision = String(placeRevision);
  document.body.dataset.placeFilter = placeFilter;
  document.body.dataset.markerDensity = markerDensity;
}
function updateZoomReadout() {
  const zoom = map.getZoom();
  const presentation = outdoorZoomPresentation(zoom, markerDensity);
  document.body.dataset.zoomBand = presentation.band;
  const output = document.querySelector<HTMLOutputElement>('#zoom-readout')!;
  output.textContent = `Zoom ${zoom.toFixed(1)} · ${presentation.label}`;
}

map.on('load', () => {
  installPlaces();
  updateZoomReadout();
  document.body.dataset.mapReady = 'true';
});
document.querySelector<HTMLSelectElement>('#place-filter')!.addEventListener('change', (event) => {
  placeFilter = (event.currentTarget as HTMLSelectElement).value as OutdoorPlaceFilter;
  installPlaces();
});
document
  .querySelector<HTMLSelectElement>('#marker-density')!
  .addEventListener('change', (event) => {
    markerDensity = (event.currentTarget as HTMLSelectElement).value as OutdoorMarkerDensity;
    installPlaces();
    updateZoomReadout();
  });
map.on('zoomend', updateZoomReadout);
map.on('click', 'place-clusters', async (event) => {
  const feature = event.features?.[0];
  const clusterId = Number(feature?.properties?.cluster_id);
  if (!Number.isFinite(clusterId)) return;
  const source = map.getSource('outdoor-places') as maplibregl.GeoJSONSource;
  const expansionZoom = await source.getClusterExpansionZoom(clusterId);
  map.easeTo({ center: event.lngLat, zoom: Math.min(18, expansionZoom), duration: 160 });
});
map.on('click', 'place-marker', (event) => {
  const feature = event.features?.[0];
  if (!feature) return;
  const text = document.createElement('div');
  text.textContent = String(feature.properties?.name ?? 'Outdoor place');
  new maplibregl.Popup().setLngLat(event.lngLat).setDOMContent(text).addTo(map);
});
map.on('click', (event) => {
  const feature = map.queryRenderedFeatures(event.point, {
    layers: ['dec-trail', 'dec-road', 'dec-land'],
  })[0];
  if (feature) {
    const text = document.createElement('div');
    text.textContent = String(feature.properties.name);
    new maplibregl.Popup().setLngLat(event.lngLat).setDOMContent(text).addTo(map);
  }
});
map.on('idle', () => {
  const visibleClusters = map.getLayer('place-clusters')
    ? map.queryRenderedFeatures({ layers: ['place-clusters'] }).length
    : 0;
  const visiblePlaceIcons = map.getLayer('place-marker')
    ? map.queryRenderedFeatures({ layers: ['place-marker'] }).length
    : 0;
  const visiblePlaceLabels = map.getLayer('place-label')
    ? map.queryRenderedFeatures({ layers: ['place-label'] }).length
    : 0;
  document.body.dataset.visibleClusters = String(visibleClusters);
  document.body.dataset.visiblePlaceIcons = String(visiblePlaceIcons);
  document.body.dataset.visiblePlaceLabels = String(visiblePlaceLabels);
  document.body.dataset.mapZoom = map.getZoom().toFixed(2);
  document.body.dataset.visibleFeatures = String(
    map.queryRenderedFeatures({ layers: ['dec-land', 'dec-road', 'dec-trail'] }).length +
      visibleClusters +
      visiblePlaceIcons,
  );
  document.body.dataset.visibleCamping = String(visibleClusters + visiblePlaceIcons);
  document.body.dataset.renderedPlaceRevision = String(placeRevision);
  document.body.dataset.basemapFeatures = String(
    map.queryRenderedFeatures().filter((feature) => feature.source === 'openmaptiles').length,
  );
});
map.on('error', (event) => {
  document.body.dataset.mapError = event.error.message;
});

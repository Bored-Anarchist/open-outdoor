import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import dataUrl from '../../packages/map/src/assets/new-york-outdoors.json?url';
import { outdoorLayerStyles } from '@open-outdoor/map';
const style = document.createElement('style');
style.textContent =
  'body{margin:0;background:#edf1eb;font-family:system-ui;color:#203b31}main{max-width:1100px;margin:24px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 6px 28px #0002}header,footer{padding:20px 26px}header strong{letter-spacing:.1em;text-transform:uppercase;font-size:12px}h1{margin:8px 0;font-size:30px}p{margin:0}#map{height:580px}footer{font-size:13px;line-height:1.7}';
document.head.appendChild(style);
maplibregl.setWorkerUrl(workerUrl);
const map = new maplibregl.Map({
  container: 'map',
  center: [-74.25, 42.08],
  zoom: 10,
  attributionControl: false,
  style: {
    version: 8,
    sources: { outdoors: { type: 'geojson', data: dataUrl } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#dfe8e8' } },
      ...outdoorLayerStyles.map((layer) => ({ ...layer, source: 'outdoors' })),
    ] as maplibregl.StyleSpecification['layers'],
  },
});
map.addControl(new maplibregl.NavigationControl());
map.on('load', () => {
  document.body.dataset.mapReady = 'true';
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
  document.body.dataset.visibleFeatures = String(
    map.queryRenderedFeatures({ layers: ['dec-land', 'dec-road', 'dec-trail'] }).length,
  );
});
map.on('error', (event) => {
  document.body.dataset.mapError = event.error.message;
});

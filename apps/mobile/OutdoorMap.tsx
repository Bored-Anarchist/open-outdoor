import licenses from './map-licenses.json';
import offlineMapLicenses from './offline-map-licenses.json';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { useAssets } from 'expo-asset';
import {
  Map as NativeMap,
  Camera,
  GeoJSONSource,
  Layer,
  type CameraRef,
  type MapRef,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import {
  createOutdoorMapStyle,
  createTieredOfflineVectorBasemapStyle,
  searchOutdoorFeatureIndex,
  segmentedTrack,
  type OutdoorBaseMapStyle,
  type OutdoorFeatureIndex,
  type OutdoorFeatureSummary,
  type OutdoorMapAdapter,
} from '@open-outdoor/map';
import { layers as protomapsLayers, namedFlavor } from '@protomaps/basemaps';
import { ProductText as Text } from './accessibility';
import { ProductButton, ProductCard, usePalette } from './ProductComponents';
import { useOfflineBasemap } from './useOfflineBasemap';
import worldOverviewAsset from '../../packages/map/src/assets/world-overview-z6.pmtiles';
import regionalOverviewAsset from '../../packages/map/src/assets/us-canada-territories-z7-z9.pmtiles';
import worldBasemapManifest from '../../packages/map/src/assets/world-basemap.manifest.json';
import regionalBasemapManifest from '../../packages/map/src/assets/us-canada-basemap.manifest.json';
import offlineFontAsset from '../../packages/map/src/assets/NotoSans-Variable.ttf';
import outdoorDataAsset from '../../packages/map/src/assets/new-york-outdoors.geojson';
import bundledIndex from '../../packages/map/src/assets/new-york-outdoors.index.json';
import manifest from '../../packages/map/src/assets/new-york-outdoors.manifest.json';
const featureIndex = bundledIndex as unknown as OutdoorFeatureIndex;
const offlineCartography = protomapsLayers('offline-basemap', namedFlavor('light'), {
  lang: 'en',
}) as unknown as OutdoorBaseMapStyle['layers'];
export function OutdoorMap({ adapter }: { adapter: OutdoorMapAdapter }) {
  const state = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
  const camera = useRef<CameraRef>(null);
  const mapView = useRef<MapRef>(null);
  const palette = usePalette();
  const [assets, assetError] = useAssets([
    outdoorDataAsset,
    worldOverviewAsset,
    regionalOverviewAsset,
    offlineFontAsset,
  ]);
  const outdoorDataUri = assets?.[0]?.localUri ?? assets?.[0]?.uri;
  const worldOverviewUri = assets?.[1]?.localUri ?? assets?.[1]?.uri;
  const regionalOverviewUri = assets?.[2]?.localUri ?? assets?.[2]?.uri;
  const offlineFontUri = assets?.[3]?.localUri ?? assets?.[3]?.uri;
  const basemap = useOfflineBasemap(regionalOverviewUri);
  const mapStyle = useMemo(
    () =>
      outdoorDataUri && worldOverviewUri && basemap.source && offlineFontUri
        ? (createOutdoorMapStyle(
            outdoorDataUri,
            createTieredOfflineVectorBasemapStyle({
              worldArchiveUri: worldOverviewUri,
              regionalArchiveUri: regionalOverviewUri!,
              installedArchiveUri:
                basemap.source.kind === 'installed' ? basemap.source.uri : undefined,
              fontUri: offlineFontUri,
              sourceLayers: offlineCartography,
              worldMaximumZoom: worldBasemapManifest.maximumZoom,
              regionalMinimumZoom: regionalBasemapManifest.minimumZoom,
              regionalMaximumZoom: regionalBasemapManifest.maximumZoom,
              installedMaximumZoom:
                basemap.source.kind === 'installed'
                  ? basemap.source.manifest.maximumZoom
                  : undefined,
            }),
          ) as unknown as StyleSpecification)
        : null,
    [basemap.source, offlineFontUri, outdoorDataUri, regionalOverviewUri, worldOverviewUri],
  );
  const [query, setQuery] = useState('');
  const [showLicenses, setShowLicenses] = useState(false);
  const selected =
    featureIndex.features.find((feature) => feature.id === state.selectedFeatureId) ?? null;
  const setSelected = (feature: OutdoorFeatureSummary | null) =>
    adapter.setSelectedFeature(feature?.id ?? null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [outside, setOutside] = useState(false);
  const [zoom, setZoom] = useState(state.camera.zoom);
  const results = useMemo(() => searchOutdoorFeatureIndex(featureIndex, query), [query]);
  const track = useMemo(
    () => segmentedTrack(state.activeTrack, state.trackBreaks),
    [state.activeTrack, state.trackBreaks],
  );
  const last = state.activeTrack.at(-1);
  const point = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: last
        ? [
            {
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'Point' as const, coordinates: [...last] },
            },
          ]
        : [],
    }),
    [last],
  );
  useEffect(() => {
    camera.current?.jumpTo({ center: [...state.camera.center], zoom: state.camera.zoom });
  }, [state.camera]);
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [basemap.source?.uri]);
  function select(feature: OutdoorFeatureSummary) {
    setSelected(feature);
    const [west, south, east, north] = feature.bounds;
    if (west === east && south === north) {
      camera.current?.jumpTo({ center: [west, south], zoom: 15 });
    } else {
      camera.current?.fitBounds(feature.bounds, {
        padding: { top: 35, right: 35, bottom: 35, left: 35 },
        duration: 0,
      });
    }
  }
  return (
    <View>
      <Text
        accessibilityRole="header"
        style={{ fontSize: 24, fontWeight: '700', color: palette.text }}
      >
        New York outdoor map
      </Text>
      <Text>
        Stored map · {manifest.featureCount.toLocaleString()} DEC geographic features ·{' '}
        {basemap.source?.kind === 'installed' ? 'detailed New York basemap' : 'offline overview'} ·{' '}
        {(
          (worldBasemapManifest.archive.bytes + regionalBasemapManifest.archive.bytes) /
          1024 ** 2
        ).toFixed(1)}{' '}
        MiB bundled
      </Text>
      <Text>
        Roads, towns, water, land cover, labels, DEC lands, hiking trails and recreation points are
        stored on this phone and work in airplane mode. Mapped land or a campsite marker is not
        current permission to camp or enter.
      </Text>
      <TextInput
        accessibilityLabel="Search New York lands, trails and campsites"
        placeholder="Search a trail, forest or campsite"
        placeholderTextColor={palette.muted}
        value={query}
        onChangeText={setQuery}
        style={{
          color: palette.text,
          borderColor: palette.border,
          borderWidth: 1,
          minHeight: 52,
          padding: 12,
          marginVertical: 8,
        }}
      />
      {query.trim() && (
        <Text accessibilityLiveRegion="polite">
          {results.length}
          {results.length === 30 ? ' or more' : ''} results. Select a result to show it on the map.
        </Text>
      )}
      {results.slice(0, 10).map((feature) => (
        <ProductButton
          key={feature.id}
          label={`${feature.properties.name} · ${feature.properties.kind}`}
          hint="Fit this real geographic feature in the offline map"
          onPress={() => select(feature)}
        />
      ))}
      <View
        style={{ height: 440, marginVertical: 12, borderWidth: 1, borderColor: palette.border }}
      >
        {mapStyle ? (
          <NativeMap
            key={basemap.source?.uri}
            ref={mapView}
            style={{ flex: 1 }}
            mapStyle={mapStyle}
            attribution
            logo={false}
            onDidFinishRenderingMapFully={() => setLoaded(true)}
            onDidFailLoadingMap={() => setFailed(true)}
            onPress={(event) => {
              void mapView.current
                ?.queryRenderedFeatures(event.nativeEvent.point, {
                  layers: ['dec-camping', 'dec-poi', 'dec-land', 'dec-road', 'dec-trail'],
                })
                .then((features) => {
                  const id = features.find((feature) => feature.properties?.kind !== 'boundary')
                    ?.properties?.id;
                  const feature = featureIndex.features.find((candidate) => candidate.id === id);
                  if (feature) setSelected(feature);
                })
                .catch(() => undefined);
            }}
            onRegionDidChange={(event) => {
              const [x, y] = event.nativeEvent.center;
              setOutside(x < -79.77 || x > -71.75 || y < 40.47 || y > 45.02);
              setZoom(event.nativeEvent.zoom);
              adapter.moveCamera({ center: [x, y], zoom: event.nativeEvent.zoom });
            }}
          >
            <Camera
              ref={camera}
              initialViewState={{ center: [...state.camera.center], zoom: state.camera.zoom }}
            />
            <Layer
              id="selection-outline"
              type="line"
              source="outdoors"
              filter={['==', ['get', 'id'], selected?.id ?? '__none__']}
              paint={{ 'line-color': '#a43913', 'line-width': 5 }}
            />
            <Layer
              id="selection-point"
              type="circle"
              source="outdoors"
              filter={['==', ['get', 'id'], selected?.id ?? '__none__']}
              paint={{
                'circle-color': '#a43913',
                'circle-radius': 10,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 3,
              }}
            />
            <GeoJSONSource id="recorded-track" data={track}>
              <Layer
                id="recorded-line"
                type="line"
                paint={{ 'line-color': '#b80d44', 'line-width': 4 }}
              />
            </GeoJSONSource>
            <GeoJSONSource id="recorded-position" data={point}>
              <Layer
                id="last-recorded"
                type="circle"
                paint={{
                  'circle-color': '#b80d44',
                  'circle-radius': 6,
                  'circle-stroke-width': 2,
                  'circle-stroke-color': '#ffffff',
                }}
              />
            </GeoJSONSource>
          </NativeMap>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text>
              {assetError ? 'Stored map overlay could not load.' : 'Preparing map layers…'}
            </Text>
          </View>
        )}
      </View>
      <Text accessibilityLiveRegion="polite">
        {failed || assetError
          ? 'Map could not render. Search and geographic details remain available.'
          : loaded
            ? basemap.source?.kind === 'installed'
              ? 'Detailed offline map ready. Pinch to zoom; drag to pan.'
              : 'Worldwide offline overview ready, with US and Canada detail through zoom 9. Pinch to zoom; drag to pan.'
            : basemap.checking
              ? 'Verifying the installed basemap while the overview remains available…'
              : 'Loading the stored basemap and DEC overlays…'}
        {outside ? ' Outside the bundled New York outdoor-overlay coverage.' : ''}
      </Text>
      {basemap.error && <Text accessibilityLiveRegion="polite">{basemap.error}</Text>}
      {basemap.source?.kind !== 'installed' && (
        <>
          <Text>
            The bundled basemap covers the world through zoom 6 and the United States, its
            territories, and Canada through zoom 9. For additional New York detail when zoomed in,
            copy the approved {basemap.detailedSizeMiB} MB New York .pmtiles pack to Files, then
            import it here. The app verifies and stores it locally; it never downloads or streams
            map data.
          </Text>
          <ProductButton
            label={basemap.importing ? 'Importing detailed map…' : 'Import detailed New York map'}
            hint="Choose the approved offline New York PMTiles file from Files"
            disabled={!basemap.importAvailable || basemap.importing}
            onPress={() => void basemap.importDetailed()}
          />
        </>
      )}
      {basemap.source?.kind === 'installed' && (
        <ProductButton
          label={basemap.removing ? 'Removing detailed map…' : 'Remove detailed map'}
          hint="Free the detailed basemap storage and return to the bundled overview"
          disabled={basemap.removing}
          onPress={() =>
            Alert.alert(
              'Remove detailed map?',
              `This removes the app's ${basemap.detailedSizeMiB} MB copy. The bundled offline overview remains available.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () => void basemap.removeDetailed(),
                },
              ],
            )
          }
        />
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <ProductButton
          label="Zoom in"
          hint="Increase map detail"
          onPress={() => camera.current?.zoomTo(Math.min(20, zoom + 1), { duration: 0 })}
        />
        <ProductButton
          label="Zoom out"
          hint="Show a wider area"
          onPress={() => camera.current?.zoomTo(Math.max(3, zoom - 1), { duration: 0 })}
        />
      </View>
      <ProductButton
        label="Show all New York coverage"
        hint="Fit the statewide geographic layers"
        onPress={() =>
          camera.current?.fitBounds([-79.7624, 40.4774, -71.7517, 45.0159], {
            padding: { top: 15, right: 15, bottom: 15, left: 15 },
            duration: 0,
          })
        }
      />
      <ProductButton
        label="Show last recorded position"
        hint="Uses only the most recent recording point; does not start location access"
        disabled={!last}
        onPress={() => {
          if (last) camera.current?.jumpTo({ center: [...last], zoom: 14 });
        }}
      />
      <Text>
        Map key: green areas — DEC lands; blue lines — hiking trails; orange dots — DEC campsites
        and lean-tos; gray dots — other DEC recreation points; brown lines — DEC roads; pink —
        recorded route. Tap a feature or search its name for text details.
      </Text>
      {selected && (
        <ProductCard title={selected.properties.name}>
          <Text>
            {selected.properties.kind} · {selected.properties.unit || selected.properties.category}
          </Text>
          <Text>
            Source: {selected.properties.sourceId}. Source update:{' '}
            {selected.properties.sourceUpdated}. Current access and camping status are unverified.
          </Text>
          <Text>
            Geographic bounds: {selected.bounds.map((number) => number.toFixed(4)).join(', ')}
          </Text>
          <ProductButton
            label="Clear map selection"
            hint="Remove the selected feature highlight"
            onPress={() => setSelected(null)}
          />
        </ProductCard>
      )}
      <Text>
        Basemap: {worldBasemapManifest.attribution}. Overlay: NYS ITS Geospatial Services and New
        York State Department of Environmental Conservation. Geometry simplified for display.
        MapLibre Native renderer. Public-use GIS data is provided without warranty; boundaries are
        not legal surveys.
      </Text>
      <ProductButton
        label="Map renderer licenses"
        hint="Show the complete license notices"
        onPress={() => setShowLicenses(!showLicenses)}
      />
      {showLicenses && (
        <Text>
          {licenses.reactNative +
            '\n\n' +
            licenses.native +
            '\n\n' +
            offlineMapLicenses.basemap +
            '\n\n' +
            offlineMapLicenses.font}
        </Text>
      )}
    </View>
  );
}

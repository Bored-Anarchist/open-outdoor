import licenses from './map-licenses.json';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { TextInput, View } from 'react-native';
import {
  Map as NativeMap,
  Camera,
  GeoJSONSource,
  Layer,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import {
  featureBounds,
  searchOutdoorFeatures,
  segmentedTrack,
  outdoorLayerStyles,
  type OutdoorCollection,
  type OutdoorFeature,
  type OutdoorMapAdapter,
} from '@open-outdoor/map';
import { ProductText as Text } from './accessibility';
import { ProductButton, ProductCard, usePalette } from './ProductComponents';
import bundled from '../../packages/map/src/assets/new-york-outdoors.json';
import manifest from '../../packages/map/src/assets/new-york-outdoors.manifest.json';
const collection = bundled as unknown as OutdoorCollection;
const nativeCollection = collection as unknown as GeoJSON.FeatureCollection;
const emptyStyle = {
  version: 8 as const,
  sources: {},
  layers: [
    { id: 'background', type: 'background' as const, paint: { 'background-color': '#dfe8e8' } },
  ],
};
export function OutdoorMap({ adapter }: { adapter: OutdoorMapAdapter }) {
  const state = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
  const camera = useRef<CameraRef>(null);
  const palette = usePalette();
  const [query, setQuery] = useState('');
  const [showLicenses, setShowLicenses] = useState(false);
  const selected = collection.features.find((f) => f.id === state.selectedFeatureId) ?? null;
  const setSelected = (feature: OutdoorFeature | null) =>
    adapter.setSelectedFeature(feature?.id ?? null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [outside, setOutside] = useState(false);
  const [zoom, setZoom] = useState(state.camera.zoom);
  const results = useMemo(() => searchOutdoorFeatures(collection, query), [query]);
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
  function select(feature: OutdoorFeature) {
    setSelected(feature);
    camera.current?.fitBounds(featureBounds(feature), {
      padding: { top: 35, right: 35, bottom: 35, left: 35 },
      duration: 0,
    });
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
        Stored on this phone · {manifest.featureCount.toLocaleString()} geographic features ·
        acquired {manifest.acquiredAt.slice(0, 10)}
      </Text>
      <Text>
        DEC lands, roads and hiking trails. Coverage excludes most streets, terrain and non-DEC
        trails. Mapped land is not permission to camp or enter.
      </Text>
      <TextInput
        accessibilityLabel="Search New York lands and trails"
        placeholder="Search a trail or forest, e.g. Slide"
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
        <NativeMap
          style={{ flex: 1 }}
          mapStyle={emptyStyle}
          attribution={false}
          logo={false}
          onDidFinishLoadingMap={() => setLoaded(true)}
          onDidFailLoadingMap={() => setFailed(true)}
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
          <GeoJSONSource
            id="outdoors"
            data={nativeCollection}
            onPress={(event) => {
              const id = event.nativeEvent.features.find((f) => f.properties?.kind !== 'boundary')
                ?.properties?.id;
              const feature = collection.features.find((f) => f.id === id);
              if (feature) setSelected(feature);
            }}
          >
            {outdoorLayerStyles.map((layer) => (
              <Layer
                key={layer.id}
                {...(layer as unknown as {
                  id: string;
                  type: 'line';
                  paint: Record<string, unknown>;
                })}
              />
            ))}
          </GeoJSONSource>
          {selected && (
            <GeoJSONSource
              id="selection"
              data={
                {
                  type: 'FeatureCollection',
                  features: [selected],
                } as unknown as GeoJSON.FeatureCollection
              }
            >
              <Layer
                id="selection-outline"
                type="line"
                paint={{ 'line-color': '#a43913', 'line-width': 5 }}
              />
            </GeoJSONSource>
          )}
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
      </View>
      <Text accessibilityLiveRegion="polite">
        {failed
          ? 'Map could not render. Search and geographic details remain available.'
          : loaded
            ? 'Offline geographic map ready. Pinch to zoom; drag to pan.'
            : 'Loading bundled geographic map…'}
        {outside ? ' Outside bundled New York coverage.' : ''}
      </Text>
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
        Map key: green areas — DEC lands; blue lines — hiking trails; brown lines — DEC roads; pink
        — recorded route. Tap a feature or search its name for text details.
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
            Geographic bounds:{' '}
            {featureBounds(selected)
              .map((n) => n.toFixed(4))
              .join(', ')}
          </Text>
          <ProductButton
            label="Clear map selection"
            hint="Remove the selected feature highlight"
            onPress={() => setSelected(null)}
          />
        </ProductCard>
      )}
      <Text>
        Data: NYS ITS Geospatial Services; New York State Department of Environmental Conservation.
        Geometry simplified for display. MapLibre Native renderer. Public-use GIS data is provided
        without warranty; boundaries are not legal surveys.
      </Text>
      <ProductButton
        label="Map renderer licenses"
        hint="Show the complete license notices"
        onPress={() => setShowLicenses(!showLicenses)}
      />
      {showLicenses && <Text>{licenses.reactNative + '\n\n' + licenses.native}</Text>}
    </View>
  );
}

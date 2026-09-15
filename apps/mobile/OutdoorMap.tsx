import licenses from './map-licenses.json';
import offlineMapLicenses from './offline-map-licenses.json';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useAssets } from 'expo-asset';
import {
  Map as NativeMap,
  Camera,
  GeoJSONSource,
  Layer,
  NativeUserLocation,
  type CameraRef,
  type GeoJSONSourceRef,
  type MapRef,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import {
  createOutdoorPlaceCollection,
  createOutdoorPlaceLayerStyles,
  createOutdoorMapStyle,
  createTieredOfflineVectorBasemapStyle,
  nextOutdoorZoom,
  outdoorMarkerDensityConfig,
  outdoorZoomPresentation,
  searchOutdoorFeatureIndex,
  segmentedTrack,
  type OutdoorBaseMapStyle,
  type OutdoorFeatureIndex,
  type OutdoorFeatureSummary,
  type OutdoorMapAdapter,
  type OutdoorMarkerDensity,
  type OutdoorPlaceFilter,
} from '@open-outdoor/map';
import {
  ioverlanderCategoryDefinition,
  ioverlanderCategoryDefinitions,
  type IoverlanderCategory,
} from '@open-outdoor/shared';
import type { PlaceJournalEntry } from '@open-outdoor/storage';
import { layers as protomapsLayers, namedFlavor } from '@protomaps/basemaps';
import { ProductText as Text } from './accessibility';
import { ProductButton, ProductCard, usePalette } from './ProductComponents';
import worldOverviewAsset from '../../packages/map/src/assets/world-overview-z6.pmtiles';
import regionalOverviewAsset from '../../packages/map/src/assets/us-canada-territories-z7-z9.pmtiles';
import worldBasemapManifest from '../../packages/map/src/assets/world-basemap.manifest.json';
import regionalBasemapManifest from '../../packages/map/src/assets/us-canada-basemap.manifest.json';
import offlineFontAsset from '../../packages/map/src/assets/NotoSans-Variable.ttf';
import {
  mobileMapDataAsset as outdoorDataAsset,
  mobileMapDataIndex as bundledIndex,
  mobileMapDataMetadata,
} from '@open-outdoor/mobile-map-data';
import type { PlaceJournalService } from './application';
const featureIndex = bundledIndex as unknown as OutdoorFeatureIndex;
const offlineCartography = protomapsLayers('offline-basemap', namedFlavor('light'), {
  lang: 'en',
}) as unknown as OutdoorBaseMapStyle['layers'];

const placeFilterOptions: readonly {
  readonly value: OutdoorPlaceFilter;
  readonly label: string;
  readonly icon?: string;
  readonly color?: string;
}[] = [
  { value: 'all', label: 'All iOverlander categories' },
  ...ioverlanderCategoryDefinitions.map((definition) => ({
    value: definition.id,
    label: definition.label,
    icon: definition.icon,
    color: definition.color,
  })),
];
const markerDensityOptions: readonly {
  readonly value: OutdoorMarkerDensity;
  readonly label: string;
}[] = [
  { value: 'automatic', label: 'Automatic detail' },
  { value: 'fewer', label: 'Fewer markers' },
  { value: 'more', label: 'More markers' },
];

function MapSelect<Value extends string>({
  label,
  value,
  options,
  expanded,
  onToggle,
  onChange,
}: {
  readonly label: string;
  readonly value: Value;
  readonly options: readonly {
    readonly value: Value;
    readonly label: string;
    readonly icon?: string;
    readonly color?: string;
  }[];
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onChange: (value: Value) => void;
}) {
  const palette = usePalette();
  const selected = options.find((option) => option.value === value)!;
  return (
    <View style={{ flex: 1, minWidth: 180 }}>
      <Pressable
        accessibilityLabel={label}
        accessibilityHint={`Current selection: ${selected.label}. Opens the selection menu.`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => ({
          minHeight: 56,
          borderWidth: 2,
          borderColor: expanded ? palette.accent : palette.border,
          borderRadius: 12,
          backgroundColor: pressed || expanded ? palette.selected : palette.surface,
          paddingHorizontal: 14,
          paddingVertical: 8,
          justifyContent: 'center',
        })}
      >
        <Text style={{ color: palette.muted, fontSize: 13, fontWeight: '700' }}>{label}</Text>
        <Text style={{ color: palette.text, fontSize: 16, fontWeight: '700' }}>
          {selected.icon ? `${selected.icon} ` : ''}
          {selected.label} {expanded ? '⌃' : '⌄'}
        </Text>
      </Pressable>
      {expanded ? (
        <View
          accessibilityLabel={`${label} choices`}
          style={{
            position: 'absolute',
            zIndex: 20,
            top: 60,
            left: 0,
            right: 0,
            borderWidth: 2,
            borderColor: palette.border,
            borderRadius: 12,
            backgroundColor: palette.surface,
            overflow: 'hidden',
          }}
        >
          <ScrollView style={{ maxHeight: 360 }} nestedScrollEnabled>
            {options.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: option.value === value }}
                onPress={() => onChange(option.value)}
                style={({ pressed }) => ({
                  minHeight: 52,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor:
                    pressed || option.value === value ? palette.selected : palette.surface,
                  borderBottomWidth: option === options.at(-1) ? 0 : 1,
                  borderBottomColor: palette.border,
                })}
              >
                {option.icon && option.color ? (
                  <View
                    accessibilityElementsHidden
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: option.color,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '800' }}>
                      {option.icon}
                    </Text>
                  </View>
                ) : null}
                <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600', flex: 1 }}>
                  {option.label}
                  {option.value === value ? ' · Selected' : ''}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function MapZoomButton({
  label,
  symbol,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly symbol: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 52,
        height: 52,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: palette.border,
        backgroundColor: pressed ? palette.selected : palette.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 0.96,
      })}
    >
      <Text style={{ color: palette.text, fontSize: 30, fontWeight: '500', lineHeight: 34 }}>
        {symbol}
      </Text>
    </Pressable>
  );
}

function PlaceKey({
  symbol,
  label,
  color,
}: {
  readonly symbol: string;
  readonly label: string;
  readonly color: string;
}) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        accessibilityElementsHidden
        style={{
          width: 25,
          height: 25,
          borderRadius: 13,
          backgroundColor: color,
          borderColor: palette.surface,
          borderWidth: 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>{symbol}</Text>
      </View>
      <Text style={{ color: palette.text, fontSize: 14 }}>{label}</Text>
    </View>
  );
}

export function OutdoorMap({
  adapter,
  placeJournal,
}: {
  adapter: OutdoorMapAdapter;
  placeJournal: PlaceJournalService | null;
}) {
  const state = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
  const camera = useRef<CameraRef>(null);
  const mapView = useRef<MapRef>(null);
  const placeSource = useRef<GeoJSONSourceRef>(null);
  const palette = usePalette();
  const [placeFilter, setPlaceFilter] = useState<OutdoorPlaceFilter>('all');
  const [markerDensity, setMarkerDensity] = useState<OutdoorMarkerDensity>('automatic');
  const [openMenu, setOpenMenu] = useState<'places' | 'density' | null>(null);
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
  const mapStyle = useMemo(
    () =>
      outdoorDataUri && worldOverviewUri && regionalOverviewUri && offlineFontUri
        ? (createOutdoorMapStyle(
            outdoorDataUri,
            createTieredOfflineVectorBasemapStyle({
              worldArchiveUri: worldOverviewUri,
              regionalArchiveUri: regionalOverviewUri,
              fontUri: offlineFontUri,
              sourceLayers: offlineCartography,
              worldMaximumZoom: worldBasemapManifest.maximumZoom,
              regionalMinimumZoom: regionalBasemapManifest.minimumZoom,
              regionalMaximumZoom: regionalBasemapManifest.maximumZoom,
            }),
            { includePlaces: false },
          ) as unknown as StyleSpecification)
        : null,
    [offlineFontUri, outdoorDataUri, regionalOverviewUri, worldOverviewUri],
  );
  const [query, setQuery] = useState('');
  const [showLicenses, setShowLicenses] = useState(false);
  const selected =
    featureIndex.features.find((feature) => feature.id === state.selectedFeatureId) ?? null;
  const selectedProperties = selected?.properties;
  const setSelected = (feature: OutdoorFeatureSummary | null) =>
    adapter.setSelectedFeature(feature?.id ?? null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [outside, setOutside] = useState(false);
  const [followUser, setFollowUser] = useState(false);
  const [zoom, setZoom] = useState(state.camera.zoom);
  const [journalEntry, setJournalEntry] = useState<PlaceJournalEntry | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [journalStatus, setJournalStatus] = useState('');
  const placeData = useMemo(
    () => createOutdoorPlaceCollection(featureIndex, placeFilter),
    [placeFilter],
  );
  const placeLayers = useMemo(() => createOutdoorPlaceLayerStyles(markerDensity), [markerDensity]);
  const densityConfig = outdoorMarkerDensityConfig[markerDensity];
  const zoomPresentation = outdoorZoomPresentation(zoom, markerDensity);
  const legendCategories: readonly IoverlanderCategory[] =
    placeFilter === 'all'
      ? [
          'campsite',
          'informal_campsite',
          'wild_campsite',
          'shorterm_parking',
          'water',
          'warning',
          'other',
        ]
      : [placeFilter];
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
    if (!followUser) {
      camera.current?.jumpTo({ center: [...state.camera.center], zoom: state.camera.zoom });
    }
  }, [followUser, state.camera]);
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [regionalOverviewUri]);
  useEffect(() => {
    const entry = selected && placeJournal ? placeJournal.get(selected.id) : null;
    setJournalEntry(entry);
    setNoteDraft(entry?.note ?? '');
    setJournalStatus('');
  }, [placeJournal, selected?.id]);
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
  function changeZoom(direction: 'in' | 'out') {
    setFollowUser(false);
    camera.current?.zoomTo(nextOutdoorZoom(zoom, direction), { duration: 160 });
  }
  async function saveJournal(checkIn: boolean): Promise<void> {
    if (!selected || !placeJournal) return;
    const occurredAt = new Date().toISOString();
    const prior = placeJournal.get(selected.id);
    const entry: PlaceJournalEntry = {
      featureId: selected.id,
      featureName: selected.properties.name,
      note: noteDraft,
      checkIns: checkIn
        ? [
            ...(prior?.checkIns ?? []),
            {
              id: `checkin-${Date.now()}-${(prior?.checkIns.length ?? 0) + 1}`,
              occurredAt,
            },
          ]
        : (prior?.checkIns ?? []),
      updatedAt: occurredAt,
    };
    setJournalStatus(checkIn ? 'Saving private check-in…' : 'Saving private note…');
    try {
      const saved = await placeJournal.save(entry);
      setJournalEntry(saved);
      setNoteDraft(saved.note);
      setJournalStatus(
        checkIn ? 'Checked in. Your note is saved privately.' : 'Your private note is saved.',
      );
    } catch (error) {
      setJournalStatus(
        `Could not save privately: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
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
        Stored map · {mobileMapDataMetadata.featureCount.toLocaleString()} geographic features ·{' '}
        {mobileMapDataMetadata.label} · offline overview ·{' '}
        {(
          (worldBasemapManifest.archive.bytes + regionalBasemapManifest.archive.bytes) /
          1024 ** 2
        ).toFixed(1)}{' '}
        MiB bundled
      </Text>
      <Text>
        Roads, towns, water, land cover, labels, agency lands, trails and recreation points are
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
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
          marginTop: 10,
          marginBottom: 4,
          zIndex: 30,
        }}
      >
        <MapSelect
          label="Show on map"
          value={placeFilter}
          options={placeFilterOptions}
          expanded={openMenu === 'places'}
          onToggle={() => setOpenMenu(openMenu === 'places' ? null : 'places')}
          onChange={(value) => {
            setPlaceFilter(value);
            setSelected(null);
            setOpenMenu(null);
          }}
        />
        <MapSelect
          label="Marker detail"
          value={markerDensity}
          options={markerDensityOptions}
          expanded={openMenu === 'density'}
          onToggle={() => setOpenMenu(openMenu === 'density' ? null : 'density')}
          onChange={(value) => {
            setMarkerDensity(value);
            setOpenMenu(null);
          }}
        />
      </View>
      <Text accessibilityLiveRegion="polite" style={{ color: palette.muted }}>
        {placeData.features.length.toLocaleString()} matching places · {zoomPresentation.label}
      </Text>
      <ProductCard title="Data on this map">
        {mobileMapDataMetadata.sources.map((source) => (
          <Text key={source.id}>
            {source.label}: {source.featureCount.toLocaleString()} features · {source.status}
          </Text>
        ))}
      </ProductCard>
      <View
        style={{
          height: 520,
          marginVertical: 12,
          borderWidth: 2,
          borderRadius: 16,
          overflow: 'hidden',
          borderColor: palette.border,
        }}
      >
        {mapStyle ? (
          <>
            <NativeMap
              key={regionalOverviewUri}
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
                    layers: ['dec-land', 'dec-road', 'dec-trail'],
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
                trackUserLocation={followUser ? 'default' : undefined}
                onTrackUserLocationChange={(event) =>
                  setFollowUser(event.nativeEvent.trackUserLocation !== null)
                }
              />
              <NativeUserLocation mode="default" />
              <GeoJSONSource
                key={`${placeFilter}-${markerDensity}`}
                ref={placeSource}
                id="outdoor-places"
                data={placeData}
                cluster
                clusterRadius={densityConfig.clusterRadius}
                clusterMaxZoom={densityConfig.clusterMaxZoom}
                onPress={(event) => {
                  const rendered = event.nativeEvent.features[0];
                  const properties = rendered?.properties;
                  if (properties?.point_count && properties.cluster_id !== undefined) {
                    void placeSource.current
                      ?.getClusterExpansionZoom(Number(properties.cluster_id))
                      .then((expansionZoom) => {
                        setFollowUser(false);
                        camera.current?.jumpTo({
                          center: [...event.nativeEvent.lngLat],
                          zoom: Math.min(18, expansionZoom),
                        });
                      })
                      .catch(() => changeZoom('in'));
                    return;
                  }
                  const id = properties?.id;
                  const feature = featureIndex.features.find((candidate) => candidate.id === id);
                  if (feature) select(feature);
                }}
              >
                {placeLayers.map((placeLayer) => (
                  <Layer
                    key={placeLayer.id}
                    {...(placeLayer as unknown as ComponentProps<typeof Layer>)}
                  />
                ))}
              </GeoJSONSource>
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
                  'circle-radius': 13,
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
            <View
              pointerEvents="box-none"
              style={{ position: 'absolute', right: 12, top: 12, gap: 8 }}
            >
              <MapZoomButton
                label="Zoom in"
                symbol="+"
                disabled={zoom >= 18}
                onPress={() => changeZoom('in')}
              />
              <MapZoomButton
                label="Zoom out"
                symbol="−"
                disabled={zoom <= 3}
                onPress={() => changeZoom('out')}
              />
            </View>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 12,
                bottom: 12,
                backgroundColor: palette.surface,
                borderColor: palette.border,
                borderWidth: 1,
                borderRadius: 9,
                paddingHorizontal: 10,
                paddingVertical: 6,
                opacity: 0.94,
              }}
            >
              <Text style={{ color: palette.text, fontSize: 13, fontWeight: '700' }}>
                Zoom {zoom.toFixed(1)}
              </Text>
            </View>
          </>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text>
              {assetError ? 'Stored map overlay could not load.' : 'Preparing map layers…'}
            </Text>
          </View>
        )}
      </View>
      <View
        accessibilityLabel="iOverlander category icon key"
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}
      >
        {legendCategories.map((category) => {
          const definition = ioverlanderCategoryDefinition(category);
          return (
            <PlaceKey
              key={category}
              symbol={definition.icon}
              label={definition.label}
              color={definition.color}
            />
          );
        })}
      </View>
      <Text accessibilityLiveRegion="polite">
        {failed || assetError
          ? 'Map could not render. Search and geographic details remain available.'
          : loaded
            ? 'Worldwide offline overview ready, with US and Canada detail through zoom 9. Pinch or use the map buttons to zoom. Tap a numbered cluster to expand it.'
            : `Loading the stored basemap and ${mobileMapDataMetadata.label} overlays…`}
        {outside ? ' Outside the bundled New York outdoor-overlay coverage.' : ''}
      </Text>
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
        label={followUser ? 'Stop following my location' : 'Center on my location'}
        hint={
          followUser
            ? 'Keep the live GPS dot visible without moving the map automatically'
            : 'Center the map on the live GPS dot and follow your movement'
        }
        onPress={() => setFollowUser(!followUser)}
      />
      <Text accessibilityLiveRegion="polite">
        {followUser
          ? 'Following your live GPS position. Drag the map to stop following.'
          : 'Your live position appears as a blue GPS dot when location access is allowed.'}
      </Text>
      <ProductButton
        label="Show last recorded position"
        hint="Uses only the most recent recording point; does not start location access"
        disabled={!last}
        onPress={() => {
          if (last) camera.current?.jumpTo({ center: [...last], zoom: 14 });
        }}
      />
      <Text>
        Map key: green areas — DEC, NPS, USFS and BLM land references when present; blue lines —
        trails; brown lines — roads; numbered orange circles — grouped places; colored symbols —
        iOverlander categories; pink — recorded route; blue GPS dot — current position. Zooming in
        expands groups into category-specific icons, then reveals names. Tap a group, feature, or
        search result for details.
      </Text>
      {selected && (
        <ProductCard title={selected.properties.name}>
          <Text>
            {selected.properties.kind} · {selected.properties.unit || selected.properties.category}
          </Text>
          <Text>
            Source: {selected.properties.sourceId}. Source update:{' '}
            {selected.properties.sourceUpdated}.
          </Text>
          <Text>
            Access note:{' '}
            {selectedProperties?.publicUse ??
              'Current access and camping status are unverified; check the managing agency.'}
          </Text>
          <Text>
            Catalog:{' '}
            {selectedProperties?.origin === 'private-catalog' ? 'private on-device' : 'public'}
            {selectedProperties?.sourceUrl
              ? ` · Official source: ${selectedProperties.sourceUrl}`
              : ''}
          </Text>
          <Text>
            Geographic bounds: {selected.bounds.map((number) => number.toFixed(4)).join(', ')}
          </Text>
          {selected.properties.sourceId === 'private-ioverlander' ? (
            <View style={{ gap: 8 }}>
              <Text accessibilityRole="header" style={{ fontWeight: '700' }}>
                iOverlander community information
              </Text>
              <Text>
                {selectedProperties?.communityDescription || 'No community description provided.'}
              </Text>
              <Text>
                {selectedProperties?.communityCheckInCount ?? 0} community check-ins available
                {(selectedProperties?.communityCheckIns?.length ?? 0) <
                (selectedProperties?.communityCheckInCount ?? 0)
                  ? ` · showing the newest ${selectedProperties?.communityCheckIns?.length ?? 0}`
                  : ''}
              </Text>
              {(selectedProperties?.communityCheckIns ?? []).slice(0, 10).map((checkIn, index) => (
                <Text key={`${checkIn.occurredAt}-${index}`}>
                  {new Date(checkIn.occurredAt).toLocaleDateString()} ·{' '}
                  {checkIn.comment || 'No community note provided.'}
                </Text>
              ))}
              {(selectedProperties?.communityCheckIns?.length ?? 0) > 10 ? (
                <Text>Showing the 10 newest community check-ins.</Text>
              ) : null}
              <Text style={{ color: palette.muted }}>
                Contributor identities are not stored. Community information may be outdated; verify
                current conditions and access.
              </Text>
            </View>
          ) : null}
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="header" style={{ fontWeight: '700' }}>
              Your private check-ins and notes
            </Text>
            <TextInput
              accessibilityLabel={`Private note for ${selected.properties.name}`}
              accessibilityHint="Stored only in this app's protected user data"
              placeholder="Add a note for your next visit"
              placeholderTextColor={palette.muted}
              value={noteDraft}
              onChangeText={setNoteDraft}
              multiline
              maxLength={5_000}
              style={{
                color: palette.text,
                borderColor: palette.border,
                borderWidth: 1,
                borderRadius: 10,
                minHeight: 96,
                padding: 12,
                textAlignVertical: 'top',
              }}
            />
            <ProductButton
              label="Check in now and save note"
              hint="Save the current time and this note privately for the selected place"
              disabled={placeJournal === null}
              onPress={() => saveJournal(true)}
            />
            <ProductButton
              label="Save note without checking in"
              hint="Update your private place note without creating a check-in"
              disabled={
                placeJournal === null || noteDraft.trim() === (journalEntry?.note.trim() ?? '')
              }
              onPress={() => saveJournal(false)}
            />
            <Text accessibilityLiveRegion="polite">
              {placeJournal === null
                ? 'Private storage is not ready; map details remain available.'
                : journalStatus ||
                  `${journalEntry?.checkIns.length ?? 0} private check-ins saved on this device.`}
            </Text>
            {(journalEntry?.checkIns ?? []).slice(0, 5).map((checkIn) => (
              <Text key={checkIn.id}>
                Checked in {new Date(checkIn.occurredAt).toLocaleString()}
              </Text>
            ))}
            {(journalEntry?.checkIns.length ?? 0) > 5 ? (
              <Text>Showing your 5 newest check-ins.</Text>
            ) : null}
          </View>
          <ProductButton
            label="Clear map selection"
            hint="Remove the selected feature highlight"
            onPress={() => setSelected(null)}
          />
        </ProductCard>
      )}
      <Text>
        Basemap: {worldBasemapManifest.attribution}. Overlay: {mobileMapDataMetadata.attribution}.
        Geometry simplified for display. MapLibre Native renderer. Public-use GIS data is provided
        without warranty; boundaries are not legal surveys.
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

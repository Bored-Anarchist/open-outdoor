import { HikeCaptureControls, type HikeCaptureActions } from './HikeCaptureControls';

import { mapHikeRoute } from './mapHikeRoute';

import { HikeDetails } from './HikeDetails';

import { outdoorSourceUrl } from '@open-outdoor/shared/outdoor-details';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from 'react';

import {
  ActionSheetIOS,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

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
  campingLegend,
  createOutdoorPlaceCollection,
  createOutdoorPlaceLayerStyles,
  createOutdoorMapStyle,
  createTieredOfflineVectorBasemapStyle,
  regionalBasemapCoversViewport,
  nextOutdoorZoom,
  outdoorDirectionsCoordinateText,
  outdoorDirectionsDestination,
  outdoorDirectionsUrl,
  outdoorMarkerDensityConfig,
  searchOutdoorFeatureIndex,
  segmentedTrack,
  mergeStateSummaries,
  bundledFeaturesForStatePackages,
  statePackageMapStyle,
  withStatePackageLayers,
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

import { layers as protomapsLayers, namedFlavor } from '@protomaps/basemaps';

import { ProductText as Text } from './accessibility';

import {
  ProductButton,
  ProductCard,
  ProductDisclosure,
  ProductIconButton,
  ProductRow,
  OriginBadge,
  usePalette,
} from './ProductComponents';
import { ProductSheet } from './ProductSheet';
import { PlaceNote } from './PlaceNote';

import worldOverviewAsset from '../../packages/map/src/assets/world-overview-z6.pmtiles';

import regionalOverviewAsset from '../../packages/map/src/assets/us-canada-territories-z7-z9.pmtiles';

import worldBasemapManifest from '../../packages/map/src/assets/world-basemap.manifest.json';

import regionalBasemapManifest from '../../packages/map/src/assets/us-canada-basemap.manifest.json';

import offlineFontAsset from '../../packages/map/src/assets/NotoSans-Variable.ttf';

import {
  mobileMapDataAsset as outdoorDataAsset,
  mobileMapDataIndex as bundledIndex,
  mobileMapDataMetadata,
  mobileHikeData as bundledHikes,
} from '@open-outdoor/mobile-map-data';

import type { PlaceJournalService } from './application';

import type { ImportedMapDatasetsService } from './useImportedMapDatasets';
import type { StatePackagesService } from './useStatePackages';
import { useStatePackagePlaces, type StatePlaceViewport } from './useStatePackagePlaces';
import { useMapCameraSync } from './useMapCameraSync';

const bundledFeatureIndex = bundledIndex as unknown as OutdoorFeatureIndex;

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
    <View style={{ flex: 1, minWidth: 130 }}>
      <Pressable
        accessibilityLabel={label}

        accessibilityHint={`Current selection: ${selected.label}. Opens the selection menu.`}

        accessibilityRole="button"

        accessibilityState={{ expanded }}

        onPress={onToggle}

        style={({ pressed }) => ({
          minHeight: 56,

          borderWidth: 1,

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
            marginTop: 8,

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
        <Text style={{ color: palette.surface, fontSize: 12, fontWeight: '800' }}>{symbol}</Text>
      </View>

      <Text style={{ color: palette.text, fontSize: 14 }}>{label}</Text>
    </View>
  );
}

export function OutdoorMap({
  adapter,

  placeJournal,

  imports,

  capture,

  section,
  query,
  onQueryChange,
  placeFilter,
  onPlaceFilterChange: setPlaceFilter,
  statePackages,
  coverage,
  onCoverageShown,
  onOpenSettings,
  onOpenMaps,
  onOpenSearch,
  onOpenExplore,
  visible,
}: {
  adapter: OutdoorMapAdapter;

  placeJournal: PlaceJournalService | null;

  imports: ImportedMapDatasetsService;

  capture: HikeCaptureActions;

  section: 'explore' | 'search';
  query: string;
  onQueryChange: (value: string) => void;
  placeFilter: OutdoorPlaceFilter;
  onPlaceFilterChange: (value: OutdoorPlaceFilter) => void;
  statePackages: StatePackagesService;
  coverage: [number, number, number, number] | null;
  onCoverageShown: () => void;
  onOpenMaps: () => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onOpenExplore: () => void;
  visible: boolean;
}) {
  const state = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);

  const camera = useRef<CameraRef>(null);

  const mapView = useRef<MapRef>(null);

  const placeSource = useRef<GeoJSONSourceRef>(null);

  const palette = usePalette();

  const [legendOpen, setLegendOpen] = useState(false);
  const [toolbarHeight, setToolbarHeight] = useState(112);
  const offlineCartography = useMemo(
    () =>
      protomapsLayers(
        'offline-basemap',
        {
          ...namedFlavor(
            palette.background === '#f5f4ec'
              ? 'light'
              : palette.background === '#000000'
                ? 'black'
                : 'dark',
          ),
          background: palette.land,
          earth: palette.land,
          water: palette.water,
          park_a: palette.land,
          park_b: palette.selected,
          wood_a: palette.land,
          wood_b: palette.selected,
          roads_label_minor: palette.text,
          roads_label_minor_halo: palette.land,
          roads_label_major: palette.text,
          roads_label_major_halo: palette.land,
          ocean_label: palette.muted,
          city_label: palette.text,
          city_label_halo: palette.land,
          subplace_label: palette.text,
          subplace_label_halo: palette.land,
          state_label: palette.text,
          state_label_halo: palette.land,
          country_label: palette.text,
        },
        { lang: 'en' },
      ) as unknown as OutdoorBaseMapStyle['layers'],
    [palette],
  );
  const [toolsOpen, setToolsOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const { width, height, fontScale } = useWindowDimensions();
  const [viewport, setViewport] = useState<StatePlaceViewport | null>(null);
  const statePlaces = useStatePackagePlaces(statePackages.packages, viewport);
  const useRegionalDetail = regionalBasemapCoversViewport(
    viewport?.bounds ?? [
      state.camera.center[0] - 0.25,
      state.camera.center[1] - 0.25,
      state.camera.center[0] + 0.25,
      state.camera.center[1] + 0.25,
    ],
    viewport?.zoom ?? state.camera.zoom,
  );
  const precisePlaces = useMemo(
    () =>
      mergeStateSummaries(
        statePlaces.features,
        statePackages.detail?.geometry?.type === 'Point' ? [statePackages.detail.summary] : [],
      ),
    [statePlaces.features, statePackages.detail],
  );
  const bundledFeatures = useMemo(
    () => bundledFeaturesForStatePackages(bundledFeatureIndex.features, statePackages.packages),
    [statePackages.packages],
  );
  const noCatalogs =
    statePackages.ready &&
    imports.ready &&
    bundledFeatureIndex.features.length === 0 &&
    statePackages.packages.length === 0 &&
    imports.datasets.length === 0;
  const excludedBundledIds = useMemo(() => {
    const included = new Set(bundledFeatures.map((feature) => feature.id));
    return bundledFeatureIndex.features
      .filter((feature) => !included.has(feature.id))
      .map((feature) => feature.id);
  }, [bundledFeatures]);
  const precisePlaceIds = useMemo(
    () => precisePlaces.map((feature) => feature.id),
    [precisePlaces],
  );
  const selectedState = useRef<{
    feature: OutdoorFeatureSummary;
    packages: typeof statePackages.packages;
  } | null>(null);
  const selectionRequest = useRef(0);
  useEffect(() => {
    selectionRequest.current++;
  }, [state.selectedFeatureId, statePackages.packages]);

  const featureIndex = useMemo<OutdoorFeatureIndex>(
    () => ({
      schemaVersion: 1,

      features: mergeStateSummaries(
        [
          ...bundledFeatures,

          ...imports.datasets

            .filter((dataset) => dataset.visible)

            .flatMap((dataset) => dataset.index.features),
        ],
        [
          ...statePlaces.features,
          ...statePackages.results,
          ...(statePackages.detail ? [statePackages.detail.summary] : []),
        ],
      ),
    }),

    [
      bundledFeatures,
      imports.datasets,
      statePlaces.features,
      statePackages.results,
      statePackages.detail,
    ],
  );

  const importedData = useMemo(
    () => ({
      type: 'FeatureCollection' as const,

      features: imports.datasets

        .filter((dataset) => dataset.visible)

        .flatMap((dataset) => dataset.collection.features)

        .map((feature) => ({
          ...feature,

          properties: {
            id: feature.id,

            kind: feature.properties.kind,

            name: feature.properties.name,

            category: feature.properties.category,
          },
        })),
    }),

    [imports.datasets],
  );

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
  const stateMap = useMemo(
    () =>
      statePackageMapStyle(
        statePackages.packages,
        placeFilter,
        state.selectedFeatureId,
        markerDensity,
        precisePlaceIds,
      ),
    [statePackages.packages, placeFilter, state.selectedFeatureId, markerDensity, precisePlaceIds],
  );

  const mapStyle = useMemo(() => {
    if (!outdoorDataUri || !worldOverviewUri || !regionalOverviewUri || !offlineFontUri)
      return null;
    const base = createOutdoorMapStyle(
      outdoorDataUri,
      createTieredOfflineVectorBasemapStyle({
        worldArchiveUri: worldOverviewUri,
        regionalArchiveUri: regionalOverviewUri,
        fontUri: offlineFontUri,
        sourceLayers: offlineCartography,
        worldMaximumZoom: worldBasemapManifest.maximumZoom,
        regionalMinimumZoom: regionalBasemapManifest.minimumZoom,
        regionalMaximumZoom: regionalBasemapManifest.maximumZoom,
        useRegionalDetail,
      }),
      { includePlaces: false, excludedFeatureIds: excludedBundledIds },
    );
    return withStatePackageLayers(base, stateMap) as unknown as StyleSpecification;
  }, [
    offlineFontUri,
    outdoorDataUri,
    regionalOverviewUri,
    worldOverviewUri,
    stateMap,
    excludedBundledIds,
    useRegionalDetail,
    offlineCartography,
  ]);

  const [showSourceDetails, setShowSourceDetails] = useState(false);
  const firstMapLabelId = mapStyle?.layers.find((layer) => layer.type === 'symbol')?.id;

  const [sourceLinkStatus, setSourceLinkStatus] = useState('');

  const selected =
    featureIndex.features.find((feature) => feature.id === state.selectedFeatureId) ??
    (selectedState.current?.feature.id === state.selectedFeatureId &&
    selectedState.current.packages === statePackages.packages
      ? selectedState.current.feature
      : null);

  const selectedHike = useMemo(
    () =>
      mapHikeRoute(
        selected,
        imports.datasets,
        statePackages.detail,
        bundledHikes,
        mobileMapDataMetadata.sha256,
      ),
    [selected, imports.datasets, statePackages.detail],
  );

  const [selectedHikeSample, setSelectedHikeSample] = useState<number | null>(null);

  const [graphic, setGraphic] = useState<'planned' | 'recorded'>('planned');

  const [capturedSample, setCapturedSample] = useState<number | null>(null);

  const captured = capture.view;

  useEffect(() => {
    setCapturedSample(null);

    if (captured) setGraphic('recorded');
  }, [captured?.id]);

  const capturedProfilePoint =
    capturedSample === null ? undefined : captured?.display.route?.samples[capturedSample];

  const capturedProfileMarker = {
    type: 'FeatureCollection' as const,

    features:
      capturedProfilePoint && graphic === 'recorded'
        ? [
            {
              type: 'Feature' as const,

              properties: {},

              geometry: {
                type: 'Point' as const,

                coordinates: [capturedProfilePoint[2], capturedProfilePoint[3]],
              },
            },
          ]
        : [],
  };

  function showCapturedPath(): void {
    const bounds = captured?.display.bounds;

    if (!bounds) return;

    setFollowUser(false);

    if (bounds[0] === bounds[2] && bounds[1] === bounds[3])
      camera.current?.jumpTo({ center: [bounds[0], bounds[1]], zoom: 14 });
    else
      camera.current?.fitBounds([...bounds], {
        padding: { top: 35, right: 35, bottom: 35, left: 35 },

        duration: 0,
      });
  }

  const capturePlan = captured?.plannedFeatureId
    ? featureIndex.features.find((feature) => feature.id === captured.plannedFeatureId)
    : null;

  const hikeMarkers = useMemo(
    () => ({
      type: 'FeatureCollection' as const,

      features: selectedHike
        ? [
            {
              type: 'Feature' as const,

              properties: { label: 'Mapped start', color: '#176b42' },

              geometry: { type: 'Point' as const, coordinates: [...selectedHike.start] },
            },

            ...(!selectedHike.closedLoop
              ? [
                  {
                    type: 'Feature' as const,

                    properties: { label: 'Mapped end', color: palette.route },

                    geometry: { type: 'Point' as const, coordinates: [...selectedHike.end] },
                  },
                ]
              : []),

            ...((!captured || graphic === 'planned') &&
            selectedHikeSample !== null &&
            selectedHike.samples[selectedHikeSample]
              ? [
                  {
                    type: 'Feature' as const,

                    properties: { label: 'Profile point', color: '#174cbd' },

                    geometry: {
                      type: 'Point' as const,

                      coordinates: [
                        selectedHike.samples[selectedHikeSample]![2],

                        selectedHike.samples[selectedHikeSample]![3],
                      ],
                    },
                  },
                ]
              : []),
          ]
        : [],
    }),

    [selectedHike, selectedHikeSample, captured?.id, graphic, palette.route],
  );

  const selectedProperties = selected?.properties;

  const selectedSourceUrl = outdoorSourceUrl(selectedProperties?.sourceUrl);

  useEffect(() => {
    setShowSourceDetails(false);

    setSourceLinkStatus('');

    setSelectedHikeSample(null);
  }, [selected?.id]);

  useEffect(() => {
    if (state.selectedFeatureId === null || selected !== null || !statePackages.ready) return;
    let cancelled = false;
    void statePackages.select(state.selectedFeatureId).then((summary) => {
      if (cancelled) return;
      if (summary) {
        selectedState.current = { feature: summary, packages: statePackages.packages };
        adapter.setSelectedFeature(summary.id);
      } else if (imports.ready) adapter.setSelectedFeature(null);
    });
    return () => {
      cancelled = true;
    };
  }, [
    adapter,
    selected,
    state.selectedFeatureId,
    statePackages.ready,
    statePackages.packages,
    imports.ready,
  ]);

  const setSelected = (feature: OutdoorFeatureSummary | null) => {
    selectionRequest.current++;
    if (!feature) {
      selectedState.current = null;
      statePackages.clearSelection();
    }
    setDetailOpen(false);
    setNoteOpen(false);
    adapter.setSelectedFeature(feature?.id ?? null);
  };

  const [loaded, setLoaded] = useState(false);

  const [failed, setFailed] = useState(false);

  const [followUser, setFollowUser] = useState(false);

  const [zoom, setZoom] = useState(state.camera.zoom);

  useEffect(() => {
    if (!loaded || !coverage) return;
    setFollowUser(false);
    if (coverage[0] === coverage[2] && coverage[1] === coverage[3])
      camera.current?.jumpTo({ center: [coverage[0], coverage[1]], zoom: 14 });
    else
      camera.current?.fitBounds(coverage, {
        padding: { top: 25, right: 25, bottom: 25, left: 25 },
        duration: 0,
      });
    onCoverageShown();
  }, [loaded, coverage, onCoverageShown]);

  const [directionsStatus, setDirectionsStatus] = useState('');

  const placeData = useMemo(
    () =>
      createOutdoorPlaceCollection(
        {
          schemaVersion: 1,
          features: mergeStateSummaries(
            [
              ...bundledFeatures,
              ...imports.datasets
                .filter((entry) => entry.visible)
                .flatMap((entry) => entry.index.features),
            ],
            precisePlaces,
          ),
        },
        placeFilter,
      ),

    [bundledFeatures, imports.datasets, placeFilter, precisePlaces],
  );

  const placeLayers = useMemo(() => createOutdoorPlaceLayerStyles(markerDensity), [markerDensity]);

  const densityConfig = outdoorMarkerDensityConfig[markerDensity];

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

  const results = useMemo(
    () =>
      mergeStateSummaries(
        searchOutdoorFeatureIndex(featureIndex, query, 30, placeFilter),
        statePackages.results,
      ).slice(0, 30),

    [featureIndex, query, placeFilter, statePackages.results],
  );

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

  useMapCameraSync(camera, state.camera, followUser);

  useEffect(() => {
    setLoaded(false);

    setFailed(false);
  }, [regionalOverviewUri]);

  useEffect(() => {
    setDirectionsStatus('');
  }, [selected?.id]);

  function select(feature: OutdoorFeatureSummary) {
    setFollowUser(false);
    if (
      statePlaces.features.some((entry) => entry.id === feature.id) ||
      statePackages.results.some((entry) => entry.id === feature.id) ||
      statePackages.detail?.summary.id === feature.id
    )
      selectedState.current = { feature, packages: statePackages.packages };
    if (statePackages.ready) void statePackages.select(feature.id);
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

  async function shareDirectionsDestination(): Promise<void> {
    if (!selected || selected.properties.navigationAllowed === false) return;

    const destination = selectedHike
      ? { name: `${selected.properties.name} mapped start`, coordinate: selectedHike.start }
      : outdoorDirectionsDestination(selected);

    const coordinate = outdoorDirectionsCoordinateText(destination);

    try {
      await Share.share({
        title: `Directions to ${destination.name}`,

        message: `${destination.name}\n${coordinate}\n${outdoorDirectionsUrl('apple', destination)}`,
      });

      setDirectionsStatus('Coordinates opened in the system share sheet.');
    } catch (error) {
      setDirectionsStatus(
        `Could not share coordinates: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function openDirectionUrl(label: string, url: string): Promise<void> {
    try {
      await Linking.openURL(url);

      setDirectionsStatus(`Opening ${label} with the selected destination.`);
    } catch (error) {
      setDirectionsStatus(
        `Could not open ${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function chooseDirectionsApp(): Promise<void> {
    if (!selected || selected.properties.navigationAllowed === false) return;

    const destination = selectedHike
      ? { name: `${selected.properties.name} mapped start`, coordinate: selectedHike.start }
      : outdoorDirectionsDestination(selected);

    const coordinate = outdoorDirectionsCoordinateText(destination);

    setDirectionsStatus('Checking available map apps…');

    if (Platform.OS !== 'ios') {
      await openDirectionUrl('your map app', outdoorDirectionsUrl('generic', destination));

      return;
    }

    const [hasGoogleMaps, hasWaze] = await Promise.all([
      Linking.canOpenURL('comgooglemaps://').catch(() => false),

      Linking.canOpenURL('waze://').catch(() => false),
    ]);

    const mapApps = [
      {
        label: 'Apple Maps',

        url: outdoorDirectionsUrl('apple', destination),
      },

      ...(hasGoogleMaps
        ? [{ label: 'Google Maps', url: outdoorDirectionsUrl('google', destination) }]
        : []),

      ...(hasWaze ? [{ label: 'Waze', url: outdoorDirectionsUrl('waze', destination) }] : []),
    ];

    const shareLabel = 'Other app or share coordinates';

    const options = [...mapApps.map((app) => app.label), shareLabel, 'Cancel'];

    const shareButtonIndex = mapApps.length;

    const cancelButtonIndex = options.length - 1;

    setDirectionsStatus(`${mapApps.length} map app${mapApps.length === 1 ? '' : 's'} available.`);

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `Directions to ${destination.name}`,

        message: coordinate,

        options,

        cancelButtonIndex,
      },

      (buttonIndex) => {
        if (buttonIndex < mapApps.length) {
          const app = mapApps[buttonIndex]!;

          void openDirectionUrl(app.label, app.url);
        } else if (buttonIndex === shareButtonIndex) {
          void shareDirectionsDestination();
        }
      },
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {section === 'search' ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 22,
            paddingTop: 8,
            paddingBottom: 32,
            gap: 16,
          }}
        >
          <TextInput
            accessibilityLabel="Search lands, trails, campsites and imported features"
            placeholder="Find a place"
            placeholderTextColor={palette.muted}
            value={query}
            onChangeText={onQueryChange}
            style={{
              color: palette.text,
              backgroundColor: palette.surface,
              minHeight: 52,
              padding: 14,
              borderWidth: 1,
              borderColor: palette.border,
              borderRadius: 14,
              fontSize: 17,
            }}
          />
          <ProductButton
            label={
              placeFilterOptions.find((item) => item.value === placeFilter)?.label ?? 'All places'
            }
            hint="Choose categories for results and map"
            onPress={() => setToolsOpen(true)}
          />
          {noCatalogs ? (
            <View style={{ paddingVertical: 24, gap: 16 }}>
              <Text>Add a map to search places.</Text>
              <ProductButton
                label="Add a map"
                hint="Open Maps to install a state package or import private data"
                primary
                onPress={onOpenMaps}
              />
            </View>
          ) : null}
          {query.trim() ? (
            <Text accessibilityLiveRegion="polite" style={{ color: palette.muted, fontSize: 14 }}>
              {results.length}
              {results.length === 30 ? '+' : ''} results
            </Text>
          ) : null}
          {results.slice(0, 30).map((feature) => (
            <ProductRow
              key={feature.id}
              title={feature.properties.name}
              subtitle={`${feature.properties.kind} · ${feature.properties.origin === 'private-catalog' ? 'Private' : 'Public'}`}
              icon={feature.properties.kind === 'trail' ? 'explore' : 'saved'}
              onPress={() => {
                select(feature);
                onOpenExplore();
              }}
            />
          ))}
          {!noCatalogs && query.trim() && results.length === 0 ? (
            <View style={{ paddingVertical: 32, gap: 16 }}>
              <Text style={{ fontSize: 23 }}>No matches</Text>
              <Text>Try another name or category.</Text>
              <ProductButton
                label="Clear filters"
                hint="Show all categories"
                onPress={() => {
                  setPlaceFilter('all');
                  onQueryChange('');
                }}
              />
            </View>
          ) : null}
        </ScrollView>
      ) : null}
      <View
        style={{ flex: 1, display: section === 'explore' ? 'flex' : 'none', overflow: 'hidden' }}
      >
        {mapStyle ? (
          <>
            <NativeMap
              key={regionalOverviewUri}

              ref={mapView}

              style={{ flex: 1 }}

              mapStyle={mapStyle}

              attribution
              attributionPosition={{ top: toolbarHeight + 16, left: 16 }}

              logo={false}

              onDidFinishRenderingMapFully={() => setLoaded(true)}

              onDidFailLoadingMap={() => setFailed(true)}

              onPress={(event) => {
                const request = ++selectionRequest.current;
                void mapView.current

                  ?.queryRenderedFeatures(event.nativeEvent.point, {
                    layers: [
                      ...stateMap.selectionLayers,
                      'imported-area',
                      'imported-line',
                      'dec-land',
                      'dec-road',
                      'dec-trail',
                    ],
                  })

                  .then((features) => {
                    if (request !== selectionRequest.current) return;
                    const id = features.find((feature) => feature.properties?.kind !== 'boundary')
                      ?.properties?.id;

                    const feature = featureIndex.features.find((candidate) => candidate.id === id);

                    if (feature) select(feature);
                    else if (typeof id === 'string' && statePackages.ready)
                      void statePackages.select(id).then((summary) => {
                        if (summary && request === selectionRequest.current) {
                          selectedState.current = {
                            feature: summary,
                            packages: statePackages.packages,
                          };
                          setSelected(summary);
                        }
                      });
                  })

                  .catch(() => undefined);
              }}

              onRegionDidChange={(event) => {
                const [x, y] = event.nativeEvent.center;

                setZoom(event.nativeEvent.zoom);
                setViewport({
                  bounds: [...event.nativeEvent.bounds],
                  zoom: event.nativeEvent.zoom,
                });

                adapter.moveCamera({ center: [x, y], zoom: event.nativeEvent.zoom });
              }}
            >
              <Camera
                ref={camera}

                initialViewState={{ center: [...state.camera.center], zoom: state.camera.zoom }}

                trackUserLocation={followUser && visible ? 'default' : undefined}

                onTrackUserLocationChange={(event) =>
                  setFollowUser(event.nativeEvent.trackUserLocation !== null)
                }
              />

              {visible && section === 'explore' ? <NativeUserLocation mode="default" /> : null}

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
                    const request = ++selectionRequest.current;
                    void placeSource.current

                      ?.getClusterExpansionZoom(Number(properties.cluster_id))

                      .then((expansionZoom) => {
                        if (request !== selectionRequest.current) return;
                        setFollowUser(false);

                        camera.current?.jumpTo({
                          center:
                            rendered?.geometry.type === 'Point'
                              ? ([...rendered.geometry.coordinates] as [number, number])
                              : [...event.nativeEvent.lngLat],

                          zoom: Math.min(18, expansionZoom),
                        });
                      })

                      .catch(() => {
                        if (request === selectionRequest.current) changeZoom('in');
                      });

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

              <GeoJSONSource id="imported-datasets" data={importedData}>
                <Layer
                  id="imported-area"
                  beforeId={firstMapLabelId}

                  type="fill"

                  filter={['==', ['geometry-type'], 'Polygon']}

                  paint={{ 'fill-color': '#8060b0', 'fill-opacity': 0.3 }}
                />

                <Layer
                  id="imported-line"
                  beforeId={firstMapLabelId}

                  type="line"

                  filter={['!=', ['geometry-type'], 'Point']}

                  paint={{ 'line-color': '#7251a4', 'line-width': 3 }}
                />

                <Layer
                  id="imported-selection-outline"

                  type="line"

                  filter={['==', ['get', 'id'], selected?.id ?? '__none__']}

                  paint={{ 'line-color': palette.route, 'line-width': 5, 'line-dasharray': [2, 1] }}
                />

                <Layer
                  id="imported-selection-point"

                  type="circle"

                  filter={[
                    'all',
                    ['==', ['geometry-type'], 'Point'],
                    ['==', ['get', 'id'], selected?.id ?? '__none__'],
                  ]}

                  paint={{
                    'circle-color': palette.route,

                    'circle-radius': 13,

                    'circle-stroke-color': palette.surface,

                    'circle-stroke-width': 3,
                  }}
                />
              </GeoJSONSource>

              <Layer
                id="selection-outline"

                type="line"

                source="outdoors"

                filter={[
                  'all',
                  ['!=', ['geometry-type'], 'Point'],
                  ['!', ['in', ['get', 'id'], ['literal', excludedBundledIds]]],
                  ['==', ['get', 'id'], selected?.id ?? '__none__'],
                ]}

                paint={{ 'line-color': palette.route, 'line-width': 5, 'line-dasharray': [2, 1] }}
              />

              <GeoJSONSource id="hike-markers" data={hikeMarkers}>
                <Layer
                  id="hike-endpoints"

                  type="circle"

                  paint={{
                    'circle-color': ['get', 'color'],

                    'circle-radius': 7,

                    'circle-stroke-color': palette.surface,

                    'circle-stroke-width': 2,
                  }}
                />

                <Layer
                  id="hike-endpoint-labels"

                  type="symbol"

                  layout={{
                    'text-field': ['get', 'label'],

                    'text-font': ['Open Outdoor Noto Sans'],

                    'text-size': 12,

                    'text-offset': [0, 1.5],
                  }}

                  paint={{
                    'text-color': palette.text,

                    'text-halo-color': palette.surface,

                    'text-halo-width': 2,
                  }}
                />
              </GeoJSONSource>

              <Layer
                id="selection-point"

                type="circle"

                source="outdoors"

                filter={[
                  'all',
                  ['==', ['geometry-type'], 'Point'],
                  ['!', ['in', ['get', 'id'], ['literal', excludedBundledIds]]],
                  ['==', ['get', 'id'], selected?.id ?? '__none__'],
                ]}

                paint={{
                  'circle-color': palette.route,

                  'circle-radius': 13,

                  'circle-stroke-color': palette.surface,

                  'circle-stroke-width': 3,
                }}
              />

              <GeoJSONSource
                id="precise-place-selection"
                data={{
                  type: 'FeatureCollection',
                  features: placeData.features.filter((feature) => feature.id === selected?.id),
                }}
              >
                <Layer
                  id="precise-place-highlight"
                  type="circle"
                  paint={{
                    'circle-color': palette.route,
                    'circle-radius': 13,
                    'circle-stroke-color': palette.surface,
                    'circle-stroke-width': 3,
                  }}
                />
              </GeoJSONSource>

              <GeoJSONSource id="recorded-track" data={track}>
                <Layer
                  id="recorded-line"

                  type="line"

                  paint={{ 'line-color': palette.accent, 'line-width': 4 }}
                />
              </GeoJSONSource>

              <GeoJSONSource id="captured-profile-point" data={capturedProfileMarker}>
                <Layer
                  id="captured-profile-marker"

                  type="circle"

                  paint={{
                    'circle-color': palette.accent,

                    'circle-radius': 10,

                    'circle-stroke-width': 3,

                    'circle-stroke-color': palette.surface,
                  }}
                />
              </GeoJSONSource>

              <GeoJSONSource id="recorded-position" data={point}>
                <Layer
                  id="last-recorded"

                  type="circle"

                  paint={{
                    'circle-color': palette.accent,

                    'circle-radius': 6,

                    'circle-stroke-width': 2,

                    'circle-stroke-color': palette.surface,
                  }}
                />
              </GeoJSONSource>
            </NativeMap>

            <View
              pointerEvents="box-none"

              style={{ position: 'absolute', right: 16, top: toolbarHeight + 16, gap: 8 }}
            >
              <ProductIconButton
                label={followUser ? 'Stop following my location' : 'Center on my location'}
                icon="location"
                selected={followUser}
                onPress={() => setFollowUser(!followUser)}
              />
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
          </>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text>
              {assetError ? 'Stored map overlay could not load.' : 'Preparing map layers…'}
            </Text>
          </View>
        )}
      </View>

      {section === 'explore' ? (
        <>
          <View
            pointerEvents="box-none"
            style={{ position: 'absolute', left: 16, right: 16, top: 8, gap: 8 }}
            onLayout={(event) => setToolbarHeight(event.nativeEvent.layout.height)}
          >
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <ProductButton
                  label="Find a place"
                  hint="Search installed maps"
                  icon="search"
                  onPress={onOpenSearch}
                />
              </View>
              <ProductIconButton label="Settings" icon="settings" onPress={onOpenSettings} />
            </View>
            {fontScale > 1.4 || width < 360 ? (
              <ProductButton
                label="Map tools"
                hint="Categories, layers and marker detail"
                onPress={() => setToolsOpen(true)}
              />
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <ProductButton
                  label={placeFilter === 'all' ? 'All places' : 'Categories'}
                  hint="Choose which places appear on the map"
                  onPress={() => {
                    setOpenMenu('places');
                    setToolsOpen(true);
                  }}
                />
                <ProductButton
                  label="Layers"
                  hint="Show or hide installed public packages and private data"
                  onPress={onOpenMaps}
                />
                <ProductButton
                  label="Detail"
                  hint="Change marker density"
                  onPress={() => {
                    setOpenMenu('density');
                    setToolsOpen(true);
                  }}
                />
              </View>
            )}
          </View>
          <View
            style={{
              position: 'absolute',
              bottom: 12,
              left: 16,
              right: width >= 800 ? width * 0.56 : 16,
              maxHeight: height * 0.5,
              borderRadius: 26,
              backgroundColor: palette.surface,
              borderWidth: palette.background === '#000000' ? 1 : 0,
              borderColor: palette.border,
            }}
          >
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              {failed || assetError || !loaded ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={{
                    color: failed || assetError ? palette.danger : palette.muted,
                    fontSize: 14,
                  }}
                >
                  {failed || assetError
                    ? 'Map could not render. Search remains available.'
                    : 'Loading map…'}
                </Text>
              ) : null}
              {statePlaces.error || statePlaces.limited ? (
                <Text accessibilityLiveRegion="polite" style={{ fontSize: 14 }}>
                  {statePlaces.error || 'Zoom in for more places.'}
                </Text>
              ) : null}
              {selected ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <OriginBadge origin={selected.properties.origin ?? 'unknown'} />
                    <View style={{ flex: 1 }} />
                    <ProductIconButton
                      label="Close place"
                      icon="close"
                      onPress={() => setSelected(null)}
                    />
                  </View>
                  <Text
                    accessibilityRole="header"
                    style={{
                      fontSize: 23,
                      fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                    }}
                  >
                    {selected.properties.name}
                  </Text>
                  <Text style={{ color: palette.caution, fontSize: 14 }}>
                    {selected.properties.publicUse || 'Access unknown'}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <ProductButton
                      label="Details"
                      hint="Read place information and source evidence"
                      primary
                      onPress={() => setDetailOpen(true)}
                    />
                    <ProductButton
                      label="Directions"
                      hint="Choose an installed maps app"
                      disabled={selected.properties.navigationAllowed === false}
                      onPress={chooseDirectionsApp}
                    />
                  </View>
                </>
              ) : captured ? (
                <ProductRow
                  title={captured.name}
                  subtitle={`${captured.state} · Private`}
                  icon="track"
                  onPress={() => setDetailOpen(true)}
                />
              ) : (
                <>
                  <Text
                    accessibilityRole="header"
                    style={{
                      fontSize: 23,
                      fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                    }}
                  >
                    {noCatalogs ? 'No maps added' : 'Explore this area'}
                  </Text>
                  {noCatalogs ? (
                    <ProductButton
                      label="Add a map"
                      hint="Open Maps to install a state package or import private data"
                      primary
                      onPress={onOpenMaps}
                    />
                  ) : null}
                  <ProductButton
                    label="Legend"
                    hint="Read map symbols and source-independent access warnings"
                    onPress={() => setLegendOpen(true)}
                  />
                </>
              )}
            </ScrollView>
          </View>
        </>
      ) : null}
      <ProductSheet
        title={selected?.properties.name ?? captured?.name ?? 'Hike'}
        visible={visible && detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        {selected && (
          <View style={{ gap: 16 }}>
            <OriginBadge origin={selected.properties.origin ?? 'unknown'} />
            <Text>
              {selected.properties.kind} ·{' '}
              {selected.properties.unit || selected.properties.category}
            </Text>

            {selectedHike && (!captured || graphic === 'planned') ? (
              <HikeDetails
                key={selected.id}

                route={selectedHike}

                selectedSample={selectedHikeSample}

                onSampleSelect={setSelectedHikeSample}

                onShowRoute={() => {
                  setFollowUser(false);

                  camera.current?.fitBounds(selected.bounds, {
                    padding: { top: 35, right: 35, bottom: 35, left: 35 },

                    duration: 0,
                  });
                }}
              />
            ) : null}

            <ProductDisclosure title="Place information">
              <Text accessibilityRole="header" style={{ fontWeight: '700' }}>
                {selectedProperties?.communityDescription ? 'Community description' : 'Description'}
              </Text>

              <Text>
                {selectedProperties?.communityDescription ||
                  selectedProperties?.description ||
                  'No description supplied by this dataset.'}
              </Text>

              {(
                [
                  ['amenities', 'Amenities and activities'],

                  ['openingHours', 'Opening hours'],

                  ['fees', 'Fees'],
                ] as const
              ).map(([field, label]) =>
                selectedProperties?.[field]?.length ? (
                  <View key={field} style={{ gap: 4 }}>
                    <Text accessibilityRole="header" style={{ fontWeight: '700' }}>
                      {label}
                    </Text>

                    {selectedProperties[field]!.map((entry, index) => (
                      <Text key={`${field}-${index}`}>{entry}</Text>
                    ))}
                  </View>
                ) : null,
              )}

              {selectedProperties?.directionsInfo ? (
                <View style={{ gap: 4 }}>
                  <Text accessibilityRole="header" style={{ fontWeight: '700' }}>
                    Getting there
                  </Text>

                  <Text>{selectedProperties.directionsInfo}</Text>
                </View>
              ) : null}
            </ProductDisclosure>
            <Text>
              Access note:{' '}
              {selectedProperties?.publicUse ||
                'Current access and camping status are unverified; check the managing agency.'}
            </Text>

            {selectedProperties?.dataAttribution ? (
              <Text>Data credit: {selectedProperties.dataAttribution}</Text>
            ) : null}

            {selectedProperties?.distributionConditions ? (
              <Text>{selectedProperties.distributionConditions}</Text>
            ) : null}

            {selectedSourceUrl ? (
              <ProductButton
                label={
                  selectedProperties?.origin === 'private-catalog'
                    ? 'Open dataset source'
                    : 'Open official source'
                }

                hint="Open the source website for current visitor information"

                onPress={() => {
                  setSourceLinkStatus('');

                  void Linking.openURL(selectedSourceUrl).catch(() =>
                    setSourceLinkStatus(
                      'Could not open the source website. Check your connection or browser.',
                    ),
                  );
                }}
              />
            ) : null}

            {sourceLinkStatus ? (
              <Text accessibilityLiveRegion="polite">{sourceLinkStatus}</Text>
            ) : null}

            <Text style={{ color: palette.muted }}>
              Source update: {selected.properties.sourceUpdated}. Hours, fees and access may change.
            </Text>

            <ProductButton
              label={showSourceDetails ? 'Hide sources' : 'Source details'}

              hint="Show the dataset source, classification and geographic bounds"

              onPress={() => setShowSourceDetails(!showSourceDetails)}
            />

            {showSourceDetails ? (
              <View style={{ gap: 4 }}>
                <Text>Source: {selected.properties.sourceId}.</Text>

                <Text>
                  Catalog:{' '}
                  {selectedProperties?.origin === 'private-catalog'
                    ? 'private on-device'
                    : 'public'}
                  .
                </Text>

                {selectedSourceUrl ? <Text>Source website: {selectedSourceUrl}</Text> : null}

                <Text>
                  Geographic bounds: {selected.bounds.map((number) => number.toFixed(4)).join(', ')}
                  .
                </Text>
              </View>
            ) : null}

            <ProductButton
              label={'Directions'}

              hint="Choose an installed maps app to route to the selected destination"

              disabled={selected.properties.navigationAllowed === false}

              onPress={chooseDirectionsApp}
            />

            <Text style={{ color: palette.muted }}>
              Destination:{' '}
              {outdoorDirectionsCoordinateText(
                selectedHike
                  ? { name: selected.properties.name, coordinate: selectedHike.start }
                  : outdoorDirectionsDestination(selected),
              )}
              .
              {selectedHike
                ? 'Directions use the first mapped endpoint, which may not be a trailhead or accessible by road.'
                : 'Points use their exact coordinates; areas use the center of their mapped bounds.'}
            </Text>

            {directionsStatus ? (
              <Text accessibilityLiveRegion="polite">{directionsStatus}</Text>
            ) : null}

            <ProductDisclosure title="Community check-ins">
              {selected.properties.sourceId === 'private-ioverlander' ||
              (selectedProperties?.communityCheckIns?.length ?? 0) > 0 ? (
                <View style={{ gap: 8 }}>
                  <Text accessibilityRole="header" style={{ fontWeight: '700' }}>
                    {selected.properties.sourceId === 'private-ioverlander'
                      ? 'iOverlander community information'
                      : 'Imported community check-ins'}
                  </Text>

                  <Text>
                    {selectedProperties?.communityCheckInCount ?? 0} community check-ins available
                    {(selectedProperties?.communityCheckIns?.length ?? 0) <
                    (selectedProperties?.communityCheckInCount ?? 0)
                      ? ` · showing the newest ${selectedProperties?.communityCheckIns?.length ?? 0}`
                      : ''}
                  </Text>

                  {(selectedProperties?.communityCheckIns ?? [])
                    .slice(0, 10)
                    .map((checkIn, index) => (
                      <Text key={`${checkIn.occurredAt}-${index}`}>
                        {new Date(checkIn.occurredAt).toLocaleDateString()} ·{' '}
                        {checkIn.comment || 'No community note provided.'}
                      </Text>
                    ))}

                  {(selectedProperties?.communityCheckIns?.length ?? 0) > 10 ? (
                    <Text>Showing the 10 newest community check-ins.</Text>
                  ) : null}

                  <Text style={{ color: palette.muted }}>
                    Contributor identities are not stored. Community information may be outdated;
                    verify current conditions and access.
                  </Text>
                </View>
              ) : null}
            </ProductDisclosure>
            <ProductRow
              title="My note"
              subtitle="Private on this device"
              icon="saved"
              onPress={() => {
                setDetailOpen(false);
                setNoteOpen(true);
              }}
            />
            <ProductButton
              label="Close place"

              hint="Remove the selected feature highlight"

              onPress={() => setSelected(null)}
            />
          </View>
        )}

        {selectedHike || captured || capture.state !== 'idle' ? (
          <ProductCard title="Hike">
            <HikeCaptureControls
              capture={{
                ...capture,
                onFinish: async () => {
                  setDetailOpen(false);
                  return capture.onFinish();
                },
              }}

              plan={
                selectedHike && selected
                  ? { id: selected.id, name: selected.properties.name }
                  : undefined
              }
            />

            {captured ? (
              <>
                <Text style={{ fontWeight: '700' }}>
                  {captured.name} · {captured.state} · private on-device
                </Text>

                <Text>Solid: recorded. Dashed: planned. GPS: {captured.display.gpsQuality}.</Text>

                <Text>
                  Elevation source:{' '}
                  {captured.display.elevationConfidence === 'barometer-fused'
                    ? 'Filtered barometer, with GPS calibration where available'
                    : captured.display.elevationConfidence === 'gps'
                      ? 'Filtered GPS (lower confidence)'
                      : 'Waiting for usable elevations'}
                  .
                </Text>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <ProductButton
                    label="Recorded"

                    hint="Show your captured path statistics and sensor elevation chart"

                    selected={graphic === 'recorded'}

                    onPress={() => setGraphic('recorded')}
                  />

                  <ProductButton
                    label="Planned"

                    hint="Restore the associated expected path and its terrain profile"

                    selected={graphic === 'planned'}

                    disabled={captured.plannedFeatureId ? !capturePlan : !selectedHike}

                    onPress={() => {
                      if (capturePlan) adapter.setSelectedFeature(capturePlan.id);

                      setGraphic('planned');
                    }}
                  />
                </View>

                {captured.plannedFeatureId && !capturePlan ? (
                  <Text>
                    The associated expected path is unavailable here. Show or reimport its dataset
                    to compare it with this captured hike.
                  </Text>
                ) : null}

                {graphic === 'recorded' ? (
                  captured.display.route ? (
                    <HikeDetails
                      key={captured.id}

                      route={captured.display.route}

                      selectedSample={capturedSample}

                      onSampleSelect={setCapturedSample}

                      onShowRoute={showCapturedPath}

                      recordedSeconds={captured.display.recordedSeconds}

                      relativeElevation={captured.display.relativeElevation}
                    />
                  ) : (
                    <Text>
                      Waiting for the first usable captured position. Keep recording; the path and
                      profile will appear here.
                    </Text>
                  )
                ) : null}
              </>
            ) : null}
          </ProductCard>
        ) : null}
      </ProductSheet>
      <ProductSheet
        title="Place note"
        visible={visible && noteOpen && selected !== null}
        onClose={() => setNoteOpen(false)}
      >
        {selected ? (
          <PlaceNote
            place={{ id: selected.id, name: selected.properties.name }}
            service={placeJournal}
          />
        ) : null}
      </ProductSheet>
      <ProductSheet
        title="Map tools"
        visible={visible && toolsOpen}
        onClose={() => setToolsOpen(false)}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <ProductButton
            label="Zoom in"
            hint="Increase map detail"
            disabled={zoom >= 18}
            onPress={() => changeZoom('in')}
          />
          <ProductButton
            label="Zoom out"
            hint="See a wider area"
            disabled={zoom <= 3}
            onPress={() => changeZoom('out')}
          />
          <ProductButton
            label="My location"
            hint="Center the map on your live GPS position"
            selected={followUser}
            onPress={() => {
              setFollowUser(!followUser);
              setToolsOpen(false);
            }}
          />
        </View>
        <View
          style={{
            flexDirection: 'row',

            flexWrap: 'wrap',

            gap: 10,

            marginTop: 0,

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

        <ProductButton
          label="Layers"
          hint="Manage installed maps"
          onPress={() => {
            setToolsOpen(false);
            onOpenMaps();
          }}
        />
        <ProductButton
          label="Legend"
          hint="Read map symbols and camping status"
          onPress={() => {
            setToolsOpen(false);
            setLegendOpen(true);
          }}
        />
        <ProductButton
          label="Last recorded position"
          hint="Show the latest durable point without starting sensors"
          disabled={!last}
          onPress={() => {
            if (last) {
              setFollowUser(false);
              camera.current?.jumpTo({ center: [...last], zoom: 14 });
              setToolsOpen(false);
            }
          }}
        />
        <ProductButton
          label="Done"
          hint="Return to the map with these settings"
          primary
          onPress={() => setToolsOpen(false)}
        />
      </ProductSheet>
      <ProductSheet
        title="Legend"
        visible={visible && legendOpen}
        onClose={() => setLegendOpen(false)}
      >
        {legendOpen ? (
          <ProductCard title="Map legend">
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

            <Text>
              Dashed: planned route. Solid: recorded route. Blue GPS dot: your location. Ring: last
              recorded position.
            </Text>
            {campingLegend.map((entry) => (
              <Text key={entry.id}>
                {entry.label}: {entry.explanation}
              </Text>
            ))}
          </ProductCard>
        ) : null}
      </ProductSheet>
    </View>
  );
}

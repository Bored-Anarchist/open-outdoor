import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OutdoorMapAdapter, type OutdoorFeatureSummary } from '../src';
import { palettes } from '@open-outdoor/shared';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  jump: vi.fn(),
  fit: vi.fn(),
  expansion: vi.fn(),
  routeColor: '#ef7826',
}));
const fixture = vi.hoisted(() => ({
  point: {
    id: 'synthetic-point',
    bounds: [-74, 42, -74, 42],
    properties: {
      id: 'synthetic-point',
      kind: 'poi',
      name: 'Synthetic place',
      category: 'water',
      unit: 'Synthetic park',
      sourceId: 'synthetic',
      origin: 'public-catalog',
    },
  },
}));
const point = {
  id: 'synthetic-point',
  bounds: [-74, 42, -74, 42],
  properties: {
    id: 'synthetic-point',
    kind: 'poi',
    name: 'Synthetic place',
    category: 'water',
    unit: 'Synthetic park',
    sourceId: 'synthetic',
    origin: 'public-catalog',
  },
} as OutdoorFeatureSummary;
const trail = {
  ...point,
  id: 'synthetic-trail',
  properties: { ...point.properties, kind: 'trail', origin: 'private-catalog' },
} as OutdoorFeatureSummary;
vi.mock('@open-outdoor/mobile-map-data', () => ({
  mobileMapDataAsset: 1,
  mobileMapDataIndex: {
    schemaVersion: 1,
    features: [
      fixture.point,
      {
        ...fixture.point,
        id: 'synthetic-trail',
        properties: { ...fixture.point.properties, kind: 'trail', origin: 'private-catalog' },
      },
    ],
  },
  mobileMapDataMetadata: { sha256: 'synthetic', attribution: '' },
  mobileHikeData: {
    sourceSha256: 'synthetic',
    hikes: {
      'synthetic-trail': {
        start: [-74, 42],
        end: [-74.01, 42.01],
        closedLoop: false,
        samples: [],
        distanceM: 100,
        segmentCount: 1,
      },
    },
  },
}));
vi.mock('../src/assets/world-overview-z6.pmtiles', () => ({ default: 2 }));
vi.mock('../src/assets/us-canada-territories-z7-z9.pmtiles', () => ({ default: 3 }));
vi.mock('../src/assets/NotoSans-Variable.ttf', () => ({ default: 4 }));
vi.mock('../../../apps/mobile/node_modules/expo-asset/build/index.js', () => ({
  useAssets: () => [[1, 2, 3, 4].map((id) => ({ localUri: `file:///synthetic-${id}` })), undefined],
}));
vi.mock(
  '../../../apps/mobile/node_modules/@maplibre/maplibre-react-native/lib/module/index.js',
  () => ({
    Map: 'native-map',
    Camera: 'camera',
    GeoJSONSource: 'source',
    Layer: 'layer',
    NativeUserLocation: 'location',
  }),
);
vi.mock('../../../apps/mobile/node_modules/react-native', () => ({
  View: 'view',
  ScrollView: 'scroll',
  TextInput: 'input',
  Pressable: 'pressable',
  Platform: { OS: 'ios' },
  Alert: {},
  Linking: {},
  Share: {},
  ActionSheetIOS: {},
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
}));
vi.mock('../../../apps/mobile/accessibility', () => ({ ProductText: 'text' }));
vi.mock('../../../apps/mobile/ProductComponents', () => ({
  ProductButton: 'button',
  ProductCard: 'card',
  ProductDisclosure: 'disclosure',
  ProductRow: 'row',
  ProductIconButton: 'icon-button',
  OriginBadge: 'badge',
  usePalette: () => ({ ...palettes.light, route: mocks.routeColor }),
}));
vi.mock('../../../apps/mobile/ProductSheet', () => ({ ProductSheet: () => null }));
vi.mock('../../../apps/mobile/HikeDetails', () => ({ HikeDetails: () => null }));
vi.mock('../../../apps/mobile/PlaceNote', () => ({ PlaceNote: () => null }));
vi.mock('../../../apps/mobile/useStatePackagePlaces', () => ({
  useStatePackagePlaces: () => ({ features: [], limited: false, error: '' }),
}));
vi.mock('../../../apps/mobile/node_modules/@protomaps/basemaps/dist/esm/index.js', () => ({
  layers: () => [],
  namedFlavor: () => ({}),
}));
import { OutdoorMap } from '../../../apps/mobile/OutdoorMap';
let root: ReturnType<typeof create>;
let adapter: OutdoorMapAdapter;
let props: Parameters<typeof OutdoorMap>[0];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.routeColor = '#ef7826';
  adapter = new OutdoorMapAdapter();
  props = {
    adapter,
    section: 'explore',
    visible: true,
    query: '',
    onQueryChange: vi.fn(),
    placeFilter: 'all',
    onPlaceFilterChange: vi.fn(),
    placeJournal: null,
    imports: { ready: true, datasets: [] },
    statePackages: {
      ready: true,
      packages: [],
      results: [],
      detail: null,
      select: vi.fn(async () => null),
      clearSelection: vi.fn(),
    },
    capture: { state: 'idle', available: false, busy: false, view: null, status: '' },
    coverage: null,
    onCoverageShown: vi.fn(),
    onOpenMaps: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenSearch: vi.fn(),
    onOpenExplore: vi.fn(),
  } as unknown as Parameters<typeof OutdoorMap>[0];
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
});
async function mount() {
  await act(async () => {
    root = create(createElement(OutdoorMap, props), {
      createNodeMock: (element) => {
        if (element.type === 'native-map') return { queryRenderedFeatures: mocks.query };
        if (element.type === 'camera') return { jumpTo: mocks.jump, fitBounds: mocks.fit };
        if (element.type === 'source') return { getClusterExpansionZoom: mocks.expansion };
        return null;
      },
    });
  });
}
const places = () =>
  root.root.findAllByType('source').find((node) => node.props.id === 'outdoor-places')!;
async function selectPoint() {
  await act(async () =>
    places().props.onPress({ nativeEvent: { features: [{ properties: { id: point.id } }] } }),
  );
}
it('ignores an old map query after a different place is selected', async () => {
  let release!: (value: unknown[]) => void;
  mocks.query.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await mount();
  await act(async () =>
    root.root.findByType('native-map').props.onPress({ nativeEvent: { point: [1, 1] } }),
  );
  await selectPoint();
  await act(async () => release([{ properties: { id: 'old-place', kind: 'poi' } }]));
  expect(adapter.getSnapshot().selectedFeatureId).toBe(point.id);
  expect(props.statePackages.select).not.toHaveBeenCalledWith('old-place');
});
it('ignores an old state detail after a different place is selected', async () => {
  let release!: (value: OutdoorFeatureSummary) => void;
  mocks.query.mockResolvedValueOnce([{ properties: { id: 'old-place', kind: 'poi' } }]);
  vi.mocked(props.statePackages.select).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await mount();
  await act(async () =>
    root.root.findByType('native-map').props.onPress({ nativeEvent: { point: [1, 1] } }),
  );
  await selectPoint();
  await act(async () => release({ ...point, id: 'old-place' }));
  expect(adapter.getSnapshot().selectedFeatureId).toBe(point.id);
});
it('does not replay a delayed cluster expansion over a new place selection', async () => {
  let release!: (zoom: number) => void;
  mocks.expansion.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await mount();
  await act(async () =>
    places().props.onPress({
      nativeEvent: {
        features: [
          {
            properties: { point_count: 2, cluster_id: 1 },
            geometry: { type: 'Point', coordinates: [-75, 43] },
          },
        ],
      },
    }),
  );
  await selectPoint();
  await act(async () => release(12));
  expect(mocks.jump).toHaveBeenLastCalledWith({ center: [-74, 42], zoom: 15 });
});
it('updates trail end-marker color when appearance changes', async () => {
  await mount();
  await act(async () => adapter.setSelectedFeature(trail.id));
  const markers = () =>
    root.root.findAllByType('source').find((node) => node.props.id === 'hike-markers')!.props.data;
  expect(markers().features[1].properties.color).toBe('#ef7826');
  mocks.routeColor = '#ffa64d';
  await act(async () => root.update(createElement(OutdoorMap, props)));
  expect(markers().features[1].properties.color).toBe('#ffa64d');
});

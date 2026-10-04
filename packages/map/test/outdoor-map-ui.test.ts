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
vi.mock('../../../apps/mobile/ProductSheet', () => ({
  ProductSheet: (props: { visible: boolean; children: React.ReactNode }) =>
    createElement('sheet', props, props.visible ? props.children : null),
}));
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
    capture: {
      state: 'idle',
      available: false,
      busy: false,
      view: null,
      status: '',
      locationAccess: {
        permission: 'always',
        label: 'Location Settings',
        message: 'Location enabled for recording.',
        hint: 'Review location access',
        busy: false,
        request: vi.fn(),
      },
      onFinish: vi.fn(async () => null),
    },
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
it('does not send native pan and zoom events back as camera commands', async () => {
  await mount();
  mocks.jump.mockClear();
  for (let i = 0; i < 15; i++) {
    await act(async () =>
      root.root.findByType('native-map').props.onRegionDidChange({
        nativeEvent: { center: [-74 + i / 100, 42], zoom: 12 + i / 10, bounds: [-75, 41, -73, 43] },
      }),
    );
  }
  expect(mocks.jump).not.toHaveBeenCalled();
  expect(adapter.getSnapshot().camera.center).toEqual([-73.86, 42]);
  await act(async () => adapter.moveCamera({ center: [-72, 40], zoom: 9 }));
  expect(mocks.jump).toHaveBeenCalledExactlyOnceWith({ center: [-72, 40], zoom: 9 });
});

it('recreates the native surface after tab changes while retaining camera and selection', async () => {
  await mount();
  await selectPoint();
  await act(async () =>
    root.root.findByType('native-map').props.onRegionDidChange({
      nativeEvent: { center: [-74, 42], zoom: 15, bounds: [-75, 41, -73, 43] },
    }),
  );
  await act(async () => root.update(createElement(OutdoorMap, { ...props, visible: false })));
  expect(root.root.findAllByType('native-map')).toHaveLength(0);
  await act(async () => root.update(createElement(OutdoorMap, props)));
  expect(root.root.findAllByType('native-map')).toHaveLength(1);
  expect(root.root.findByType('camera').props.initialViewState).toEqual({
    center: [-74, 42],
    zoom: 15,
  });
  expect(adapter.getSnapshot().selectedFeatureId).toBe(point.id);
});

it('uses one sheet for tools, legend, details and notes, and clears it when leaving Explore', async () => {
  await mount();
  const sheet = () => root.root.findByType('sheet');
  await act(async () =>
    root.root
      .findAllByType('button')
      .find((node) => node.props.label === 'All places')!
      .props.onPress(),
  );
  expect(sheet().props.title).toBe('Map tools');
  await act(async () =>
    root.root
      .findAllByType('button')
      .find((node) => node.props.label === 'Legend')!
      .props.onPress(),
  );
  expect(sheet().props.title).toBe('Legend');
  expect(sheet().props.visible).toBe(true);
  expect(root.root.findAllByType('sheet')).toHaveLength(1);
  await act(async () => sheet().props.onClose());
  await selectPoint();
  await act(async () =>
    root.root
      .findAllByType('button')
      .find((node) => node.props.label === 'Details')!
      .props.onPress(),
  );
  expect(sheet().props.title).toBe(point.properties.name);
  await act(async () =>
    root.root
      .findAllByType('row')
      .find((node) => node.props.title === 'My note')!
      .props.onPress(),
  );
  expect(sheet().props.title).toBe('Place note');
  expect(sheet().props.visible).toBe(true);
  expect(root.root.findAllByType('sheet')).toHaveLength(1);
  await act(async () => root.update(createElement(OutdoorMap, { ...props, visible: false })));
  await act(async () => root.update(createElement(OutdoorMap, props)));
  expect(sheet().props.visible).toBe(false);
});

it('waits for the iOS sheet to dismiss before opening the finish review', async () => {
  props.capture = { ...props.capture, state: 'recording', available: true };
  await mount();
  await selectPoint();
  await act(async () =>
    root.root
      .findAllByType('button')
      .find((node) => node.props.label === 'Details')!
      .props.onPress(),
  );
  await act(async () =>
    root.root
      .findAllByType('button')
      .find((node) => node.props.label === 'Finish hike')!
      .props.onPress(),
  );
  const sheet = root.root.findByType('sheet');
  expect(sheet.props.visible).toBe(false);
  expect(props.capture.onFinish).not.toHaveBeenCalled();
  await act(async () => sheet.props.onDismiss());
  expect(props.capture.onFinish).toHaveBeenCalledOnce();
  await act(async () => sheet.props.onDismiss());
  expect(props.capture.onFinish).toHaveBeenCalledOnce();
});
it('reloads a failed map at its retained camera and clears the error after a full render', async () => {
  await mount();
  await act(async () =>
    root.root.findByType('native-map').props.onRegionDidChange({
      nativeEvent: { center: [-74, 42], zoom: 14, bounds: [-75, 41, -73, 43] },
    }),
  );
  const oldSurface = root.root.findByType('native-map');
  await act(async () => oldSurface.props.onDidFailLoadingMap());
  await act(async () =>
    root.root
      .findAllByType('button')
      .find((node) => node.props.label === 'Reload map')!
      .props.onPress(),
  );
  expect(root.root.findByType('native-map')).not.toBe(oldSurface);
  expect(root.root.findByType('camera').props.initialViewState).toEqual({
    center: [-74, 42],
    zoom: 14,
  });
  await act(async () => root.root.findByType('native-map').props.onDidFinishRenderingMapFully());
  expect(root.root.findAllByType('button').some((node) => node.props.label === 'Reload map')).toBe(
    false,
  );
});

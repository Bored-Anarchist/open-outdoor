import { act, create } from 'react-test-renderer';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { parseMapDataset } from '../src';
import type { StatePackagesService } from '../../../apps/mobile/useStatePackages';
import type { ImportedMapDatasetsService } from '../../../apps/mobile/useImportedMapDatasets';

vi.mock('../../../apps/mobile/node_modules/react-native', () => ({
  View: 'view',
  Switch: 'switch',
  Alert: { alert: vi.fn() },
}));
vi.mock('../../../apps/mobile/accessibility', () => ({ ProductText: 'text' }));
vi.mock('../../../apps/mobile/LaptopPackages', () => ({ LaptopPackages: () => null }));
vi.mock('../../../apps/mobile/ProductComponents', () => ({
  ProductButton: (props: { label: string }) => createElement('button', props, props.label),
  ProductCard: (props: { title: string; children: unknown }) => createElement('card', props),
  ProductRow: (props: { title: string; onPress: () => void }) =>
    createElement('button', { ...props, label: props.title }),
  ProductHeader: 'header',
  ProductMetric: () => null,
  ProductDisclosure: (props: { title: string; children: unknown }) =>
    createElement('disclosure', props),
  usePalette: () => ({ muted: '#50665b', surface: '#fff' }),
}));
vi.mock('@open-outdoor/mobile-map-data', () => ({
  mobileMapDataMetadata: {
    label: 'Offline basemaps',
    hasPrivateData: false,
    featureCount: 0,
    attribution: '',
    sources: [],
  },
  mobileHikeData: { attribution: '' },
  mobileMapDataIndex: { schemaVersion: 1, features: [] },
}));
import { MapSettings } from '../../../apps/mobile/MapSettings';

let root: ReturnType<typeof create>;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
});
const statePackages = {
  ready: true,
  busy: false,
  status: '',
  packages: [],
  change: vi.fn(),
  install: vi.fn(),
} as unknown as StatePackagesService;
const imports = {
  ready: true,
  busy: false,
  status: '',
  datasets: [],
  toggleDataset: vi.fn(),
  importDataset: vi.fn(),
} as unknown as ImportedMapDatasetsService;

it('distinguishes the bundled map from empty public installs and private imports', async () => {
  await act(async () => {
    root = create(createElement(MapSettings, { imports, statePackages, onShowCoverage: vi.fn() }));
  });
  const text = JSON.stringify(root.toJSON());
  expect(text).toContain('Public packages');
  expect(text).toContain('No public packages');
  expect(text).toContain('Private data');
  expect(text).toContain('No private datasets');
  expect(text).not.toContain('Bundled private sources');
  expect(text).not.toContain('Permission is hereby granted');
});

it('shows basemap coverage rather than implying a New York catalog is bundled', async () => {
  const show = vi.fn();
  await act(async () => {
    root = create(createElement(MapSettings, { imports, statePackages, onShowCoverage: show }));
  });
  const button = (label: string) =>
    root.root.findAllByType('button').find((node) => node.props.label === label)!;
  await act(async () => button('World + regional map').props.onPress());
  const text = JSON.stringify(root.toJSON());
  expect(text).toContain('State packages are installed separately.');
  expect(text).not.toContain('NYS');
  expect(text).not.toContain('0 features');
  await act(async () => button('Coverage').props.onPress());
  expect(show).toHaveBeenCalledWith([-180, -85.0511287, 180, 85.0511287]);
});

it('shows package visibility and routes public and private coverage to Explore', async () => {
  const point = [-73.12345678, 42.87654321];
  const dataset = parseMapDataset(
    JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: point },
          properties: { name: 'Synthetic site' },
        },
      ],
    }),
    'a'.repeat(64),
    'Synthetic private dataset',
  );
  const bounds: [number, number, number, number] = [-75, 41, -73, 43];
  const packages = {
    ...statePackages,
    packages: [
      {
        state: 'NY',
        name: 'Synthetic New York',
        visible: true,
        bounds,
        featureCount: 1,
        generatedAt: '2026-10-03',
        installedBytes: 100,
      },
    ],
  } as StatePackagesService;
  const show = vi.fn();
  await act(async () => {
    root = create(
      createElement(MapSettings, {
        imports: { ...imports, datasets: [dataset] },
        statePackages: packages,
        onShowCoverage: show,
      }),
    );
  });
  const button = (label: string) =>
    root.root.findAllByType('button').find((node) => node.props.label === label)!;
  await act(async () =>
    root.root
      .findAllByType('switch')
      .find((node) => node.props.accessibilityLabel === 'Hide Synthetic New York')!
      .props.onValueChange(false),
  );
  expect(packages.change).toHaveBeenCalledWith('NY', 'visibility');
  await act(async () => button('Synthetic New York').props.onPress());
  await act(async () => button('Coverage').props.onPress());
  expect(show).toHaveBeenLastCalledWith(bounds);
  await act(async () => root.root.findByType('header').props.onBack());
  await act(async () => button('Synthetic private dataset').props.onPress());
  await act(async () => button('Coverage').props.onPress());
  expect(show).toHaveBeenLastCalledWith([point[0], point[1], point[0], point[1]]);
  expect(JSON.stringify(root.toJSON())).toContain('Private on this device');
});

it('reviews a checked import without persisting it until the user imports it', async () => {
  const draft = parseMapDataset(
    JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-73, 42] },
      properties: { name: 'Synthetic' },
    }),
    'b'.repeat(64),
    'Synthetic.geojson',
  );
  const commitDataset = vi.fn(async () => draft);
  const prepareDataset = vi.fn(async () => draft);
  await act(async () => {
    root = create(
      createElement(MapSettings, {
        imports: { ...imports, prepareDataset, commitDataset },
        statePackages,
        onShowCoverage: vi.fn(),
      }),
    );
  });
  const button = (label: string) =>
    root.root.findAllByType('button').find((node) => node.props.label === label)!;
  await act(async () => button('Add a map').props.onPress());
  await act(async () => button('Import GeoJSON').props.onPress());
  expect(prepareDataset).toHaveBeenCalledTimes(1);
  expect(commitDataset).not.toHaveBeenCalled();
  expect(root.root.findByType('header').props.title).toBe('Review import');
  await act(async () => button('Import dataset').props.onPress());
  expect(commitDataset).toHaveBeenCalledWith(draft);
  expect(root.root.findByType('header').props.title).toBe('Maps');
});

it('shows the active import error even when the public package service has a readiness message', async () => {
  await act(async () => {
    root = create(
      createElement(MapSettings, {
        imports: {
          ...imports,
          status: 'Invalid GeoJSON',
          prepareDataset: vi.fn(async () => undefined),
        },
        statePackages: { ...statePackages, status: 'State packages ready.' },
        onShowCoverage: vi.fn(),
      }),
    );
  });
  const button = (label: string) =>
    root.root.findAllByType('button').find((node) => node.props.label === label)!;
  await act(async () => button('Add a map').props.onPress());
  await act(async () => button('Import GeoJSON').props.onPress());
  const text = JSON.stringify(root.toJSON());
  expect(text).toContain('Invalid GeoJSON');
  expect(text).not.toContain('State packages ready.');
});

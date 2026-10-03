import { act, create } from 'react-test-renderer';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { parseMapDataset } from '../src';
import type { StatePackagesService } from '../../../apps/mobile/useStatePackages';
import type { ImportedMapDatasetsService } from '../../../apps/mobile/useImportedMapDatasets';

vi.mock('../../../apps/mobile/node_modules/react-native', () => ({
  View: 'view',
  Alert: { alert: vi.fn() },
}));
vi.mock('../../../apps/mobile/accessibility', () => ({ ProductText: 'text' }));
vi.mock('../../../apps/mobile/LaptopPackages', () => ({ LaptopPackages: () => null }));
vi.mock('../../../apps/mobile/ProductComponents', () => ({
  ProductButton: (props: { label: string }) => createElement('button', props, props.label),
  ProductCard: (props: { title: string; children: unknown }) => createElement('card', props),
}));
vi.mock('@open-outdoor/mobile-map-data', () => ({
  mobileMapDataMetadata: {
    label: 'Synthetic public bundle',
    hasPrivateData: false,
    featureCount: 1,
    attribution: 'Synthetic',
    sources: [],
  },
  mobileHikeData: { attribution: 'Synthetic' },
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
  expect(text).toContain('Installed public packages');
  expect(text).toContain('No public state packages installed.');
  expect(text).toContain('Private imported datasets');
  expect(text).toContain('No private datasets imported.');
  expect(text).toContain('No private data bundled in this build.');
  expect(text).not.toContain('Permission is hereby granted');
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
  await act(async () => button('Hide Synthetic New York').props.onPress());
  expect(packages.change).toHaveBeenCalledWith('NY', 'visibility');
  await act(async () => button('Show Synthetic New York coverage').props.onPress());
  expect(show).toHaveBeenLastCalledWith(bounds);
  await act(async () => button('Show coverage of Synthetic private dataset').props.onPress());
  expect(show).toHaveBeenLastCalledWith([point[0], point[1], point[0], point[1]]);
  expect(JSON.stringify(root.toJSON())).toContain('private on-device');
});

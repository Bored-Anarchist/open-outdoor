import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../apps/mobile/node_modules/react-native', () => ({
  View: 'view',
  ScrollView: 'scroll',
  Platform: { OS: 'ios' },
  AppState: {},
  StyleSheet: { create: (value: unknown) => value },
  useColorScheme: () => 'light',
  Alert: {},
}));
vi.mock('../../../apps/mobile/node_modules/react-native-safe-area-context', () => ({
  SafeAreaProvider: 'safe-provider',
  SafeAreaView: 'safe-area',
}));
vi.mock('../../../apps/mobile/node_modules/expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('../../../apps/mobile/accessibility', async () => {
  const { createContext } = await import('react');
  return {
    ProductText: 'text',
    AccessibilityContext: createContext({}),
    useDeviceAccessibility: () => ({}),
    useAnnouncement: () => {},
  };
});
vi.mock('../../../apps/mobile/ProductComponents', async () => {
  const { createContext } = await import('react');
  const { palettes } = await import('@open-outdoor/shared');
  return {
    AppearanceContext: createContext('light'),
    usePalette: () => palettes.light,
    ProductButton: (props: { label: string }) => createElement('button', props, props.label),
    ProductCard: 'card',
    ProductNavigation: 'navigation',
    ProductIcon: () => null,
    FieldNotice: () => null,
    OriginBadge: () => null,
    ProductMetric: () => null,
  };
});
vi.mock('../../../apps/mobile/nativeSpikes', () => ({
  nativeSpikes: { available: false, loadError: 'Synthetic unavailable build' },
}));
vi.mock('../../../apps/mobile/application', () => ({
  createOutdoorMapAdapter: () => ({}),
  createMobileApplication: vi.fn(),
}));
vi.mock('../../../apps/mobile/useImportedMapDatasets', () => ({
  useImportedMapDatasets: () => ({ datasets: [] }),
}));
vi.mock('../../../apps/mobile/useStatePackages', () => ({
  useStatePackages: () => ({ packages: [], ready: true }),
}));
vi.mock('../../../apps/mobile/OutdoorMap', () => ({ OutdoorMap: 'map' }));
vi.mock('../../../apps/mobile/MapSettings', () => ({ MapSettings: 'settings' }));
import App from '../../../apps/mobile/App';

let root: ReturnType<typeof create>;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
});

it('gives navigation its own bottom safe area and keeps Settings outside Explore', async () => {
  await act(async () => {
    root = create(createElement(App));
  });
  const nav = () => root.root.findByType('navigation');
  expect(nav().parent?.type).toBe('safe-area');
  expect(nav().parent?.props.edges).toEqual(['bottom', 'left', 'right']);
  expect(root.root.findByType('scroll').parent?.props.edges).toEqual(['top', 'left', 'right']);
  expect(root.root.findAllByType('settings')).toHaveLength(0);
  expect(root.root.findAllByType('map')).toHaveLength(1);
  await act(async () =>
    root.root
      .findAllByType('button')
      .find((node) => node.props.label === 'Settings')!
      .props.onPress(),
  );
  expect(root.root.findAllByType('settings')).toHaveLength(1);
  expect(root.root.findAllByType('map')).toHaveLength(0);
  expect(nav().props.section).toBeNull();
  await act(async () => nav().props.onChange('explore'));
  expect(root.root.findAllByType('settings')).toHaveLength(0);
  expect(root.root.findAllByType('map')).toHaveLength(1);
});

it('opens package coverage on Explore without losing the shared package service', async () => {
  await act(async () => {
    root = create(createElement(App));
  });
  const service = root.root.findByType('map').props.statePackages;
  await act(async () =>
    root.root
      .findAllByType('button')
      .find((node) => node.props.label === 'Settings')!
      .props.onPress(),
  );
  const bounds = [-75, 41, -73, 43];
  await act(async () => root.root.findByType('settings').props.onShowCoverage(bounds));
  expect(root.root.findByType('map').props.coverage).toEqual(bounds);
  expect(root.root.findByType('map').props.statePackages).toEqual(service);
  await act(async () => root.root.findByType('map').props.onCoverageShown());
  expect(root.root.findByType('map').props.coverage).toBeNull();
});

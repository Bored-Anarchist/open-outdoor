import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  available: false,
  loadError: 'Synthetic unavailable build',
  inspectTrackingSession: vi.fn(async () => null),
}));

vi.mock('../../../apps/mobile/node_modules/react-native', () => ({
  View: 'view',
  ScrollView: 'scroll',
  Platform: { OS: 'ios' },
  AppState: { currentState: 'inactive', addEventListener: () => ({ remove: () => {} }) },
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
    ProductHeader: (props: { onBack?: () => void; onSettings?: () => void }) =>
      createElement(
        'header',
        props,
        props.onSettings
          ? createElement('button', { label: 'Settings', onPress: props.onSettings })
          : null,
      ),
    ProductRow: (props: { title: string; onPress: () => void }) =>
      createElement('button', { ...props, label: props.title }),
    ProductDisclosure: 'disclosure',
    ProductNavigation: 'navigation',
    ProductIcon: () => null,
    FieldNotice: () => null,
    OriginBadge: () => null,
    ProductMetric: () => null,
  };
});
vi.mock('../../../apps/mobile/nativeSpikes', () => ({
  nativeSpikes: native,
}));
vi.mock('../../../apps/mobile/application', () => ({
  createOutdoorMapAdapter: () => ({ setActiveTrack: vi.fn(), setSelectedFeature: vi.fn() }),
  createMobileApplication: vi.fn(),
}));
vi.mock('../../../apps/mobile/useImportedMapDatasets', () => ({
  useImportedMapDatasets: () => ({ datasets: [] }),
}));
vi.mock('../../../apps/mobile/useStatePackages', () => ({
  useStatePackages: () => ({ packages: [], ready: true }),
}));
vi.mock('../../../apps/mobile/ProductSheet', () => ({
  ProductSheet: (props: { visible: boolean }) =>
    props.visible ? createElement('sheet', props) : null,
}));
vi.mock('../../../apps/mobile/RecordingScreen', () => ({
  RecordingScreen: 'recording',
  RecordedPathPreview: () => null,
  recordingTime: () => '00:00:00',
  recordingModes: { balanced: 'Balanced' },
}));
vi.mock('../../../apps/mobile/OutdoorMap', () => ({ OutdoorMap: 'map' }));
vi.mock('../../../apps/mobile/MapSettings', () => ({
  MapSettings: 'settings',
  MapNotices: 'notices',
}));
import App from '../../../apps/mobile/App';
import { createMobileApplication } from '../../../apps/mobile/application';

let root: ReturnType<typeof create>;
beforeEach(() => {
  native.available = false;
  vi.mocked(createMobileApplication).mockReset();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
});

it('keeps navigation flush to its bottom safe area and preserves the map while visiting Settings', async () => {
  await act(async () => {
    root = create(createElement(App));
  });
  const nav = () => root.root.findByType('navigation');
  expect(nav().parent?.type).toBe('safe-area');
  expect(nav().parent?.props.edges).toEqual(['bottom', 'left', 'right']);
  expect(root.root.findByType('map').parent?.parent?.props.edges).toEqual(['top', 'left', 'right']);
  expect(root.root.findAllByType('settings')).toHaveLength(0);
  expect(root.root.findAllByType('map')).toHaveLength(1);
  await act(async () => root.root.findByType('map').props.onOpenSettings());
  expect(root.root.findAllByType('settings')).toHaveLength(0);
  expect(root.root.findByType('map').props.visible).toBe(false);
  await act(async () =>
    root.root
      .findAllByType('button')
      .find((node) => node.props.label === 'Maps')!
      .props.onPress(),
  );
  expect(root.root.findAllByType('settings')).toHaveLength(1);
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
  await act(async () => root.root.findByType('map').props.onOpenSettings());
  await act(async () =>
    root.root
      .findAllByType('button')
      .find((node) => node.props.label === 'Maps')!
      .props.onPress(),
  );
  const bounds = [-75, 41, -73, 43];
  await act(async () => root.root.findByType('settings').props.onShowCoverage(bounds));
  expect(root.root.findByType('map').props.coverage).toEqual(bounds);
  expect(root.root.findByType('map').props.statePackages).toEqual(service);
  await act(async () => root.root.findByType('map').props.onCoverageShown());
  expect(root.root.findByType('map').props.coverage).toBeNull();
});

it('retains query and map instance through Search, Settings and tab changes', async () => {
  await act(async () => {
    root = create(createElement(App));
  });
  const map = root.root.findByType('map');
  await act(async () => map.props.onQueryChange('Hemlock'));
  await act(async () => root.root.findByType('navigation').props.onChange('search'));
  expect(root.root.findByType('map')).toBe(map);
  expect(map.props.query).toBe('Hemlock');
  await act(async () => map.props.onOpenSettings());
  expect(map.props.visible).toBe(false);
  await act(async () => root.root.findByType('navigation').props.onChange('search'));
  expect(map.props.visible).toBe(true);
  expect(map.props.query).toBe('Hemlock');
});

it('reviews before saving, keeps recording on return, and retains a failed save for retry', async () => {
  native.available = true;
  const activity = {
    id: 'synthetic-hike',
    name: 'Synthetic hike',
    mode: 'balanced',
    lifecycle: 'recording',
    startedAt: '2026-10-03T12:00:00Z',
    finishedAt: null,
    samples: [],
    qualityFlags: [],
  };
  const finish = vi
    .fn()
    .mockRejectedValueOnce(new Error('Storage full'))
    .mockImplementationOnce(async () => {
      activity.lifecycle = 'finished';
      return { activity, distanceM: 0, ascentM: 0 };
    });
  const map = { setActiveTrack: vi.fn(), setSelectedFeature: vi.fn() };
  vi.mocked(createMobileApplication).mockResolvedValue({
    map,
    repository: {
      exportSnapshot: () => ({ associations: [], revisions: [] }),
      listPlaceJournal: () => [],
    },
    library: { list: () => [activity] },
    recorder: {
      start: vi.fn(async () => activity),
      finish,
      stateMachine: { state: { kind: 'paused' }, committedObservations: [] },
    },
  } as never);
  await act(async () => {
    root = create(createElement(App));
  });
  await act(async () => root.root.findByType('navigation').props.onChange('track'));
  await act(async () => {
    await root.root.findByType('recording').props.capture.onStart();
  });
  expect(root.root.findByType('recording').props.capture.state).toBe('recording');
  await act(async () => {
    await root.root.findByType('recording').props.capture.onFinish();
  });
  expect(root.root.findByType('sheet').props.title).toBe('Save hike');
  expect(finish).not.toHaveBeenCalled();
  const button = (label: string) =>
    root.root.findAllByType('button').find((node) => node.props.label === label)!;
  await act(async () => button('Keep recording').props.onPress());
  expect(root.root.findAllByType('sheet')).toHaveLength(0);
  expect(root.root.findByType('recording').props.capture.state).toBe('recording');
  await act(async () => {
    await root.root.findByType('recording').props.capture.onFinish();
  });
  await act(async () => {
    await button('Save hike').props.onPress();
  });
  expect(JSON.stringify(root.toJSON())).toContain('Storage full');
  expect(root.root.findByType('recording').props.capture.state).toBe('paused');
  await act(async () => {
    await button('Save hike').props.onPress();
  });
  expect(finish).toHaveBeenCalledTimes(2);
  expect(root.root.findAllByType('sheet')).toHaveLength(0);
  expect(root.root.findByType('recording').props.capture.state).toBe('idle');
  await act(async () => root.root.findByType('navigation').props.onChange('saved'));
  expect(button('Synthetic hike')).toBeDefined();
});

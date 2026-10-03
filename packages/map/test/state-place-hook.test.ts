import { act, create } from 'react-test-renderer';
import { createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { InstalledStatePackage } from '../src';
import type { StatePlaceViewport } from '../../../apps/mobile/useStatePackagePlaces';

const native = vi.hoisted(() => ({
  statePackagePlacesAvailable: true,
  statePackagePlaces: vi.fn(),
}));
vi.mock('../../../apps/mobile/nativeSpikes', () => ({ nativeSpikes: native }));
import { useStatePackagePlaces } from '../../../apps/mobile/useStatePackagePlaces';

let service: ReturnType<typeof useStatePackagePlaces>;
let root: ReturnType<typeof create>;
const packages = [{ state: 'NY', visible: true }] as InstalledStatePackage[];
const viewport: StatePlaceViewport = { bounds: [-74, 41, -72, 43], zoom: 15 };
function Harness({
  entries = packages,
  view = viewport,
}: {
  entries?: InstalledStatePackage[];
  view?: StatePlaceViewport;
}) {
  service = useStatePackagePlaces(entries, view);
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  native.statePackagePlaces.mockResolvedValue('{"features":[],"limited":false}');
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  vi.useRealTimers();
  vi.clearAllMocks();
});
async function mount() {
  await act(async () => {
    root = create(createElement(Harness));
  });
}
async function query() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120);
  });
}

it('loads original coordinates at close zoom and avoids work at overview zoom', async () => {
  const feature = {
    id: 'synthetic-place',
    bounds: [-73.12345678, 42.87654321, -73.12345678, 42.87654321],
  };
  native.statePackagePlaces.mockResolvedValueOnce(
    JSON.stringify({ features: [feature], limited: false }),
  );
  await mount();
  await query();
  expect(native.statePackagePlaces).toHaveBeenCalledWith(viewport.bounds);
  expect(service.features[0]?.bounds).toEqual(feature.bounds);
  await act(async () => root.update(createElement(Harness, { view: { ...viewport, zoom: 8 } })));
  await query();
  expect(service.features).toEqual([]);
  expect(native.statePackagePlaces).toHaveBeenCalledTimes(1);
});

it('ignores late viewport queries and immediately drops points from hidden packages', async () => {
  let finish!: (payload: string) => void;
  native.statePackagePlaces.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  await query();
  await act(async () =>
    root.update(createElement(Harness, { entries: [{ ...packages[0]!, visible: false }] })),
  );
  await act(async () => finish('{"features":[{"id":"hidden-place"}],"limited":false}'));
  expect(service.features).toEqual([]);
  expect(native.statePackagePlaces).toHaveBeenCalledTimes(1);
});

it('retains precise points during a pan and reports a bounded-result limit', async () => {
  native.statePackagePlaces.mockResolvedValueOnce('{"features":[{"id":"first"}],"limited":false}');
  await mount();
  await query();
  await act(async () =>
    root.update(createElement(Harness, { view: { ...viewport, bounds: [-75, 41, -73, 43] } })),
  );
  expect(service.features[0]?.id).toBe('first');
  native.statePackagePlaces.mockResolvedValueOnce('{"features":[{"id":"next"}],"limited":true}');
  await query();
  expect(service.features[0]?.id).toBe('next');
  expect(service.limited).toBe(true);
});

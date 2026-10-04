import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { OutdoorPlaceFilter } from '../src';

const native = vi.hoisted(() => ({
  statePackagesAvailable: true,
  laptopPackagesAvailable: false,
  laptopUpdatesAvailable: false,
  loadStatePackages: vi.fn(),
  searchStatePackages: vi.fn(),
}));
vi.mock('../../../apps/mobile/nativeSpikes', () => ({ nativeSpikes: native }));
vi.mock('../../../apps/mobile/node_modules/react-native', () => ({ AppState: {} }));
import { useStatePackages } from '../../../apps/mobile/useStatePackages';
let service: ReturnType<typeof useStatePackages>;
let root: ReturnType<typeof create>;
function Harness({
  query = 'Spring',
  filter = 'water',
}: {
  query?: string;
  filter?: OutdoorPlaceFilter;
}) {
  service = useStatePackages(query, filter);
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  native.loadStatePackages.mockResolvedValue('[{"state":"NY","visible":true}]');
  native.searchStatePackages.mockResolvedValue('[{"id":"synthetic-water"}]');
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  vi.useRealTimers();
});
it('passes categories to native search and drops old results when query or category changes', async () => {
  await act(async () => {
    root = create(createElement(Harness));
  });
  await act(async () => vi.advanceTimersByTimeAsync(180));
  expect(native.searchStatePackages).toHaveBeenCalledWith('Spring', 'water');
  expect(service.results[0]?.id).toBe('synthetic-water');
  await act(async () => root.update(createElement(Harness, { filter: 'campsite' })));
  expect(service.results).toEqual([]);
  native.searchStatePackages.mockResolvedValueOnce('[{"id":"synthetic-camp"}]');
  await act(async () => vi.advanceTimersByTimeAsync(180));
  expect(service.results[0]?.id).toBe('synthetic-camp');
  await act(async () =>
    root.update(createElement(Harness, { query: 'Other', filter: 'campsite' })),
  );
  expect(service.results).toEqual([]);
});
it('ignores a delayed response from a previous category', async () => {
  let release!: (payload: string) => void;
  native.searchStatePackages.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await act(async () => {
    root = create(createElement(Harness));
  });
  await act(async () => vi.advanceTimersByTimeAsync(180));
  await act(async () => root.update(createElement(Harness, { filter: 'campsite' })));
  await act(async () => release('[{"id":"old-water"}]'));
  expect(service.results).toEqual([]);
});

import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NativeLocationPermission } from '../../../apps/mobile/nativeSpikes';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  request: vi.fn(async () => {}),
  settings: vi.fn(async () => {}),
  remove: vi.fn(),
  removeAppState: vi.fn(),
  change: null as null | ((status: NativeLocationPermission) => void),
  foreground: null as null | ((status: string) => void),
}));
vi.mock('../../../apps/mobile/nativeSpikes', () => ({
  nativeSpikes: {
    locationPermissionAvailable: true,
    locationPermission: mocks.read,
    requestAlwaysAuthorization: mocks.request,
    onLocationPermissionChange: (listener: (status: NativeLocationPermission) => void) => {
      mocks.change = listener;
      return { remove: mocks.remove };
    },
  },
}));
vi.mock('../../../apps/mobile/node_modules/react-native', () => ({
  Linking: { openSettings: mocks.settings },
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mocks.foreground = listener;
      return { remove: mocks.removeAppState };
    },
  },
}));
import { useLocationAccess } from '../../../apps/mobile/useLocationAccess';
let access: ReturnType<typeof useLocationAccess>;
let root: ReturnType<typeof create> | null;
function Harness() {
  access = useLocationAccess();
  return null;
}
async function mount() {
  await act(async () => {
    root = create(createElement(Harness));
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockReset().mockResolvedValue('not-determined');
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
});

it('changes the permission action after the actual prompt response, including denial', async () => {
  await mount();
  expect(access.label).toBe('Allow location');
  await act(async () => access.request());
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(access.permission).toBe('not-determined');
  expect(access.message).not.toContain('enabled');
  await act(async () => mocks.change!('denied'));
  expect(access.label).toBe('Open Settings');
  expect(access.message).toContain('off');
  await act(async () => access.request());
  expect(mocks.settings).toHaveBeenCalledOnce();
  expect(mocks.request).toHaveBeenCalledOnce();
});

it('distinguishes foreground-only access from background recording and refreshes after Settings', async () => {
  mocks.read.mockResolvedValue('when-in-use');
  await mount();
  expect(access.label).toBe('Allow background location');
  await act(async () => access.request());
  expect(mocks.settings).toHaveBeenCalledOnce();
  mocks.read.mockResolvedValue('always');
  await act(async () => mocks.foreground!('active'));
  expect(access.label).toBe('Location Settings');
  expect(access.message).toBe('Location enabled for recording.');
  expect(mocks.request).not.toHaveBeenCalled();
});

it('ignores a stale status query after a newer authorization event', async () => {
  let resolve!: (status: NativeLocationPermission) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await mount();
  await act(async () => mocks.change!('always'));
  await act(async () => resolve('not-determined'));
  expect(access.permission).toBe('always');
  expect(access.busy).toBe(false);
});

it.each(['restricted', 'services-disabled'] as const)(
  'opens Settings for %s without repeating a permission request',
  async (status) => {
    mocks.read.mockResolvedValue(status);
    await mount();
    expect(access.label).toBe('Open Settings');
    await act(async () => access.request());
    expect(mocks.settings).toHaveBeenCalledOnce();
    expect(mocks.request).not.toHaveBeenCalled();
  },
);

it('unlocks a failed action for retry and removes permission listeners on unmount', async () => {
  await mount();
  mocks.request.mockRejectedValueOnce(new Error('Synthetic request failure'));
  await act(async () => access.request());
  expect(access.message).toContain('Try again');
  expect(access.busy).toBe(false);
  await act(async () => access.request());
  expect(mocks.request).toHaveBeenCalledTimes(2);
  await act(async () => root!.unmount());
  root = null;
  expect(mocks.remove).toHaveBeenCalledOnce();
  expect(mocks.removeAppState).toHaveBeenCalledOnce();
});
it('keeps controls busy until the newest overlapping permission query finishes', async () => {
  let first!: (value: string) => void, second!: (value: string) => void;
  mocks.read
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          first = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          second = resolve;
        }),
    );
  await mount();
  await act(async () => mocks.foreground!('active'));
  await act(async () => first('not-determined'));
  expect(access.busy).toBe(true);
  await act(async () => second('always'));
  expect(access.busy).toBe(false);
  expect(access.permission).toBe('always');
});

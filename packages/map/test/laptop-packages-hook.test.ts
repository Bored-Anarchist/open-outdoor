import { act, create } from 'react-test-renderer';
import { createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  statePackagesAvailable: true,
  laptopPackagesAvailable: true,
  laptopPairingAvailable: true,
  discoverLaptopPackages: vi.fn(),
  cancelLaptopDiscovery: vi.fn(),
  scanLaptopPairingQr: vi.fn(),
  cancelLaptopPairingQr: vi.fn(),
  loadStatePackages: vi.fn(),
  searchStatePackages: vi.fn(),
  statePackageDetail: vi.fn(),
  pickStatePackage: vi.fn(),
  changeStatePackage: vi.fn(),
  connectLaptopPackages: vi.fn(),
  downloadLaptopPackage: vi.fn(),
  laptopPackageProgress: vi.fn(),
  cancelLaptopPackage: vi.fn(),
  disconnectLaptopPackages: vi.fn(),
}));
const app = vi.hoisted(() => ({
  listeners: new Set<(state: string) => void>(),
  removed: vi.fn(),
}));
vi.mock('../../../apps/mobile/nativeSpikes', () => ({ nativeSpikes: native }));
vi.mock('../../../apps/mobile/node_modules/react-native', () => ({
  View: 'view',
  TextInput: 'input',
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      app.listeners.add(listener);
      return {
        remove: () => {
          app.listeners.delete(listener);
          app.removed();
        },
      };
    },
  },
}));
vi.mock('../../../apps/mobile/accessibility', () => ({
  ProductText: 'text',
  useAnnouncement: vi.fn(),
}));
vi.mock('../../../apps/mobile/ProductComponents', () => ({
  ProductButton: (props: { label: string }) => createElement('button', props, props.label),
  usePalette: () => ({ text: '#111', muted: '#555', border: '#ccc', surface: '#fff' }),
}));
import { useStatePackages } from '../../../apps/mobile/useStatePackages';
import { LaptopPackages } from '../../../apps/mobile/LaptopPackages';

const pin = {
  state: 'NY',
  name: 'Synthetic New York',
  sha256: 'a'.repeat(64),
  bytes: 1048576,
  installedBytes: 2097152,
};
const catalog = JSON.stringify({ packages: [pin], unsupportedCount: 1 });
const installed = [{ ...pin, visible: true }];
const address = 'http://192.168.1.20:8765';
const code = 'a'.repeat(32);
let service: ReturnType<typeof useStatePackages>;
let tree: ReturnType<typeof create> | undefined;
function Harness() {
  service = useStatePackages('');
  return createElement(LaptopPackages, { service });
}
async function mount() {
  await act(async () => {
    tree = create(createElement(Harness));
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks();
  native.laptopPairingAvailable = true;
  native.discoverLaptopPackages.mockResolvedValue('[]');
  native.cancelLaptopDiscovery.mockResolvedValue(undefined);
  native.cancelLaptopPairingQr.mockResolvedValue(undefined);
  native.scanLaptopPairingQr.mockResolvedValue(null);
  native.loadStatePackages.mockResolvedValue(JSON.stringify(installed));
  native.connectLaptopPackages.mockResolvedValue(catalog);
  native.downloadLaptopPackage.mockResolvedValue(JSON.stringify(installed));
  native.laptopPackageProgress.mockResolvedValue(
    JSON.stringify({ phase: 'idle', receivedBytes: 0, totalBytes: 0 }),
  );
  native.cancelLaptopPackage.mockResolvedValue(undefined);
  native.disconnectLaptopPackages.mockResolvedValue(undefined);
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.useRealTimers();
});

it('connects with normalized credentials and marks incompatible package versions', async () => {
  await mount();
  await act(async () => {
    expect(await service.connectLaptop(` ${address}/ `, ` ${code.toUpperCase()} `)).toBe(true);
  });
  expect(native.connectLaptopPackages).toHaveBeenCalledWith(address, code);
  expect(service.laptopCatalog?.packages).toEqual([pin]);
  expect(service.laptopStatus).toContain('1 states require a different app build');
  expect(service.busy).toBe(false);
  await act(async () => {
    await service.disconnectLaptop();
  });
  expect(service.laptopCatalog).toBeNull();
  expect(service.packages).toEqual(installed);
});

it('rejects unsafe addresses without requesting native network access', async () => {
  await mount();
  await act(async () => {
    expect(await service.connectLaptop('http://example.com:8765', code)).toBe(false);
  });
  expect(native.connectLaptopPackages).not.toHaveBeenCalled();
  expect(service.laptopStatus).toContain('laptop address');
});

it('blocks overlapping installs, polls bounded progress, and releases busy state after failure', async () => {
  vi.useFakeTimers();
  await mount();
  const transfer = deferred<string>();
  native.downloadLaptopPackage.mockReturnValueOnce(transfer.promise);
  native.laptopPackageProgress.mockResolvedValue(
    JSON.stringify({ phase: 'downloading', receivedBytes: 524288, totalBytes: 1048576 }),
  );
  let operation!: Promise<void>;
  await act(async () => {
    operation = service.installFromLaptop('NY');
  });
  await act(async () => {
    await service.install();
    await service.installFromLaptop('CA');
  });
  expect(native.downloadLaptopPackage).toHaveBeenCalledTimes(1);
  expect(native.pickStatePackage).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(service.laptopStatus).toContain('(50%)');
  await act(async () => {
    transfer.reject(new Error('Checksum mismatch'));
    await operation;
  });
  expect(service.packages).toEqual(installed);
  expect(service.laptopStatus).toContain('Checksum mismatch');
  expect(service.busy).toBe(false);
  expect(service.laptopBusy).toBe(false);
  const polls = native.laptopPackageProgress.mock.calls.length;
  await vi.advanceTimersByTimeAsync(3000);
  expect(native.laptopPackageProgress).toHaveBeenCalledTimes(polls);
});

it('cancels a download and keeps previously installed state metadata', async () => {
  await mount();
  const transfer = deferred<string>();
  native.downloadLaptopPackage.mockReturnValueOnce(transfer.promise);
  native.cancelLaptopPackage.mockImplementationOnce(async () =>
    transfer.reject(new Error('Transfer cancelled')),
  );
  let operation!: Promise<void>;
  await act(async () => {
    operation = service.installFromLaptop('NY');
  });
  await act(async () => {
    await service.cancelLaptop();
    await operation;
  });
  expect(service.packages).toEqual(installed);
  expect(service.laptopStatus).toContain('Transfer cancelled');
  expect(service.busy).toBe(false);
});

it('forgets the connection on backgrounding and rejects a late catalog response', async () => {
  await mount();
  const connect = deferred<string>();
  native.connectLaptopPackages.mockReturnValueOnce(connect.promise);
  let operation!: Promise<boolean>;
  await act(async () => {
    operation = service.connectLaptop(address, code);
  });
  await act(async () => {
    app.listeners.forEach((listener) => listener('background'));
  });
  expect(native.disconnectLaptopPackages).toHaveBeenCalled();
  await act(async () => {
    connect.resolve(catalog);
    expect(await operation).toBe(false);
  });
  expect(service.laptopCatalog).toBeNull();
  expect(service.packages).toEqual(installed);
  expect(service.busy).toBe(false);
});

it('keeps a connection alive during the iOS Local Network permission dialog', async () => {
  await mount();
  const connect = deferred<string>();
  native.connectLaptopPackages.mockReturnValueOnce(connect.promise);
  let operation!: Promise<boolean>;
  await act(async () => {
    operation = service.connectLaptop(address, code);
  });
  await act(async () => {
    app.listeners.forEach((listener) => listener('inactive'));
  });
  expect(native.disconnectLaptopPackages).not.toHaveBeenCalled();
  await act(async () => {
    connect.resolve(catalog);
    expect(await operation).toBe(true);
  });
  expect(service.laptopCatalog?.packages).toEqual([pin]);
});

it('renders labelled inputs and installed state feedback with disabled duplicate downloads', async () => {
  await mount();
  const connect = tree!.root
    .findAllByType('button')
    .find((button) => button.props.label === 'Connect to laptop')!;
  await act(async () => {
    connect.props.onPress();
  });
  const inputs = tree!.root.findAllByType('input');
  expect(inputs.map((input) => input.props.accessibilityLabel)).toEqual([
    'Laptop address',
    'Laptop pairing code',
  ]);
  expect(inputs[1]!.props.secureTextEntry).toBe(true);
  await act(async () => {
    await service.connectLaptop(address, code);
  });
  const installedButton = tree!.root
    .findAllByType('button')
    .find((button) => button.props.label === 'Synthetic New York installed')!;
  expect(installedButton.props.disabled).toBe(true);
  expect(
    tree!.root.findAllByType('button').some((button) => button.props.label === 'Disconnect laptop'),
  ).toBe(true);
});

function button(label: string) {
  return tree!.root.findAllByType('button').find((entry) => entry.props.label === label)!;
}
async function openPanel() {
  await act(async () => button('Connect to laptop').props.onPress());
}

it('automatically discovers on opening, fills a selected address, and ignores late results after close', async () => {
  const discovery = deferred<string>();
  native.discoverLaptopPackages.mockReturnValueOnce(discovery.promise);
  await mount();
  expect(native.discoverLaptopPackages).not.toHaveBeenCalled();
  await openPanel();
  expect(native.discoverLaptopPackages).toHaveBeenCalledTimes(1);
  await act(async () => discovery.resolve(JSON.stringify([{ name: 'Synthetic laptop', address }])));
  await act(async () => button('Use Synthetic laptop').props.onPress());
  expect(tree!.root.findAllByType('input')[0]!.props.value).toBe(address);
  const late = deferred<string>();
  native.discoverLaptopPackages.mockReturnValueOnce(late.promise);
  await act(async () => button('Search again').props.onPress());
  await act(async () => button('Close laptop connection').props.onPress());
  await act(async () => late.resolve(JSON.stringify([{ name: 'Late laptop', address }])));
  expect(native.cancelLaptopDiscovery).toHaveBeenCalled();
  expect(
    tree!.root.findAllByType('button').some((entry) => entry.props.label === 'Use Late laptop'),
  ).toBe(false);
});

it('scans once, preserves pairing during permission prompts, and connects without typing', async () => {
  const scan = deferred<string | null>();
  native.scanLaptopPairingQr.mockReturnValueOnce(scan.promise);
  await mount();
  await openPanel();
  native.cancelLaptopPairingQr.mockClear();
  const press = button('Scan pairing QR code').props.onPress;
  await act(async () => {
    press();
    press();
  });
  expect(native.scanLaptopPairingQr).toHaveBeenCalledTimes(1);
  await act(async () => app.listeners.forEach((listener) => listener('inactive')));
  expect(native.cancelLaptopPairingQr).not.toHaveBeenCalled();
  await act(async () =>
    scan.resolve(
      JSON.stringify({ type: 'open-outdoor-laptop', version: 1, address, pairingCode: code }),
    ),
  );
  expect(native.connectLaptopPackages).toHaveBeenCalledWith(address, code);
  expect(service.laptopCatalog?.packages).toEqual([pin]);
  expect(tree!.root.findAllByType('input')).toHaveLength(0);
});

it('does not connect from an unsafe QR or a scan completing after background cancellation', async () => {
  native.scanLaptopPairingQr.mockResolvedValueOnce(
    JSON.stringify({
      type: 'open-outdoor-laptop',
      version: 1,
      address: 'http://example.com:8765',
      pairingCode: code,
    }),
  );
  await mount();
  await openPanel();
  await act(async () => button('Scan pairing QR code').props.onPress());
  expect(native.connectLaptopPackages).not.toHaveBeenCalled();
  const late = deferred<string | null>();
  native.scanLaptopPairingQr.mockReturnValueOnce(late.promise);
  await act(async () => button('Scan pairing QR code').props.onPress());
  await act(async () => app.listeners.forEach((listener) => listener('background')));
  await act(async () =>
    late.resolve(
      JSON.stringify({ type: 'open-outdoor-laptop', version: 1, address, pairingCode: code }),
    ),
  );
  expect(native.cancelLaptopPairingQr).toHaveBeenCalled();
  expect(native.connectLaptopPackages).not.toHaveBeenCalled();
});

it('supports manual entry in older builds and camera denial/cancellation in newer builds', async () => {
  native.laptopPairingAvailable = false;
  await mount();
  await openPanel();
  expect(native.discoverLaptopPackages).not.toHaveBeenCalled();
  expect(tree!.root.findAllByType('input')).toHaveLength(2);
  await act(async () => tree!.unmount());
  tree = undefined;
  native.laptopPairingAvailable = true;
  native.scanLaptopPairingQr.mockRejectedValueOnce(
    new Error('Allow Camera access or use manual entry.'),
  );
  await mount();
  await openPanel();
  await act(async () => button('Scan pairing QR code').props.onPress());
  expect(JSON.stringify(tree!.toJSON())).toContain('Allow Camera access');
  await act(async () => button('Scan pairing QR code').props.onPress());
  expect(JSON.stringify(tree!.toJSON())).toContain('Scan cancelled');
  expect(native.connectLaptopPackages).not.toHaveBeenCalled();
});

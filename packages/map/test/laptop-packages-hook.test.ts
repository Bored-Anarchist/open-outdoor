import { act, create } from 'react-test-renderer';
import { createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  statePackagesAvailable: true,
  laptopPackagesAvailable: true,
  laptopPairingAvailable: true,
  laptopUpdatesAvailable: false,
  connectLaptopUpdates: vi.fn(),
  approveLaptopUpdates: vi.fn(),
  revokeLaptopUpdates: vi.fn(),
  refreshLaptopPackages: vi.fn(),
  trustedLaptopSigners: vi.fn(),
  revokeStateUpdateSigner: vi.fn(),
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
  native.laptopUpdatesAvailable = false;
  native.trustedLaptopSigners.mockResolvedValue('[]');
  native.revokeStateUpdateSigner.mockResolvedValue(undefined);
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

it('passes the independently scanned signing fingerprint and requires explicit trust for newer packages', async () => {
  native.laptopUpdatesAvailable = true;
  const updated = {
    ...pin,
    sha256: 'b'.repeat(64),
    generatedAt: '2026-09-30T00:00:00.000Z',
    revision: 2,
    requiresTrust: true,
    signed: true,
  };
  const fingerprint = 'c'.repeat(64);
  const candidate = {
    packages: [updated],
    unsupportedCount: 0,
    signerFingerprint: fingerprint,
    signerTrusted: false,
    canTrustSigner: true,
  };
  native.connectLaptopUpdates.mockResolvedValue(JSON.stringify(candidate));
  native.scanLaptopPairingQr.mockResolvedValueOnce(
    JSON.stringify({
      type: 'open-outdoor-laptop',
      version: 2,
      address,
      pairingCode: code,
      signerFingerprint: fingerprint,
    }),
  );
  await mount();
  await openPanel();
  await act(async () => button('Scan pairing QR code').props.onPress());
  expect(native.connectLaptopUpdates).toHaveBeenCalledWith(address, code, fingerprint);
  expect(native.approveLaptopUpdates).not.toHaveBeenCalled();
  expect(button('Update Synthetic New York').props.disabled).toBe(true);
  native.approveLaptopUpdates.mockResolvedValueOnce(
    JSON.stringify({
      ...candidate,
      signerTrusted: true,
      packages: [{ ...updated, requiresTrust: false }],
    }),
  );
  await act(async () => button('Trust this laptop for updates').props.onPress());
  expect(native.approveLaptopUpdates).toHaveBeenCalledTimes(1);
  expect(button('Update Synthetic New York').props.disabled).toBe(false);
  expect(
    tree!.root
      .findAllByType('text')
      .some((entry) => entry.children.join('').includes('Available snapshot bbbbbbbbbbbb')),
  ).toBe(true);
  expect(JSON.stringify(tree!.toJSON())).toContain('2026-09-30');
  native.downloadLaptopPackage.mockResolvedValueOnce(
    JSON.stringify([{ ...updated, visible: true }]),
  );
  await act(async () => button('Update Synthetic New York').props.onPress());
  expect(service.packages[0]!.sha256).toBe(updated.sha256);
  expect(button('Synthetic New York installed').props.disabled).toBe(true);
  native.revokeLaptopUpdates.mockResolvedValueOnce(JSON.stringify(candidate));
  await act(async () => button('Stop trusting laptop updates').props.onPress());
  expect(native.revokeLaptopUpdates).toHaveBeenCalledTimes(1);
  expect(service.packages[0]!.sha256).toBe(updated.sha256);
});

it('manual pairing cannot enroll an API-provided key without a compared fingerprint, and ignores stale refresh', async () => {
  native.laptopUpdatesAvailable = true;
  const candidate = {
    packages: [],
    unsupportedCount: 0,
    signerFingerprint: 'c'.repeat(64),
    signerTrusted: false,
    canTrustSigner: false,
  };
  native.connectLaptopUpdates.mockResolvedValueOnce(JSON.stringify(candidate));
  await mount();
  await openPanel();
  await act(async () => {
    await service.connectLaptop(address, code);
  });
  expect(native.connectLaptopUpdates).toHaveBeenCalledWith(address, code, '');
  expect(
    tree!.root
      .findAllByType('button')
      .some((entry) => entry.props.label === 'Trust this laptop for updates'),
  ).toBe(false);
  const refresh = deferred<string>();
  native.refreshLaptopPackages.mockReturnValueOnce(refresh.promise);
  await act(async () => button('Check for state updates').props.onPress());
  await act(async () => app.listeners.forEach((listener) => listener('background')));
  await act(async () => refresh.resolve(JSON.stringify(candidate)));
  expect(service.laptopCatalog).toBeNull();
  expect(service.busy).toBe(false);
});

it('a failed signing-key approval keeps installed packages and releases controls', async () => {
  native.laptopUpdatesAvailable = true;
  const candidate = {
    packages: [],
    unsupportedCount: 0,
    signerFingerprint: 'c'.repeat(64),
    signerTrusted: false,
    canTrustSigner: true,
  };
  native.connectLaptopUpdates.mockResolvedValueOnce(JSON.stringify(candidate));
  native.approveLaptopUpdates.mockRejectedValueOnce(new Error('Could not save update trust'));
  await mount();
  await openPanel();
  await act(async () => {
    await service.connectLaptop(address, code, 'c'.repeat(64));
  });
  await act(async () => button('Trust this laptop for updates').props.onPress());
  expect(service.laptopCatalog?.signerTrusted).toBe(false);
  expect(service.packages).toEqual(installed);
  expect(service.busy).toBe(false);
  expect(service.laptopStatus).toContain('Could not save update trust');
});

it('revokes a saved laptop key while offline without connecting or changing installed states', async () => {
  native.laptopUpdatesAvailable = true;
  native.trustedLaptopSigners
    .mockResolvedValueOnce(JSON.stringify(['c'.repeat(64)]))
    .mockResolvedValueOnce('[]');
  await mount();
  await openPanel();
  await act(async () => button('Remove update trust cccccccccccc').props.onPress());
  expect(native.revokeStateUpdateSigner).toHaveBeenCalledWith('c'.repeat(64));
  expect(native.connectLaptopUpdates).not.toHaveBeenCalled();
  expect(service.trustedLaptopSigners).toEqual([]);
  expect(service.packages).toEqual(installed);
});

import { act, create } from 'react-test-renderer';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  statePackagesAvailable: true,
  loadStatePackages: vi.fn().mockResolvedValue('[]'),
  searchStatePackages: vi.fn().mockResolvedValue('[]'),
  statePackageDetail: vi.fn(),
  pickStatePackage: vi.fn(),
  changeStatePackage: vi.fn(),
}));
vi.mock('../../../apps/mobile/nativeSpikes', () => ({ nativeSpikes: native }));
import { useStatePackages } from '../../../apps/mobile/useStatePackages';

let service: ReturnType<typeof useStatePackages>;
const roots: ReturnType<typeof create>[] = [];
function Harness() {
  service = useStatePackages('');
  return null;
}
async function mount() {
  await act(async () => {
    roots.push(create(createElement(Harness)));
  });
}
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  vi.clearAllMocks();
});

it('rejects late detail responses after a newer selection or deselection', async () => {
  await mount();
  let finishFirst!: (value: string) => void;
  let finishSecond!: (value: string) => void;
  native.statePackageDetail
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSecond = resolve;
        }),
    );
  const first = service.select('first');
  const second = service.select('second');
  const payload = (id: string) =>
    JSON.stringify({
      summary: { id, properties: { name: id } },
      geometry: null,
      geometryLimited: false,
    });
  await act(async () => {
    finishSecond(payload('second'));
    await second;
  });
  await act(async () => {
    finishFirst(payload('first'));
    expect(await first).toBeNull();
  });
  expect(service.detail?.summary.id).toBe('second');
  await act(async () => service.clearSelection());
  expect(service.detail).toBeNull();
});

it('keeps installed state metadata when an update fails and does not call manual import storage', async () => {
  await mount();
  native.pickStatePackage.mockRejectedValueOnce(new Error('Not enough free space'));
  await act(async () => {
    await service.install();
  });
  expect(service.packages).toEqual([]);
  expect(service.status).toContain('Not enough free space');
  expect(service.busy).toBe(false);
  expect(native.changeStatePackage).not.toHaveBeenCalled();
});

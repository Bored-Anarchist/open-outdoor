import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { restoreMapDatasets } from '../src';

const native = vi.hoisted(() => ({
  mapImportAvailable: true,
  loadMapDatasets: vi.fn(),
  saveMapDatasets: vi.fn(),
  pickMapDataset: vi.fn(),
}));
vi.mock('../../../apps/mobile/nativeSpikes', () => ({ nativeSpikes: native }));
import { useImportedMapDatasets } from '../../../apps/mobile/useImportedMapDatasets';
let service: ReturnType<typeof useImportedMapDatasets>;
let tree: ReturnType<typeof create>;
function Harness() {
  service = useImportedMapDatasets();
  return null;
}
const picked = {
  id: 'a'.repeat(64),
  name: 'Synthetic.geojson',
  text: JSON.stringify({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-73.125678, 42.876543] },
    properties: { name: 'Synthetic site' },
  }),
};
beforeEach(async () => {
  vi.resetAllMocks();
  native.loadMapDatasets.mockResolvedValue(null);
  native.saveMapDatasets.mockResolvedValue(undefined);
  native.pickMapDataset.mockResolvedValue(picked);
  await act(async () => {
    tree = create(createElement(Harness));
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
});

it('keeps review private and unsaved until commit, then preserves exact coordinates and visibility', async () => {
  let draft;
  await act(async () => {
    draft = await service.prepareDataset();
  });
  expect(draft).toBeDefined();
  expect(service.datasets).toEqual([]);
  expect(native.saveMapDatasets).not.toHaveBeenCalled();
  // Leaving review has no persistence side effect. Choosing the same file remains possible.
  await act(async () => {
    draft = await service.prepareDataset();
  });
  await act(async () => {
    await service.commitDataset(draft!);
  });
  const restored = restoreMapDatasets(native.saveMapDatasets.mock.calls[0]![0]);
  expect(restored[0]!.collection.features[0]!.geometry).toEqual({
    type: 'Point',
    coordinates: [-73.125678, 42.876543],
  });
  expect(service.datasets[0]!.visible).toBe(true);
  await act(async () => {
    await service.toggleDataset(picked.id);
  });
  expect(service.datasets[0]!.visible).toBe(false);
  await act(async () => {
    await service.prepareDataset();
  });
  expect(service.status).toContain('already imported');
  expect(native.saveMapDatasets).toHaveBeenCalledTimes(2);
});

it('does not expose a failed save as installed and allows retry of the reviewed draft', async () => {
  let draft;
  await act(async () => {
    draft = await service.prepareDataset();
  });
  native.saveMapDatasets.mockRejectedValueOnce(new Error('Storage full'));
  await act(async () => {
    expect(await service.commitDataset(draft!)).toBeUndefined();
  });
  expect(service.datasets).toEqual([]);
  expect(service.status).toBe('Storage full');
  expect(service.busy).toBe(false);
  await act(async () => {
    await service.commitDataset(draft!);
  });
  expect(service.datasets).toHaveLength(1);
});

it('keeps cancelled and invalid files out of the inventory', async () => {
  native.pickMapDataset.mockResolvedValueOnce(null);
  await act(async () => {
    expect(await service.prepareDataset()).toBeUndefined();
  });
  expect(service.status).toContain('cancelled');
  native.pickMapDataset.mockResolvedValueOnce({ ...picked, text: '{invalid' });
  await act(async () => {
    expect(await service.prepareDataset()).toBeUndefined();
  });
  expect(service.datasets).toEqual([]);
  expect(service.busy).toBe(false);
  expect(native.saveMapDatasets).not.toHaveBeenCalled();
});

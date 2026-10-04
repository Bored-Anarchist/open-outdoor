import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import { useMapCameraSync } from '../../../apps/mobile/useMapCameraSync';
import type { MapCamera } from '../src';

it('does not overwrite a feature or coverage fit when GPS following stops', async () => {
  const jumpTo = vi.fn();
  const camera = { current: { jumpTo } };
  const oldView = { center: [-74, 42] as const, zoom: 10 };
  function Harness({
    view = oldView,
    following = false,
  }: {
    view?: MapCamera;
    following?: boolean;
  }) {
    useMapCameraSync(camera, view, following);
    return null;
  }
  let root!: ReturnType<typeof create>;
  try {
    await act(async () => {
      root = create(createElement(Harness));
    });
    expect(jumpTo).toHaveBeenLastCalledWith({ center: [-74, 42], zoom: 10 });
    await act(async () => root.update(createElement(Harness, { following: true })));
    jumpTo.mockClear();
    // A selection jumps to its own bounds and disables follow in the same event.
    await act(async () => root.update(createElement(Harness, { following: false })));
    expect(jumpTo).not.toHaveBeenCalled();
    const selectedView: MapCamera = { center: [-73, 43], zoom: 15 };
    await act(async () => root.update(createElement(Harness, { view: selectedView })));
    expect(jumpTo).toHaveBeenLastCalledWith({ center: [-73, 43], zoom: 15 });
    await act(async () =>
      root.update(createElement(Harness, { view: selectedView, following: true })),
    );
    jumpTo.mockClear();
    const gpsView: MapCamera = { center: [-72, 44], zoom: 15 };
    await act(async () => root.update(createElement(Harness, { view: gpsView, following: true })));
    expect(jumpTo).not.toHaveBeenCalled();
    await act(async () => root.update(createElement(Harness, { view: gpsView })));
    expect(jumpTo).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
});

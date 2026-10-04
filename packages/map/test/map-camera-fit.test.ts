import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import { useMapCameraFit } from '../../../apps/mobile/useMapCameraFit';

it('keeps only the latest destination until a native map is ready and applies it once', async () => {
  const jumpTo = vi.fn();
  const fitBounds = vi.fn();
  const camera = { current: { jumpTo, fitBounds } };
  let fit!: ReturnType<typeof useMapCameraFit>;
  function Harness({ ready }: { ready: boolean }) {
    fit = useMapCameraFit(camera, ready);
    return null;
  }
  let root!: ReturnType<typeof create>;
  try {
    await act(async () => {
      root = create(createElement(Harness, { ready: false }));
    });
    await act(async () => fit([-74, 42, -74, 42], 15));
    const route: [number, number, number, number] = [-76, 40, -72, 44];
    await act(async () => fit(route));
    route[0] = -100;
    expect(jumpTo).not.toHaveBeenCalled();
    expect(fitBounds).not.toHaveBeenCalled();
    await act(async () => root.update(createElement(Harness, { ready: true })));
    expect(jumpTo).not.toHaveBeenCalled();
    expect(fitBounds).toHaveBeenCalledExactlyOnceWith([-76, 40, -72, 44], {
      padding: { top: 35, right: 35, bottom: 35, left: 35 },
      duration: 0,
    });
    await act(async () => root.update(createElement(Harness, { ready: false })));
    await act(async () => root.update(createElement(Harness, { ready: true })));
    expect(fitBounds).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
  }
});

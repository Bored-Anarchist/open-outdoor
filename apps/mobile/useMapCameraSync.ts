import { useEffect, useRef, type RefObject } from 'react';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import type { MapCamera } from '@open-outdoor/map';

/** Stop following without replaying the old position over a selection or coverage fit. */
export function useMapCameraSync(
  camera: RefObject<Pick<CameraRef, 'jumpTo'> | null>,
  view: MapCamera,
  following: boolean,
) {
  const syncedView = useRef<MapCamera | null>(null);
  const nativeView = useRef<MapCamera | null>(null);
  useEffect(() => {
    if (syncedView.current === view) return;
    syncedView.current = view;
    const rendered = nativeView.current;
    const fromNative =
      rendered &&
      Math.abs(rendered.center[0] - view.center[0]) < 1e-7 &&
      Math.abs(rendered.center[1] - view.center[1]) < 1e-7 &&
      Math.abs(rendered.zoom - view.zoom) < 1e-7;
    if (!following && !fromNative)
      camera.current?.jumpTo({ center: [...view.center], zoom: view.zoom });
  }, [camera, view, following]);
  // A native region event reports an already rendered camera, not a new camera command.
  return (rendered: MapCamera) => {
    nativeView.current = rendered;
  };
}

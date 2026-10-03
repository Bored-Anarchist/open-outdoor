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
  useEffect(() => {
    if (syncedView.current === view) return;
    syncedView.current = view;
    if (!following) camera.current?.jumpTo({ center: [...view.center], zoom: view.zoom });
  }, [camera, view, following]);
}

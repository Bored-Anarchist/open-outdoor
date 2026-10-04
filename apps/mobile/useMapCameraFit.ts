import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { CameraRef } from '@maplibre/maplibre-react-native';

type Bounds = [number, number, number, number];
interface CameraFit {
  bounds: Bounds;
  pointZoom: number;
  padding: number;
}

/** Preserve Search/coverage/path commands until the native map can apply them. Latest wins. */
export function useMapCameraFit(
  camera: RefObject<Pick<CameraRef, 'jumpTo' | 'fitBounds'> | null>,
  ready: boolean,
) {
  const [pending, setPending] = useState<CameraFit | null>(null);
  const fit = useCallback((bounds: Bounds, pointZoom = 14, padding = 35) => {
    setPending({ bounds: [...bounds], pointZoom, padding });
  }, []);
  useEffect(() => {
    if (!ready || !pending || !camera.current) return;
    const { bounds, pointZoom, padding } = pending;
    if (bounds[0] === bounds[2] && bounds[1] === bounds[3])
      camera.current.jumpTo({ center: [bounds[0], bounds[1]], zoom: pointZoom });
    else
      camera.current.fitBounds(bounds, {
        padding: { top: padding, right: padding, bottom: padding, left: padding },
        duration: 0,
      });
    setPending(null);
  }, [camera, ready, pending]);
  return fit;
}

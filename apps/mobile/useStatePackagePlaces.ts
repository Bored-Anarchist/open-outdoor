import { useEffect, useState } from 'react';
import type { InstalledStatePackage, OutdoorFeatureSummary } from '@open-outdoor/map';
import { nativeSpikes } from './nativeSpikes';

const emptyFeatures: OutdoorFeatureSummary[] = [];

export interface StatePlaceViewport {
  readonly bounds: [number, number, number, number];
  readonly zoom: number;
}

/** At close zoom, use original coordinates rather than overzoomed tile grid positions. */
export function useStatePackagePlaces(
  packages: readonly InstalledStatePackage[],
  viewport: StatePlaceViewport | null,
) {
  const [result, setResult] = useState<{
    packages: readonly InstalledStatePackage[];
    features: OutdoorFeatureSummary[];
    limited: boolean;
  }>({ packages, features: [], limited: false });
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setError('');
    if (
      !nativeSpikes.statePackagePlacesAvailable ||
      !viewport ||
      viewport.zoom < 12 ||
      !packages.some((entry) => entry.visible && !entry.integrityError)
    )
      return;
    const timer = setTimeout(() => {
      void nativeSpikes
        .statePackagePlaces(viewport.bounds)
        .then((payload) => {
          if (!cancelled) setResult({ ...JSON.parse(payload), packages });
        })
        .catch(() => {
          if (!cancelled)
            setError('Precise place positions could not load. Try moving or zooming the map.');
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [packages, viewport]);
  return result.packages === packages && viewport && viewport.zoom >= 12
    ? { features: result.features, limited: result.limited, error }
    : { features: emptyFeatures, limited: false, error: '' };
}

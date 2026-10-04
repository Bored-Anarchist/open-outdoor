import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { nativeSpikes, type NativeLocationPermission } from './nativeSpikes';

export const locationAccessCopy: Record<
  NativeLocationPermission,
  { label: string; message: string; hint: string }
> = {
  'not-determined': {
    label: 'Allow location',
    message: 'Allow Always access to record with the screen locked.',
    hint: 'Request location access on this device',
  },
  'when-in-use': {
    label: 'Allow background location',
    message: 'Location is on while using the app. Choose Always for recording.',
    hint: 'Open Settings to allow location Always',
  },
  always: {
    label: 'Location Settings',
    message: 'Location enabled for recording.',
    hint: 'Review location access in Settings',
  },
  denied: {
    label: 'Open Settings',
    message: 'Location is off. Choose Always to record.',
    hint: 'Open Settings to enable location access',
  },
  restricted: {
    label: 'Open Settings',
    message: 'Location is restricted on this device.',
    hint: 'Review device location restrictions in Settings',
  },
  'services-disabled': {
    label: 'Open Settings',
    message: 'Turn on Location Services to use GPS.',
    hint: 'Open Settings to review Location Services',
  },
  unavailable: {
    label: 'Location Settings',
    message: 'Location status unavailable.',
    hint: 'Review location access in Settings',
  },
};

/** Follow actual authorization, including changes made in device Settings. */
export function useLocationAccess() {
  const [permission, setPermission] = useState<NativeLocationPermission>('unavailable');
  const [checking, setChecking] = useState(nativeSpikes.locationPermissionAvailable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const revision = useRef(0);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (!nativeSpikes.locationPermissionAvailable) return;
    const request = ++revision.current;
    if (mounted.current) setChecking(true);
    try {
      const next = await nativeSpikes.locationPermission();
      if (mounted.current && request === revision.current) {
        setPermission(next);
        setError('');
      }
    } catch {
      if (mounted.current && request === revision.current)
        setError('Could not check location access. Try again.');
    } finally {
      if (mounted.current && request === revision.current) setChecking(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const listener = nativeSpikes.onLocationPermissionChange?.((next) => {
      if (!active) return;
      revision.current++;
      setPermission(next);
      setChecking(false);
      setError('');
    });
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      active = false;
      mounted.current = false;
      revision.current++;
      listener?.remove();
      subscription.remove();
    };
  }, [refresh]);
  const request = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (permission === 'not-determined') await nativeSpikes.requestAlwaysAuthorization();
      else await Linking.openSettings();
      await refresh();
    } catch {
      if (mounted.current) setError('Could not open location access. Try again.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const copy = locationAccessCopy[permission] ?? locationAccessCopy.unavailable;
  return {
    permission,
    label: copy.label,
    hint: copy.hint,
    message: error || copy.message,
    busy: busy || checking,
    request,
  };
}
export type LocationAccessService = ReturnType<typeof useLocationAccess>;

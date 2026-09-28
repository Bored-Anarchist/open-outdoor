import { useEffect, useRef, useState } from 'react';
import type {
  InstalledStatePackage,
  OutdoorFeature,
  OutdoorFeatureSummary,
} from '@open-outdoor/map';
import registry from '../../packages/map/src/assets/state-packages/US/loader-inventory.json';
import { nativeSpikes } from './nativeSpikes';

interface StateDetail {
  readonly summary: OutdoorFeatureSummary;
  readonly geometry: OutdoorFeature['geometry'] | null;
  readonly geometryLimited: boolean;
}

export function useStatePackages(query: string) {
  const [packages, setPackages] = useState<InstalledStatePackage[]>([]);
  const [results, setResults] = useState<OutdoorFeatureSummary[]>([]);
  const [detail, setDetail] = useState<StateDetail | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const detailRequest = useRef(0);

  useEffect(() => {
    mounted.current = true;
    if (!nativeSpikes.statePackagesAvailable) {
      setStatus('Install an app build with state packages to enable this feature.');
      return () => {
        mounted.current = false;
      };
    }
    setStatus('Checking installed state packages…');
    void nativeSpikes
      .loadStatePackages(JSON.stringify(registry.states))
      .then((payload) => {
        if (mounted.current) {
          setPackages(JSON.parse(payload));
          setReady(true);
          setStatus('State packages ready.');
        }
      })
      .catch((error: unknown) => {
        if (mounted.current) setStatus(`State packages could not load: ${String(error)}`);
      });
    return () => {
      mounted.current = false;
      detailRequest.current++;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!ready || !query.trim()) {
      setResults([]);
      return;
    }
    setResults([]);
    const timer = setTimeout(() => {
      void nativeSpikes
        .searchStatePackages(query)
        .then((payload) => {
          if (!cancelled) setResults(JSON.parse(payload));
        })
        .catch((error: unknown) => {
          if (!cancelled) setStatus(`State search failed: ${String(error)}`);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, ready, packages]);

  async function select(id: string): Promise<OutdoorFeatureSummary | null> {
    const request = ++detailRequest.current;
    try {
      const payload = await nativeSpikes.statePackageDetail(id);
      if (!mounted.current || request !== detailRequest.current) return null;
      const next = payload ? (JSON.parse(payload) as StateDetail) : null;
      setDetail(next);
      if (next?.geometryLimited)
        setStatus(
          'This feature’s full geometry is too large to load as a selection. Its map and details remain available.',
        );
      return next?.summary ?? null;
    } catch (error) {
      if (mounted.current) setStatus(`Feature details failed: ${String(error)}`);
      return null;
    }
  }

  async function operation(action: () => Promise<string | null>) {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setStatus('Verifying the state package and available storage…');
    try {
      const payload = await action();
      if (mounted.current) {
        if (payload) {
          detailRequest.current++;
          setDetail(null);
          setPackages(JSON.parse(payload));
          setStatus('State packages updated. Your place notes and recordings are kept.');
        } else setStatus('State package selection cancelled.');
      }
    } catch (error) {
      if (mounted.current) setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return {
    packages,
    results,
    detail,
    ready,
    busy,
    status,
    select,
    clearSelection: () => {
      detailRequest.current++;
      setDetail(null);
    },
    install: () => operation(() => nativeSpikes.pickStatePackage()),
    change: (state: string, action: 'visibility' | 'remove' | 'rollback') =>
      operation(() => nativeSpikes.changeStatePackage(state, action)),
  };
}

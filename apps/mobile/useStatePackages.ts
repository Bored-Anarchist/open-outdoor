import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { laptopTransferMessage, validateLaptopConnection } from '@open-outdoor/map';
import type {
  InstalledStatePackage,
  OutdoorFeature,
  OutdoorFeatureSummary,
  LaptopCatalog,
  LaptopTransferProgress,
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
  const [laptopCatalog, setLaptopCatalog] = useState<LaptopCatalog | null>(null);
  const [laptopStatus, setLaptopStatus] = useState('');
  const [laptopBusy, setLaptopBusy] = useState(false);
  const [laptopProgress, setLaptopProgress] = useState<LaptopTransferProgress | null>(null);
  const [trustedLaptopSigners, setTrustedLaptopSigners] = useState<readonly string[]>([]);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const detailRequest = useRef(0);
  const laptopRequest = useRef(0);
  async function refreshTrustedSigners() {
    if (!nativeSpikes.laptopUpdatesAvailable) return;
    const values = JSON.parse(await nativeSpikes.trustedLaptopSigners()) as unknown;
    if (
      !Array.isArray(values) ||
      values.length > 8 ||
      values.some((value) => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    )
      throw new Error('The saved laptop trust list is invalid.');
    if (mounted.current) setTrustedLaptopSigners(values);
  }
  useEffect(() => {
    void refreshTrustedSigners().catch(() => {});
  }, []);

  useEffect(() => {
    if (!nativeSpikes.laptopPackagesAvailable) return;
    const subscription = AppState.addEventListener('change', (state) => {
      // Permission dialogs briefly make iOS inactive; only leaving the foreground cancels.
      if (state === 'background') {
        laptopRequest.current++;
        setLaptopCatalog(null);
        setLaptopStatus(
          'Laptop disconnected. Keep the app open during a transfer, then reconnect to retry.',
        );
        void nativeSpikes.disconnectLaptopPackages().catch(() => {});
      }
    });
    return () => {
      laptopRequest.current++;
      subscription.remove();
      void nativeSpikes.disconnectLaptopPackages().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!laptopBusy) return;
    let active = true;
    let polling = false;
    const timer = setInterval(() => {
      if (polling) return;
      polling = true;
      void nativeSpikes
        .laptopPackageProgress()
        .then((payload) => {
          if (!active || !mounted.current) return;
          const progress = JSON.parse(payload) as LaptopTransferProgress;
          setLaptopProgress(progress);
          const message = laptopTransferMessage(progress);
          if (message) setLaptopStatus(message);
        })
        .catch(() => {})
        .finally(() => {
          polling = false;
        });
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [laptopBusy]);

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

  async function operation(action: () => Promise<string | null>, laptop = false) {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    if (laptop) {
      setLaptopBusy(true);
      setLaptopProgress({ phase: 'downloading', receivedBytes: 0, totalBytes: 0 });
      setLaptopStatus('Downloading the selected state. Keep the app open…');
    }
    setStatus('Verifying the state package and available storage…');
    try {
      const payload = await action();
      if (mounted.current) {
        if (payload) {
          detailRequest.current++;
          setDetail(null);
          setPackages(JSON.parse(payload));
          setStatus('State packages updated. Your place notes and recordings are kept.');
          if (laptop)
            setLaptopStatus(
              'State installed and ready offline. You can disconnect from the laptop.',
            );
        } else setStatus('State package selection cancelled.');
      }
    } catch (error) {
      if (mounted.current) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message);
        if (laptop) setLaptopStatus(message);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        if (laptop) {
          setLaptopBusy(false);
          setLaptopProgress(null);
        }
      }
    }
  }

  async function connectLaptop(address: string, code: string, fingerprint = ''): Promise<boolean> {
    if (!ready || inFlight.current || !nativeSpikes.laptopPackagesAvailable) return false;
    let connection;
    try {
      connection = validateLaptopConnection(address, code, fingerprint);
    } catch (error) {
      setLaptopStatus(
        error instanceof Error ? error.message : 'Check the laptop address and pairing code.',
      );
      return false;
    }
    const request = ++laptopRequest.current;
    inFlight.current = true;
    setBusy(true);
    setLaptopBusy(true);
    setLaptopCatalog(null);
    setLaptopStatus('Connecting to laptop… Allow Local Network access if asked.');
    try {
      const payload = nativeSpikes.laptopUpdatesAvailable
        ? await nativeSpikes.connectLaptopUpdates(
            connection.address,
            connection.pairingCode,
            connection.signerFingerprint ?? '',
          )
        : await nativeSpikes.connectLaptopPackages(connection.address, connection.pairingCode);
      if (!mounted.current || request !== laptopRequest.current) return false;
      const catalog = JSON.parse(payload) as LaptopCatalog;
      setLaptopCatalog(catalog);
      setLaptopStatus(
        `${catalog.packages.length} states available.${catalog.unsupportedCount ? ` ${catalog.unsupportedCount} states require a different app build.` : ''}${catalog.blockedCount ? ` ${catalog.blockedCount} older or conflicting updates were blocked.` : ''}${catalog.signerFingerprint && !catalog.signerTrusted ? ' Approve this laptop to enable newer signed packages.' : catalog.packages.length ? ' Choose a state to download or update.' : ' Restore matching public packages on the laptop and reconnect.'}`,
      );
      return true;
    } catch (error) {
      if (mounted.current && request === laptopRequest.current)
        setLaptopStatus(error instanceof Error ? error.message : 'Could not connect to laptop.');
      return false;
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        setLaptopBusy(false);
        setLaptopProgress(null);
      }
    }
  }

  async function disconnectLaptop() {
    laptopRequest.current++;
    setLaptopCatalog(null);
    setLaptopStatus('Laptop disconnected. Installed states remain available offline.');
    await nativeSpikes.disconnectLaptopPackages().catch(() => {});
  }
  async function changeLaptopCatalog(action: () => Promise<string>, message: string) {
    if (!mounted.current || !nativeSpikes.laptopUpdatesAvailable || inFlight.current) return;
    inFlight.current = true;
    const request = ++laptopRequest.current;
    setBusy(true);
    setLaptopStatus(message);
    try {
      const catalog = JSON.parse(await action()) as LaptopCatalog;
      await refreshTrustedSigners();
      if (mounted.current && request === laptopRequest.current) {
        setLaptopCatalog(catalog);
        setLaptopStatus(
          catalog.signerTrusted
            ? 'Signed updates are enabled for this laptop. Choose a state to install or update.'
            : 'Laptop update trust is not enabled. Installed maps are kept; newer packages require approval.',
        );
      }
    } catch (error) {
      if (mounted.current && request === laptopRequest.current)
        setLaptopStatus(
          error instanceof Error ? error.message : 'Could not update the laptop package list.',
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function revokeSavedLaptopSigner(fingerprint: string) {
    if (
      !nativeSpikes.laptopUpdatesAvailable ||
      inFlight.current ||
      !/^[a-f0-9]{64}$/.test(fingerprint)
    )
      return;
    inFlight.current = true;
    setBusy(true);
    try {
      await nativeSpikes.revokeStateUpdateSigner(fingerprint);
      await refreshTrustedSigners();
      if (mounted.current) {
        setLaptopCatalog((current) =>
          current?.signerFingerprint === fingerprint
            ? {
                ...current,
                signerTrusted: false,
                packages: current.packages.map((entry) => ({ ...entry, requiresTrust: true })),
              }
            : current,
        );
        setLaptopStatus(
          'Laptop update trust removed. Installed maps and rollback history are kept.',
        );
      }
    } catch (error) {
      if (mounted.current)
        setLaptopStatus(
          error instanceof Error ? error.message : 'Could not remove laptop update trust.',
        );
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
    laptopAvailable: nativeSpikes.laptopPackagesAvailable,
    laptopUpdatesAvailable: nativeSpikes.laptopUpdatesAvailable,
    trustedLaptopSigners,
    revokeSavedLaptopSigner,
    approveLaptopUpdates: () =>
      changeLaptopCatalog(() => nativeSpikes.approveLaptopUpdates(), 'Saving laptop update trust…'),
    revokeLaptopUpdates: () =>
      changeLaptopCatalog(
        () => nativeSpikes.revokeLaptopUpdates(),
        'Removing laptop update trust…',
      ),
    refreshLaptopPackages: () =>
      changeLaptopCatalog(
        () => nativeSpikes.refreshLaptopPackages(),
        'Checking available state updates…',
      ),
    laptopCatalog,
    laptopStatus,
    laptopBusy,
    laptopProgress,
    connectLaptop,
    disconnectLaptop,
    cancelLaptop: () => nativeSpikes.cancelLaptopPackage().catch(() => {}),
    installFromLaptop: (state: string) =>
      operation(() => nativeSpikes.downloadLaptopPackage(state), true),
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

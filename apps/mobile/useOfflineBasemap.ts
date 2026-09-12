import { useCallback, useEffect, useMemo, useState } from 'react';
import { File } from 'expo-file-system';
import {
  resolveOfflineBasemapSource,
  type OfflineBasemapSourceManifest,
  type ResolvedOfflineBasemapSource,
} from '@open-outdoor/map';
import type { PinnedBasemapManifest } from '@open-outdoor/storage';
import { basemapPacks, type NativeInstalledBasemap } from './basemapPacks';
import overviewManifestJson from '../../packages/map/src/assets/new-york-basemap.manifest.json';
import detailedManifestJson from '../../packages/map/src/assets/new-york-full-basemap.manifest.json';

const overviewManifest = overviewManifestJson as OfflineBasemapSourceManifest;
const detailedManifest = detailedManifestJson as unknown as PinnedBasemapManifest;

function installedCandidate(installed: NativeInstalledBasemap) {
  return {
    uri: installed.uri,
    manifest: {
      schemaVersion: overviewManifest.schemaVersion,
      regionId: overviewManifest.regionId,
      minimumZoom: installed.manifest.format.minZoom,
      maximumZoom: installed.manifest.format.maxZoom,
      archive: {
        format: 'pmtiles' as const,
        bytes: installed.manifest.byteLength,
        sha256: installed.manifest.sha256,
      },
    },
    verification: installed.verification,
  };
}

export function useOfflineBasemap(overviewUri: string | undefined) {
  const [installed, setInstalled] = useState<NativeInstalledBasemap | null>(null);
  const [checking, setChecking] = useState(basemapPacks.available);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!basemapPacks.available) return;
    let cancelled = false;
    void basemapPacks
      .active()
      .then((pack) => {
        if (!cancelled) setInstalled(pack);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setInstalled(null);
          setError(
            reason instanceof Error ? reason.message : 'Stored basemap verification failed.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const source = useMemo<ResolvedOfflineBasemapSource | null>(() => {
    if (!overviewUri) return null;
    return resolveOfflineBasemapSource({
      overview: { uri: overviewUri, manifest: overviewManifest },
      installed: installed ? installedCandidate(installed) : null,
    });
  }, [installed, overviewUri]);

  const importDetailed = useCallback(async () => {
    if (!basemapPacks.available || importing) return;
    setImporting(true);
    setError(null);
    try {
      const picked = await File.pickFileAsync({ multipleFiles: false });
      if (picked.canceled || picked.result === null) return;
      const activated = await basemapPacks.import(picked.result.uri, detailedManifest);
      setInstalled(activated);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Detailed basemap import failed.');
    } finally {
      setImporting(false);
    }
  }, [importing]);

  const removeDetailed = useCallback(async () => {
    if (!basemapPacks.available || removing) return;
    setRemoving(true);
    setError(null);
    try {
      await basemapPacks.removeActive();
      setInstalled(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Could not remove the detailed basemap.');
    } finally {
      setRemoving(false);
    }
  }, [removing]);

  return {
    source,
    checking,
    importing,
    removing,
    error,
    importAvailable: basemapPacks.available,
    detailedSizeMiB: Math.round((detailedManifest.byteLength / 1024 ** 2) * 10) / 10,
    importDetailed,
    removeDetailed,
  } as const;
}

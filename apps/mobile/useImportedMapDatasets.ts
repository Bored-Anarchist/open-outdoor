import { useEffect, useRef, useState } from 'react';
import {
  parseMapDataset,
  restoreMapDatasets,
  serializeMapDatasets,
  type ImportedMapDataset,
} from '@open-outdoor/map';
import { nativeSpikes } from './nativeSpikes';

export function useImportedMapDatasets() {
  const [datasets, setDatasets] = useState<ImportedMapDataset[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const current = useRef<ImportedMapDataset[]>([]);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!nativeSpikes.mapImportAvailable) {
      setStatus('Install the IPA with dataset import to enable this feature.');
      return () => {
        mounted.current = false;
      };
    }
    let cancelled = false;
    void nativeSpikes
      .loadMapDatasets()
      .then((payload) => {
        if (cancelled) return;
        const restored = restoreMapDatasets(payload);
        current.current = restored;
        setDatasets(restored);
        setReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setStatus(
            'Saved datasets could not load: ' +
              (error instanceof Error ? error.message : String(error)),
          );
      });
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, []);

  async function save(next: ImportedMapDataset[]) {
    await nativeSpikes.saveMapDatasets(serializeMapDatasets(next));
    current.current = next;
    if (mounted.current) setDatasets(next);
  }

  async function operation<T>(run: () => Promise<T>): Promise<T | undefined> {
    if (!ready || inFlight.current) return undefined;
    inFlight.current = true;
    setBusy(true);
    try {
      return await run();
    } catch (error) {
      if (mounted.current) setStatus(error instanceof Error ? error.message : String(error));
      return undefined;
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const importDataset = () =>
    operation(async () => {
      setStatus('Choose a GeoJSON dataset from Files.');
      const selected = await nativeSpikes.pickMapDataset();
      if (selected === null) {
        if (mounted.current) setStatus('Import cancelled.');
        return undefined;
      }
      if (current.current.some((dataset) => dataset.id === selected.id))
        throw new Error('This exact dataset is already imported.');
      if (mounted.current) setStatus('Validating and saving the dataset…');
      const dataset = parseMapDataset(selected.text, selected.id, selected.name);
      await save([...current.current, dataset]);
      if (mounted.current)
        setStatus(
          `Imported ${dataset.collection.features.length.toLocaleString()} features from ${dataset.name}.`,
        );
      return dataset;
    });

  const toggleDataset = (id: string) =>
    operation(async () => {
      await save(
        current.current.map((dataset) =>
          dataset.id === id ? { ...dataset, visible: !dataset.visible } : dataset,
        ),
      );
      if (mounted.current) setStatus('Dataset visibility saved.');
    });

  const removeDataset = (id: string) =>
    operation(async () => {
      await save(current.current.filter((dataset) => dataset.id !== id));
      if (mounted.current) setStatus('Dataset removed. Your place notes and recordings are kept.');
    });

  // A failed restore must be explicitly discarded rather than overwritten by a new import.
  const resetDatasets = async () => {
    if (inFlight.current || !nativeSpikes.mapImportAvailable) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await save([]);
      if (mounted.current) {
        setReady(true);
        setStatus('Imported dataset storage cleared. Choose your files again.');
      }
    } catch (error) {
      if (mounted.current) setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return {
    datasets,
    ready,
    busy,
    status,
    importDataset,
    toggleDataset,
    removeDataset,
    resetDatasets,
  };
}

export type ImportedMapDatasetsService = ReturnType<typeof useImportedMapDatasets>;

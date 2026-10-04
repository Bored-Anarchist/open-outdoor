import { useEffect, useRef, useState } from 'react';
import type { PlaceJournalEntry } from '@open-outdoor/storage';
import type { PlaceJournalService } from './privatePersistence';

export interface JournalPlace {
  readonly id: string;
  readonly name: string;
}

/** Saves belong to their original place, even if selection changes during a protected write. */
export function usePlaceJournal(service: PlaceJournalService | null, place: JournalPlace | null) {
  const [entry, setEntry] = useState<PlaceJournalEntry | null>(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    generation.current++;
    const saved = service && place ? service.get(place.id) : null;
    setEntry(saved);
    setDraft(saved?.note ?? '');
    setStatus('');
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [service, place?.id]);

  async function save(checkIn: boolean): Promise<void> {
    if (!service || !place || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const request = generation.current;
    const occurredAt = new Date().toISOString();
    setStatus(checkIn ? 'Saving private check-in…' : 'Saving private note…');
    try {
      const saved = await service.save(place.id, (prior) => ({
        featureId: place.id,
        featureName: place.name,
        note: draft,
        checkIns: checkIn
          ? [
              ...(prior?.checkIns ?? []),
              {
                id: `checkin-${Date.now()}-${(prior?.checkIns.length ?? 0) + 1}`,
                occurredAt,
              },
            ]
          : (prior?.checkIns ?? []),
        updatedAt: occurredAt,
      }));
      if (request === generation.current) {
        setEntry(saved);
        setDraft(saved.note);
        setStatus(
          checkIn ? 'Checked in. Your note is saved privately.' : 'Your private note is saved.',
        );
      }
    } catch (error) {
      if (request === generation.current)
        setStatus(
          `Could not save privately: ${error instanceof Error ? error.message : String(error)}`,
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { entry, draft, setDraft, status, busy, save };
}

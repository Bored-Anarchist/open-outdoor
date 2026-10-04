import { InMemoryPrivateRepository, type PlaceJournalEntry } from '@open-outdoor/storage';
import type { RecorderPersistence } from '@open-outdoor/recorder';
import type { nativeSpikes } from './nativeSpikes';

export interface PlaceJournalService {
  readonly get: (featureId: string) => PlaceJournalEntry | null;
  readonly save: (
    featureId: string,
    change: (prior: PlaceJournalEntry | null) => PlaceJournalEntry,
  ) => Promise<PlaceJournalEntry>;
}

/** One write queue keeps note commits and recorder checkpoints in the same private snapshot. */
export function createPrivatePersistence(
  repository: InMemoryPrivateRepository,
  store: Pick<typeof nativeSpikes, 'commitPrivateSnapshot' | 'commitTrackingSnapshot'>,
) {
  let queue = Promise.resolve();
  function persist<T>(operation: () => Promise<T>): Promise<T> {
    const next = queue.then(operation);
    queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  const persistence: RecorderPersistence = {
    commit: (snapshot, tracking) =>
      persist(() => {
        // A checkpoint may have been prepared while a note commit was still pending.
        const json = JSON.stringify({
          ...snapshot,
          placeJournal: repository.listPlaceJournal(),
        });
        return tracking === undefined
          ? store.commitPrivateSnapshot(json)
          : store.commitTrackingSnapshot(json, tracking.sessionId, tracking.highestSequence);
      }),
  };
  const placeJournal: PlaceJournalService = {
    get: (id) => repository.placeJournalFor(id),
    save: (id, change) =>
      persist(async () => {
        const draft = new InMemoryPrivateRepository(repository.exportSnapshot());
        const saved = draft.savePlaceJournal(change(draft.placeJournalFor(id)));
        await store.commitPrivateSnapshot(JSON.stringify(draft.exportSnapshot()));
        // Publish only after the protected store confirms the write.
        return repository.savePlaceJournal(saved);
      }),
  };
  return { persistence, placeJournal };
}

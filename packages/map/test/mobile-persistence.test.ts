import { expect, it, vi } from 'vitest';
import { InMemoryPrivateRepository, type PlaceJournalEntry } from '../../storage/src';
import { createPrivatePersistence } from '../../../apps/mobile/privatePersistence';

const entry: PlaceJournalEntry = {
  featureId: 'synthetic-place',
  featureName: 'Synthetic place',
  note: 'New note',
  checkIns: [],
  updatedAt: '2026-10-03T12:00:00.000Z',
};
function setup() {
  const repository = new InMemoryPrivateRepository();
  const store = {
    commitPrivateSnapshot: vi.fn(async () => {}),
    commitTrackingSnapshot: vi.fn(async () => {}),
  };
  return { repository, store, ...createPrivatePersistence(repository, store) };
}

it('does not publish a failed note save and allows retry', async () => {
  const { repository, store, placeJournal } = setup();
  store.commitPrivateSnapshot.mockRejectedValueOnce(new Error('Storage full'));
  await expect(placeJournal.save(entry.featureId, () => entry)).rejects.toThrow('Storage full');
  expect(repository.placeJournalFor(entry.featureId)).toBeNull();
  await placeJournal.save(entry.featureId, () => entry);
  expect(repository.placeJournalFor(entry.featureId)?.note).toBe('New note');
});

it('keeps newly saved notes when a previously prepared tracking checkpoint commits', async () => {
  const { repository, store, placeJournal, persistence } = setup();
  const oldSnapshot = repository.exportSnapshot();
  let release!: () => void;
  store.commitPrivateSnapshot.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const saved = placeJournal.save(entry.featureId, () => entry);
  const checkpoint = persistence.commit(oldSnapshot, {
    sessionId: 'synthetic-session',
    highestSequence: 7,
  });
  await Promise.resolve();
  expect(store.commitTrackingSnapshot).not.toHaveBeenCalled();
  release();
  await Promise.all([saved, checkpoint]);
  const [payload, id, sequence] = store.commitTrackingSnapshot.mock.calls[0]! as unknown as [
    string,
    string,
    number,
  ];
  expect(JSON.parse(payload).placeJournal).toEqual([entry]);
  expect([id, sequence]).toEqual(['synthetic-session', 7]);
});

it('merges concurrent check-ins using the latest committed journal entry', async () => {
  const { placeJournal } = setup();
  const checkIn = (prior: PlaceJournalEntry | null): PlaceJournalEntry => ({
    ...entry,
    checkIns: [
      ...(prior?.checkIns ?? []),
      { id: `synthetic-${(prior?.checkIns.length ?? 0) + 1}`, occurredAt: entry.updatedAt },
    ],
  });
  await Promise.all([
    placeJournal.save(entry.featureId, checkIn),
    placeJournal.save(entry.featureId, checkIn),
  ]);
  expect(placeJournal.get(entry.featureId)?.checkIns.map((item) => item.id)).toEqual([
    'synthetic-1',
    'synthetic-2',
  ]);
});

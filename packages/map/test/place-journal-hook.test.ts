import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { InMemoryPrivateRepository } from '../../storage/src';
import { createPrivatePersistence } from '../../../apps/mobile/privatePersistence';
import { usePlaceJournal, type JournalPlace } from '../../../apps/mobile/usePlaceJournal';

let root: ReturnType<typeof create>;
let journal: ReturnType<typeof usePlaceJournal>;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
});
const first = { id: 'synthetic-first', name: 'First place' };
const second = { id: 'synthetic-second', name: 'Second place' };
const time = '2026-10-03T12:00:00.000Z';
function setup() {
  const repository = new InMemoryPrivateRepository();
  repository.savePlaceJournal({
    featureId: second.id,
    featureName: second.name,
    note: 'Second note',
    checkIns: [],
    updatedAt: time,
  });
  const commit = vi.fn(async () => {});
  const { placeJournal } = createPrivatePersistence(repository, {
    commitPrivateSnapshot: commit,
    commitTrackingSnapshot: vi.fn(async () => {}),
  });
  function Harness({ place = first }: { place?: JournalPlace }) {
    journal = usePlaceJournal(placeJournal, place);
    return null;
  }
  return { repository, commit, Harness };
}
it('does not put a late save into the draft for a different place', async () => {
  const { repository, commit, Harness } = setup();
  let release!: () => void;
  commit.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await act(async () => {
    root = create(createElement(Harness));
  });
  await act(async () => journal.setDraft('First note'));
  let saving!: Promise<void>;
  await act(async () => {
    saving = journal.save(false);
  });
  await act(async () => root.update(createElement(Harness, { place: second })));
  expect(journal.draft).toBe('Second note');
  await act(async () => {
    release();
    await saving;
  });
  expect(repository.placeJournalFor(first.id)?.note).toBe('First note');
  expect(journal.draft).toBe('Second note');
  expect(journal.entry?.featureId).toBe(second.id);
  expect(journal.status).toBe('');
});
it('prevents overlapping note/check-in writes and keeps a failed draft for retry', async () => {
  const { commit, Harness } = setup();
  let reject!: (error: Error) => void;
  commit.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      }),
  );
  await act(async () => {
    root = create(createElement(Harness));
  });
  await act(async () => journal.setDraft('Keep this draft'));
  let saving!: Promise<void>;
  await act(async () => {
    saving = journal.save(false);
    await journal.save(true);
  });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(journal.busy).toBe(true);
  await act(async () => {
    reject(new Error('Storage full'));
    await saving;
  });
  expect(journal.draft).toBe('Keep this draft');
  expect(journal.entry).toBeNull();
  expect(journal.status).toContain('Storage full');
  await act(async () => journal.save(true));
  expect(journal.entry?.checkIns).toHaveLength(1);
});

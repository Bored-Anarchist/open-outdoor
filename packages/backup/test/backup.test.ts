import { describe, expect, it } from 'vitest';
import { BackupError, createEncryptedBackup, transactionalRestore } from '../src/index.js';
import { InMemoryPrivateRepository } from '@open-outdoor/storage';

const passphrase = 'correct horse battery staple';

function fixture() {
  const repository = new InMemoryPrivateRepository();
  repository.createActivity({
    id: 'activity-1',
    name: 'Private hike',
    mode: 'balanced',
    lifecycle: 'recording',
    startedAt: '2026-08-23T12:00:00.000Z',
    finishedAt: null,
  });
  return repository.exportSnapshot();
}

describe('WP-107 authenticated all-or-nothing backup restore', () => {
  it('round trips private data and selected attachments', () => {
    const bytes = createEncryptedBackup(
      fixture(),
      [{ id: 'photo-1', fileName: 'photo.jpg', bytes: new Uint8Array([1, 2, 3]) }],
      passphrase,
    );
    let committed = false;
    const restored = transactionalRestore(bytes, passphrase, () => {
      committed = true;
    });
    expect(committed).toBe(true);
    expect(restored.snapshot.activities[0]?.id).toBe('activity-1');
    expect(restored.attachments[0]?.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it.each(['wrong-key', 'tamper', 'truncation'])(
    'leaves existing private data untouched after %s',
    (failure) => {
      let bytes = createEncryptedBackup(fixture(), [], passphrase);
      let key = passphrase;
      if (failure === 'wrong-key') key = 'different secure passphrase';
      if (failure === 'tamper') {
        bytes = bytes.slice();
        const index = Math.floor(bytes.length / 2);
        bytes[index] = (bytes[index] ?? 0) ^ 1;
      }
      if (failure === 'truncation') bytes = bytes.slice(0, -8);
      const existing = fixture();
      let committed = existing;
      expect(() =>
        transactionalRestore(bytes, key, (restored) => {
          committed = restored.snapshot;
        }),
      ).toThrow(BackupError);
      expect(committed).toEqual(existing);
    },
  );
});

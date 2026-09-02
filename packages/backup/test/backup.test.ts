import { describe, expect, it } from 'vitest';
import { createCipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import {
  BackupError,
  InMemoryAtomicRestoreTarget,
  createEncryptedBackup,
  evaluatePreUninstallBackup,
  restoreToAtomicTarget,
  stageEncryptedRestore,
  transactionalRestore,
  validateDecryptedBackup,
} from '../src/index.js';
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

function legacyContainer(): Uint8Array {
  const snapshot = { ...fixture(), schemaVersion: 2 };
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const header = {
    magic: 'OPEN-OUTDOOR-BACKUP',
    formatVersion: 1,
    cipher: 'AES-256-GCM',
    kdf: 'scrypt',
    kdfParameters: { N: 16_384, r: 8, p: 1 },
    salt: salt.toString('base64'),
    nonce: nonce.toString('base64'),
  };
  const payload = {
    createdAt: '2026-08-23T12:00:00.000Z',
    snapshot,
    manifest: {
      privateSchemaVersion: 2,
      activityCount: 1,
      userTrailCount: 0,
      overlayCount: 0,
      attachmentCount: 0,
      attachmentHashes: {},
    },
    attachments: [],
  };
  const key = scryptSync(passphrase, salt, 32, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(JSON.stringify(header)));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload))),
    cipher.final(),
  ]);
  key.fill(0);
  return Buffer.from(
    JSON.stringify({
      header,
      ciphertext: ciphertext.toString('base64'),
      authenticationTag: cipher.getAuthTag().toString('base64'),
    }),
  );
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

describe('WP-306 complete encrypted backup and restore', () => {
  it('restores the previous major container format', () => {
    expect(stageEncryptedRestore(legacyContainer(), passphrase).snapshot).toMatchObject({
      schemaVersion: 3,
      activities: [{ id: 'activity-1' }],
    });
  });

  it('encrypts a complete manifest and restores the previous private schema transactionally', () => {
    const previous = { ...fixture(), schemaVersion: 2 };
    const bytes = createEncryptedBackup(
      previous,
      [
        {
          id: 'photo-1',
          fileName: 'photo.jpg',
          bytes: new Uint8Array([1, 2, 3]),
          ownerType: 'activity',
          ownerId: 'activity-1',
          mediaType: 'image/jpeg',
        },
      ],
      passphrase,
    );
    const restored = stageEncryptedRestore(bytes, passphrase);
    expect(restored.snapshot.schemaVersion).toBe(3);
    expect(restored.attachments[0]).toMatchObject({
      ownerType: 'activity',
      ownerId: 'activity-1',
      mediaType: 'image/jpeg',
    });
  });

  it('rejects corrupt attachment bytes even when payload authentication already passed', () => {
    const snapshot = fixture();
    expect(() =>
      validateDecryptedBackup({
        createdAt: '2026-09-02T12:00:00.000Z',
        snapshot,
        manifest: {
          privateSchemaVersion: 3,
          snapshotHash: createHash('sha256')
            .update(Buffer.from(JSON.stringify(snapshot)))
            .digest('hex'),
          recordCounts: {
            activities: 1,
            userTrails: 0,
            associations: 0,
            overlays: 0,
            revisions: 0,
            importExportHistory: 0,
            settings: 0,
            catalogInventory: 0,
          },
          attachmentCount: 1,
          attachments: [
            {
              id: 'photo',
              fileName: 'photo.jpg',
              ownerType: null,
              ownerId: null,
              mediaType: null,
              byteLength: 3,
              sha256: '0'.repeat(64),
            },
          ],
        },
        attachments: [
          {
            id: 'photo',
            fileName: 'photo.jpg',
            ownerType: null,
            ownerId: null,
            mediaType: null,
            bytes: Buffer.from([9, 9, 9]).toString('base64'),
          },
        ],
      }),
    ).toThrow(BackupError);
  });

  it('preflights low space and rolls back a failed atomic commit', () => {
    const original = { snapshot: fixture(), attachments: [], createdAt: '2026-09-01T00:00:00Z' };
    const target = new InMemoryAtomicRestoreTarget(original);
    const bytes = createEncryptedBackup(fixture(), [], passphrase);
    expect(() => stageEncryptedRestore(bytes, passphrase, 1)).toThrowError(
      expect.objectContaining({ code: 'SPACE_INSUFFICIENT' }),
    );
    expect(() =>
      restoreToAtomicTarget(bytes, passphrase, {
        stage: (restored) => target.stage(restored),
        commit: () => {
          throw new Error('simulated atomic swap failure');
        },
        rollback: (staged) => target.rollback(staged),
      }),
    ).toThrow('simulated atomic swap failure');
    expect(target.read()).toEqual(original);
  });

  it('blocks uninstall without a current verified backup and independent recovery secret', () => {
    expect(
      evaluatePreUninstallBackup({
        verifiedAt: '2026-09-01T10:00:00.000Z',
        privateDataChangedAt: '2026-09-01T11:00:00.000Z',
        independentRecoverySecretConfirmed: false,
      }),
    ).toEqual({
      safeToContinue: false,
      reasons: ['BACKUP_STALE', 'RECOVERY_SECRET_NOT_CONFIRMED'],
    });
  });
});

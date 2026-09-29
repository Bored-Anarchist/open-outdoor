import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  stagePrivateDirectory,
  activatePrivateDirectory,
  recoverPrivateDirectory,
  replaceManifest,
  writeImmutable,
} from './private-package-transaction.mjs';

test('manifest activation failure preserves the previous pointer and succeeds on retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-manifest-'));
  try {
    await writeFile(join(root, 'manifest.json'), 'old');
    await assert.rejects(
      replaceManifest(root, 'manifest.json', Buffer.from('new'), {
        beforeActivate: () => {
          throw Error('injected failure');
        },
      }),
      /injected/,
    );
    assert.equal(await readFile(join(root, 'manifest.json'), 'utf8'), 'old');
    await replaceManifest(root, 'manifest.json', Buffer.from('new'));
    assert.equal(await readFile(join(root, 'manifest.json'), 'utf8'), 'new');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('directory activation rolls back interrupted publication and preserves the stage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-directory-')),
    active = join(root, 'current');
  try {
    await mkdir(active);
    await writeFile(join(active, 'manifest.json'), 'old');
    const stage = await stagePrivateDirectory(active);
    await writeFile(join(stage, 'manifest.json'), 'new');
    await assert.rejects(
      activatePrivateDirectory(active, stage, {
        afterBackup: () => {
          throw Error('injected failure');
        },
      }),
      /injected/,
    );
    assert.equal(await readFile(join(active, 'manifest.json'), 'utf8'), 'old');
    assert.equal(await readFile(join(stage, 'manifest.json'), 'utf8'), 'new');
    const backup = await activatePrivateDirectory(active, stage);
    assert.equal(await readFile(join(active, 'manifest.json'), 'utf8'), 'new');
    assert.equal(await readFile(join(backup, 'manifest.json'), 'utf8'), 'old');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('next invocation recovers an activation journal left after a process interruption', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-journal-')),
    active = join(root, 'current'),
    backup = join(root, 'current.previous-test'),
    stage = join(root, '.current.staging-test');
  try {
    await mkdir(active);
    await writeFile(join(active, 'manifest.json'), 'old');
    await mkdir(stage);
    await writeFile(join(stage, 'manifest.json'), 'new');
    await writeFile(
      join(root, '.current.activation.json'),
      JSON.stringify({ active, backup, stage }),
    );
    await rename(active, backup);
    await recoverPrivateDirectory(active);
    assert.equal(await readFile(join(active, 'manifest.json'), 'utf8'), 'old');
    assert.equal(await readFile(join(stage, 'manifest.json'), 'utf8'), 'new');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('immutable publication permits identical retries and preserves collisions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-immutable-'));
  try {
    await writeImmutable(root, 'artifact.json', Buffer.from('complete'));
    await writeImmutable(root, 'artifact.json', Buffer.from('complete'));
    await assert.rejects(
      writeImmutable(root, 'artifact.json', Buffer.from('different')),
      /collision/,
    );
    assert.equal(await readFile(join(root, 'artifact.json'), 'utf8'), 'complete');
    await writeFile(join(root, 'artifact.json'), 'damaged');
    await writeImmutable(root, 'artifact.json', Buffer.from('complete'), { repairCorrupt: true });
    assert.equal(await readFile(join(root, 'artifact.json'), 'utf8'), 'complete');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('failed first directory activation leaves the staged generation available for retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-new-directory-')),
    active = join(root, 'current');
  try {
    const stage = await stagePrivateDirectory(active);
    await writeFile(join(stage, 'manifest.json'), 'new');
    await assert.rejects(
      activatePrivateDirectory(active, stage, {
        afterBackup: () => {
          throw Error('injected failure');
        },
      }),
      /injected/,
    );
    await activatePrivateDirectory(active, stage);
    assert.equal(await readFile(join(active, 'manifest.json'), 'utf8'), 'new');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

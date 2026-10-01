import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, cp, unlink, stat, link } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function writeImmutable(directory, file, bytes, { repairCorrupt = false } = {}) {
  if (basename(file) !== file) throw new Error('Immutable artifact must be a filename');
  const path = join(directory, file);
  const temporary = join(directory, `.${file}.${randomUUID()}.pending`);
  await writeFile(temporary, bytes, { flag: 'wx' });
  try {
    // Publish a complete file atomically without replacing an existing generation.
    try {
      await link(temporary, path);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await readFile(path);
      if (!existing.equals(bytes)) {
        if (!repairCorrupt) throw new Error(`Immutable artifact collision: ${file}`);
        await rename(path, `${path}.corrupt-${randomUUID()}`);
        await link(temporary, path);
      }
    }
  } finally {
    await unlink(temporary);
  }
}
export async function replaceManifest(directory, file, bytes, { beforeActivate } = {}) {
  const path = join(directory, file);
  try {
    const previous = await readFile(path);
    await writeImmutable(directory, `${file}.${hash(previous)}.previous`, previous);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = join(directory, `.${file}.${randomUUID()}.pending`);
  await writeFile(temporary, bytes);
  if (beforeActivate) await beforeActivate();
  // All artifacts are immutable and complete before the single manifest pointer changes.
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(temporary, path);
      break;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
const exists = async (path) =>
  stat(path).then(
    () => true,
    (error) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    },
  );
function journalPath(active) {
  return join(dirname(active), `.${basename(active)}.activation.json`);
}
export async function recoverPrivateDirectory(active) {
  active = resolve(active);
  let journal;
  try {
    journal = JSON.parse(await readFile(journalPath(active), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (
    journal.active !== active ||
    [journal.backup, journal.stage].some((p) => dirname(resolve(p)) !== dirname(active)) ||
    !basename(journal.backup).startsWith(`${basename(active)}.previous-`) ||
    !basename(journal.stage).startsWith(`.${basename(active)}.staging-`)
  )
    throw new Error('Invalid private activation journal');
  if (!(await exists(active))) {
    if (await exists(journal.backup)) await rename(journal.backup, active);
    else if (journal.hadPrevious !== false)
      throw new Error('Private activation recovery needs the preserved prior directory');
  }
  await unlink(journalPath(active));
}
export async function stagePrivateDirectory(active, { copyCurrent = true } = {}) {
  active = resolve(active);
  await recoverPrivateDirectory(active);
  const stage = join(dirname(active), `.${basename(active)}.staging-${randomUUID()}`);
  if (copyCurrent && (await exists(active)))
    await cp(active, stage, { recursive: true, errorOnExist: true, force: false });
  else await mkdir(stage, { recursive: true });
  return stage;
}
export async function activatePrivateDirectory(active, stage, { afterBackup } = {}) {
  active = resolve(active);
  stage = resolve(stage);
  await recoverPrivateDirectory(active);
  const backup = join(dirname(active), `${basename(active)}.previous-${randomUUID()}`);
  if (
    dirname(stage) !== dirname(active) ||
    !basename(stage).startsWith(`.${basename(active)}.staging-`)
  )
    throw new Error('Private stage must be an isolated sibling directory');
  const hadPrevious = await exists(active);
  await writeImmutable(
    dirname(active),
    basename(journalPath(active)),
    Buffer.from(JSON.stringify({ active, backup, stage, hadPrevious }) + '\n'),
  );
  try {
    if (await exists(active)) await rename(active, backup);
    if (afterBackup) await afterBackup();
    await rename(stage, active);
    await unlink(journalPath(active));
  } catch (error) {
    await recoverPrivateDirectory(active);
    throw error;
  }
  return backup;
}

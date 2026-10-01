import { createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export const sourceHash = (value) => createHash('sha256').update(value).digest('hex');
export const sourceSignature = (value) => sourceHash(JSON.stringify(value));

// Never reuse a source on a date, feature count, or object ID inventory alone.
export async function reusableSource(directory, signature, revision, filename = 'raw.geojson') {
  if (!Number.isSafeInteger(revision) || revision <= 0) return null;
  try {
    const receipt = JSON.parse(await readFile(join(directory, 'receipt.json'), 'utf8'));
    if (receipt.refreshSignature !== signature || receipt.sourceRevision !== revision) return null;
    const file = receipt.rawFilename ?? filename;
    if (!/^raw(?:-[a-f0-9]{64})?\.(?:geojson|zip|kml|json|csv|gpkg)$/.test(file)) return null;
    const bytes = await readFile(join(directory, file));
    return bytes.length === receipt.bytes && sourceHash(bytes) === receipt.sha256 ? receipt : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function atomicSourceWrite(path, bytes) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

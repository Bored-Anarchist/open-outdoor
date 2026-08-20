import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  composeSyntheticPrivateCatalog,
  validatePrivateRoot,
} from '../../../tools/private-root-lib.mjs';

async function privateRoot() {
  const root = await mkdtemp(join(tmpdir(), 'open-outdoor-private-'));
  await mkdir(join(root, 'connectors', 'synthetic'), { recursive: true });
  await writeFile(
    join(root, 'open-outdoor.private.json'),
    JSON.stringify({
      schemaVersion: 1,
      classification: 'private',
      retention: 'indefinite',
      synthetic: true,
      connectors: ['connectors/synthetic'],
    }),
  );
  return root;
}

describe('external private-root composition', () => {
  it('rejects roots inside the public checkout', async () => {
    await expect(
      validatePrivateRoot(resolve('fixtures/private-root-template'), process.cwd()),
    ).rejects.toThrow(/must not contain/);
  });

  it('discovers a synthetic manifest and writes only under the external root', async () => {
    const root = await privateRoot();
    const output = await composeSyntheticPrivateCatalog(root, process.cwd());
    const outputRelation = relative(root, output);
    expect(outputRelation.startsWith('..') || isAbsolute(outputRelation)).toBe(false);
    expect(JSON.parse(await readFile(output, 'utf8'))).toMatchObject({
      classification: 'private',
      synthetic: true,
    });
  });

  it('rejects connector traversal outside the private root', async () => {
    const root = await privateRoot();
    await writeFile(
      join(root, 'open-outdoor.private.json'),
      JSON.stringify({
        schemaVersion: 1,
        classification: 'private',
        retention: 'indefinite',
        synthetic: true,
        connectors: ['../../escape'],
      }),
    );
    await expect(validatePrivateRoot(root, process.cwd())).rejects.toThrow(/escapes/);
  });
});

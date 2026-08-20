import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanPublicBoundary } from '../../../tools/public-boundary.mjs';

describe('public publication boundary', () => {
  it.each([
    ['secret', ['OPEN', 'OUTDOOR', 'TEST', 'SECRET', 'BLOCK'].join('_')],
    ['private location', ['OPEN', 'OUTDOOR', 'TEST', 'PRIVATE_LOCATION', 'BLOCK'].join('_')],
    ['private classification', '{"classification":"private"}'],
  ])('blocks a deliberate %s fixture', async (_name, content) => {
    const root = await mkdtemp(join(tmpdir(), 'open-outdoor-boundary-'));
    const extension = _name === 'private classification' ? 'json' : 'txt';
    await writeFile(join(root, `candidate.${extension}`), content);
    expect(await scanPublicBoundary(root)).not.toHaveLength(0);
  });

  it('blocks prohibited private paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'open-outdoor-boundary-'));
    await mkdir(join(root, 'user-data'));
    await writeFile(join(root, 'user-data', 'track.txt'), 'not actually private');
    expect(await scanPublicBoundary(root)).not.toHaveLength(0);
  });
});

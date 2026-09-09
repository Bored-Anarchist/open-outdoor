import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { validateConnectorManifest } from '../src/connector.js';
// @ts-expect-error source tooling is intentionally plain Node ESM
import { createSource } from '../../../tools/source.mjs';

describe('WP-401 generated connector', () => {
  it('generates every artifact and runs the generated contract without registration edits', async () => {
    const parent = resolve('packages/data/connectors');
    await mkdir(parent, { recursive: true });
    const temporary = await mkdtemp(join(parent, 'scaffold-test-'));
    try {
      const directory = (await createSource('synthetic-example', temporary)) as string;
      const manifest = validateConnectorManifest(
        JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')),
      );
      expect(manifest.classification).toBe('PUBLIC_SYNTHETIC');
      expect(manifest.allowedHosts).toEqual([]);
      for (const file of [
        'model.ts',
        'connector.ts',
        'fixture.json',
        'contract.test.ts',
        'attribution.md',
        'health.json',
        'README.md',
      ]) {
        expect((await readFile(join(directory, file), 'utf8')).length).toBeGreaterThan(0);
      }
      const result = await promisify(execFile)(
        process.execPath,
        ['node_modules/vitest/vitest.mjs', 'run', join(directory, 'contract.test.ts')],
        { cwd: resolve('.'), timeout: 30_000 },
      );
      expect(result.stdout).toContain('1 passed');
      await expect(createSource('synthetic-example', temporary)).rejects.toThrow();
      await expect(createSource('../escape', temporary)).rejects.toThrow();
      await expect(createSource('con', temporary)).rejects.toThrow();
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }, 40_000);
});

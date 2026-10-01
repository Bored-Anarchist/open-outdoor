import { readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repository = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
if (args.length !== 1 || !['types', 'release-tests'].includes(args[0]))
  throw new Error('Usage: repository-checks.mjs types|release-tests');

async function discover(directory, filename) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !['node_modules', 'dist', '.private-map-data'].includes(entry.name))
      result.push(...(await discover(join(directory, entry.name), filename)));
    else if (entry.isFile() && filename(entry.name)) result.push(join(directory, entry.name));
  }
  return result.sort();
}

let parameters;
if (args[0] === 'types') {
  const projects = [];
  for (const parent of ['apps', 'packages']) {
    for (const entry of await readdir(join(repository, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const contents = await readdir(join(repository, parent, entry.name));
      if (contents.includes('tsconfig.json')) projects.push(`${parent}/${entry.name}`);
    }
  }
  if (!projects.length) throw new Error('No TypeScript projects discovered');
  parameters = ['node_modules/typescript/bin/tsc', '-b', ...projects.sort()];
} else {
  const files = await discover(
    join(repository, 'tools/test'),
    (name) => name.endsWith('.test.mjs') && name !== 'dependency-compatibility.test.mjs',
  );
  if (!files.length) throw new Error('No release tests discovered');
  parameters = ['--test', ...files];
}
const result = spawnSync(process.execPath, parameters, { cwd: repository, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

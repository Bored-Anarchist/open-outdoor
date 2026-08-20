import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workflowDirectory = resolve(root, '.github', 'workflows');
const names = (await readdir(workflowDirectory))
  .filter((name) => /\.ya?ml$/i.test(name))
  .map((name) => resolve(workflowDirectory, name));
names.push(
  resolve(
    root,
    'templates',
    'private-downstream',
    '.github',
    'workflows',
    'private-compatibility.yml',
  ),
);

const failures = [];
for (const name of names) {
  const document = parseDocument(await readFile(name, 'utf8'), { prettyErrors: true });
  for (const error of document.errors) failures.push(`${name}: ${error.message}`);
  if (!document.get('on') || !document.get('jobs'))
    failures.push(`${name}: workflow requires on and jobs`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log(`${names.length} workflow files are valid YAML with triggers and jobs`);

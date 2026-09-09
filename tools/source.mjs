import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function createSource(id, parent = join(repository, 'packages/data/connectors')) {
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ||
    id.length > 64 ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(id)
  )
    throw new Error('connector ID must be safe lowercase kebab-case');
  const destination = resolve(parent, id);
  await mkdir(parent, { recursive: true });
  // Refuse existing destinations; do not overwrite connector work or follow directory links.
  await mkdir(destination);
  const sdk = relative(destination, join(repository, 'packages/data/src/index.js')).replaceAll(
    '\\',
    '/',
  );
  const files = [
    'manifest.json',
    'model.ts',
    'connector.ts',
    'fixture.json',
    'contract.test.ts',
    'attribution.md',
    'health.json',
    'README.md',
  ];
  for (const file of files) {
    const template = await readFile(
      join(repository, 'templates/connector', `${file}.template`),
      'utf8',
    );
    await writeFile(
      join(destination, file),
      template
        .replaceAll('__SOURCE_ID__', id)
        .replaceAll('__SDK__', sdk.startsWith('.') ? sdk : `./${sdk}`),
      { flag: 'wx' },
    );
  }
  return destination;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, id, ...extra] = process.argv.slice(2);
  if (command !== 'create' || !id || extra.length) {
    console.error('Usage: pnpm source create <connector-id>');
    process.exitCode = 1;
  } else {
    try {
      console.log(await createSource(id));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}

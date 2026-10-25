import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, join, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPrivateNewYorkProfiles } from './build-private-new-york-profiles.mjs';

export async function rebuildPrivateNewYork() {
  const repository = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const settings = JSON.parse(
    await readFile(join(repository, '.private/package-maintenance.json')),
  ).newYorkPrivate;
  if (!settings)
    throw new Error(
      'newYorkPrivate build inputs must be configured in local package-maintenance settings',
    );
  const privateRoot = join(repository, 'PrivateData');
  for (const key of ['inputDirectory', 'npsSnapshotPath', 'federalSnapshotPath', 'reviewCsvPath']) {
    if (typeof settings[key] !== 'string') throw new Error(`Missing NY private input: ${key}`);
    const path = relative(privateRoot, resolve(settings[key]));
    if (!path || path === '..' || path.startsWith('..' + sep) || isAbsolute(path))
      throw new Error(`NY private input must stay in PrivateData: ${key}`);
  }
  const sourceDirectory = join(privateRoot, 'catalogs/US/New York/dec-source-acquisition/current');
  const profiles = await buildPrivateNewYorkProfiles({
    privateRoot,
    sourceDirectory,
    ...(settings.terrainCache ? { terrainCache: settings.terrainCache } : {}),
  });
  const args = [
    'tools/catalog/ioverlander-private-catalog.mjs',
    '--input',
    settings.inputDirectory,
    '--output',
    join(privateRoot, 'catalogs/US/New York/current'),
    '--dec',
    join(sourceDirectory, 'new-york-outdoors.geojson'),
    '--profiles',
    profiles.outputDirectory,
    '--review',
    settings.reviewCsvPath,
    '--nps',
    settings.npsSnapshotPath,
    '--federal',
    settings.federalSnapshotPath,
  ];
  await new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repository,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error(`Private NY rebuild failed (${code}); prior active package retained`)),
    );
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await rebuildPrivateNewYork();

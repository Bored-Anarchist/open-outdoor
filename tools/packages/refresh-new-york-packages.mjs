#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDecRefreshInputs } from '../acquisition/acquire-outdoor-map.mjs';
import { loadOprhpRefreshInputs } from '../acquisition/stage-private-new-york-oprhp.mjs';

// NY has different source receipts and builders from the other 49 states.
// Keep acquisition, packaging and unresolved sources visible in one command.
const repository = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const output = join(repository, '.scratch/package-maintenance', `ny-${Date.now()}`);
await mkdir(output, { recursive: true });
const results = [];
const run = (executable, args) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, { cwd: repository, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolveRun() : reject(new Error(`exit ${code}`))));
  });
async function step(source, args) {
  try {
    await run(process.execPath, args);
    results.push({ source, status: 'succeeded' });
    return true;
  } catch {
    results.push({
      source,
      status: 'unresolved',
      reason: 'Command failed; last-good package retained. See command output.',
    });
    return false;
  }
}
try {
  results.push({
    source: 'ioverlander',
    status: 'unresolved',
    reason: 'Uses reviewed local archives; no new archive acquired by this command.',
  });
  const expectedPython = (await readFile(join(repository, '.python-version'), 'utf8')).trim();
  await run(process.env.OPEN_OUTDOOR_PYTHON ?? 'python', [
    '-c',
    "import sys; assert sys.version.split()[0] == sys.argv[1], 'Pinned Python runtime required'; import mapbox_vector_tile, pmtiles",
    expectedPython,
  ]);
  const boundary = join(output, 'boundary');
  const nps = join(output, 'nps');
  const federal = join(output, 'federal');
  const boundaryReady = await step('boundary', [
    'tools/acquisition/acquire-new-york-boundary.mjs',
    boundary,
  ]);
  const npsReady = await step('nps', [
    'tools/acquisition/acquire-nps-new-york.mjs',
    '--output',
    nps,
  ]);
  const federalReady = await step('federal', [
    'tools/acquisition/acquire-federal-new-york.mjs',
    '--output',
    federal,
  ]);
  // Do not recompose using an old federal snapshot if acquisition failed.
  if (boundaryReady && federalReady) {
    const composed = join(output, 'composed');
    const args = [
      'tools/packages/compose-official-public-map.mjs',
      '--base',
      join(boundary, 'new-york-outdoors.geojson'),
      '--base-manifest',
      join(boundary, 'new-york-outdoors.manifest.json'),
      '--federal',
      join(federal, 'federal-new-york.json'),
      '--federal-manifest',
      join(federal, 'manifest.json'),
      '--output',
      composed,
    ];
    if (npsReady)
      args.push(
        '--nps',
        join(nps, 'nps-new-york.json'),
        '--nps-manifest',
        join(nps, 'manifest.json'),
      );
    else args.push('--retain-nps', 'true');
    await run(process.execPath, args);
    const assets = join(repository, 'packages/map/src/assets');
    for (const file of [
      'new-york-outdoors.geojson',
      'new-york-outdoors.index.json',
      'new-york-outdoors.manifest.json',
    ])
      await copyFile(join(composed, file), join(assets, file));
    for (const [ready, directory, name, file] of [
      [true, federal, 'federal', 'federal-new-york.json'],
      [npsReady, nps, 'nps', 'nps-new-york.json'],
    ]) {
      if (!ready) continue;
      for (const artifact of [file, 'manifest.json'])
        await copyFile(
          join(directory, artifact),
          join(repository, 'packages/map/source-snapshots/new-york', name, artifact),
        );
    }
    await run(process.execPath, ['tools/packages/build-public-state-packages.mjs', 'NY']);
    await run(process.env.OPEN_OUTDOOR_PYTHON ?? 'python', [
      'tools/packages/build-state-loader.py',
      '--states',
      'NY',
      '--workers',
      '2',
    ]);
    await run(process.execPath, ['tools/reporting/report-public-state-packages.mjs']);
  }
  let oprhpApproved = false;
  try {
    await loadOprhpRefreshInputs();
    oprhpApproved = true;
  } catch (error) {
    results.push({ source: 'oprhp', status: 'unresolved', reason: error.message });
  }
  const oprhpReady =
    oprhpApproved && (await step('oprhp', ['tools/acquisition/stage-private-new-york-oprhp.mjs']));
  let decApproved = false;
  try {
    await loadDecRefreshInputs();
    decApproved = true;
  } catch (error) {
    results.push({ source: 'dec', status: 'unresolved', reason: error.message });
  }
  const decReady =
    decApproved && (await step('dec', ['tools/acquisition/acquire-outdoor-map.mjs']));
  if (decReady) await step('private-NY-rebuild', ['tools/packages/rebuild-private-new-york.mjs']);
  else if (oprhpReady)
    await run(process.execPath, ['tools/packages/package-private-new-york-agencies.mjs']);
  await run(process.execPath, ['tools/packages/deduplicate-private-state-packages.mjs', 'NY']);
  await run(process.execPath, [
    'tools/packages/deduplicate-private-state-packages.mjs',
    '--verify',
  ]);
  await run(process.execPath, ['tools/reporting/report-private-state-packages.mjs']);
  await run(process.execPath, ['tools/packages/verify-public-state-packages.mjs']);
  await run(process.env.OPEN_OUTDOOR_PYTHON ?? 'python', ['tools/packages/verify-state-loader.py']);
} catch (error) {
  results.push({
    source: 'package-verification',
    status: 'unresolved',
    reason: String(error.message),
  });
} finally {
  const report = {
    checkedAt: new Date().toISOString(),
    status: results.some((row) => row.status === 'unresolved') ? 'partial' : 'complete',
    results,
  };
  const reportPath = join(output, 'report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  if (report.status !== 'complete') process.exitCode = 1;
}

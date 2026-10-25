#!/usr/bin/env node
import { deduplicatePrivateStatePackage } from '../packages/deduplicate-private-state-packages.mjs';
import {
  recoverPrivateDirectory,
  activatePrivateDirectory,
} from '../packages/private-package-transaction.mjs';
import { resolve, join, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildIoverlanderPrivateCatalog } from '../../packages/data/dist/ioverlander-private.js';
import { packagePrivateNewYorkHikes } from '../packages/package-private-new-york-hikes.mjs';
import { packagePrivateNewYorkAgencies } from '../packages/package-private-new-york-agencies.mjs';
import { access, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

function argumentsByName(values) {
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`invalid argument near ${name ?? '<end>'}`);
    }
    parsed.set(name.slice(2), value);
  }
  return parsed;
}

const args = argumentsByName(process.argv.slice(2));
const inputDirectory = args.get('input');
const outputDirectory = args.get('output');
if (!inputDirectory || !outputDirectory) {
  throw new Error(
    'usage: pnpm catalog:private:ioverlander -- --input <directory> --output <directory> [--dec <geojson>] [--profiles <preserved profile directory>] [--nps <snapshot.json>] [--federal <snapshot.json>] [--review <csv>] [--generated-at <UTC>]',
  );
}

const activeDirectory = resolve(outputDirectory);
await recoverPrivateDirectory(activeDirectory);
// The builder creates its output atomically and requires a path that does not exist.
const stagingDirectory = join(
  dirname(activeDirectory),
  `.${basename(activeDirectory)}.staging-${randomUUID()}`,
);
const result = await buildIoverlanderPrivateCatalog({
  inputDirectory: resolve(inputDirectory),
  decGeojsonPath: resolve(
    args.get('dec') ??
      'PrivateData/catalogs/US/New York/rights-held-2026-09-27/new-york-outdoors.geojson',
  ),
  npsSnapshotPath: args.get('nps') ? resolve(args.get('nps')) : undefined,
  federalSnapshotPath: args.get('federal') ? resolve(args.get('federal')) : undefined,
  outputDirectory: stagingDirectory,
  publicCheckout: process.cwd(),
  reviewCsvPath: args.get('review') ? resolve(args.get('review')) : undefined,
  generatedAt: args.get('generated-at'),
});

// Retain the private acquisition receipt in the package and its backup scope.
if (args.get('dec')) {
  const receiptBytes = await readFile(
    resolve(dirname(args.get('dec')), 'new-york-outdoors.manifest.json'),
  );
  const receipt = JSON.parse(receiptBytes);
  const manifestPath = join(result.outputDirectory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath));
  if (
    receipt.classification !== 'PRIVATE_USER' ||
    receipt.publicDistribution !== false ||
    receipt.sha256 !== manifest.input.decGeojson.sha256 ||
    receipt.bytes !== manifest.input.decGeojson.bytes
  )
    throw new Error('Private DEC acquisition receipt does not match the build input');
  const file = 'dec-source.private.manifest.json';
  await writeFile(join(result.outputDirectory, file), receiptBytes);
  const descriptor = {
    file,
    bytes: receiptBytes.length,
    sha256: createHash('sha256').update(receiptBytes).digest('hex'),
  };
  manifest.artifacts.push(descriptor);
  manifest.dec = {
    acquiredAt: receipt.acquiredAt,
    featureCount: receipt.featureCount,
    publicDistribution: false,
    sourceReceipt: descriptor,
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

await packagePrivateNewYorkHikes({
  catalogDirectory: result.outputDirectory,
  ...(args.get('profiles') ? { profileDirectory: resolve(args.get('profiles')) } : {}),
});
if (
  await access(resolve('PrivateData/agency-feeds/US/NY/nys-oprhp-trails/receipt.json')).then(
    () => true,
    () => false,
  )
)
  await packagePrivateNewYorkAgencies({
    catalogDirectory: result.outputDirectory,
    transactional: false,
    ...(args.get('profiles') ? { profileDirectory: resolve(args.get('profiles')) } : {}),
  });

if (activeDirectory === resolve('PrivateData/catalogs/US/New York/current'))
  await deduplicatePrivateStatePackage(resolve('.'), 'NY', 'New York', {
    catalogDirectory: stagingDirectory,
  });
await activatePrivateDirectory(activeDirectory, stagingDirectory);

process.stdout.write(
  `${JSON.stringify({ outputDirectory: activeDirectory, counts: result.counts }, null, 2)}\n`,
);

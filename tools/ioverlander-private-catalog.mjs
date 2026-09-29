#!/usr/bin/env node
import { deduplicatePrivateStatePackage } from './deduplicate-private-state-packages.mjs';
import { resolve } from 'node:path';
import { buildIoverlanderPrivateCatalog } from '../packages/data/dist/ioverlander-private.js';
import { packagePrivateNewYorkHikes } from './package-private-new-york-hikes.mjs';
import { packagePrivateNewYorkAgencies } from './package-private-new-york-agencies.mjs';
import { access } from 'node:fs/promises';

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

const result = await buildIoverlanderPrivateCatalog({
  inputDirectory: resolve(inputDirectory),
  decGeojsonPath: resolve(
    args.get('dec') ??
      'PrivateData/catalogs/US/New York/rights-held-2026-09-27/new-york-outdoors.geojson',
  ),
  npsSnapshotPath: args.get('nps') ? resolve(args.get('nps')) : undefined,
  federalSnapshotPath: args.get('federal') ? resolve(args.get('federal')) : undefined,
  outputDirectory: resolve(outputDirectory),
  publicCheckout: process.cwd(),
  reviewCsvPath: args.get('review') ? resolve(args.get('review')) : undefined,
  generatedAt: args.get('generated-at'),
});

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
    ...(args.get('profiles') ? { profileDirectory: resolve(args.get('profiles')) } : {}),
  });

if (result.outputDirectory === resolve('PrivateData/catalogs/US/New York/current'))
  await deduplicatePrivateStatePackage(resolve('.'), 'NY', 'New York');

process.stdout.write(
  `${JSON.stringify({ outputDirectory: result.outputDirectory, counts: result.counts }, null, 2)}\n`,
);

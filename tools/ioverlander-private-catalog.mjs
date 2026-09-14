#!/usr/bin/env node
import { resolve } from 'node:path';
import { buildIoverlanderPrivateCatalog } from '../packages/data/dist/ioverlander-private.js';

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
    'usage: pnpm catalog:private:ioverlander -- --input <directory> --output <directory> [--dec <geojson>] [--nps <snapshot.json>] [--review <csv>] [--generated-at <UTC>]',
  );
}

const result = await buildIoverlanderPrivateCatalog({
  inputDirectory: resolve(inputDirectory),
  decGeojsonPath: resolve(args.get('dec') ?? 'packages/map/src/assets/new-york-outdoors.geojson'),
  npsSnapshotPath: args.get('nps') ? resolve(args.get('nps')) : undefined,
  outputDirectory: resolve(outputDirectory),
  publicCheckout: process.cwd(),
  reviewCsvPath: args.get('review') ? resolve(args.get('review')) : undefined,
  generatedAt: args.get('generated-at'),
});

process.stdout.write(
  `${JSON.stringify({ outputDirectory: result.outputDirectory, counts: result.counts }, null, 2)}\n`,
);

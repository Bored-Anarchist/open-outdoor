import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
const [output] = process.argv.slice(2);
if (!output) throw new Error('Usage: node tools/release-sbom.mjs OUTPUT.json');
const lock = await readFile('pnpm-lock.yaml');
const packages = parse(lock.toString()).packages;
if (!packages || !Object.keys(packages).length) throw new Error('Empty dependency inventory');
const components = Object.entries(packages)
  .map(([identity, value]) => {
    if (!value.resolution?.integrity) throw new Error(`Missing package integrity: ${identity}`);
    return { identity, integrity: value.resolution.integrity };
  })
  .sort((a, b) => a.identity.localeCompare(b.identity, 'en'));
await writeFile(
  output,
  JSON.stringify(
    {
      schemaVersion: 1,
      ecosystem: 'npm',
      scope: 'all locked packages including build dependencies',
      lockSha256: createHash('sha256').update(lock).digest('hex'),
      components,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Inventoried ${components.length} pinned npm packages. Add Python/native/tool inventories for the actual release.`,
);

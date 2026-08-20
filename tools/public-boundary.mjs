import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const excluded = new Set(['.git', '.pnpm-store', '.venv', 'coverage', 'dist', 'node_modules']);
const binaryExtensions = new Set([
  '.app',
  '.db',
  '.ipa',
  '.jpg',
  '.mbtiles',
  '.pdf',
  '.png',
  '.sqlite',
  '.zip',
]);
const prohibitedPaths = /(^|[\\/])(?:private-data|user-data|secrets?)(?:[\\/]|$)/i;
const deliberateMarker = new RegExp(
  ['OPEN', 'OUTDOOR', 'TEST', '(?:SECRET|PRIVATE_LOCATION)', '[A-Z0-9]+'].join('_'),
);
const signatures = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
  ['deliberate boundary fixture', deliberateMarker],
];

async function walk(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name.startsWith('.tmp-')) continue;
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(
        `symbolic links are not allowed at the public boundary: ${relative(root, path)}`,
      );
    if (entry.isDirectory()) files.push(...(await walk(root, path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function scanPublicBoundary(candidate) {
  const root = await realpath(candidate);
  const failures = [];
  for (const file of await walk(root)) {
    const name = relative(root, file);
    if (prohibitedPaths.test(name)) failures.push(`${name}: prohibited path`);
    const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
    if (binaryExtensions.has(extension)) continue;
    const stat = await lstat(file);
    if (stat.size > 2_000_000) continue;
    const content = await readFile(file, 'utf8');
    for (const [label, pattern] of signatures) {
      if (pattern.test(content)) failures.push(`${name}: ${label}`);
    }
    if (
      name.toLowerCase().endsWith('.json') &&
      !name.startsWith(`config${sep}`) &&
      !name.startsWith(`fixtures${sep}private-root-template${sep}`) &&
      /["']classification["']\s*:\s*["'](?:private|restricted|secret)["']/i.test(content)
    )
      failures.push(`${name}: private classification`);
  }
  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const marker = process.argv.indexOf('--scan');
  const target = marker >= 0 ? process.argv[marker + 1] : undefined;
  if (!target) throw new Error('usage: node tools/public-boundary.mjs --scan <path>');
  const failures = await scanPublicBoundary(target);
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else console.log(`public boundary passed: ${resolve(target).split(sep).join('/')}`);
}

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const packages = join(root, 'packages/map/src/assets/state-packages/US');

export async function matchesArtifact(path, descriptor) {
  try {
    if ((await stat(path)).size !== descriptor.bytes) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex') === descriptor.sha256;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function restoreArtifact(path, descriptor, streamFactory) {
  if (
    !Number.isSafeInteger(descriptor.bytes) ||
    descriptor.bytes <= 0 ||
    !/^[a-f0-9]{64}$/.test(descriptor.sha256)
  )
    throw new Error('Invalid pinned artifact');
  if (await matchesArtifact(path, descriptor)) return 'cached';
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  let bytes = 0;
  const hash = createHash('sha256');
  try {
    await pipeline(
      await streamFactory(),
      new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > descriptor.bytes) return callback(new Error('Artifact exceeds pinned size'));
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(temporary, { flags: 'wx' }),
    );
    if (bytes !== descriptor.bytes || hash.digest('hex') !== descriptor.sha256)
      throw new Error('Artifact checksum or size mismatch');
    await rename(temporary, path);
    return 'restored';
  } finally {
    await rm(temporary, { force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const fromIndex = args.indexOf('--from');
  const from = fromIndex < 0 ? null : args[fromIndex + 1];
  if (fromIndex >= 0 && (!from || from.startsWith('--')))
    throw new Error('--from needs a directory');
  if (fromIndex >= 0) args.splice(fromIndex, 2);
  const includeParts = args.includes('--parts');
  const states = args.filter((arg) => arg !== '--parts');
  if (!states.length || states.some((state) => !/^[A-Z]{2}$/.test(state)))
    throw new Error(
      'Usage: pnpm map:public:restore -- NY CA [--parts] [--from external-directory]',
    );
  const base = process.env.OPEN_OUTDOOR_PUBLIC_ARTIFACT_BASE_URL;
  if (!from && !base)
    throw new Error(
      'Set OPEN_OUTDOOR_PUBLIC_ARTIFACT_BASE_URL or use --from. No artifact host is preconfigured.',
    );
  if (!from) {
    const url = new URL(base);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error('Artifact base must be HTTPS without credentials, query, or fragment');
    if (/(^|\.)github(?:usercontent)?\.com$/i.test(url.hostname))
      throw new Error('Use external artifact storage, not GitHub dataset storage');
  }
  const inventory = JSON.parse(await readFile(join(packages, 'loader-inventory.json')));
  for (const state of new Set(states)) {
    const manifest = JSON.parse(await readFile(join(packages, state, 'manifest.json')));
    if (
      manifest.publicDistribution !== true ||
      manifest.classification !== 'SOURCE_REDISTRIBUTABLE'
    )
      throw new Error(`${state}: public package required`);
    const loader = inventory.states.find((entry) => entry.state === state);
    if (!loader) throw new Error(`${state}: missing loader pin`);
    const artifacts = [
      [`${state}/outdoors.geojson`, manifest.artifacts.geojson],
      [`${state}/index.json`, manifest.artifacts.index],
      [`${state}/state.sqlite`, loader],
      ...(includeParts ? manifest.import.parts.map((part) => [`${state}/${part.file}`, part]) : []),
    ];
    for (const [relative, descriptor] of artifacts) {
      if (
        !/^[A-Z]{2}\/(?:outdoors\.geojson|index\.json|state\.sqlite|parts\/outdoors-\d+\.geojson)$/.test(
          relative,
        )
      )
        throw new Error('Unexpected artifact path');
      const status = await restoreArtifact(join(packages, relative), descriptor, async () => {
        if (from) return createReadStream(join(resolve(from), relative));
        const response = await fetch(new URL(relative, base.replace(/\/?$/, '/')), {
          signal: AbortSignal.timeout(600_000),
          redirect: 'error',
        });
        if (!response.ok || !response.body) throw new Error(`Artifact HTTP ${response.status}`);
        return Readable.fromWeb(response.body);
      });
      console.log(`${relative}: ${status}`);
    }
  }
}

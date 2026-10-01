import { createReadStream } from 'node:fs';
import { link, mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { sourceHash } from './package-source-cache.mjs';
import { matchesArtifact, restoreArtifact } from './restore-public-package-artifacts.mjs';

const root = resolve(import.meta.dirname, '../..');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const safeFile = (file) =>
  typeof file === 'string' &&
  file.length > 0 &&
  !file.includes('\\') &&
  !file.startsWith('/') &&
  !file.split('/').some((part) => ['.', '..', ''].includes(part)) &&
  !file.includes(':');

export function privatePackageDescriptors(manifest) {
  const entries = [
    ...(manifest.artifacts ?? []),
    manifest.output,
    manifest.publicDeduplication?.input,
    manifest.publicDeduplication?.report,
    manifest.publicDeduplication?.enrichments,
  ].filter(Boolean);
  const byFile = new Map();
  for (const descriptor of entries) {
    if (
      !safeFile(descriptor.file) ||
      !/^[a-f0-9]{64}$/.test(descriptor.sha256) ||
      !Number.isSafeInteger(descriptor.bytes) ||
      descriptor.bytes <= 0
    )
      throw new Error('Invalid private backup descriptor');
    const previous = byFile.get(descriptor.file);
    if (previous && previous.sha256 !== descriptor.sha256)
      throw new Error('Conflicting private descriptors');
    byFile.set(descriptor.file, descriptor);
  }
  if (!byFile.size) throw new Error('Private package has no pinned artifacts');
  return [...byFile.values()];
}

export async function backupPinnedFiles(files, destination, metadata = {}) {
  const fingerprint = sourceHash(
    JSON.stringify(files.map(({ file, descriptor }) => ({ ...descriptor, file }))),
  );
  const release = join(destination, 'releases', fingerprint);
  await mkdir(release, { recursive: true });
  let totalBytes = 0;
  for (const item of files) {
    if (!safeFile(item.file)) throw new Error('Unsafe backup path');
    const object = join(destination, 'objects', item.descriptor.sha256);
    await restoreArtifact(object, item.descriptor, async () => createReadStream(item.source));
    const target = join(release, item.file);
    await mkdir(dirname(target), { recursive: true });
    try {
      await link(object, target);
    } catch (error) {
      if (error.code !== 'EEXIST' || !(await matchesArtifact(target, item.descriptor))) throw error;
    }
    totalBytes += item.descriptor.bytes;
  }
  const receipt = {
    schemaVersion: 1,
    complete: true,
    ...metadata,
    fingerprint,
    verifiedAt: new Date().toISOString(),
    files: files.map(({ file, descriptor }) => ({ ...descriptor, file })),
    fileCount: files.length,
    logicalBytes: totalBytes,
  };
  await writeFile(join(release, 'backup-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  return { release, fileCount: files.length, logicalBytes: totalBytes, fingerprint };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [channel, destinationArg] = process.argv.slice(2).filter((arg) => arg !== '--');
  if (!['public', 'private'].includes(channel) || !destinationArg)
    throw new Error(
      'Usage: node tools/packages/backup-package-artifacts.mjs public|private <external-directory>',
    );
  await mkdir(resolve(destinationArg), { recursive: true });
  const destination = await realpath(resolve(destinationArg));
  const relation = relative(await realpath(root), destination);
  if (!(relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)))
    throw new Error('Backup must be outside the repository');
  const files = [];
  const add = async (source, file, descriptor) => {
    if (!descriptor) {
      const bytes = await readFile(source);
      descriptor = { bytes: bytes.length, sha256: sourceHash(bytes) };
    }
    files.push({ source, file, descriptor });
  };
  const states = (await json(join(root, 'config/us-state-forestry-agencies.json'))).states;
  if (states.length !== 50) throw new Error('Expected 50 states');
  if (channel === 'public') {
    const base = join(root, 'packages/map/src/assets/state-packages/US');
    const loaders = (await json(join(base, 'loader-inventory.json'))).states;
    for (const state of states) {
      const directory = join(base, state.code);
      const manifest = await json(join(directory, 'manifest.json'));
      const loader = loaders.find((entry) => entry.state === state.code);
      if (
        manifest.publicDistribution !== true ||
        manifest.classification !== 'SOURCE_REDISTRIBUTABLE' ||
        loader?.sourceSha256 !== manifest.output.sha256 ||
        loader?.sourceIndexSha256 !== manifest.artifacts.index.sha256
      )
        throw new Error(`${state.code}: invalid public bindings`);
      for (const descriptor of [
        manifest.artifacts.geojson,
        manifest.artifacts.index,
        manifest.artifacts.notices,
        ...manifest.import.parts,
        { ...loader, file: 'state.sqlite' },
      ]) {
        if (!safeFile(descriptor.file)) throw new Error('Unsafe public artifact path');
        await add(join(directory, descriptor.file), `${state.code}/${descriptor.file}`, descriptor);
      }
      await add(join(directory, 'manifest.json'), `${state.code}/manifest.json`);
    }
    for (const file of ['inventory.json', 'loader-inventory.json'])
      await add(join(base, file), file);
  } else {
    for (const state of states) {
      const base = join(root, 'PrivateData/catalogs/US', state.name, 'current');
      const file = state.code === 'NY' ? 'manifest.json' : 'agency-ioverlander.manifest.json';
      const manifest = await json(join(base, file));
      if (manifest.classification !== 'PRIVATE_USER' || manifest.publicDistribution === true)
        throw new Error('Private classification required');
      for (const descriptor of privatePackageDescriptors(manifest))
        await add(
          join(base, descriptor.file),
          `${state.code}/current/${descriptor.file}`,
          descriptor,
        );
      await add(join(base, file), `${state.code}/current/${file}`);
    }
    await add(
      join(root, 'PrivateData/catalogs/US/private-state-package-inventory.json'),
      'private-state-package-inventory.json',
    );
  }
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const result = await backupPinnedFiles(files, destination, {
    channel,
    commit,
    packageCount: states.length,
    scope:
      channel === 'public'
        ? 'complete public state artifacts'
        : 'active private packages and pinned deduplication recovery; raw source archives excluded',
  });
  console.log(JSON.stringify({ channel, packages: states.length, ...result }));
}

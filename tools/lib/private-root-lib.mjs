import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

function isWithin(parent, child) {
  const relation = relative(parent, child);
  return (
    relation === '' ||
    (relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation))
  );
}

async function confinedPath(root, candidate, allowMissing = false) {
  const target = resolve(root, candidate);
  if (!isWithin(root, target)) throw new Error('private path escapes the private root');
  let current = root;
  for (const part of relative(root, target).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    const stat = await lstat(current).catch((error) => {
      if (allowMissing && error.code === 'ENOENT') return null;
      throw error;
    });
    if (stat && (stat.isSymbolicLink() || !isWithin(root, await realpath(current))))
      throw new Error('linked paths are not allowed in the private root');
  }
  return target;
}

export async function validatePrivateRoot(candidate, publicCheckout = process.cwd()) {
  if (!candidate || !isAbsolute(candidate))
    throw new Error('OUTDOOR_PRIVATE_ROOT must be an absolute path');
  const checkout = await realpath(publicCheckout);
  const root = await realpath(candidate);
  if (isWithin(checkout, root) || isWithin(root, checkout)) {
    throw new Error('private root and public checkout must not contain one another');
  }
  const manifestPath = await confinedPath(root, 'open-outdoor.private.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.classification !== 'private' ||
    manifest.retention !== 'indefinite' ||
    manifest.synthetic !== true
  ) {
    throw new Error(
      'spike manifest must be schemaVersion 1, private, indefinitely retainable, and synthetic',
    );
  }
  if (!Array.isArray(manifest.connectors) || manifest.connectors.length === 0) {
    throw new Error('private manifest requires at least one connector');
  }
  const connectorPaths = [];
  for (const connector of manifest.connectors) {
    if (typeof connector !== 'string' || connector.length === 0) {
      throw new Error('private connector paths must be non-empty strings');
    }
    const connectorPath = resolve(root, connector);
    if (!isWithin(root, connectorPath))
      throw new Error('private connector escapes the private root');
    connectorPaths.push(await confinedPath(root, connector));
  }
  return { root, manifest, manifestPath, connectorPaths };
}

export async function composeSyntheticPrivateCatalog(candidate, publicCheckout = process.cwd()) {
  const validated = await validatePrivateRoot(candidate, publicCheckout);
  const outputDirectory = await confinedPath(validated.root, 'output', true);
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = await confinedPath(
    validated.root,
    'output/synthetic-private-catalog.json',
    true,
  );
  const catalog = {
    schemaVersion: 1,
    classification: 'private',
    retention: 'indefinite',
    synthetic: true,
    connectors: validated.manifest.connectors,
  };
  await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'w',
  });
  return outputPath;
}

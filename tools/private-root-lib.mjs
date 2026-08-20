import { access, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

function isWithin(parent, child) {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
}

export async function validatePrivateRoot(candidate, publicCheckout = process.cwd()) {
  if (!candidate || !isAbsolute(candidate))
    throw new Error('OUTDOOR_PRIVATE_ROOT must be an absolute path');
  const checkout = await realpath(publicCheckout);
  const root = await realpath(candidate);
  if (isWithin(checkout, root) || isWithin(root, checkout)) {
    throw new Error('private root and public checkout must not contain one another');
  }
  const manifestPath = resolve(root, 'open-outdoor.private.json');
  await access(manifestPath);
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
    await access(connectorPath);
    connectorPaths.push(connectorPath);
  }
  return { root, manifest, manifestPath, connectorPaths };
}

export async function composeSyntheticPrivateCatalog(candidate, publicCheckout = process.cwd()) {
  const validated = await validatePrivateRoot(candidate, publicCheckout);
  const outputDirectory = resolve(validated.root, 'output');
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(outputDirectory, 'synthetic-private-catalog.json');
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

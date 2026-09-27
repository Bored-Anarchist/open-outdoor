#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStateAgencyFeedCatalog } from './state-agency-feeds.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(repository, 'PrivateData/agency-feeds');
const feeds = (await loadStateAgencyFeedCatalog()).filter(
  (feed) => feed.provisionalPrivateValidation,
);
const tryJson = async (path) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};
const batch = await tryJson(join(root, 'batch-report.json'));
const discovery = await tryJson(join(root, 'child-discovery.json'));
const childReceipts = new Map();
for (const state of new Set(feeds.map((feed) => feed.state))) {
  const stateRoot = join(root, 'US', state);
  const directories = await readdir(stateRoot, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const directory of directories.filter((item) => item.isDirectory())) {
    const item = await tryJson(join(stateRoot, directory.name, 'receipt.json'));
    if (!item?.parentSourceId || item.publicDistribution !== false) continue;
    const existing = childReceipts.get(item.parentSourceId) ?? [];
    existing.push(item);
    childReceipts.set(item.parentSourceId, existing);
  }
}
const results = [];
for (const feed of feeds) {
  const receipt = await tryJson(join(root, 'US', feed.state, feed.id, 'receipt.json'));
  const failure = batch?.results?.find((item) => item.id === feed.id && item.status === 'error');
  const child = discovery?.find((item) => item.id === feed.id);
  let status;
  if (receipt?.sourceId === feed.id && receipt.publicDistribution === false) {
    status = 'staged-private';
  } else if (feed.sourceType === 'arcgis-service') {
    const stagedChildren = childReceipts.get(feed.id) ?? [];
    const sharedService = feeds.some(
      (other) =>
        other.id !== feed.id &&
        other.url === feed.url &&
        (childReceipts.get(other.id)?.length ?? 0) > 0,
    );
    status = stagedChildren.length
      ? 'staged-child-private'
      : sharedService
        ? 'staged-shared-service-private'
        : child?.error
          ? 'service-unavailable'
          : 'select-child-layer';
  } else if (feed.sourceType === 'arcgis-layer' || feed.sourceType === 'download-file') {
    status = failure ? 'source-error' : 'pending-stage';
  } else {
    status = 'select-exact-download';
  }
  results.push({
    id: feed.id,
    state: feed.state,
    role: feed.agencyRole,
    sourceType: feed.sourceType,
    status,
    sourceUrl: feed.url,
    ...(receipt ? { featureCount: receipt.featureCount, rawFilename: receipt.rawFilename } : {}),
    ...(failure ? { error: failure.error } : {}),
    ...(child?.children ? { childCount: child.children.length } : {}),
    ...(childReceipts.get(feed.id)?.length
      ? { stagedChildCount: childReceipts.get(feed.id).length }
      : {}),
  });
}
const summary = Object.fromEntries(
  [...new Set(results.map((item) => item.status))]
    .sort()
    .map((status) => [status, results.filter((item) => item.status === status).length]),
);
await writeFile(
  join(root, 'provisional-status.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), total: results.length, summary, results }, null, 2)}\n`,
);
console.log(JSON.stringify({ total: results.length, summary }, null, 2));

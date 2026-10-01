#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeCurlFetch } from '../lib/native-curl-fetch.mjs';
import {
  discoverArcgisChildLayers,
  loadStateAgencyFeedCatalog,
  stageApprovedFeed,
} from './state-agency-feeds.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const privateRoot = join(repository, 'PrivateData/agency-feeds');
const config = JSON.parse(
  await readFile(join(repository, 'config/agency-provisional-child-selections-2026-09-27.json')),
);
const feeds = await loadStateAgencyFeedCatalog();
const stateIndex = process.argv.indexOf('--state');
const state = stateIndex < 0 ? null : process.argv[stateIndex + 1]?.toUpperCase();
if (state && !/^[A-Z]{2}$/.test(state)) throw new Error('--state requires a state code');
const approvalPath = join(privateRoot, 'approvals.json');
const approvals = JSON.parse(await readFile(approvalPath, 'utf8'));
const selected = [];
for (const selection of config.selections) {
  const parent = feeds.find((feed) => feed.id === selection.parentId);
  if (state && parent?.state !== state) continue;
  if (!parent?.provisionalPrivateValidation || parent.sourceType !== 'arcgis-service') {
    throw new Error(`unapproved service root: ${selection.parentId}`);
  }
  const children = await discoverArcgisChildLayers(parent);
  for (const layerId of selection.layerIds) {
    const child = children.find((item) => item.url.endsWith(`/${layerId}`));
    if (!child) throw new Error(`${parent.id}: missing child layer ${layerId}`);
    selected.push(child);
  }
}
const now = new Date();
const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
for (const child of selected) {
  if (approvals[child.id]) continue;
  approvals[child.id] = {
    sourceId: child.id,
    sourceUrl: child.url,
    collect: true,
    privateStorage: true,
    publicDistribution: false,
    publisherGrant: false,
    provisionalPrivateValidation: true,
    evidenceUrl: child.url,
    reviewedAt: now.toISOString(),
    expiresAt,
  };
}
await writeFile(approvalPath, `${JSON.stringify(approvals, null, 2)}\n`);

const maxIndex = process.argv.indexOf('--max-features');
const maximum = maxIndex < 0 ? 10000 : Number(process.argv[maxIndex + 1]);
if (!(maximum > 0)) throw new Error('--max-features requires a positive number');
const results = [];
const refresh = process.argv.includes('--refresh');
for (const child of selected) {
  const receiptPath = join(privateRoot, 'US', child.state, child.id, 'receipt.json');
  try {
    const existing = await readFile(receiptPath, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (existing && !refresh) {
      results.push({ id: child.id, parentId: child.parentSourceId, status: 'already-staged' });
      continue;
    }
    const countResponse = await nativeCurlFetch(`${child.url}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ where: '1=1', returnCountOnly: 'true', f: 'json' }),
    });
    const countBody = await countResponse.json();
    const count = countBody.count;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(
        `invalid count: ${JSON.stringify(countBody.error ?? countBody).slice(0, 120)}`,
      );
    }
    if (count > maximum) {
      results.push({ id: child.id, parentId: child.parentSourceId, status: 'over-limit', count });
      continue;
    }
    const staged = await stageApprovedFeed(child, approvals[child.id], undefined, { refresh });
    results.push({
      id: child.id,
      parentId: child.parentSourceId,
      status: staged.status,
      count: staged.receipt.featureCount,
    });
  } catch (error) {
    results.push({
      id: child.id,
      parentId: child.parentSourceId,
      status: 'error',
      error: String(error).slice(0, 250),
    });
  }
  console.log(`${results.length}/${selected.length} ${child.id}: ${results.at(-1).status}`);
}
await writeFile(
  join(privateRoot, `child-stage-report${state ? `-${state}` : ''}.json`),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), maximumFeatures: maximum, results }, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    selected: selected.length,
    staged: results.filter((item) => item.status === 'staged').length,
    existing: results.filter((item) => item.status === 'already-staged').length,
    overLimit: results.filter((item) => item.status === 'over-limit').length,
    errors: results.filter((item) => item.status === 'error').length,
  }),
);
if (results.some((item) => item.status === 'error')) process.exitCode = 1;

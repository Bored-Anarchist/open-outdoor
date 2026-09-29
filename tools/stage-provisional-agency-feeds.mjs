#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeCurlFetch } from './native-curl-fetch.mjs';
import { loadStateAgencyFeedCatalog, stageApprovedFeed } from './state-agency-feeds.mjs';

const repository = resolve(fileURLToPath(new URL('..', import.meta.url)));
const privateRoot = join(repository, 'PrivateData/agency-feeds');
const maxIndex = process.argv.indexOf('--max-features');
const maximum = maxIndex < 0 ? Infinity : Number(process.argv[maxIndex + 1]);
if (!(maximum > 0)) throw new Error('--max-features requires a positive number');
const stateIndex = process.argv.indexOf('--state');
const state = stateIndex < 0 ? null : process.argv[stateIndex + 1]?.toUpperCase();
if (state && !/^[A-Z]{2}$/.test(state)) throw new Error('--state requires a state code');

const feeds = (await loadStateAgencyFeedCatalog()).filter(
  (feed) =>
    feed.provisionalPrivateValidation &&
    ['arcgis-layer', 'download-file'].includes(feed.sourceType) &&
    (!state || feed.state === state),
);
const approvals = JSON.parse(await readFile(join(privateRoot, 'approvals.json'), 'utf8'));
const counts = new Map();
const results = [];
const refresh = process.argv.includes('--refresh');

async function featureCount(feed) {
  if (feed.sourceType !== 'arcgis-layer') return null;
  if (counts.has(feed.url)) return counts.get(feed.url);
  const response = await nativeCurlFetch(`${feed.url}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ where: '1=1', returnCountOnly: 'true', f: 'json' }),
  });
  const body = await response.json();
  if (!Number.isSafeInteger(body.count) || body.count < 0) {
    throw new Error(`invalid feature count: ${JSON.stringify(body.error ?? body).slice(0, 150)}`);
  }
  counts.set(feed.url, body.count);
  return body.count;
}

let next = 0;
async function worker() {
  while (next < feeds.length) {
    const feed = feeds[next++];
    const receiptPath = join(privateRoot, 'US', feed.state, feed.id, 'receipt.json');
    try {
      const existing = await readFile(receiptPath, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (existing && !refresh) {
        results.push({ id: feed.id, state: feed.state, status: 'already-staged' });
        continue;
      }
      const count = await featureCount(feed);
      if (count !== null && count > maximum) {
        results.push({ id: feed.id, state: feed.state, status: 'over-limit', featureCount: count });
        continue;
      }
      const staged = await stageApprovedFeed(feed, approvals[feed.id], undefined, { refresh });
      results.push({
        id: feed.id,
        state: feed.state,
        status: staged.status,
        featureCount: staged.receipt.featureCount,
        bytes: staged.receipt.bytes,
      });
    } catch (error) {
      results.push({
        id: feed.id,
        state: feed.state,
        status: 'error',
        error: String(error).slice(0, 250),
      });
    }
    console.log(`${results.length}/${feeds.length} ${feed.id}: ${results.at(-1).status}`);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
const report = {
  generatedAt: new Date().toISOString(),
  maximumFeatures: Number.isFinite(maximum) ? maximum : null,
  state,
  results: results.sort((a, b) => a.id.localeCompare(b.id)),
};
await writeFile(
  join(privateRoot, `batch-report${state ? `-${state}` : ''}.json`),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    total: feeds.length,
    staged: results.filter((item) => item.status === 'staged').length,
    existing: results.filter((item) => item.status === 'already-staged').length,
    overLimit: results.filter((item) => item.status === 'over-limit').length,
    errors: results.filter((item) => item.status === 'error').length,
  }),
);
if (results.some((item) => item.status === 'error')) process.exitCode = 1;

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { atomicSourceWrite } from '../packages/package-source-cache.mjs';
import { assertPrivateAcquisitionApproved, stageApprovedFeed } from './state-agency-feeds.mjs';
import { nativeCurlFetch } from '../lib/native-curl-fetch.mjs';

export async function loadOprhpRefreshInputs({
  stagingRoot = resolve('PrivateData/agency-feeds'),
  sources,
} = {}) {
  const config = sources
    ? { sources }
    : JSON.parse(await readFile('config/private-new-york-oprhp-sources.json', 'utf8'));
  let approvals;
  try {
    approvals = JSON.parse(await readFile(join(stagingRoot, 'approvals.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    approvals = {};
  }
  if (!approvals || typeof approvals !== 'object' || Array.isArray(approvals))
    throw new Error('OPRHP approval ledger must be an object');
  // Validate the entire selection before contacting any source or changing any receipt.
  const blockers = [];
  for (const source of config.sources) {
    try {
      assertPrivateAcquisitionApproved(source, approvals[source.id]);
    } catch (error) {
      blockers.push(error.message);
    }
  }
  if (blockers.length) throw new Error(`OPRHP refresh blocked: ${blockers.join('; ')}`);
  return { sources: config.sources, approvals };
}

export async function stagePrivateNewYorkOprhp({
  fetchImpl = nativeCurlFetch,
  stagingRoot = resolve('PrivateData/agency-feeds'),
  sources,
} = {}) {
  const inputs = await loadOprhpRefreshInputs({ stagingRoot, sources });
  const results = [];
  for (const source of inputs.sources) {
    const approval = inputs.approvals[source.id];
    const result = await stageApprovedFeed(source, approval, fetchImpl, {
      stagingRoot,
      refresh: true,
      force: true,
      prepareReceipt: async (receipt, directory) => {
        assertPrivateAcquisitionApproved(source, approval);
        const evidence = [];
        for (const [kind, url] of [
          ['terms', source.termsUrl],
          ['layer', `${source.url}?f=json`],
        ]) {
          const response = await fetchImpl(url);
          if (!response.ok) throw new Error(`${source.id}: metadata HTTP ${response.status}`);
          const bytes = Buffer.from(await response.arrayBuffer());
          const body = JSON.parse(bytes);
          if (body.error) throw new Error(`${source.id}: metadata error`);
          const sha256 = createHash('sha256').update(bytes).digest('hex');
          const file = `${kind}-${sha256}.json`;
          await atomicSourceWrite(join(directory, file), bytes);
          evidence.push({ file, url, bytes: bytes.length, sha256 });
        }
        Object.assign(receipt, {
          approval: {
            reviewedAt: approval.reviewedAt,
            expiresAt: approval.expiresAt,
            sha256: createHash('sha256').update(JSON.stringify(approval)).digest('hex'),
          },
          evidence,
          mode: source.mode,
          attribution: source.attribution,
          currentConditions: false,
          sourceEditDate: receipt.sourceRevision ?? null,
          snapshotWarning:
            'Dated private reference only; verify current conditions with NY State Parks.',
        });
        assertPrivateAcquisitionApproved(source, approval);
      },
    });
    const receipt = result.receipt;
    results.push({ id: source.id, features: receipt.featureCount, mode: source.mode });
    console.log(JSON.stringify(results.at(-1)));
  }
  return results;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await stagePrivateNewYorkOprhp();

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stageApprovedFeed } from './state-agency-feeds.mjs';
import { nativeCurlFetch } from '../lib/native-curl-fetch.mjs';

export async function stagePrivateNewYorkOprhp() {
  const config = JSON.parse(await readFile('config/private-new-york-oprhp-sources.json', 'utf8'));
  const results = [];
  for (const source of config.sources) {
    const directory = resolve('PrivateData/agency-feeds/US/NY', source.id);
    let receipt;
    try {
      receipt = JSON.parse(await readFile(join(directory, 'receipt.json'), 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (receipt) {
      if (receipt.sourceUrl !== source.url || receipt.publicDistribution !== false)
        throw new Error(`${source.id}: conflicting staged receipt`);
    } else {
      const now = new Date();
      const approval = {
        sourceId: source.id,
        sourceUrl: source.url,
        collect: true,
        privateStorage: true,
        publicDistribution: false,
        publisherGrant: false,
        provisionalPrivateValidation: true,
        ...(source.mode === 'reference-only' ? { referenceOnlyPrivateValidation: true } : {}),
        evidenceUrl: source.termsUrl,
        reviewedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 90 * 86400000).toISOString(),
      };
      receipt = (await stageApprovedFeed(source, approval)).receipt;
    }
    const evidence = [];
    for (const [file, url] of [
      ['terms.json', source.termsUrl],
      ['layer.json', `${source.url}?f=json`],
    ]) {
      const response = await nativeCurlFetch(url);
      if (!response.ok) throw new Error(`${source.id}: metadata HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const body = JSON.parse(bytes);
      if (body.error) throw new Error(`${source.id}: metadata error`);
      await writeFile(join(directory, file), bytes);
      evidence.push({
        file,
        url,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    receipt.evidence = evidence;
    receipt.rightsStatus = source.rightsStatus;
    if (source.mode === 'reference-only') receipt.referenceOnlyPrivateValidation = true;
    receipt.mode = source.mode;
    receipt.attribution = source.attribution;
    receipt.currentConditions = false;
    receipt.sourceEditDate =
      JSON.parse(await readFile(join(directory, 'layer.json'))).editingInfo?.lastEditDate ?? null;
    receipt.snapshotWarning =
      'Historical private reference only; verify current conditions with NY State Parks.';
    await writeFile(join(directory, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    results.push({ id: source.id, features: receipt.featureCount, mode: source.mode });
    console.log(JSON.stringify(results.at(-1)));
  }
  return results;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await stagePrivateNewYorkOprhp();

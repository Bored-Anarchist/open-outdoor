#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { stageApprovedFeed } from './state-agency-feeds.mjs';

const source = JSON.parse(
  await readFile('config/private-mississippi-state-forest-source.json', 'utf8'),
);
const path = resolve('PrivateData/agency-feeds/US/MS', source.id);
const existing = await readFile(join(path, 'receipt.json'), 'utf8').catch((error) => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
if (existing) {
  const receipt = JSON.parse(existing);
  if (
    receipt.sourceUrl !== source.url ||
    receipt.sourceFilter !== source.where ||
    receipt.publicDistribution !== false
  )
    throw new Error('conflicting Mississippi private receipt');
  console.log(JSON.stringify({ features: receipt.featureCount, status: 'already-staged' }));
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
    evidenceUrl: source.evidenceUrl,
    reviewedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 90 * 86400000).toISOString(),
  };
  const staged = await stageApprovedFeed(source, approval);
  const collection = JSON.parse(await readFile(join(path, 'raw.geojson')));
  if (
    collection.features.some(
      (f) =>
        Object.keys(f.properties ?? {}).some((k) => !source.fields.includes(k)) ||
        !/^(CAMDEN STATE FOREST|KURTZ STATE FOREST(?:.*)|JAMIE WHITTEN STATE FOREST)$/i.test(
          f.properties.PlanName ?? '',
        ),
    )
  )
    throw new Error('Mississippi selection returned non-forest records or unexpected fields');
  staged.receipt.scope = source.scope;
  await writeFile(join(path, 'receipt.json'), `${JSON.stringify(staged.receipt, null, 2)}\n`);
  console.log(JSON.stringify({ features: staged.receipt.featureCount, status: 'staged-private' }));
}

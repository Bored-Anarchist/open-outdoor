#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeCurlFetch } from '../lib/native-curl-fetch.mjs';
import {
  discoverArcgisChildLayers,
  loadStateAgencyFeedCatalog,
  stageApprovedFeed,
} from './state-agency-feeds.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = join(repository, 'PrivateData/agency-feeds');
const resolutions = JSON.parse(
  await readFile(join(repository, 'config/agency-pending-source-resolutions-2026-09-27.json')),
).resolutions;
const permissionRoles = JSON.parse(
  await readFile(
    join(repository, 'config/agency-permission-required-private-validation-2026-09-27.json'),
  ),
).roles;
const catalog = await loadStateAgencyFeedCatalog();
const stateIndex = process.argv.indexOf('--state');
const state = stateIndex < 0 ? null : process.argv[stateIndex + 1]?.toUpperCase();
if (state && !/^[A-Z]{2}$/.test(state)) throw new Error('--state requires a state code');
const maxIndex = process.argv.indexOf('--max-features');
const maximum = maxIndex < 0 ? 200000 : Number(process.argv[maxIndex + 1]);
if (!Number.isSafeInteger(maximum) || maximum < 1)
  throw new Error('--max-features requires a positive integer');
await mkdir(root, { recursive: true });
const approvalPath = join(root, 'approvals.json');
const approvals = JSON.parse(await readFile(approvalPath, 'utf8'));
const now = new Date();
const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
const results = [];
const refresh = process.argv.includes('--refresh');

async function stage(feed, evidenceUrl) {
  const path = join(root, 'US', feed.state, feed.id, 'receipt.json');
  const existing = await readFile(path, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing) {
    const receipt = JSON.parse(existing);
    if (
      receipt.sourceId !== feed.id ||
      receipt.sourceUrl !== feed.url ||
      receipt.sourceFilter !== feed.where ||
      JSON.stringify(receipt.sourceFields) !== JSON.stringify(feed.fields) ||
      receipt.publicDistribution !== false ||
      receipt.validationStatus === 'rejected-subject'
    )
      throw new Error(
        'Existing receipt is rejected or belongs to a different source; use a new reviewed stageId',
      );
    if (!refresh) return { status: 'already-staged', count: receipt.featureCount };
  }
  approvals[feed.id] = {
    sourceId: feed.id,
    sourceUrl: feed.url,
    collect: true,
    privateStorage: true,
    publicDistribution: false,
    publisherGrant: false,
    provisionalPrivateValidation: feed.provisionalPrivateValidation === true,
    permissionRequiredPrivateValidation: feed.permissionRequiredPrivateValidation === true,
    evidenceUrl,
    reviewedAt: now.toISOString(),
    expiresAt,
  };
  await writeFile(approvalPath, `${JSON.stringify(approvals, null, 2)}\n`);
  if (feed.sourceType === 'arcgis-layer') {
    const response = await nativeCurlFetch(`${feed.url}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ where: feed.where ?? '1=1', returnCountOnly: 'true', f: 'json' }),
    });
    const body = await response.json();
    if (!Number.isSafeInteger(body.count) || body.count < 0) {
      throw new Error(`invalid layer count: ${JSON.stringify(body.error ?? body).slice(0, 120)}`);
    }
    if (body.count > maximum) return { status: 'over-limit', count: body.count };
  }
  const staged = await stageApprovedFeed(feed, approvals[feed.id], undefined, { refresh });
  return {
    status: staged.status,
    count: staged.receipt.featureCount,
    bytes: staged.receipt.bytes,
    rawFilename: staged.receipt.rawFilename,
  };
}

for (const resolution of resolutions) {
  const parent = catalog.find((item) => item.id === resolution.parentId);
  if (!parent?.provisionalPrivateValidation)
    throw new Error(`invalid Unconfirmed source role: ${resolution.parentId}`);
  if (state && parent.state !== state) continue;
  const result = { id: parent.id, state: parent.state, rightsStatus: parent.rightsStatus };
  if (!resolution.url) {
    result.status = resolution.status;
    result.reason = resolution.reason;
  } else {
    const feed = {
      ...parent,
      id: resolution.stageId ?? `resolved-${parent.id}`,
      parentSourceId: parent.id,
      name: `${parent.name}: ${resolution.reason}`,
      url: resolution.url,
      ...(resolution.where ? { where: resolution.where } : {}),
      ...(resolution.fields ? { fields: resolution.fields } : {}),
      sourceType: resolution.format === 'arcgis-layer' ? 'arcgis-layer' : 'download-file',
      ...(resolution.format === 'zip' ? { downloadFormat: 'zip' } : {}),
    };
    try {
      Object.assign(result, await stage(feed, resolution.evidenceUrl ?? parent.url));
    } catch (error) {
      result.status = 'error';
      result.error = String(error).slice(0, 300);
    }
    result.selectedUrl = feed.url;
  }
  results.push(result);
  console.log(`${result.state} ${result.id}: ${result.status}`);
}

for (const role of permissionRoles) {
  const parent = catalog.find((item) => item.id === role.id);
  if (!parent || parent.rightsStatus !== 'Permission required')
    throw new Error(`invalid permission-required role: ${role.id}`);
  if (state && parent.state !== state) continue;
  const result = { id: parent.id, state: parent.state, rightsStatus: parent.rightsStatus };
  if (!role.privateCollection) {
    result.status = 'permission-needed-for-copying';
    result.reason = role.reason;
    results.push(result);
    continue;
  }
  try {
    const feeds = role.alternateUrl
      ? [
          {
            ...parent,
            id: `resolved-${parent.id}`,
            parentSourceId: parent.id,
            url: role.alternateUrl,
            sourceType: 'arcgis-layer',
          },
        ]
      : role.childLayerIds
        ? (await discoverArcgisChildLayers(parent)).filter((child) =>
            role.childLayerIds.some((id) => child.url.endsWith(`/${id}`)),
          )
        : [parent];
    if (role.childLayerIds && feeds.length !== role.childLayerIds.length)
      throw new Error('selected NJDEP children not found');
    const stages = [];
    for (const feed of feeds) {
      stages.push(await stage({ ...feed, permissionRequiredPrivateValidation: true }, parent.url));
    }
    result.status = stages.every((item) => ['staged', 'already-staged'].includes(item.status))
      ? 'staged-private-permission-pending'
      : 'partially-staged';
    result.layers = stages;
  } catch (error) {
    result.status = 'error';
    result.error = String(error).slice(0, 300);
  }
  results.push(result);
  console.log(`${result.state} ${result.id}: ${result.status}`);
}

const report = { generatedAt: now.toISOString(), maximumFeatures: maximum, results };
await writeFile(
  join(root, `resolution-report${state ? `-${state}` : ''}.json`),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    total: results.length,
    staged: results.filter(
      (item) => item.status?.startsWith('staged') || item.status === 'already-staged',
    ).length,
    pending: results.filter(
      (item) => !item.status?.startsWith('staged') && item.status !== 'already-staged',
    ).length,
  }),
);

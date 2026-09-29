import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nativeCurlFetch } from './native-curl-fetch.mjs';
import { atomicSourceWrite, sourceSignature } from './package-source-cache.mjs';

const root = resolve(import.meta.dirname, '..');
const reportRoot = join(root, '.tmp-package-maintenance');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

export function compareSourceRevision(previous, revision, signature, acknowledge = false) {
  if (!Number.isSafeInteger(revision) || revision <= 0)
    return { status: 'unversioned', pending: previous?.pending === true };
  if (!previous) return { status: 'baseline-established', pending: false, signature, revision };
  const pending = !acknowledge && (previous.pending || previous.signature !== signature);
  return {
    status: pending ? 'changed' : 'unchanged',
    pending: Boolean(pending),
    signature: acknowledge ? signature : previous.signature,
    revision: acknowledge ? revision : previous.revision,
    observedSignature: signature,
    observedRevision: revision,
  };
}

export async function packageSourceReferences(repository = root) {
  const sources = new Map();
  const add = (url, state, channel) => {
    if (typeof url !== 'string' || !/^https:\/\/.*\/(?:FeatureServer|MapServer)\/\d+$/i.test(url))
      return;
    const key = `${channel}:${url}`;
    const entry = sources.get(key) ?? { key, url, channel, states: [] };
    if (!entry.states.includes(state)) entry.states.push(state);
    sources.set(key, entry);
  };
  const states = (await json(join(repository, 'config/us-state-forestry-agencies.json'))).states;
  const configuredPublic = await json(join(repository, 'config/public-state-agency-sources.json'));
  for (const source of configuredPublic.sources) add(source.url, source.state, 'public');
  for (const state of states) {
    const publicManifest = await json(
      join(repository, 'packages/map/src/assets/state-packages/US', state.code, 'manifest.json'),
    );
    for (const source of publicManifest.sources ?? [])
      add(source.url ?? source.sourceUrl, state.code, 'public');
    const privatePath = join(
      repository,
      'PrivateData/catalogs/US',
      state.name,
      'current',
      state.code === 'NY' ? 'manifest.json' : 'agency-ioverlander.manifest.json',
    );
    let privateManifest;
    try {
      privateManifest = await json(privatePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    for (const source of privateManifest?.agency?.sources ?? privateManifest?.sources ?? [])
      add(source.sourceUrl ?? source.url, state.code, 'private');
  }
  return [...sources.values()].sort((a, b) => a.key.localeCompare(b.key));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  if (args.some((arg) => arg !== '--acknowledge'))
    throw new Error('Usage: node tools/check-package-source-updates.mjs [--acknowledge]');
  const acknowledge = args.includes('--acknowledge');
  await mkdir(reportRoot, { recursive: true });
  const baselinePath = join(reportRoot, 'source-revisions.json');
  let previous = {};
  try {
    previous = await json(baselinePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const references = await packageSourceReferences();
  const metadata = new Map();
  const rows = [];
  const next = { ...previous };
  let index = 0;
  const worker = async () => {
    while (index < references.length) {
      const source = references[index++];
      try {
        if (!metadata.has(source.url))
          metadata.set(
            source.url,
            (async () => {
              const response = await nativeCurlFetch(`${source.url}?f=json`, {
                signal: AbortSignal.timeout(45_000),
              });
              const value = await response.json();
              if (value.error || !value.fields || !value.geometryType)
                throw new Error('Exact feature-layer metadata unavailable');
              return value;
            })(),
          );
        const value = await metadata.get(source.url);
        const result = compareSourceRevision(
          previous[source.key],
          value.editingInfo?.lastEditDate,
          sourceSignature(value),
          acknowledge,
        );
        // A failed/unversioned check must never clear a pending change.
        if (result.signature) next[source.key] = result;
        rows.push({ ...source, ...result });
      } catch (error) {
        rows.push({
          ...source,
          status: 'error',
          pending: previous[source.key]?.pending === true,
          error: String(error).slice(0, 180),
        });
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    metadataOnly: true,
    requiresManualRefresh: [
      'file-only agency downloads',
      'reviewed local iOverlander archives',
      'APIs without edit revisions',
    ],
    results: rows.sort((a, b) => a.key.localeCompare(b.key)),
    changedStates: [
      ...new Set(rows.filter((row) => row.pending).flatMap((row) => row.states)),
    ].sort(),
    errors: rows.filter((row) => row.status === 'error').length,
  };
  await atomicSourceWrite(baselinePath, JSON.stringify(next, null, 2) + '\n');
  await atomicSourceWrite(
    join(reportRoot, 'latest-source-check.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      sources: rows.length,
      errors: report.errors,
      changedStates: report.changedStates,
      baselineEstablished: rows.filter((row) => row.status === 'baseline-established').length,
      unversioned: rows.filter((row) => row.status === 'unversioned').length,
      report: '.tmp-package-maintenance/latest-source-check.json',
    }),
  );
  if (report.errors) process.exitCode = 1;
}

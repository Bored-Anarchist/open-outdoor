#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  dedupPolicy,
  deduplicatePrivateFeatures,
  readPublicStatePackage,
} from './private-public-dedup.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const encode = (value) => Buffer.from(JSON.stringify(value) + '\n');
export async function deduplicatePrivateStatePackage(
  repository,
  code,
  name,
  { verifyOnly = false } = {},
) {
  const directory = join(repository, 'PrivateData/catalogs/US', name, 'current');
  const ny = code === 'NY';
  const manifestFile = ny ? 'manifest.json' : 'agency-ioverlander.manifest.json';
  const manifest = JSON.parse(await readFile(join(directory, manifestFile), 'utf8'));
  if (manifest.classification !== 'PRIVATE_USER' || (!ny && manifest.publicDistribution !== false))
    throw new Error(`${code}: invalid private classification`);
  const descriptor = ny
    ? manifest.artifacts.find((a) => a.file === 'new-york-outdoors.composed.geojson')
    : manifest.output;
  const current = await readFile(join(directory, descriptor.file));
  if (hash(current) !== descriptor.sha256 || current.length !== descriptor.bytes)
    throw new Error(`${code}: private checksum mismatch`);
  const publicPackage = await readPublicStatePackage(repository, code);
  if (verifyOnly) {
    const d = manifest.publicDeduplication;
    if (
      !d ||
      d.publicSha256 !== publicPackage.sha256 ||
      JSON.stringify(d.policy) !== JSON.stringify(dedupPolicy) ||
      d.outputSha256 !== descriptor.sha256
    )
      throw new Error(`${code}: missing or stale deduplication receipt`);
    const reportBytes = await readFile(join(directory, d.report.file));
    if (hash(reportBytes) !== d.report.sha256 || reportBytes.length !== d.report.bytes)
      throw new Error(`${code}: deduplication report checksum mismatch`);
    const report = JSON.parse(reportBytes);
    const base = await readFile(join(directory, d.input.file));
    if (
      hash(base) !== d.input.sha256 ||
      base.length !== d.input.bytes ||
      report.classification !== 'PRIVATE_USER' ||
      report.publicDistribution !== false ||
      report.state !== code ||
      report.publicSha256 !== publicPackage.sha256 ||
      report.inputSha256 !== d.input.sha256 ||
      report.outputSha256 !== d.outputSha256 ||
      JSON.stringify(report.policy) !== JSON.stringify(dedupPolicy) ||
      JSON.stringify(report.summary) !== JSON.stringify(d.summary)
    )
      throw new Error(`${code}: deduplication provenance mismatch`);
    const replay = deduplicatePrivateFeatures(JSON.parse(base).features, publicPackage.features);
    if (
      !encode({ type: 'FeatureCollection', features: replay.features }).equals(current) ||
      JSON.stringify(replay.matches) !== JSON.stringify(report.matches) ||
      replay.matches.length !== report.summary.removed ||
      replay.features.length !== report.summary.total ||
      JSON.parse(base).features.length !== report.summary.before
    )
      throw new Error(`${code}: deduplication replay mismatch`);
    return report.summary;
  }
  let input = current;
  if (manifest.publicDeduplication) {
    const saved = manifest.publicDeduplication.input;
    input = await readFile(join(directory, saved.file));
    if (hash(input) !== saved.sha256 || input.length !== saved.bytes)
      throw new Error(`${code}: preserved deduplication input checksum mismatch`);
  }
  const collection = JSON.parse(input);
  const result = deduplicatePrivateFeatures(collection.features, publicPackage.features);
  // NY has independently reviewed DEC profiles and a SQLite identity catalog. Fail closed
  // if future public inputs require removing their records, rather than desynchronizing them.
  if (ny && result.matches.length)
    throw new Error(
      'NY: matches require rebuilding the reviewed identity catalog and DEC profile bindings before removal',
    );
  const output = encode({ type: 'FeatureCollection', features: result.features });
  const ioverlander = result.features.filter(
    (f) => f.properties?.sourceId === 'private-ioverlander',
  ).length;
  const summary = {
    state: code,
    name,
    before: collection.features.length,
    removed: result.matches.length,
    removedAgency: result.matches.filter((m) => m.privateSourceId !== 'private-ioverlander').length,
    removedIoverlander: result.matches.filter((m) => m.privateSourceId === 'private-ioverlander')
      .length,
    agency: result.features.length - ioverlander,
    ioverlander,
    total: result.features.length,
  };
  const report = encode({
    schemaVersion: 1,
    state: code,
    classification: 'PRIVATE_USER',
    publicDistribution: false,
    policy: dedupPolicy,
    publicSha256: publicPackage.sha256,
    inputSha256: hash(input),
    outputSha256: hash(output),
    summary,
    matches: result.matches,
  });
  const inputFile = 'before-public-dedup.geojson',
    reportFile = 'public-dedup.private.json';
  if (!ny) {
    manifest.ioverlander.featureCount = ioverlander;
    manifest.agency.featureCount = summary.agency;
    manifest.agency.status = summary.agency ? 'staged-private-validation' : 'not-included';
    for (const source of manifest.agency.sources)
      source.retainedFeatureCount = result.features.filter(
        (f) => f.properties?.sourceId === source.sourceId,
      ).length;
    manifest.packageMode = summary.agency ? 'agency-and-ioverlander' : 'ioverlander-only';
    if (manifest.visitorReferences) {
      const ids = new Set(result.features.map((f) => f.id));
      if (manifest.visitorReferences.bindings.some((b) => !ids.has(b.featureId)))
        throw new Error(`${code}: matched visitor reference requires explicit binding migration`);
    }
    Object.assign(descriptor, {
      featureCount: result.features.length,
      bytes: output.length,
      sha256: hash(output),
    });
  } else if (!output.equals(current))
    throw new Error('NY: deduplication must preserve reviewed map bytes');
  manifest.publicDeduplication = {
    policy: dedupPolicy,
    publicSha256: publicPackage.sha256,
    outputSha256: hash(output),
    input: { file: inputFile, bytes: input.length, sha256: hash(input) },
    report: { file: reportFile, bytes: report.length, sha256: hash(report) },
    summary,
  };
  // Store the complete recoverable input and private match details before activating output.
  await writeFile(join(directory, inputFile), input);
  await writeFile(join(directory, reportFile), report);
  if (!ny) await writeFile(join(directory, descriptor.file), output);
  await writeFile(join(directory, manifestFile), JSON.stringify(manifest, null, 2) + '\n');
  return summary;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const repository = resolve(import.meta.dirname, '..');
  const states = JSON.parse(
    await readFile(join(repository, 'config/us-state-forestry-agencies.json'), 'utf8'),
  ).states;
  const requested = process.argv[2]?.toUpperCase();
  if (
    !requested ||
    (!['--ALL', '--VERIFY'].includes(requested) && !states.some((s) => s.code === requested))
  )
    throw new Error(
      'Usage: node tools/deduplicate-private-state-packages.mjs <state-code>|--all|--verify',
    );
  const rows = [];
  for (const state of states.filter((s) => requested.startsWith('--') || s.code === requested)) {
    const result = await deduplicatePrivateStatePackage(repository, state.code, state.name, {
      verifyOnly: requested === '--VERIFY',
    });
    rows.push(result);
    console.log(`${state.code}: ${result.removed} removed; ${result.total} retained`);
  }
  console.log(
    JSON.stringify({
      packages: rows.length,
      removed: rows.reduce((n, r) => n + r.removed, 0),
      retained: rows.reduce((n, r) => n + r.total, 0),
    }),
  );
}

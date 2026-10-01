import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadAgencySourcePolicy } from '../acquisition/agency-source-policy.mjs';
import { loadStateAgencyFeedCatalog } from '../acquisition/state-agency-feeds.mjs';

const repository = resolve(import.meta.dirname, '../..');
const cell = (value) =>
  String(value ?? '')
    .replace(/\]\(([A-Z0-9_]+_2026-\d{2}-\d{2}\.md)\)/g, '](../archive/reports/$1)')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
const link = (label, url) =>
  `[${cell(label)}](${url.replaceAll('(', '%28').replaceAll(')', '%29')})`;
const table = (head, rows) =>
  [head, head.map(() => '---'), ...rows]
    .map((row) => `| ${row.map(cell).join(' | ')} |`)
    .join('\n');

export function renderPublicPackageReports(inventory, manifests, policy, feeds) {
  const totals = {};
  for (const key of ['features', 'poi', 'other', 'agency', 'agencySources', 'parts']) {
    totals[key] = inventory.states.reduce((sum, state) => sum + state[key], 0);
    if (!Number.isSafeInteger(totals[key]) || totals[key] !== inventory.totals[key])
      throw new Error(`Inventory total mismatch: ${key}`);
  }
  const codes = new Set(inventory.states.map((state) => state.state));
  if (codes.size !== inventory.states.length || manifests.length !== codes.size)
    throw new Error('Duplicate states or missing manifests');
  for (let index = 0; index < manifests.length; index++) {
    const manifest = manifests[index];
    const state = inventory.states[index];
    const code = typeof manifest.state === 'string' ? manifest.state : manifest.state?.code;
    if (code !== state.state || manifest.featureCount !== state.features)
      throw new Error(`Manifest/inventory mismatch: ${state.state}`);
    if (manifest.publicDistribution !== true || manifest.distribution !== 'public')
      throw new Error(`Non-public manifest: ${state.state}`);
  }
  const introduction = [
    `Generated from the pinned inventory (${inventory.generatedAt}), state manifests, and agency source policy.`,
    'Regenerate with `pnpm docs:generate`; `pnpm docs:check` rejects stale output. Do not edit generated reports manually.',
    '',
    `${codes.size} state packages; ${totals.features.toLocaleString('en-US')} features; ${totals.poi.toLocaleString('en-US')} POIs; ${totals.agency.toLocaleString('en-US')} eligible agency features; ${totals.parts} validated import parts.`,
    '',
    'These are package entries, not deduplicated national entities. Other categories retain source types. Ownership and historical records do not establish current access, conditions, or permission. Physical-phone acceptance remains pending.',
    'Public derivative receipts and private collection permissions remain separate. A candidate rights classification does not authorize ingestion. Source-specific terms and modifications remain in the manifests and distribution notices.',
    '',
    '[Package format and rebuild guide](../guides/PUBLIC_STATE_PACKAGE_FORMAT.md) Â· [Offline state loader](../guides/STATE_PACKAGE_LOADER.md)',
    '',
  ];
  const tracker = [
    '# State outdoor data package tracker',
    '',
    ...introduction,
    '## State-by-state progress',
    '',
    table(
      ['State', 'Name', 'Features', 'POIs', 'Agency features', 'Import parts', 'Manifest'],
      inventory.states.map((state) => [
        state.state,
        state.name,
        state.features,
        state.poi,
        state.agency,
        state.parts,
        link(
          'Manifest',
          `../../packages/map/src/assets/state-packages/US/${state.state}/manifest.json`,
        ),
      ]),
    ),
    '',
    '## Selected agency inputs',
    '',
    'Selection notes and review gates come from the structured policy. Inclusion in this plan does not mean inclusion in a public package. Consult the exact manifest receipts for shipped inputs.',
    '',
    table(
      ['State / role', 'Source', 'Selection', 'Review gates'],
      policy.planned.map((row) => [
        `${row.state} / ${row.role}`,
        link(row.name, row.url),
        row.notes,
        row.review.join(' '),
      ]),
    ),
    '',
  ].join('\n');
  const sources = new Map();
  for (const manifest of manifests) {
    for (const source of manifest.sources) {
      const key = `${source.id}|${source.url}`;
      const record = sources.get(key) ?? { source, states: new Set() };
      record.states.add(typeof manifest.state === 'string' ? manifest.state : manifest.state.code);
      sources.set(key, record);
    }
  }
  const datasets = [
    '# All datasets tracker',
    '',
    ...introduction,
    '## Shipped source receipts',
    '',
    'Exact per-state counts, rights terms, acquisition dates, checksums and modifications belong to the linked package manifests.',
    '',
    table(
      ['Source ID', 'Source', 'States'],
      [...sources.values()]
        .sort((a, b) => a.source.id.localeCompare(b.source.id))
        .map(({ source, states }) => [
          source.id,
          link(source.name ?? source.id, source.url),
          [...states].sort().join(', '),
        ]),
    ),
    '',
    '## Agency candidate catalog',
    '',
    'The catalog below is metadata only. Private validation eligibility is not public redistribution approval. The historical rights evidence remains archived; current classifications are maintained in config/agency-source-policy.json.',
    '',
    table(
      ['ID', 'State / role', 'Source', 'Rights classification'],
      feeds.map((feed) => [
        feed.id,
        `${feed.state} / ${feed.agencyRole}`,
        link(feed.name, feed.url),
        feed.rightsStatus,
      ]),
    ),
    '',
  ].join('\n');
  return new Map([
    ['docs/reference/STATE_DATA_PACKAGE_TRACKER.md', tracker],
    ['docs/reference/ALL_DATASETS_TRACKER.md', datasets],
  ]);
}

export async function writePublicPackageReports({ root = repository, check = false } = {}) {
  const base = join(root, 'packages/map/src/assets/state-packages/US');
  const inventory = JSON.parse(await readFile(join(base, 'inventory.json'), 'utf8'));
  const manifests = await Promise.all(
    inventory.states.map(async (state) =>
      JSON.parse(await readFile(join(base, state.state, 'manifest.json'), 'utf8')),
    ),
  );
  const [policy, feeds] = await Promise.all([
    loadAgencySourcePolicy(),
    loadStateAgencyFeedCatalog(),
  ]);
  for (const [path, text] of renderPublicPackageReports(inventory, manifests, policy, feeds)) {
    let existing;
    try {
      existing = await readFile(join(root, path), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    // Windows checkouts/editors can use CRLF without changing report content.
    if (existing?.replaceAll('\r\n', '\n') === text) continue;
    if (check) throw new Error(`Stale generated report: ${path}; run pnpm docs:generate`);
    await writeFile(join(root, path), text);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check'))
    throw new Error('Usage: pnpm docs:generate | pnpm docs:check');
  await writePublicPackageReports({ check: args[0] === '--check' });
  console.log('Public package reports are current.');
}

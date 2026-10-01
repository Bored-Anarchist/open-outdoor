import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  renderPublicPackageReports,
  writePublicPackageReports,
} from '../reporting/report-public-state-packages.mjs';

const inventory = {
  generatedAt: '2026-09-28T00:00:00Z',
  states: [
    {
      state: 'NY',
      name: 'New York',
      features: 1,
      poi: 1,
      other: 0,
      agency: 0,
      agencySources: 0,
      parts: 1,
    },
  ],
  totals: { features: 1, poi: 1, other: 0, agency: 0, agencySources: 0, parts: 1 },
};
const manifests = [
  {
    state: 'NY',
    featureCount: 1,
    publicDistribution: true,
    distribution: 'public',
    sources: [{ id: 'public-example', url: 'https://example.org/source' }],
  },
];
const policy = { planned: [] };

test('freshness gate tolerates Windows line endings but rejects missing or edited reports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'outdoor-reports-'));
  try {
    const base = join(root, 'packages/map/src/assets/state-packages/US');
    await mkdir(join(base, 'NY'), { recursive: true });
    await mkdir(join(root, 'docs/reference'), { recursive: true });
    await writeFile(join(base, 'inventory.json'), JSON.stringify(inventory));
    await writeFile(join(base, 'NY/manifest.json'), JSON.stringify(manifests[0]));
    await assert.rejects(
      writePublicPackageReports({ root, check: true }),
      /Stale generated report/,
    );
    await writePublicPackageReports({ root });
    await writePublicPackageReports({ root, check: true });
    const windowsReports = new Map();
    for (const name of ['STATE_DATA_PACKAGE_TRACKER.md', 'ALL_DATASETS_TRACKER.md']) {
      const path = join(root, 'docs/reference', name);
      const windowsText = (await readFile(path, 'utf8')).replaceAll('\n', '\r\n');
      await writeFile(path, windowsText);
      windowsReports.set(path, windowsText);
    }
    await writePublicPackageReports({ root, check: true });
    for (const [path, windowsText] of windowsReports) {
      assert.equal(await readFile(path, 'utf8'), windowsText);
    }
    await writeFile(join(root, 'docs/reference/STATE_DATA_PACKAGE_TRACKER.md'), 'manual edit');
    await assert.rejects(
      writePublicPackageReports({ root, check: true }),
      /Stale generated report/,
    );
    await writePublicPackageReports({ root });
    await writePublicPackageReports({ root, check: true });
    assert.equal(
      await readFile(join(base, 'NY/manifest.json'), 'utf8'),
      JSON.stringify(manifests[0]),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('current reports are deterministic and reject inconsistent or nonpublic inputs', () => {
  const reports = renderPublicPackageReports(inventory, manifests, policy, []);
  assert.deepEqual(reports, renderPublicPackageReports(inventory, manifests, policy, []));
  assert.match(
    reports.get('docs/reference/STATE_DATA_PACKAGE_TRACKER.md'),
    /Physical-phone acceptance remains pending/,
  );
  const stale = structuredClone(inventory);
  stale.totals.features++;
  assert.throws(() => renderPublicPackageReports(stale, manifests, policy, []), /total mismatch/);
  const held = structuredClone(manifests);
  held[0].publicDistribution = false;
  assert.throws(() => renderPublicPackageReports(inventory, held, policy, []), /Non-public/);
  const mismatch = structuredClone(manifests);
  mismatch[0].featureCount++;
  assert.throws(
    () => renderPublicPackageReports(inventory, mismatch, policy, []),
    /Manifest\/inventory mismatch/,
  );
});

test('freshness checks are read-only for distribution notices and manifest pins', async () => {
  const manifest = new URL(
    '../../packages/map/src/assets/state-packages/US/NY/manifest.json',
    import.meta.url,
  );
  const notices = new URL(
    '../../packages/map/src/assets/state-packages/US/NY/DATA_NOTICES.md',
    import.meta.url,
  );
  const before = await Promise.all([readFile(manifest), readFile(notices)]);
  await writePublicPackageReports({ check: true });
  assert.deepEqual(await Promise.all([readFile(manifest), readFile(notices)]), before);
});

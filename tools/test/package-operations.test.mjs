import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  backupPinnedFiles,
  privatePackageDescriptors,
} from '../packages/backup-package-artifacts.mjs';
import {
  compareSourceRevision,
  packageSourceReferences,
} from '../packages/check-package-source-updates.mjs';
import { sourceHash } from '../packages/package-source-cache.mjs';

test('external mirror preserves state paths and reuses identical objects across snapshots', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'outdoor-mirror-'));
  try {
    const source = join(directory, 'source');
    const bytes = Buffer.from('package');
    await writeFile(source, bytes);
    const descriptor = { file: 'outdoors.geojson', bytes: bytes.length, sha256: sourceHash(bytes) };
    const destination = join(directory, 'mirror');
    const result = await backupPinnedFiles(
      [
        { source, file: 'NY/outdoors.geojson', descriptor },
        { source, file: 'CO/outdoors.geojson', descriptor },
      ],
      destination,
    );
    const receipt = JSON.parse(await readFile(join(result.release, 'backup-receipt.json')));
    assert.deepEqual(
      receipt.files.map((entry) => entry.file),
      ['NY/outdoors.geojson', 'CO/outdoors.geojson'],
    );
    const object = await stat(join(destination, 'objects', descriptor.sha256));
    assert.equal((await stat(join(result.release, 'NY/outdoors.geojson'))).ino, object.ino);
    assert.equal((await stat(join(result.release, 'CO/outdoors.geojson'))).ino, object.ino);
    assert.equal(
      (await backupPinnedFiles([{ source, file: 'NY/outdoors.geojson', descriptor }], destination))
        .fileCount,
      1,
    );
    await assert.rejects(
      backupPinnedFiles([{ source, file: '../escape', descriptor }], destination),
      /Unsafe/,
    );
    await assert.rejects(
      backupPinnedFiles(
        [{ source, file: 'NY/corrupt', descriptor: { ...descriptor, sha256: '0'.repeat(64) } }],
        destination,
      ),
      /mismatch/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('private backups include active, recovery and enrichment files and reject unsafe descriptors', () => {
  const descriptor = (file) => ({ file, bytes: 3, sha256: 'a'.repeat(64) });
  const manifest = {
    output: descriptor('active.geojson'),
    publicDeduplication: {
      input: descriptor('recovery.geojson'),
      report: descriptor('audit.json'),
      enrichments: descriptor('enrichments.json'),
    },
  };
  assert.equal(privatePackageDescriptors(manifest).length, 4);
  assert.throws(() => privatePackageDescriptors({ output: descriptor('../private') }), /Invalid/);
});

test('pending API changes survive repeated checks and clear only after explicit acknowledgement', () => {
  const baseline = compareSourceRevision(null, 100, 'first');
  assert.equal(baseline.status, 'baseline-established');
  assert.equal(baseline.pending, true);
  assert.equal(baseline.acquisitionRequired, true);
  const changed = compareSourceRevision(baseline, 101, 'next');
  assert.equal(changed.pending, true);
  assert.equal(compareSourceRevision(changed, 101, 'next').pending, true);
  assert.equal(compareSourceRevision(changed, undefined, 'unknown').pending, true);
  const acknowledged = compareSourceRevision(changed, 101, 'next', true);
  assert.equal(acknowledged.pending, false);
  assert.equal(acknowledged.signature, 'next');
  assert.equal(compareSourceRevision(acknowledged, 101, 'next').status, 'unchanged');
});

test('unversioned sources require acquisition even on first observation and acknowledgement', () => {
  for (const acknowledge of [false, true]) {
    const result = compareSourceRevision(null, undefined, 'unknown', acknowledge);
    assert.equal(result.pending, true);
    assert.equal(result.acquisitionRequired, true);
  }
});

test('source inventory includes NY DEC, all OPRHP layers, and NPS APIs', async () => {
  const sources = await packageSourceReferences();
  const ny = sources.filter((source) => source.states.includes('NY'));
  const oprhp = JSON.parse(await readFile('config/private-new-york-oprhp-sources.json'));
  for (const source of oprhp.sources)
    assert.ok(ny.some((item) => item.channel === 'private' && item.url === source.url));
  assert.ok(
    ny.some((item) => item.channel === 'private' && item.url.includes('dil_trails/MapServer/2')),
  );
  assert.ok(ny.some((item) => item.channel === 'private' && item.url.includes('yvkb-z58x')));
  assert.ok(
    ny.some(
      (item) => item.channel === 'public' && item.url.includes('developer.nps.gov/api/v1/parks'),
    ),
  );
});

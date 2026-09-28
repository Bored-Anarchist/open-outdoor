import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const text = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const native = text('packages/native-spikes/ios/OpenOutdoorStatePackages.swift');

test('native state activation is build-pinned, bounded and separate from private user storage', () => {
  for (const token of [
    'allowed.first',
    'hash(temporary) == pin.sha256',
    'extractTiles(pin)',
    'PublicStatePackages',
    'active.previous.json',
    'SQLITE_OPEN_READONLY',
    'sqlite3_bind_text',
    'sqlite3_blob_read',
    'PRAGMA quick_check',
    '3 * 1024 * 1024 * 1024',
    'completeUntilFirstUserAuthentication',
    'quarantined',
    'previous',
    'try save(active)',
  ])
    assert.ok(native.includes(token), token);
  assert.ok(
    native.indexOf('try extractTiles(pin)') <
      native.indexOf('try save(active) // Atomic publication'),
  );
  assert.ok(!native.includes('userDatabaseURL') && !native.includes('commitPrivateSnapshot'));
});

test('manual imports retain their existing guardrails', () => {
  const manual = text('packages/map/src/imported-dataset.ts');
  for (const token of [
    'maximumBytes: 20 * 1024 * 1024',
    'maximumFeatures: 20_000',
    'maximumPositions: 200_000',
    'maximumDatasets: 5',
    'maximumStoreBytes: 50 * 1024 * 1024',
  ])
    assert.ok(manual.includes(token), token);
});

test('state picker bridges only catalog summaries, never a complete GeoJSON payload', () => {
  const hook = text('apps/mobile/useStatePackages.ts');
  assert.ok(hook.includes('searchStatePackages(query)') && hook.includes('statePackageDetail(id)'));
  assert.ok(!hook.includes('parseMapDataset') && !hook.includes('serializeMapDatasets'));
  assert.ok(native.includes('read(upToCount: 1024 * 1024)'));
  assert.ok(native.includes('length(geometry)<=2097152'));
});

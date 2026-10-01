import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Resolve through the real Expo consumers, so these tests exercise overrides
// used by the mobile build rather than unrelated top-level installations.
const mobileRequire = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const expoRequire = createRequire(mobileRequire.resolve('expo/package.json'));
const metroRequire = createRequire(expoRequire.resolve('@expo/metro-config/package.json'));
const pluginsRequire = createRequire(expoRequire.resolve('@expo/config-plugins/package.json'));
const { getAssetSize, getAssetData } = metroRequire('metro/private/Assets');
const xcode = pluginsRequire('xcode');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6XkAAAAASUVORK5CYII=',
  'base64',
);

test('Metro reads image dimensions from buffers after removing image-size', () => {
  assert.deepEqual(getAssetSize('png', png, 'synthetic.png'), { width: 1, height: 1 });
  assert.throws(() => getAssetSize('png', Buffer.from('invalid'), 'synthetic.png'));
});

test('Metro reads on-disk image assets and preserves density scaling', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-outdoor-dependency-'));
  try {
    const filename = path.join(directory, 'synthetic@2x.png');
    await writeFile(filename, png);
    const asset = await getAssetData(filename, 'synthetic@2x.png', [], 'ios', '/assets');
    assert.equal(asset.width, 0.5);
    assert.equal(asset.height, 0.5);
    assert.deepEqual(asset.scales, [2]);
    assert.deepEqual(asset.files, [filename]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('xcode generates valid project identifiers with the patched CommonJS UUID API', () => {
  const project = xcode.project('synthetic.pbxproj');
  project.hash = { project: { objects: {} } };
  assert.match(project.generateUuid(), /^[0-9A-F]{24}$/);
});

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const source = 'https://tiles.openfreemap.org/styles/liberty';
const output = new URL('../packages/map/src/assets/', import.meta.url);
const allowedHost = 'tiles.openfreemap.org';
const response = await fetch(source, {
  redirect: 'error',
  signal: AbortSignal.timeout(60_000),
});
if (!response.ok) throw new Error('OpenFreeMap style HTTP ' + response.status);
const text = await response.text();
if (Buffer.byteLength(text) > 512 * 1024) throw new Error('OpenFreeMap style exceeds size limit');
const style = JSON.parse(text);
if (
  style.version !== 8 ||
  !style.sources ||
  !Array.isArray(style.layers) ||
  style.layers.length < 20 ||
  style.layers.length > 250
) {
  throw new Error('OpenFreeMap style does not match the reviewed MapLibre profile');
}
const resources = [style.sprite, style.glyphs];
for (const sourceDefinition of Object.values(style.sources)) {
  if (typeof sourceDefinition.url === 'string') resources.push(sourceDefinition.url);
  if (Array.isArray(sourceDefinition.tiles)) resources.push(...sourceDefinition.tiles);
}
for (const resource of resources) {
  const url = new URL(resource);
  if (url.protocol !== 'https:' || url.hostname !== allowedHost) {
    throw new Error('OpenFreeMap style contains an unapproved resource: ' + resource);
  }
}
style.sources.openmaptiles.attribution =
  'OpenFreeMap © OpenMapTiles Data © OpenStreetMap contributors';
style.sources.ne2_shaded.attribution = 'Natural Earth';
const bytes = JSON.stringify(style) + '\n';
const sha256 = createHash('sha256').update(bytes).digest('hex');
await mkdir(output, { recursive: true });
await writeFile(new URL('openfreemap-liberty.json', output), bytes);
await writeFile(
  new URL('openfreemap-liberty.manifest.json', output),
  JSON.stringify(
    {
      schemaVersion: 1,
      acquiredAt: new Date().toISOString(),
      source,
      sha256,
      bytes: Buffer.byteLength(bytes),
      layerCount: style.layers.length,
      attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
      connectedOnly: true,
      license:
        'Style code BSD-3-Clause; style design CC BY 4.0; OpenStreetMap data ODbL; OpenFreeMap project MIT',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Pinned OpenFreeMap Liberty style: ' + style.layers.length + ' layers, ' + sha256 + '.',
);

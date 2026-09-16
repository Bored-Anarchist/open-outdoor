import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { hikeRouteDetails, withHikeElevations } from '../packages/shared/src/hike-route.ts';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const TILE_ROOT = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

/** Decode only the bounded, non-interlaced RGB/RGBA PNGs supplied by Terrarium. */
export function decodeTerrainPng(bytes) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw Error('Invalid terrain PNG');
  let width, height, channels;
  const chunks = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (offset + 12 + length > bytes.length) throw Error('Truncated terrain PNG');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = data[9] === 2 ? 3 : data[9] === 6 ? 4 : 0;
      if (
        width !== 256 ||
        height !== 256 ||
        data[8] !== 8 ||
        !channels ||
        data[10] ||
        data[11] ||
        data[12]
      )
        throw Error('Unsupported terrain PNG');
    }
    if (type === 'IDAT') chunks.push(data);
    offset += 12 + length;
  }
  if (!width || !chunks.length) throw Error('Missing terrain image');
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(chunks), { maxOutputLength: (stride + 1) * height });
  if (raw.length !== (stride + 1) * height) throw Error('Malformed terrain image');
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw Error('Unsupported terrain filter');
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const prediction = left + up - upperLeft;
      const paeth =
        Math.abs(prediction - left) <= Math.abs(prediction - up) &&
        Math.abs(prediction - left) <= Math.abs(prediction - upperLeft)
          ? left
          : Math.abs(prediction - up) <= Math.abs(prediction - upperLeft)
            ? up
            : upperLeft;
      const adjustment = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
      pixels[y * stride + x] = (raw[y * (stride + 1) + x + 1] + adjustment) & 255;
    }
  }
  return { width, height, channels, pixels };
}

export function terrainTilePosition(longitude, latitude, zoom) {
  const n = 2 ** zoom;
  const x = ((longitude + 180) / 360) * n;
  const radians = (Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI) / 180;
  const y = ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * n;
  const tileX = Math.max(0, Math.min(n - 1, Math.floor(x)));
  const tileY = Math.max(0, Math.min(n - 1, Math.floor(y)));
  return {
    key: `${zoom}/${tileX}/${tileY}`,
    pixelX: (x - tileX) * 256 - 0.5,
    pixelY: (y - tileY) * 256 - 0.5,
  };
}

export function terrainElevation(tile, pixelX, pixelY) {
  const x = Math.max(0, Math.min(255, pixelX));
  const y = Math.max(0, Math.min(255, pixelY));
  const read = (px, py) => {
    const offset = (py * tile.width + px) * tile.channels;
    return (
      tile.pixels[offset] * 256 + tile.pixels[offset + 1] + tile.pixels[offset + 2] / 256 - 32768
    );
  };
  const left = Math.floor(x),
    top = Math.floor(y);
  const right = Math.min(255, left + 1),
    bottom = Math.min(255, top + 1);
  const row = (py) => read(left, py) * (1 - (x - left)) + read(right, py) * (x - left);
  return row(top) * (1 - (y - top)) + row(bottom) * (y - top);
}

async function main() {
  // Fixed public input: never send imported or private route coordinates to a provider.
  const sourcePath = resolve('packages/map/src/assets/new-york-outdoors.geojson');
  const sourceBytes = await readFile(sourcePath);
  const sourceManifest = JSON.parse(
    await readFile('packages/map/src/assets/new-york-outdoors.manifest.json', 'utf8'),
  );
  if (
    sourceManifest.sha256 !== digest(sourceBytes) ||
    sourceManifest.classification !== 'SOURCE_REDISTRIBUTABLE'
  )
    throw Error('Expected checksum-verified public government map');
  const features = JSON.parse(sourceBytes).features.filter(
    (feature) =>
      feature.properties.kind === 'trail' &&
      ['LineString', 'MultiLineString'].includes(feature.geometry.type),
  );
  if (features.some((feature) => feature.properties.origin === 'private-catalog'))
    throw Error('Private hikes must remain on device');
  const zoom = 11;
  const cache = resolve('.tmp-hike-terrain-tiles');
  await mkdir(cache, { recursive: true });
  const hikes = Object.fromEntries(
    features.map((feature) => [feature.id, hikeRouteDetails(feature.geometry)]),
  );
  const keys = [
    ...new Set(
      Object.values(hikes).flatMap((hike) =>
        hike.samples.map((sample) => terrainTilePosition(sample[2], sample[3], zoom).key),
      ),
    ),
  ].sort();
  const tiles = new Map();
  const receipts = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < keys.length) {
        const key = keys[next++];
        const url = `${TILE_ROOT}/${key}.png`;
        const filename = join(cache, key.replaceAll('/', '-') + '.png');
        let bytes;
        try {
          bytes = await readFile(filename);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          for (let attempt = 0; attempt < 3; attempt++) {
            const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
            if (response.ok) {
              bytes = Buffer.from(await response.arrayBuffer());
              break;
            }
            if (attempt === 2 || response.status < 500)
              throw Error(`Terrain tile ${key}: HTTP ${response.status}`);
          }
          decodeTerrainPng(bytes);
          await writeFile(filename, bytes);
        }
        tiles.set(key, decodeTerrainPng(bytes));
        receipts.push({ url, bytes: bytes.length, sha256: digest(bytes) });
        if (tiles.size % 25 === 0)
          process.stdout.write(`Terrain tiles: ${tiles.size}/${keys.length}\n`);
      }
    }),
  );
  for (const [id, hike] of Object.entries(hikes)) {
    hikes[id] = withHikeElevations(
      hike,
      hike.samples.map((sample) => {
        const position = terrainTilePosition(sample[2], sample[3], zoom);
        return terrainElevation(tiles.get(position.key), position.pixelX, position.pixelY);
      }),
      'terrain-model',
    );
  }
  const generatedAt = new Date().toISOString();
  const attribution =
    'Mapzen terrain tiles; United States 3DEP, GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey; contains information licensed under the Open Government Licence – Canada.';
  const asset = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      sourceSha256: digest(sourceBytes),
      generatedAt,
      attribution,
      hikes,
    }) + '\n',
  );
  const output = resolve('packages/map/src/assets');
  await writeFile(join(output, 'new-york-hikes.json'), asset);
  await writeFile(
    join(output, 'new-york-hikes.manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        classification: 'SOURCE_REDISTRIBUTABLE',
        generatedAt,
        sha256: digest(asset),
        bytes: asset.length,
        sourceSha256: digest(sourceBytes),
        featureCount: features.length,
        terrainZoom: zoom,
        sampleSpacingM: 100,
        maximumSamples: 128,
        coverage:
          'Derived planning profiles for the bundled public New York trail segments, not curated complete hikes.',
        modifications:
          'WGS84 geometry sampled at approximately 100 m (coarser on long routes), bilinear Terrarium terrain interpolation; cumulative ascent/descent derived from sampled elevations. Separate parts are not connected.',
        attribution,
        termsUrls: [
          'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
          'https://registry.opendata.aws/terrain-tiles/',
          'https://open.canada.ca/en/open-government-licence-canada',
        ],
        tiles: receipts.sort((a, b) => a.url.localeCompare(b.url)),
      },
      null,
      2,
    ) + '\n',
  );
  process.stdout.write(
    JSON.stringify({
      hikes: features.length,
      tiles: tiles.size,
      bytes: asset.length,
      sha256: digest(asset),
    }) + '\n',
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import {
  decodeTerrainPng,
  terrainElevation,
  terrainTilePosition,
} from './acquire-hike-profiles.mjs';

function chunk(type, data) {
  const name = Buffer.from(type);
  const bytes = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, bytes, checksum]);
}
function fixture(filter, channels) {
  const stride = 256 * channels;
  const pixels = Buffer.alloc(stride * 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const offset = y * stride + x * channels;
      pixels[offset] = 128;
      pixels[offset + 1] = (x + y) % 256;
      pixels[offset + 2] = 128;
      if (channels === 4) pixels[offset + 3] = 255;
    }
  const raw = Buffer.alloc((stride + 1) * 256);
  for (let y = 0; y < 256; y++) {
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y ? pixels[(y - 1) * stride + x] : 0;
      const c = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c;
      const predictors = [a, b, c].map((value, index) => ({
        value,
        index,
        error: Math.abs(p - value),
      }));
      predictors.sort((left, right) => left.error - right.error || left.index - right.index);
      const prediction = [0, a, b, Math.floor((a + b) / 2), predictors[0].value][filter];
      raw[y * (stride + 1) + x + 1] = (pixels[y * stride + x] - prediction + 256) & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(256, 0);
  header.writeUInt32BE(256, 4);
  header[8] = 8;
  header[9] = channels === 3 ? 2 : 6;
  return {
    pixels,
    png: Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  };
}

test('Terrarium PNG decoder handles all standard scanline filters and RGB/RGBA', () => {
  for (const channels of [3, 4])
    for (const filter of [0, 1, 2, 3, 4]) {
      const { pixels, png } = fixture(filter, channels);
      const decoded = decodeTerrainPng(png);
      assert.deepEqual(decoded.pixels, pixels);
      assert.equal(terrainElevation(decoded, 10, 20), 30.5);
    }
});
test('terrain sampling decodes signed elevations, bilinearly interpolates, and bounds edge pixels', () => {
  const { png } = fixture(0, 3);
  const tile = decodeTerrainPng(png);
  assert.equal(terrainElevation(tile, 10.5, 20.5), 31.5);
  assert.equal(terrainElevation(tile, -10, -10), 0.5);
  tile.pixels[0] = 127;
  tile.pixels[1] = 255;
  tile.pixels[2] = 128;
  assert.equal(terrainElevation(tile, 0, 0), -0.5);
});
test('terrain tile position uses Web Mercator and XYZ addressing', () => {
  assert.deepEqual(terrainTilePosition(0, 0, 0), { key: '0/0/0', pixelX: 127.5, pixelY: 127.5 });
  assert.equal(terrainTilePosition(-74, 42, 11).key, '11/603/760');
});
test('malformed terrain images fail instead of fabricating elevation', () => {
  assert.throws(() => decodeTerrainPng(Buffer.from('invalid')), /Invalid terrain/);
  const { png } = fixture(0, 3);
  assert.throws(() => decodeTerrainPng(png.subarray(0, 50)), /Truncated terrain/);
  const wrongDepth = Buffer.from(png);
  wrongDepth[24] = 16;
  assert.throws(() => decodeTerrainPng(wrongDepth), /Unsupported terrain/);
});

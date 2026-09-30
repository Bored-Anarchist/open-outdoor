import { expect, it } from 'vitest';
import { parseDiscoveredLaptops, parseLaptopPairingQr } from '../src/laptop-connection';

const address = 'http://192.168.1.20:8765';
const pairingCode = 'a'.repeat(32);
const pair = { type: 'open-outdoor-laptop', version: 1, address, pairingCode };

it('validates QR credentials independently before connecting', () => {
  expect(parseLaptopPairingQr(JSON.stringify(pair))).toEqual({ address, pairingCode });
  for (const raw of [
    'https://example.com',
    'null',
    '{}',
    'x'.repeat(1025),
    JSON.stringify({ ...pair, version: 2 }),
    JSON.stringify({ ...pair, pairingCode: 'bad' }),
    JSON.stringify({ ...pair, address: 'http://example.com:8765' }),
    JSON.stringify({ ...pair, address: 'http://192.168.1.20:8765/v1/catalog' }),
    JSON.stringify({ ...pair, address: 'http://8.8.8.8:8765' }),
  ]) {
    expect(() => parseLaptopPairingQr(raw)).toThrow('Scan the pairing QR code');
  }
});

it('bounds, filters and deduplicates discovery data without trusting advertised hosts', () => {
  expect(
    parseDiscoveredLaptops(
      JSON.stringify([
        { name: 'Synthetic laptop', address },
        { name: 'Duplicate', address: address + '/' },
        { name: 'Unsafe', address: 'http://example.com:8765' },
        { name: 'Control\nname', address },
      ]),
    ),
  ).toEqual([{ name: 'Synthetic laptop', address }]);
  for (const raw of [
    'null',
    '{}',
    'x'.repeat(8193),
    JSON.stringify(Array(21).fill({ name: 'Synthetic', address })),
  ])
    expect(() => parseDiscoveredLaptops(raw)).toThrow();
});

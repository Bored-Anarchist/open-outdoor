import { expect, it } from 'vitest';
import { parseDiscoveredLaptops, parseLaptopPairingQr } from '../src/laptop-connection';

const address = 'http://192.168.1.20:8765';
const pairingCode = 'a'.repeat(32);
const pair = { type: 'open-outdoor-laptop', version: 1, address, pairingCode };

it('accepts shared-address Wi-Fi through both QR pairing and nearby discovery', () => {
  const address = 'http://100.96.1.20:8765';
  expect(parseLaptopPairingQr(JSON.stringify({ ...pair, address }))).toEqual({
    address,
    pairingCode,
  });
  expect(parseDiscoveredLaptops(JSON.stringify([{ name: 'Synthetic laptop', address }]))).toEqual([
    { name: 'Synthetic laptop', address },
  ]);
});

it('normalizes IPv6 QR and discovery addresses without accepting loopback or multicast', () => {
  const input = 'http://[2001:0DB8:0:0:0:0:0:20]:8765';
  const address = 'http://[2001:db8::20]:8765';
  expect(parseLaptopPairingQr(JSON.stringify({ ...pair, address: input }))).toEqual({
    address,
    pairingCode,
  });
  expect(
    parseDiscoveredLaptops(
      JSON.stringify([
        { name: 'IPv6 laptop', address: input },
        { name: 'Duplicate', address },
        { name: 'Loopback', address: 'http://[::1]:8765' },
        { name: 'Multicast', address: 'http://[ff02::1]:8765' },
      ]),
    ),
  ).toEqual([{ name: 'IPv6 laptop', address }]);
});

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
    JSON.stringify({ ...pair, address: 'http://224.0.0.1:8765' }),
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

it('version-two QR pairing carries an independent signing fingerprint', () => {
  const signerFingerprint = 'c'.repeat(64);
  expect(parseLaptopPairingQr(JSON.stringify({ ...pair, version: 2, signerFingerprint }))).toEqual({
    address,
    pairingCode,
    signerFingerprint,
  });
  for (const value of ['', 'short', 'g'.repeat(64), 'c'.repeat(65), null])
    expect(() =>
      parseLaptopPairingQr(JSON.stringify({ ...pair, version: 2, signerFingerprint: value })),
    ).toThrow('Scan the pairing QR code');
});

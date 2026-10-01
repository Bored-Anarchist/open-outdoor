import assert from 'node:assert/strict';
import { test } from 'node:test';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  advertiseLaptop,
  canViewPairingPage,
  pairingPage,
  pairingPayload,
} from '../laptop/laptop-pairing.mjs';

const address = 'http://192.168.1.20:8765';
const code = 'a'.repeat(32); // Synthetic credential.

test('pairing QR decodes independently to the expected app credentials', async () => {
  const payload = pairingPayload(address, code);
  const { modules } = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const size = (modules.size + 8) * 6;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < modules.size; y++)
    for (let x = 0; x < modules.size; x++) {
      if (!modules.get(y, x)) continue;
      for (let dy = 0; dy < 6; dy++)
        for (let dx = 0; dx < 6; dx++) {
          const at = (((y + 4) * 6 + dy) * size + (x + 4) * 6 + dx) * 4;
          pixels[at] = pixels[at + 1] = pixels[at + 2] = 0;
        }
    }
  assert.equal(jsQR(pixels, size, size)?.data, payload);
  const page = await pairingPage(address, code);
  assert.match(page, /<svg/);
  assert.match(page, /Scan pairing QR code/);
  assert.doesNotMatch(page, /<script|<iframe|src=/);
});

test('the pairing page is restricted to this laptop and first-party browser visits', () => {
  assert.equal(canViewPairingPage('192.168.1.20', '192.168.1.20', 'none'), true);
  assert.equal(canViewPairingPage('192.168.1.21', '192.168.1.20', 'none'), false);
  assert.equal(canViewPairingPage('192.168.1.20', '192.168.1.20', 'cross-site'), false);
  assert.equal(canViewPairingPage('192.168.1.20', '192.168.1.20', 'same-site'), false);
});

test('signed-update QR carries only public fingerprint metadata alongside the session code', async () => {
  const fingerprint = 'c'.repeat(64);
  assert.deepEqual(JSON.parse(pairingPayload(address, code, fingerprint)), {
    type: 'open-outdoor-laptop',
    version: 2,
    address,
    pairingCode: code,
    signerFingerprint: fingerprint,
  });
  const page = await pairingPage(address, code, fingerprint);
  assert.ok(page.includes(fingerprint));
  assert.doesNotMatch(page, /PRIVATE KEY/);
});

test('Bonjour publishes only the chosen IPv4 interface and never advertises a credential or device name', () => {
  let options,
    config,
    service,
    destroyed = 0,
    stopped = 0;
  class FakeBonjour {
    constructor(value) {
      options = value;
    }
    publish(value) {
      config = value;
      service = {
        records: () => [
          { type: 'A', data: '192.168.1.20' },
          { type: 'A', data: '8.8.8.8' },
          { type: 'AAAA', data: '::1' },
          { type: 'TXT', data: value.txt },
        ],
        stop: (done) => {
          stopped++;
          done();
        },
      };
      return service;
    }
    destroy() {
      destroyed++;
    }
  }
  const stop = advertiseLaptop('192.168.1.20', 8765, { BonjourClass: FakeBonjour });
  assert.deepEqual(options, { interface: '192.168.1.20' });
  assert.equal(config.type, 'openoutdoor');
  assert.deepEqual(config.txt, { v: '1', address });
  assert.match(config.name, /^Open Outdoor laptop [a-f0-9]{8}$/);
  assert.match(config.host, /^open-outdoor-[a-f0-9]{8}\.local$/);
  assert.deepEqual(service.records(), [
    { type: 'A', data: '192.168.1.20' },
    { type: 'TXT', data: config.txt },
  ]);
  stop();
  stop();
  assert.equal(stopped, 1);
  assert.equal(destroyed, 1);
});

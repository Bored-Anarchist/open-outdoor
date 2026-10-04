import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateLaptopTransportPolicy } from '../laptop/laptop-transport-policy.mjs';

const app = JSON.parse(await readFile(new URL('../../apps/mobile/app.json', import.meta.url)));
const policy = () => structuredClone(app.expo.ios.infoPlist);

test('the application permits HTTP on shared Wi-Fi and private IPv4/IPv6 networks', () => {
  validateLaptopTransportPolicy(policy());
});

test('the old local-network-only configuration and missing shared Wi-Fi exception fail the gate', () => {
  const old = policy();
  delete old.NSAppTransportSecurity.NSExceptionDomains;
  assert.throws(() => validateLaptopTransportPolicy(old), /declared private/);
  const missing = policy();
  delete missing.NSAppTransportSecurity.NSExceptionDomains['100.64.0.0/10'];
  assert.throws(() => validateLaptopTransportPolicy(missing), /declared private/);
});

test('global HTTP bypasses, public network ranges and TLS weakening fail closed', () => {
  for (const mutate of [
    (ats) => {
      ats.NSAllowsArbitraryLoads = true;
    },
    (ats) => {
      ats.NSAllowsArbitraryLoadsInWebContent = true;
    },
    (ats) => {
      ats.NSExceptionDomains['0.0.0.0/0'] = { NSExceptionAllowsInsecureHTTPLoads: true };
    },
    (ats) => {
      ats.NSExceptionDomains['::/0'] = { NSExceptionAllowsInsecureHTTPLoads: true };
    },
    (ats) => {
      ats.NSExceptionDomains['100.64.0.0/10'].NSExceptionMinimumTLSVersion = 'TLSv1.0';
    },
  ]) {
    const info = policy();
    mutate(info.NSAppTransportSecurity);
    assert.throws(() => validateLaptopTransportPolicy(info));
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// iOS 17+ permits numeric IP/CIDR exceptions. Shared Wi-Fi is not always RFC1918.
export const laptopHttpRanges = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '100.64.0.0/10',
  '169.254.0.0/16',
  'fc00::/7',
  'fe80::/10',
];

export function validateLaptopTransportPolicy(info) {
  assert.equal(typeof info.NSLocalNetworkUsageDescription, 'string');
  assert.ok(info.NSLocalNetworkUsageDescription.length > 0, 'Explain Local Network access.');
  assert.ok(info.NSBonjourServices?.includes('_openoutdoor._tcp'), 'Declare laptop discovery.');
  const ats = info.NSAppTransportSecurity;
  assert.equal(ats?.NSAllowsLocalNetworking, true, 'Allow foreground local networking.');
  for (const key of [
    'NSAllowsArbitraryLoads',
    'NSAllowsArbitraryLoadsInWebContent',
    'NSAllowsArbitraryLoadsForMedia',
  ])
    assert.ok(ats[key] === undefined || ats[key] === false, `Do not enable ${key}.`);
  assert.deepEqual(
    Object.keys(ats.NSExceptionDomains ?? {}).sort(),
    [...laptopHttpRanges].sort(),
    'Allow HTTP only for the declared private, shared and link-local ranges.',
  );
  for (const range of laptopHttpRanges)
    assert.deepEqual(ats.NSExceptionDomains[range], { NSExceptionAllowsInsecureHTTPLoads: true });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = resolve(process.argv[2] ?? 'apps/mobile/app.json');
  let value;
  if (file.endsWith('.plist')) {
    const result = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, 'Could not read the built application Info.plist.');
    value = JSON.parse(result.stdout);
  } else value = JSON.parse(await readFile(file, 'utf8')).expo.ios.infoPlist;
  validateLaptopTransportPolicy(value);
  console.log('Laptop Local Network, Bonjour and scoped HTTP transport policy verified.');
}

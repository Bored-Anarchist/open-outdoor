import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isLaptopHost,
  laptopAddress,
  laptopAddresses,
  matchesRequestHost,
} from '../laptop/laptop-network.mjs';

test('IPv6 unicast, scopes and formatting exclude local aliases and multicast', () => {
  for (const host of [
    '2001:db8::20',
    'fd12:3456::20',
    'fe80::20%12',
    '64:ff9b::192.0.2.20',
    'ff1::20',
  ])
    assert.equal(isLaptopHost(host), true, host);
  for (const host of [
    '::',
    '::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:198.51.100.20',
    '::192.168.1.20',
    '2001:db8::20%12',
    'fe8::20%12',
    'fe80::20%bad%scope',
    '2001::db8::20',
  ])
    assert.equal(isLaptopHost(host), false, host);
  assert.equal(laptopAddress('2001:0DB8::20', 8765), 'http://[2001:db8::20]:8765');
  assert.equal(laptopAddress('fe80::20%12', 8765), 'http://[fe80::20]:8765');
});

test('interface selection includes both families, preserves local scope and deprioritizes link-local', () => {
  assert.deepEqual(
    laptopAddresses({
      isolated: [{ address: '169.254.1.20', family: 'IPv4', internal: false }],
      wifi: [
        { address: '100.96.1.20', family: 'IPv4', internal: false },
        { address: '2001:db8::20', family: 'IPv6', internal: false },
        { address: 'fe80::20', family: 'IPv6', scopeid: 12, internal: false },
      ],
      loopback: [{ address: '::1', family: 'IPv6', internal: true }],
    }),
    ['100.96.1.20', '2001:db8::20', '169.254.1.20', 'fe80::20%12'],
  );
});

test('IPv6 Host checks normalize the literal but reject rebinding, wrong ports and browser URL tricks', () => {
  const socket = { localAddress: '2001:db8::20', localPort: 8765 };
  assert.equal(matchesRequestHost('[2001:0DB8:0:0:0:0:0:20]:8765', socket), true);
  for (const host of [
    'example.com:8765',
    '[2001:db8::21]:8765',
    '[2001:db8::20]:8766',
    'user@[2001:db8::20]:8765',
    '[2001:db8::20]:8765/path',
    '[2001:db8::20]:8765?code=secret',
  ])
    assert.equal(matchesRequestHost(host, socket), false, host);
});

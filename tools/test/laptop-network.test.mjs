import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  laptopServerOptions,
  laptopServerFailureMessage,
} from '../laptop/laptop-server-options.mjs';
import {
  isLaptopHost,
  laptopAddress,
  laptopAddresses,
  literalHost,
  matchesRequestHost,
} from '../laptop/laptop-network.mjs';

const adapter = (...hosts) =>
  hosts.map((host) => {
    const { host: address, family, scope } = literalHost(host);
    return {
      address,
      family: family === 4 ? 'IPv4' : 'IPv6',
      scopeid: Number(scope),
      internal: false,
    };
  });

test('server selects an assigned address and refuses to guess between Wi-Fi and VPN adapters', () => {
  const addresses = ['100.96.1.20', '10.8.0.2', 'fe80::20%12'];
  const interfaces = { wifi: adapter(addresses[0], addresses[2]), vpn: adapter(addresses[1]) };
  assert.deepEqual(laptopServerOptions([], { wifi: interfaces.wifi }), {
    host: addresses[0],
    port: 8765,
  });
  assert.throws(() => laptopServerOptions([], interfaces), /Select the Wi-Fi address/);
  assert.deepEqual(laptopServerOptions(['--host', addresses[0], '--port', '9000'], interfaces), {
    host: addresses[0],
    port: 9000,
  });
  assert.deepEqual(laptopServerOptions(['--host', 'fe80::20'], interfaces), {
    host: 'fe80::20%12',
    port: 8765,
  });
  assert.throws(
    () =>
      laptopServerOptions(['--host', 'fe80::20'], {
        wifi: adapter('fe80::20%12'),
        ethernet: adapter('fe80::20%13'),
      }),
    /multiple interfaces/,
  );
  assert.throws(() => laptopServerOptions([], {}), /Connect this laptop to Wi-Fi/);
  assert.throws(() => laptopServerOptions(['--host', '192.168.1.20'], interfaces), /assigned/);
});

test('single dual-stack Wi-Fi starts automatically and prefers its usable IPv4 address', () => {
  const wifi = adapter('fe80::20%12', '2001:db8::20', '100.96.1.20');
  const loopback = [{ address: '127.0.0.1', family: 'IPv4', internal: true }];
  assert.deepEqual(laptopServerOptions([], { wifi, loopback }), {
    host: '100.96.1.20',
    port: 8765,
  });
  assert.deepEqual(laptopServerOptions([], { wifi: wifi.slice(0, 2), loopback }), {
    host: '2001:db8::20',
    port: 8765,
  });
});

test('invalid command options fail before acquiring the signer or opening a listener', () => {
  for (const args of [
    ['--host'],
    ['--port'],
    ['--unknown', '8765'],
    ['--port', '80'],
    ['--port', '65536'],
    ['--port', '0x223d'],
    ['--port', '8.765e3'],
    ['--port', '8765', '--port', '9000'],
    ['--host', '100.96.1.20', '--host', '10.8.0.2'],
  ])
    assert.throws(
      () => laptopServerOptions(args, { wifi: adapter('100.96.1.20') }),
      undefined,
      args.join(' '),
    );
});

test('startup explains occupied ports and stale addresses without exposing raw system errors', () => {
  assert.match(laptopServerFailureMessage({ code: 'EADDRINUSE' }), /port is already in use/);
  assert.match(laptopServerFailureMessage({ code: 'EADDRNOTAVAIL' }), /current --host/);
  assert.match(
    laptopServerFailureMessage(new Error('Laptop signing identity is already in use.')),
    /Another laptop server/,
  );
  assert.equal(
    laptopServerFailureMessage(new Error('secret path or credential')).includes('secret'),
    false,
  );
});

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

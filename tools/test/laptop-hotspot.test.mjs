import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isHotspotClient, startLaptopHotspot, validateHotspot } from '../laptop/laptop-hotspot.mjs';
import { startLaptopServer } from '../laptop/laptop-package-server.mjs';

const hotspot = {
  host: '192.168.137.1',
  prefixLength: 24,
  interfaceAlias: 'Synthetic hotspot',
  networkName: 'Synthetic Wi-Fi',
  passphrase: 'synthetic-password',
};
const interfaces = {
  [hotspot.interfaceAlias]: [{ address: hotspot.host, internal: false, family: 'IPv4' }],
};

function helper() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  const input = [];
  child.stdin = new Writable({
    write(chunk, _encoding, done) {
      input.push(chunk.toString());
      done();
    },
  });
  child.stdin.on('finish', () => {
    child.stdout.end();
    child.emit('close', 0);
  });
  const send = (value) => child.stdout.write(`${JSON.stringify(value)}\n`);
  const options = {
    port: 8765,
    platform: 'win32',
    spawnProcess: () => child,
    interfaces: () => interfaces,
  };
  return { child, send, options, input };
}

test('hotspot validation requires a private address on the reported local adapter and safe configuration', () => {
  assert.deepEqual(validateHotspot(hotspot, interfaces), hotspot);
  for (const invalid of [
    { ...hotspot, host: '100.96.1.20' },
    { ...hotspot, host: '127.0.0.1' },
    { ...hotspot, interfaceAlias: 'Wi-Fi' },
    { ...hotspot, prefixLength: 0 },
    { ...hotspot, prefixLength: 8 },
    { ...hotspot, prefixLength: 32 },
    { ...hotspot, networkName: '' },
    { ...hotspot, passphrase: 'short' },
  ])
    assert.throws(() => validateHotspot(invalid, interfaces), /valid laptop hotspot/);
  assert.equal(isHotspotClient('192.168.137.54', hotspot), true);
  assert.equal(isHotspotClient('192.168.138.54', hotspot), false);
  assert.equal(isHotspotClient('100.96.20.30', hotspot), false);
  assert.equal(isHotspotClient('::ffff:192.168.137.54', hotspot), false);
  assert.equal(isHotspotClient('10.20.30.19', { host: '10.20.30.17', prefixLength: 28 }), true);
  assert.equal(isHotspotClient('10.20.30.33', { host: '10.20.30.17', prefixLength: 28 }), false);
});

test('helper startup waits for readiness, keeps credentials out of approval messages, and stops once', async () => {
  const fake = helper();
  const messages = [];
  const started = startLaptopHotspot({
    ...fake.options,
    onMessage: (message) => messages.push(message),
  });
  fake.send({ event: 'approval' });
  fake.send({ event: 'ready', ...hotspot });
  const session = await started;
  assert.equal(session.host, hotspot.host);
  assert.equal(messages.length, 1);
  assert.ok(!messages.join('').includes(hotspot.passphrase));
  await Promise.all([session.close(), session.close()]);
  assert.deepEqual(fake.input, ['stop\n']);
});

test('startup errors, malformed output, cancellation and timeouts release the helper', async () => {
  for (const mode of ['error', 'malformed', 'null', 'abort', 'timeout']) {
    const fake = helper();
    const controller = new AbortController();
    const started = startLaptopHotspot({
      ...fake.options,
      signal: controller.signal,
      startupTimeoutMs: 15,
    });
    const rejected = assert.rejects(started);
    if (mode === 'error')
      fake.send({ event: 'error', message: 'Administrator approval is required.' });
    if (mode === 'malformed') fake.child.stdout.write('not JSON\n');
    if (mode === 'null') fake.send(null);
    if (mode === 'abort') controller.abort();
    await rejected;
    assert.deepEqual(fake.input, ['stop\n'], mode);
  }
});

test('hotspot loss notifies the running server, and non-Windows startup cannot fall back to LAN', async () => {
  const fake = helper();
  const lost = [];
  const started = startLaptopHotspot({
    ...fake.options,
    onDisconnect: (error) => lost.push(error.message),
  });
  fake.send({ event: 'ready', ...hotspot });
  const session = await started;
  fake.send({ event: 'error', message: 'The laptop hotspot stopped.' });
  assert.deepEqual(lost, ['The laptop hotspot stopped.']);
  await session.close();
  await assert.rejects(
    startLaptopHotspot({
      platform: 'linux',
      spawnProcess: () => {
        throw new Error('Must not spawn');
      },
    }),
    /requires Windows/,
  );
});

test('an unexpected helper exit is reported after readiness without leaving shutdown waiting', async () => {
  const fake = helper();
  const lost = [];
  const started = startLaptopHotspot({
    ...fake.options,
    onDisconnect: (error) => lost.push(error.message),
  });
  fake.send({ event: 'ready', ...hotspot });
  const session = await started;
  fake.child.stdout.end();
  fake.child.emit('close', 1);
  assert.equal(lost.length, 1);
  assert.match(lost[0], /helper stopped/);
  await session.close();
});

function resources() {
  const calls = [];
  const server = new EventEmitter();
  server.listen = (port, host) => {
    calls.push(['listen', port, host]);
    queueMicrotask(() => server.emit('listening'));
  };
  server.close = (done) => {
    calls.push('server closed');
    done();
  };
  server.closeAllConnections = () => {};
  const signer = {
    identity: { keyId: 'c'.repeat(64) },
    close: async () => calls.push('signer closed'),
  };
  const connection = { ...hotspot, close: async () => calls.push('hotspot closed') };
  const result = { server, token: 'a'.repeat(32), availableStates: ['NY'], missingStates: [] };
  const dependencies = {
    loadSigner: async () => {
      calls.push('signer acquired');
      return signer;
    },
    startHotspot: async () => {
      calls.push('hotspot acquired');
      return connection;
    },
    createPackageServer: async (options) => {
      assert.equal(options.hotspot, connection);
      assert.equal(options.pairingEndpoint.host, hotspot.host);
      return result;
    },
    advertise: (host) => {
      assert.equal(host, hotspot.host);
      return () => calls.push('discovery stopped');
    },
  };
  return { calls, dependencies, result };
}

test('server binds only the hotspot and releases listeners, signer and hotspot on shutdown', async () => {
  const fake = resources();
  const session = await startLaptopServer({ port: 8765, onMessage: () => {} }, fake.dependencies);
  assert.deepEqual(fake.calls.slice(0, 3), [
    'signer acquired',
    'hotspot acquired',
    ['listen', 8765, hotspot.host],
  ]);
  await session.close();
  await session.close();
  assert.deepEqual(fake.calls.slice(3), [
    'discovery stopped',
    'server closed',
    'signer closed',
    'hotspot closed',
  ]);
});

test('startup failure and cancellation unwind hotspot ownership; signer contention does not start a hotspot', async () => {
  for (const mode of ['catalog', 'empty', 'cancel', 'signer', 'hotspot', 'listen']) {
    const fake = resources();
    const controller = new AbortController();
    if (mode === 'catalog')
      fake.dependencies.createPackageServer = async () => {
        throw new Error('Synthetic catalog failure');
      };
    if (mode === 'empty') fake.result.availableStates = [];
    if (mode === 'cancel')
      fake.dependencies.createPackageServer = async () => {
        controller.abort();
        return fake.result;
      };
    if (mode === 'signer')
      fake.dependencies.loadSigner = async () => {
        throw new Error('Signer contention');
      };
    if (mode === 'hotspot')
      fake.dependencies.startHotspot = async () => {
        throw new Error('Hotspot unavailable');
      };
    if (mode === 'listen')
      fake.result.server.listen = () =>
        queueMicrotask(() =>
          fake.result.server.emit(
            'error',
            Object.assign(new Error('Busy port'), { code: 'EADDRINUSE' }),
          ),
        );
    await assert.rejects(
      startLaptopServer(
        { port: 8765, signal: controller.signal, onMessage: () => {} },
        fake.dependencies,
      ),
    );
    if (mode === 'signer') assert.deepEqual(fake.calls, []);
    else assert.ok(fake.calls.includes('signer closed'), mode);
    if (mode !== 'signer' && mode !== 'hotspot')
      assert.ok(fake.calls.includes('hotspot closed'), mode);
    assert.ok(!fake.calls.some((call) => Array.isArray(call) && call[0] === 'listen'), mode);
  }
});

test('a discovery shutdown error still releases the signer and hotspot', async () => {
  const fake = resources();
  fake.dependencies.advertise = () => () => {
    throw new Error('Synthetic discovery cleanup failure');
  };
  const session = await startLaptopServer({ port: 8765, onMessage: () => {} }, fake.dependencies);
  await assert.rejects(session.close(), /discovery cleanup failure/);
  assert.ok(fake.calls.includes('server closed'));
  assert.ok(fake.calls.includes('signer closed'));
  assert.ok(fake.calls.includes('hotspot closed'));
});

test(
  'Windows helper adapter detection, firewall scoping and PowerShell syntax pass native regressions',
  { skip: process.platform !== 'win32' },
  () => {
    const script = fileURLToPath(
      new URL('../laptop/laptop-hotspot-native-tests.ps1', import.meta.url),
    );
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
      { encoding: 'utf8', windowsHide: true },
    );
    assert.match(output, /Hotspot native regressions passed/);
  },
);

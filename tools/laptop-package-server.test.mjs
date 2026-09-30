import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { request } from 'node:http';
import { createLaptopPackageServer, isPrivateIPv4 } from './laptop-package-server.mjs';

const token = 'a'.repeat(32); // Synthetic; never a real connection credential.
const bytes = Buffer.from('Synthetic public package; not a real SQLite catalog.');
const pin = (state, body = bytes) => ({
  state,
  name: `Synthetic ${state}`,
  file: `${state}/state.sqlite`,
  channel: 'public',
  classification: 'SOURCE_REDISTRIBUTABLE',
  sha256: createHash('sha256').update(body).digest('hex'),
  bytes: body.length,
  installedBytes: body.length + 256,
});
async function fixture(t, states = [pin('NY')]) {
  const root = await mkdtemp(join(tmpdir(), 'open-outdoor-laptop-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, 'loader-inventory.json'),
    JSON.stringify({ schemaVersion: 1, states }),
  );
  return root;
}
async function stateFile(root, state, data = bytes) {
  await mkdir(join(root, state), { recursive: true });
  await writeFile(join(root, state, 'state.sqlite'), data);
}
async function serve(t, root) {
  const result = await createLaptopPackageServer({ root, token });
  result.server.listen(0, '127.0.0.1');
  await once(result.server, 'listening');
  t.after(() => {
    result.server.close();
    result.server.closeAllConnections();
  });
  const base = `http://127.0.0.1:${result.server.address().port}`;
  const get = (path, options = {}) =>
    fetch(base + path, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options.headers },
    });
  const requestWithHost = (host) =>
    new Promise((accept, reject) => {
      const outgoing = request(
        base + '/v1/catalog',
        { headers: { Host: host, Authorization: `Bearer ${token}` } },
        (response) => {
          response.resume();
          accept(response.statusCode);
        },
      );
      outgoing.on('error', reject);
      outgoing.end();
    });
  return { ...result, get, requestWithHost };
}

test('only canonical RFC1918 IPv4 laptop addresses are allowed', () => {
  for (const host of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.1.20'])
    assert.equal(isPrivateIPv4(host), true);
  for (const host of [
    '127.0.0.1',
    '0.0.0.0',
    '8.8.8.8',
    '169.254.1.1',
    '172.15.0.1',
    '172.32.0.1',
    '192.168.999.1',
    '010.0.0.1',
    '192.168.1.1.example.com',
    '::1',
  ])
    assert.equal(isPrivateIPv4(host), false, host);
});

test('paired clients list verified public states and download identical bytes', async (t) => {
  const root = await fixture(t, [pin('NY'), pin('CA'), pin('MA')]);
  await stateFile(root, 'NY');
  await stateFile(root, 'MA', Buffer.alloc(bytes.length));
  await writeFile(join(root, 'private.sqlite'), 'Synthetic private data that must never be served');
  const { get, missingStates } = await serve(t, root);
  assert.deepEqual(missingStates, ['CA', 'MA']);
  const response = await get('/v1/catalog');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  const catalog = await response.json();
  assert.deepEqual(catalog.packages, [
    {
      state: 'NY',
      name: 'Synthetic NY',
      sha256: pin('NY').sha256,
      bytes: bytes.length,
      installedBytes: bytes.length + 256,
    },
  ]);
  assert.equal(JSON.stringify(catalog).includes(root), false);
  const download = await get('/v1/packages/NY');
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  for (const path of [
    '/v1/packages/CA',
    '/private.sqlite',
    '/v1/packages/NY?file=private.sqlite',
    '/v1/packages/%2e%2e%2fprivate.sqlite',
  ])
    assert.equal((await get(path)).status, 404);
});

test('server rejects wrong codes, browser origins, rebinding hosts and writes', async (t) => {
  const root = await fixture(t);
  await stateFile(root, 'NY');
  const { get, requestWithHost } = await serve(t, root);
  assert.equal((await get('/v1/catalog', { headers: { Authorization: '' } })).status, 401);
  assert.equal(
    (await get('/v1/catalog', { headers: { Authorization: `Bearer ${'b'.repeat(32)}` } })).status,
    401,
  );
  assert.equal(
    (await get('/v1/catalog', { headers: { Origin: 'https://example.com' } })).status,
    403,
  );
  assert.equal(await requestWithHost('example.com'), 403);
  assert.equal((await get('/v1/catalog', { method: 'POST' })).status, 405);
  assert.equal(
    (await get('/v1/catalog', { method: 'POST', body: 'unexpected input' })).status,
    403,
  );
});

test('changed packages cannot be served after catalog verification', async (t) => {
  const root = await fixture(t);
  await stateFile(root, 'NY');
  const { get } = await serve(t, root);
  await stateFile(root, 'NY', Buffer.alloc(bytes.length));
  assert.equal((await get('/v1/packages/NY')).status, 409);
});

test('inventory cannot advertise private, duplicate or path-traversing packages', async (t) => {
  for (const states of [
    [{ ...pin('NY'), channel: 'private' }],
    [{ ...pin('NY'), classification: 'PERMISSION_REQUIRED' }],
    [{ ...pin('NY'), file: '../private.sqlite' }],
    [pin('NY'), pin('NY')],
    [{ ...pin('NY'), bytes: 3 * 1024 ** 3 + 1 }],
  ]) {
    const root = await fixture(t, states);
    await assert.rejects(createLaptopPackageServer({ root, token }));
  }
});

test('public state folders cannot point outside the package root', async (t) => {
  const root = await fixture(t);
  const external = await fixture(t);
  await writeFile(join(external, 'state.sqlite'), bytes);
  await symlink(external, join(root, 'NY'), process.platform === 'win32' ? 'junction' : 'dir');
  const { availableStates, missingStates } = await createLaptopPackageServer({ root, token });
  assert.deepEqual(availableStates, []);
  assert.deepEqual(missingStates, ['NY']);
});

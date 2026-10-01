import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { open, readFile, realpath } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { advertiseLaptop, canViewPairingPage, pairingPage } from './laptop-pairing.mjs';
import { loadLaptopUpdateSigner } from './laptop-update-signing.mjs';

const defaultRoot = fileURLToPath(
  new URL('../../packages/map/src/assets/state-packages/US', import.meta.url),
);
const maximumBytes = 3 * 1024 ** 3;

export function isPrivateIPv4(host) {
  const parts = host.split('.');
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)
  )
    return false;
  const [a, b] = parts.map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function laptopAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter(
      (entry) =>
        entry && !entry.internal && entry.family === 'IPv4' && isPrivateIPv4(entry.address),
    )
    .map((entry) => entry.address);
}

function validatePin(pin) {
  if (
    !pin ||
    !/^[A-Z]{2}$/.test(pin.state) ||
    pin.file !== `${pin.state}/state.sqlite` ||
    pin.channel !== 'public' ||
    pin.classification !== 'SOURCE_REDISTRIBUTABLE' ||
    typeof pin.name !== 'string' ||
    pin.name.length > 80 ||
    !/^[a-f0-9]{64}$/.test(pin.sha256) ||
    !Number.isSafeInteger(pin.bytes) ||
    pin.bytes <= 0 ||
    pin.bytes > maximumBytes ||
    !Number.isSafeInteger(pin.installedBytes) ||
    pin.installedBytes < pin.bytes ||
    pin.installedBytes > maximumBytes
  )
    throw new Error('Invalid public state package inventory.');
}

async function verifiedFile(root, pin) {
  const target = await realpath(resolve(root, pin.file));
  const offset = relative(root, target);
  if (isAbsolute(offset) || offset === '..' || offset.startsWith(`..${sep}`))
    throw new Error('State file is outside the public package directory.');
  const handle = await open(target, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== pin.bytes) throw new Error('State package size mismatch.');
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ start: 0, autoClose: false }))
      hash.update(chunk);
    if (hash.digest('hex') !== pin.sha256) throw new Error('State package checksum mismatch.');
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

// root is injectable for synthetic tests; the CLI always uses the public asset directory.
export async function createLaptopPackageServer({
  root = defaultRoot,
  token = randomBytes(16).toString('hex'),
  signer,
} = {}) {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid pairing code.');
  const directory = await realpath(root);
  const inventory = JSON.parse(await readFile(resolve(directory, 'loader-inventory.json'), 'utf8'));
  if (
    inventory.schemaVersion !== 1 ||
    !Array.isArray(inventory.states) ||
    inventory.states.length > 50
  )
    throw new Error('Invalid public state package inventory.');
  const packages = new Map();
  const missing = [];
  const seen = new Set();
  for (const pin of inventory.states) {
    validatePin(pin);
    if (seen.has(pin.state)) throw new Error('Duplicate state package.');
    seen.add(pin.state);
    try {
      const handle = await verifiedFile(directory, pin);
      await handle.close();
      packages.set(pin.state, pin);
    } catch {
      missing.push(pin.state);
    }
  }
  const catalog = JSON.stringify(
    signer
      ? {
          schemaVersion: 2,
          signingKey: signer.identity,
          packages: await signer.seal([...packages.values()]),
        }
      : {
          schemaVersion: 1,
          packages: [...packages.values()].map(
            ({ state, name, bytes, installedBytes, sha256 }) => ({
              state,
              name,
              bytes,
              installedBytes,
              sha256,
            }),
          ),
        },
  );
  if (Buffer.byteLength(catalog) > 64 * 1024) throw new Error('Public catalog is too large.');
  const expected = Buffer.from(`Bearer ${token}`);
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const fail = (status, message) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(message);
    };
    const address = request.socket.remoteAddress?.replace(/^::ffff:/, '');
    const host = `${request.socket.localAddress?.replace(/^::ffff:/, '')}:${request.socket.localPort}`;
    // Reject browser origins and rebinding hosts; never send CORS headers or tokens in URLs.
    if (
      (!isPrivateIPv4(address ?? '') && address !== '127.0.0.1') ||
      request.headers.host !== host ||
      request.headers.origin ||
      request.headers['transfer-encoding'] ||
      (request.headers['content-length'] && request.headers['content-length'] !== '0')
    )
      return fail(403, 'Local app connections only.');
    if (request.url === '/pair') {
      if (request.method !== 'GET') return fail(405, 'Read-only package server.');
      if (
        !canViewPairingPage(
          address,
          request.socket.localAddress?.replace(/^::ffff:/, ''),
          request.headers['sec-fetch-site'],
        )
      )
        return fail(403, 'Open the pairing page on the laptop itself.');
      try {
        const page = await pairingPage(`http://${host}`, token, signer?.identity.keyId);
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy':
            "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'no-referrer',
        });
        return response.end(page);
      } catch {
        return fail(500, 'Pairing page unavailable. Use the terminal pairing code.');
      }
    }
    const supplied = Buffer.from(request.headers.authorization ?? '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return fail(401, 'Pairing code required.');
    if (request.method !== 'GET') return fail(405, 'Read-only package server.');
    if (request.url === '/v1/catalog') {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(catalog),
      });
      return response.end(catalog);
    }
    const state = /^\/v1\/packages\/([A-Z]{2})$/.exec(request.url ?? '')?.[1];
    const pin = packages.get(state);
    if (!pin) return fail(404, 'State package unavailable.');
    let handle;
    try {
      handle = await verifiedFile(directory, pin);
      if (response.destroyed) return;
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': pin.bytes,
      });
      await pipeline(handle.createReadStream({ start: 0, autoClose: false }), response);
    } catch {
      if (!response.headersSent && !response.destroyed)
        fail(409, 'State file changed or is unavailable. Restore it and restart the server.');
      else response.destroy();
    } finally {
      await handle?.close();
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.maxConnections = 4;
  server.on('clientError', (_error, socket) => socket.destroy());
  return { server, token, availableStates: [...packages.keys()], missingStates: missing };
}

async function main() {
  const args = process.argv.slice(2);
  let host = laptopAddresses()[0];
  let port = 8765;
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === '--host') host = args[i + 1];
    else if (args[i] === '--port') port = Number(args[i + 1]);
    else throw new Error('Usage: pnpm map:laptop [--host PRIVATE_IPV4] [--port PORT]');
  }
  if (!host || !isPrivateIPv4(host) || !laptopAddresses().includes(host))
    throw new Error(
      'Connect this laptop to Wi-Fi, then select its private IPv4 address with --host.',
    );
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Choose a port between 1024 and 65535.');
  console.log('Verifying local public state packages…');
  const signer = await loadLaptopUpdateSigner();
  let result;
  try {
    result = await createLaptopPackageServer({ signer });
  } catch (error) {
    await signer.close();
    throw error;
  }
  const { server, token, availableStates, missingStates } = result;
  if (!availableStates.length) {
    await signer.close();
    throw new Error(
      'No verified state.sqlite files found. Restore public packages with pnpm map:public:restore STATE, then retry.',
    );
  }
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, host, accept);
  }).catch(async (error) => {
    await signer.close();
    throw error;
  });
  let stopDiscovery = () => {};
  try {
    stopDiscovery = advertiseLaptop(host, port, {
      onError: () => console.log('Nearby discovery is unavailable. Use QR or manual pairing.'),
    });
  } catch {
    console.log('Nearby discovery is unavailable. Use QR or manual pairing.');
  }
  console.log(
    `\nOpen Outdoor → Explore → Offline state packages → Connect to laptop\nOpen http://${host}:${port}/pair on this laptop to show the pairing QR code.\nLaptop address: http://${host}:${port}\nPairing code: ${token}\nSigning fingerprint: ${signer.identity.keyId}\n${availableStates.length} verified public states available.`,
  );
  if (missingStates.length)
    console.log(
      `Missing or invalid states: ${missingStates.join(', ')}. Restore them and restart to add them.`,
    );
  console.log(
    'Keep this terminal open. Use a trusted local network; transfers use HTTP. Ctrl+C stops sharing and expires this pairing code.',
  );
  const stop = () => {
    stopDiscovery();
    server.close();
    server.closeAllConnections();
    void signer.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().catch(() => {
    // Never print raw request errors, local filesystem paths or pairing headers.
    console.error(
      'Laptop server could not start. Check the host/port, public inventory and restored packages. See docs/guides/CONNECT_TO_LAPTOP.md.',
    );
    process.exitCode = 1;
  });

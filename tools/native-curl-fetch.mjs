import { spawn } from 'node:child_process';

const MAX_RESPONSE_BYTES = 500 * 1024 * 1024;

/** Windows Schannel transport for public HTTPS endpoints with incomplete Node CA chains. */
export async function nativeCurlFetch(url, options = {}) {
  if (!/^https:\/\//i.test(url)) throw new Error('HTTPS source required');
  if (options.signal?.aborted) throw new Error('HTTPS request aborted');
  const args = [
    '--silent',
    '--show-error',
    '--fail',
    '--location',
    '--proto',
    '=https',
    '--proto-redir',
    '=https',
    '--max-time',
    '120',
  ];
  const method = options.method ?? 'GET';
  if (method === 'POST') args.push('--request', 'POST', '--data-binary', '@-');
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    args.push('--header', `${name}: ${value}`);
  }
  args.push(url);
  const body = options.body?.toString() ?? '';
  const bytes = await new Promise((resolve, reject) => {
    const process = spawn(processPlatformCurl(), args, { windowsHide: true, stdio: 'pipe' });
    const chunks = [];
    let size = 0;
    let stderr = '';
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      process.kill();
      reject(error);
    };
    const abort = () => fail(new Error('HTTPS request aborted'));
    options.signal?.addEventListener('abort', abort, { once: true });
    process.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) {
        fail(new Error('HTTPS response exceeds 500 MiB'));
      } else {
        chunks.push(chunk);
      }
    });
    process.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-2000);
    });
    process.on('error', fail);
    process.stdin.on('error', fail);
    process.on('close', (code) => {
      options.signal?.removeEventListener('abort', abort);
      if (settled) return;
      settled = true;
      if (code !== 0) {
        reject(new Error(`HTTPS request failed (${code}): ${stderr.trim()}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
    process.stdin.end(body);
  });
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name) => (name.toLowerCase() === 'content-length' ? String(bytes.length) : null),
    },
    json: async () => JSON.parse(bytes.toString('utf8')),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function processPlatformCurl() {
  return process.platform === 'win32' ? 'curl.exe' : 'curl';
}

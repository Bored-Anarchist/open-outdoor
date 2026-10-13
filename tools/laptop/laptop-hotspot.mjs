import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { LaptopServerConfigurationError } from './laptop-server-options.mjs';

const failure = (message) => new LaptopServerConfigurationError(message);
const ipv4 = (host) => host.split('.').reduce((value, part) => value * 256 + Number(part), 0);

export function isHotspotClient(address, { host, prefixLength }) {
  if (isIP(address) !== 4) return false;
  const divisor = 2 ** (32 - prefixLength);
  return Math.floor(ipv4(address) / divisor) === Math.floor(ipv4(host) / divisor);
}

export function validateHotspot(value, interfaces = networkInterfaces()) {
  if (
    !value ||
    isIP(value.host) !== 4 ||
    !/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(value.host) ||
    !Number.isInteger(value.prefixLength) ||
    value.prefixLength <
      (value.host.startsWith('10.') ? 8 : value.host.startsWith('172.') ? 12 : 16) ||
    value.prefixLength > 30 ||
    typeof value.interfaceAlias !== 'string' ||
    !interfaces[value.interfaceAlias]?.some(
      (entry) => !entry.internal && entry.address === value.host,
    ) ||
    typeof value.networkName !== 'string' ||
    Buffer.byteLength(value.networkName) < 1 ||
    Buffer.byteLength(value.networkName) > 32 ||
    typeof value.passphrase !== 'string' ||
    value.passphrase.length < 8 ||
    value.passphrase.length > 63
  )
    throw failure(
      'Windows did not provide a valid laptop hotspot. Check Mobile hotspot settings and restart pnpm map:laptop.',
    );
  return {
    host: value.host,
    prefixLength: value.prefixLength,
    interfaceAlias: value.interfaceAlias,
    networkName: value.networkName,
    passphrase: value.passphrase,
  };
}

/** A piped helper owns hotspot cleanup, including when the parent exits unexpectedly. */
export function startLaptopHotspot({
  port,
  signal,
  onMessage = () => {},
  onDisconnect = () => {},
  platform = process.platform,
  spawnProcess = spawn,
  interfaces = networkInterfaces,
  startupTimeoutMs = 180_000,
} = {}) {
  if (platform !== 'win32')
    return Promise.reject(
      failure(
        'Automatic laptop hotspot sharing requires Windows 10 or 11 with Mobile hotspot support.',
      ),
    );
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawnProcess(
      join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      ),
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        fileURLToPath(new URL('./laptop-hotspot.ps1', import.meta.url)),
        '-NodePath',
        process.execPath,
        '-Port',
        String(port),
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
    );
    let ready = false;
    let failing = false;
    let exited = false;
    let closing;
    let timer;
    let totalBytes = 0;
    let resolveExit;
    const exit = new Promise((done) => {
      resolveExit = done;
    });
    const close = () => {
      if (!closing)
        closing = (async () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          if (!exited) {
            child.stdin.end('stop\n');
            let deadline;
            try {
              await Promise.race([
                exit,
                new Promise((_, rejectClose) => {
                  // Allow a pending WinRT operation plus both bounded restoration calls.
                  deadline = setTimeout(() => {
                    child.kill();
                    rejectClose(
                      failure(
                        'Hotspot cleanup timed out. Turn off Mobile hotspot in Windows Settings.',
                      ),
                    );
                  }, 75_000);
                }),
              ]);
            } finally {
              clearTimeout(deadline);
            }
          }
        })();
      return closing;
    };
    const fail = (error) => {
      if (failing || closing) return;
      failing = true;
      if (ready) onDisconnect(error);
      else
        void close().then(
          () => reject(error),
          (cleanupError) => {
            onMessage(cleanupError.message);
            reject(error);
          },
        );
    };
    const abort = () => fail(signal.reason ?? failure('Laptop sharing stopped.'));
    child.stdin.on('error', () => {}); // EOF/closed parent pipes are normal during teardown.
    child.on('error', () => {
      exited = true;
      resolveExit();
      fail(failure('Windows PowerShell could not start the laptop hotspot helper.'));
    });
    child.on('close', () => {
      exited = true;
      resolveExit();
      fail(failure('The laptop hotspot helper stopped. Restart pnpm map:laptop.'));
    });
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      totalBytes += Buffer.byteLength(line);
      if (totalBytes > 16 * 1024) {
        fail(failure('The hotspot helper returned an invalid response.'));
        return;
      }
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        fail(failure('The hotspot helper returned an invalid response.'));
        return;
      }
      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        fail(failure('The hotspot helper returned an invalid response.'));
        return;
      }
      if (event.event === 'cleanup-error') {
        onMessage(
          'Windows could not fully restore hotspot settings. Check Mobile hotspot in Windows Settings.',
        );
        return;
      }
      if (closing || failing) return;
      if (event.event === 'approval') {
        onMessage(
          'Approve the Windows administrator prompt to allow the server only on the laptop hotspot.',
        );
      } else if (event.event === 'ready' && !ready) {
        try {
          const value = validateHotspot(event, interfaces());
          ready = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          resolve({ ...value, close });
        } catch (error) {
          fail(error);
        }
      } else if (event.event === 'error') {
        fail(
          failure(
            typeof event.message === 'string' && event.message.length <= 400
              ? event.message
              : 'The laptop hotspot failed. Restart pnpm map:laptop.',
          ),
        );
      }
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    timer = setTimeout(
      () =>
        fail(
          failure(
            'Hotspot startup timed out. Check Windows Mobile hotspot and any administrator prompt, then retry.',
          ),
        ),
      startupTimeoutMs,
    );
  });
}

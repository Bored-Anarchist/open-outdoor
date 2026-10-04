import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';

export function literalHost(input) {
  if (typeof input !== 'string') return null;
  const parts = input.split('%');
  if (parts.length > 2 || (parts[1] !== undefined && !/^[A-Za-z0-9_.-]{1,32}$/.test(parts[1])))
    return null;
  const family = isIP(parts[0]);
  if (!family || (family === 4 && parts.length !== 1)) return null;
  const host = family === 6 ? new URL(`http://[${parts[0]}]`).hostname.slice(1, -1) : parts[0];
  return { host, family, scope: parts[1] };
}

export function isLaptopHost(input) {
  const value = literalHost(input);
  if (!value) return false;
  if (value.family === 4) {
    const first = Number(value.host.split('.')[0]);
    return first !== 0 && first !== 127 && first < 224;
  }
  // Exclude multicast, unspecified, loopback and IPv4-compatible/mapped aliases.
  return (
    !/^ff[0-9a-f]{2}:/i.test(value.host) &&
    !/^::(?:ffff:)?(?:[0-9a-f]{1,4}:)?[0-9a-f]{0,4}$/i.test(value.host) &&
    (value.scope === undefined || /^fe[89ab][0-9a-f]:/i.test(value.host))
  );
}

/** Zone IDs are local to the laptop; the phone chooses its own Wi-Fi scope. */
export function laptopAddress(host, port) {
  const parsed = literalHost(host);
  if (!parsed || !Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Choose a literal laptop address and port.');
  return `http://${parsed.family === 6 ? `[${parsed.host}]` : parsed.host}:${port}`;
}

export function laptopAddresses(interfaces = networkInterfaces()) {
  return Object.values(interfaces)
    .flat()
    .filter((entry) => entry && !entry.internal)
    .map((entry) => {
      const host =
        entry.family === 'IPv6' &&
        /^fe[89ab][0-9a-f]:/i.test(entry.address) &&
        !entry.address.includes('%')
          ? `${entry.address}%${entry.scopeid}`
          : entry.address;
      return host;
    })
    .filter(isLaptopHost)
    .sort((a, b) => {
      const priority = (host) =>
        /^169\.254\.|^fe[89ab][0-9a-f]:/i.test(host) ? 2 : isIP(host) === 4 ? 0 : 1;
      return priority(a) - priority(b);
    });
}

export function matchesRequestHost(value, socket) {
  const match = /^([0-9.]+|\[[0-9a-fA-F:.]+(?:%25[A-Za-z0-9_.-]+)?\]):([0-9]+)$/.exec(value ?? '');
  if (!match || Number(match[2]) !== socket.localPort) return false;
  const supplied = literalHost(match[1].replace(/^\[|\]$/g, '').replace('%25', '%'));
  const actual = literalHost(socket.localAddress);
  return (
    supplied !== null &&
    actual !== null &&
    supplied.family === actual.family &&
    supplied.host === actual.host
  );
}

import { isLaptopHost, laptopAddresses, literalHost } from './laptop-network.mjs';
import { networkInterfaces } from 'node:os';

export class LaptopServerConfigurationError extends Error {}

/** Never guess which adapter can reach the phone on a multi-interface laptop. */
export function laptopServerOptions(args, interfaces = networkInterfaces()) {
  const adapters = Object.values(interfaces)
    .map((entries) => laptopAddresses({ adapter: entries }))
    .filter((addresses) => addresses.length > 0);
  const addresses = adapters.flat();
  let host;
  let port = 8765;
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const option = args[i];
    if (!['--host', '--port'].includes(option) || !args[i + 1] || seen.has(option))
      throw new LaptopServerConfigurationError(
        'Usage: pnpm map:laptop [--host LOCAL_IP] [--port PORT]. Supply each option once.',
      );
    seen.add(option);
    if (option === '--host') host = args[i + 1];
    else {
      if (!/^[0-9]{4,5}$/.test(args[i + 1]))
        throw new LaptopServerConfigurationError('Choose a port between 1024 and 65535.');
      port = Number(args[i + 1]);
    }
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new LaptopServerConfigurationError('Choose a port between 1024 and 65535.');
  if (host === undefined) {
    if (adapters.length > 1)
      throw new LaptopServerConfigurationError(
        `Several laptop adapters are available. Select the Wi-Fi address with pnpm map:laptop --host LOCAL_IP. Available addresses: ${addresses.join(', ')}.`,
      );
    host = addresses[0];
  }
  const selected = literalHost(host);
  const matches = addresses.filter((candidate) => {
    const value = literalHost(candidate);
    return (
      selected &&
      value?.host === selected.host &&
      (selected.scope === undefined || value.scope === selected.scope)
    );
  });
  if (matches.length > 1)
    throw new LaptopServerConfigurationError(
      'This IPv6 address belongs to multiple interfaces. Include the Wi-Fi interface scope in --host.',
    );
  if (matches.length !== 1 || !isLaptopHost(matches[0]))
    throw new LaptopServerConfigurationError(
      'Connect this laptop to Wi-Fi, then select its assigned IPv4 or IPv6 address with --host.',
    );
  return { host: matches[0], port };
}

/** Print actionable, bounded guidance; raw system errors can contain local paths. */
export function laptopServerFailureMessage(error) {
  if (error instanceof LaptopServerConfigurationError) return error.message;
  if (error?.code === 'EADDRINUSE')
    return 'The laptop server port is already in use. Stop the other server or choose a different --port.';
  if (error?.code === 'EADDRNOTAVAIL')
    return 'The selected laptop address is no longer available. Check Wi-Fi and restart with its current --host address.';
  if (error?.message === 'Laptop signing identity is already in use.')
    return 'Another laptop server is using the signing identity. Stop it before restarting.';
  return 'Laptop server could not start. Check the public inventory and restored packages. See docs/guides/CONNECT_TO_LAPTOP.md.';
}

export class LaptopServerConfigurationError extends Error {}

/** The Windows hotspot chooses the interface; callers can only choose the port. */
export function laptopServerOptions(args) {
  if (args.length === 0) return { port: 8765 };
  if (args.length !== 2 || args[0] !== '--port' || !args[1])
    throw new LaptopServerConfigurationError(
      'Usage: pnpm map:laptop [--port PORT]. The server starts and uses the laptop hotspot automatically; --host is no longer supported.',
    );
  const port = Number(args[1]);
  if (!/^[0-9]{4,5}$/.test(args[1]) || !Number.isInteger(port) || port < 1024 || port > 65535)
    throw new LaptopServerConfigurationError('Choose a port between 1024 and 65535.');
  return { port };
}

/** Print actionable, bounded guidance; raw system errors can contain local paths. */
export function laptopServerFailureMessage(error) {
  if (error instanceof LaptopServerConfigurationError) return error.message;
  if (error?.code === 'EADDRINUSE')
    return 'The laptop server port is already in use. Stop the other server or choose a different --port.';
  if (error?.code === 'EADDRNOTAVAIL')
    return 'The laptop hotspot address changed. Restart pnpm map:laptop and reconnect the phone to its hotspot.';
  if (error?.message === 'Laptop signing identity is already in use.')
    return 'Another laptop server is using the signing identity. Stop it before restarting.';
  return 'Laptop server could not start. Check the public inventory and restored packages. See docs/guides/CONNECT_TO_LAPTOP.md.';
}

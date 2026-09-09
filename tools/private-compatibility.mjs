import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verifyPrivateExtension,
  verifyUpstreamCompatibility,
} from '../packages/data/src/private-extension.ts';

const checkout = fileURLToPath(new URL('../', import.meta.url));
try {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--proposed-core'))
    throw new Error('Usage: pnpm private:compatibility [--proposed-core <contract.json>]');
  const core = JSON.parse(
    await readFile(new URL('../config/extension-api.json', import.meta.url), 'utf8'),
  );
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  if (core.coreVersion !== pkg.version)
    throw new Error('core extension contract version differs from package version');
  const candidate = process.env.OUTDOOR_PRIVATE_ROOT;
  if (!candidate) throw new Error('OUTDOOR_PRIVATE_ROOT must select an external private root');
  if (args.length) {
    const proposed = JSON.parse(await readFile(resolve(args[1]), 'utf8'));
    await verifyUpstreamCompatibility(candidate, checkout, core, proposed);
  } else await verifyPrivateExtension(candidate, checkout, core);
  console.log(
    'Private extension compatibility and package integrity passed; no package code executed.',
  );
} catch (error) {
  const message =
    error instanceof Error &&
    /^(private extension rejected:|Usage:|core extension contract|OUTDOOR_PRIVATE_ROOT)/.test(
      error.message,
    )
      ? error.message
      : 'Private compatibility failed; inspect the selected inputs in the private environment.';
  console.error(message);
  process.exitCode = 1;
}

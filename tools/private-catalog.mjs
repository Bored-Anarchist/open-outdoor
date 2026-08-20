import { composeSyntheticPrivateCatalog } from './private-root-lib.mjs';

const output = await composeSyntheticPrivateCatalog(
  process.env.OUTDOOR_PRIVATE_ROOT,
  process.cwd(),
);
console.log(`wrote synthetic private catalog outside the public checkout: ${output}`);

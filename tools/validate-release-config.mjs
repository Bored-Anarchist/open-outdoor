import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

const root = new URL('../', import.meta.url);
const schema = JSON.parse(await readFile(new URL('config/release.schema.json', root), 'utf8'));
const release = JSON.parse(await readFile(new URL('config/release.json', root), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

if (!validate(release)) {
  console.error(JSON.stringify(validate.errors, null, 2));
  process.exitCode = 1;
} else {
  console.log(`release configuration v${release.schemaVersion} is valid`);
}

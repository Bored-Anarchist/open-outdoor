import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

const root = new URL('../', import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), 'utf8'));
}

const releaseSchema = await readJson('config/release.schema.json');
const release = await readJson('config/release.json');
const trustSchema = await readJson('config/catalog-trust.schema.json');
const trust = await readJson('config/catalog-trust.json');
const signatureSchema = await readJson('config/catalog-signature.schema.json');
const ajv = new Ajv2020({ allErrors: true, strict: true });
const checks = [
  ['release configuration', releaseSchema, release],
  ['catalog trust configuration', trustSchema, trust],
];
let failed = false;

for (const [name, schema, value] of checks) {
  const validate = ajv.compile(schema);
  if (!validate(value)) {
    console.error(`${name} is invalid`);
    console.error(JSON.stringify(validate.errors, null, 2));
    failed = true;
  } else {
    console.log(`${name} v${value.schemaVersion} is valid`);
  }
}

ajv.compile(signatureSchema);
console.log('catalog signature envelope schema is valid');

for (const channel of ['public', 'local', 'private']) {
  if (release.channels[channel].trustRoot !== trust.channels[channel].trustRoot) {
    console.error(`release and catalog trust roots disagree for ${channel}`);
    failed = true;
  }
}

if (
  trust.channels.public.allowUnsignedDevelopment ||
  trust.channels.private.allowUnsignedDevelopment
) {
  console.error('production catalog channels must reject unsigned development catalogs');
  failed = true;
}
if (!trust.channels.local.allowUnsignedDevelopment) {
  console.error(
    'the local channel must explicitly permit visibly labelled unsigned development catalogs',
  );
  failed = true;
}
if (trust.channels.private.keySource !== 'external-private-root') {
  console.error('private catalog trust must resolve from the external private root');
  failed = true;
}

if (failed) process.exitCode = 1;

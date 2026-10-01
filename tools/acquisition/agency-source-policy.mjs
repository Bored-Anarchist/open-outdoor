import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const schema = JSON.parse(
  readFileSync(new URL('../../config/agency-source-policy.schema.json', import.meta.url), 'utf8'),
);
const validate = new Ajv({ allErrors: true }).compile(schema);

export function validateAgencySourcePolicy(policy) {
  if (!validate(policy))
    throw new Error(`Invalid agency source policy: ${JSON.stringify(validate.errors)}`);
  for (const group of ['rights', 'planned']) {
    const seen = new Set();
    for (const row of policy[group]) {
      const key = `${row.state}|${row.role}|${row.url}`;
      if (seen.has(key)) throw new Error(`Duplicate ${group} policy record: ${key}`);
      seen.add(key);
    }
  }
  return policy;
}

export async function loadAgencySourcePolicy() {
  return validateAgencySourcePolicy(
    JSON.parse(
      await readFile(new URL('../../config/agency-source-policy.json', import.meta.url), 'utf8'),
    ),
  );
}

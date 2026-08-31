import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import { evaluatePhase1Gate } from './phase1-gate-lib.mjs';

const root = new URL('../', import.meta.url);
const record = JSON.parse(await readFile(new URL('config/phase1-gate.json', root), 'utf8'));
const schema = JSON.parse(await readFile(new URL('config/phase1-gate.schema.json', root), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
if (!validate(record)) {
  console.error('Phase 1 gate record is invalid');
  console.error(JSON.stringify(validate.errors, null, 2));
  process.exitCode = 2;
} else {
  const result = evaluatePhase1Gate(record);
  console.log(`Phase 1 gate: ${result.status}`);
  for (const blocker of result.blockers) console.log(`- ${blocker}`);
  if (result.status !== record.gateStatus) {
    console.error(
      `declared gate status ${record.gateStatus} does not match computed ${result.status}`,
    );
    process.exitCode = 2;
  } else if (result.status === 'blocked') {
    process.exitCode = 1;
  }
}

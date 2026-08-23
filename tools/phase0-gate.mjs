import { readFile } from 'node:fs/promises';
import { evaluatePhase0Gate } from './phase0-gate-lib.mjs';

const root = new URL('../', import.meta.url);
const record = JSON.parse(await readFile(new URL('config/phase0-gate.json', root), 'utf8'));
const result = evaluatePhase0Gate(record);
console.log(`Phase 0 gate: ${result.status}`);
for (const blocker of result.blockers) console.log(`- ${blocker}`);
if (result.status !== record.gateStatus) {
  console.error(
    `declared gate status ${record.gateStatus} does not match computed ${result.status}`,
  );
  process.exitCode = 2;
} else if (result.status !== 'passed') {
  process.exitCode = 1;
}

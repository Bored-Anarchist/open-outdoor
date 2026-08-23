import { readFile } from 'node:fs/promises';
import { evaluatePhase1Gate } from './phase1-gate-lib.mjs';

const root = new URL('../', import.meta.url);
const record = JSON.parse(await readFile(new URL('config/phase1-gate.json', root), 'utf8'));
const result = evaluatePhase1Gate(record);
console.log(`Phase 1 gate: ${result.status}`);
for (const blocker of result.blockers) console.log(`- ${blocker}`);
if (result.status !== record.gateStatus) {
  console.error(
    `declared gate status ${record.gateStatus} does not match computed ${result.status}`,
  );
  process.exitCode = 2;
}

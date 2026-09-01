import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import { evaluatePhase0Gate } from './phase0-gate-lib.mjs';
import { evaluatePhase1Gate } from './phase1-gate-lib.mjs';
import { evaluatePhase2Gate } from './phase2-gate-lib.mjs';
import { summarizeHostedCiWindow } from './hosted-ci-window-lib.mjs';

const root = new URL('../', import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), 'utf8'));
}

const releaseSchema = await readJson('config/release.schema.json');
const release = await readJson('config/release.json');
const trustSchema = await readJson('config/catalog-trust.schema.json');
const trust = await readJson('config/catalog-trust.json');
const signatureSchema = await readJson('config/catalog-signature.schema.json');
const phase0Schema = await readJson('config/phase0-gate.schema.json');
const phase0 = await readJson('config/phase0-gate.json');
const phase1Schema = await readJson('config/phase1-gate.schema.json');
const phase1PhysicalReportSchema = await readJson('config/phase1-physical-report.schema.json');
const phase1 = await readJson('config/phase1-gate.json');
const phase2ProfileSchema = await readJson('config/phase2-acceptance-profile.schema.json');
const phase2Profile = await readJson('config/phase2-acceptance-profile.json');
const phase2ReportSchema = await readJson('config/phase2-guided-report.schema.json');
const phase2GateSchema = await readJson('config/phase2-gate.schema.json');
const phase2 = await readJson('config/phase2-gate.json');
const hostedCiSchema = await readJson('config/hosted-ci-window.schema.json');
const hostedCi = await readJson('config/hosted-ci-window.json');
const ajv = new Ajv2020({ allErrors: true, strict: true });
const checks = [
  ['release configuration', releaseSchema, release],
  ['catalog trust configuration', trustSchema, trust],
  ['Phase 0 gate record', phase0Schema, phase0],
  ['Phase 1 gate record', phase1Schema, phase1],
  ['Phase 2 acceptance profile', phase2ProfileSchema, phase2Profile],
  ['Phase 2 gate record', phase2GateSchema, phase2],
  ['hosted CI clean-window ledger', hostedCiSchema, hostedCi],
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
ajv.compile(phase1PhysicalReportSchema);
console.log('Phase 1 physical report schema is valid');
ajv.compile(phase2ReportSchema);
console.log('Phase 2 guided report schema is valid');

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

const hostedCiSummary = summarizeHostedCiWindow(hostedCi);
if (JSON.stringify(hostedCiSummary) !== JSON.stringify(phase0.hostedCi.cleanWindow)) {
  console.error('hosted CI ledger summary disagrees with the Phase 0 gate record');
  failed = true;
}
if (release.phase0.profileId !== phase0.profileId) {
  console.error('release and Phase 0 gate profile IDs disagree');
  failed = true;
}
const phase0Result = evaluatePhase0Gate(phase0);
if (phase0Result.status !== phase0.gateStatus) {
  console.error(
    `declared Phase 0 gate status ${phase0.gateStatus} does not match computed ${phase0Result.status}`,
  );
  failed = true;
} else {
  console.log(`Phase 0 gate declaration is consistent: ${phase0Result.status}`);
}

const phase1Result = evaluatePhase1Gate(phase1);
if (phase1Result.status !== phase1.gateStatus) {
  console.error(
    `declared Phase 1 gate status ${phase1.gateStatus} does not match computed ${phase1Result.status}`,
  );
  failed = true;
} else {
  console.log(`Phase 1 gate declaration is consistent: ${phase1Result.status}`);
}

const phase2Result = evaluatePhase2Gate(phase2);
if (phase2Result.status !== phase2.gateStatus) {
  console.error(
    `declared Phase 2 gate status ${phase2.gateStatus} does not match computed ${phase2Result.status}`,
  );
  failed = true;
} else {
  console.log(`Phase 2 gate declaration is consistent: ${phase2Result.status}`);
}

if (failed) process.exitCode = 1;

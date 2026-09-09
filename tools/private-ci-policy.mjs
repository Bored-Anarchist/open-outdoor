import { readFile } from 'node:fs/promises';

const workflowPath = new URL(
  '../templates/private-downstream/.github/workflows/private-compatibility.yml',
  import.meta.url,
);
const workflow = await readFile(workflowPath, 'utf8');
const prohibited = [
  ['privileged pull-request event', /pull_request_target\s*:/],
  ['public artifact upload', /actions\/upload-artifact/],
  ['shared cache action', /actions\/cache/],
  ['scheduled execution', /^\s*schedule\s*:/m],
  ['persistent self-hosted runner', /self-hosted/],
];
const failures = prohibited.filter(([, pattern]) => pattern.test(workflow)).map(([name]) => name);

if (!/workflow_dispatch\s*:/.test(workflow))
  failures.push('missing explicit workflow_dispatch gate');
if (!/permissions:\s*\n\s+contents:\s+read/.test(workflow))
  failures.push('missing read-only default permissions');
if (!/OPEN_OUTDOOR_EPHEMERAL:\s*1/.test(workflow))
  failures.push('missing ephemeral boundary assertion');

if (!workflow.includes('node tools/private-compatibility.mjs --proposed-core'))
  failures.push('missing package compatibility verification');
if (!workflow.includes('env -u OUTDOOR_PRIVATE_ROOT pnpm quality'))
  failures.push('missing isolated public quality check');
if (!workflow.includes('merge-base --is-ancestor "$PUBLIC_REF" origin/main'))
  failures.push('missing protected public ancestry check');
if (/\$\{\{\s*inputs\.public_ref\s*\}\}/.test(workflow.split('steps:')[1] ?? ''))
  failures.push('workflow input interpolated directly into shell code');
if (failures.length) {
  console.error(`private workflow policy failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else console.log('private downstream workflow policy passed');

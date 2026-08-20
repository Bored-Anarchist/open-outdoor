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

if (failures.length) {
  console.error(`private workflow policy failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else console.log('private downstream workflow policy passed');

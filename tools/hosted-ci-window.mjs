import { readFile } from 'node:fs/promises';
import { summarizeHostedCiWindow } from './hosted-ci-window-lib.mjs';

const root = new URL('../', import.meta.url);
const ledger = JSON.parse(await readFile(new URL('config/hosted-ci-window.json', root), 'utf8'));
const result = summarizeHostedCiWindow(ledger);
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'passed') process.exitCode = 1;

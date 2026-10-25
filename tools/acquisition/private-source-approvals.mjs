import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { assertPrivateAcquisitionApproved } from './state-agency-feeds.mjs';

export async function loadPrivateSourceApprovals(
  sources,
  { stagingRoot = resolve('PrivateData/agency-feeds'), label = 'Private source' } = {},
) {
  let approvals;
  try {
    approvals = JSON.parse(await readFile(join(stagingRoot, 'approvals.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    approvals = {};
  }
  if (!approvals || typeof approvals !== 'object' || Array.isArray(approvals))
    throw new Error(`${label} approval ledger must be an object`);
  const blockers = [];
  for (const source of sources) {
    try {
      assertPrivateAcquisitionApproved(source, approvals[source.id]);
    } catch (error) {
      blockers.push(error.message);
    }
  }
  if (blockers.length) throw new Error(`${label} refresh blocked: ${blockers.join('; ')}`);
  return approvals;
}

import { REQUIRED_PHASE2_ACCEPTANCE } from './phase2-guided-lib.mjs';

const requiredPackages = Array.from({ length: 10 }, (_, index) => `WP-${201 + index}`);

export function evaluatePhase2Gate(record) {
  const blockers = [];
  if (record?.schemaVersion !== 1) blockers.push('phase2 gate schemaVersion must be 1');
  if (record?.profileId !== 'new-york-data-alpha-phase2-v1') {
    blockers.push('phase2 gate profileId is invalid');
  }
  for (const packageId of requiredPackages) {
    const item = record?.packages?.[packageId];
    if (!['accepted', 'passed'].includes(item?.status)) {
      blockers.push(`${packageId}: ${item?.status ?? 'missing'}`);
    }
  }
  for (const criterion of REQUIRED_PHASE2_ACCEPTANCE) {
    const item = record?.acceptance?.[criterion];
    if (item?.status !== 'passed') blockers.push(`${criterion}: ${item?.status ?? 'missing'}`);
  }
  if ((record?.review?.reportSha256 ?? '').match(/^[0-9a-f]{64}$/) === null) {
    blockers.push('review: accepted report checksum is missing');
  }
  if (!record?.review?.acceptedBy || !record?.review?.acceptedAt) {
    blockers.push('review: explicit reviewer acceptance is missing');
  }
  return { status: blockers.length === 0 ? 'passed' : 'blocked', blockers };
}

const passing = new Set(['implemented', 'accepted', 'passed']);

export function evaluatePhase1Gate(record) {
  const blockers = [];
  if (record?.schemaVersion !== 1) blockers.push('phase1 gate schemaVersion must be 1');
  for (const [packageId, item] of Object.entries(record?.packages ?? {})) {
    if (!passing.has(item?.status)) blockers.push(`${packageId}: ${item?.status ?? 'missing'}`);
  }
  for (const [caseId, item] of Object.entries(record?.acceptance ?? {})) {
    if (!passing.has(item?.status)) blockers.push(`${caseId}: ${item?.status ?? 'missing'}`);
  }
  if (record?.deferred?.measuredEnergy !== 'WP-307/WP-503') {
    blockers.push('measured energy must remain explicitly deferred to WP-307/WP-503');
  }
  return { status: blockers.length === 0 ? 'passed' : 'blocked', blockers };
}

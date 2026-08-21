export const requiredPhase0Packages = [
  'WP-001',
  'WP-002',
  'WP-003',
  'WP-004',
  'WP-005',
  'WP-006',
  'WP-007',
  'WP-008',
  'WP-009',
  'WP-010',
];

export const requiredPhase1Budgets = ['BUD-REC-001', 'BUD-REC-002', 'BUD-REC-003', 'BUD-MEM-001'];

export function evaluatePhase0Gate(record) {
  const blockers = [];
  for (const packageId of requiredPhase0Packages) {
    const item = record.packages[packageId];
    if (item?.status !== 'accepted') blockers.push(`${packageId}: ${item?.status ?? 'missing'}`);
  }
  for (const budgetId of requiredPhase1Budgets) {
    const item = record.budgets[budgetId];
    if (item?.status !== 'passed') blockers.push(`${budgetId}: ${item?.status ?? 'missing'}`);
  }
  if (record.hostedCi.avoidableJobsDetected) blockers.push('hosted CI: avoidable jobs detected');
  return { status: blockers.length === 0 ? 'passed' : 'blocked', blockers };
}

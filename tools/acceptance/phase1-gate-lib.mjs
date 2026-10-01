const passing = new Set(['accepted', 'passed']);
const requiredPackages = Array.from({ length: 9 }, (_, index) => `WP-${101 + index}`);
const requiredAcceptance = [
  'automatedCore',
  'trackerCorrectness',
  'memorySmoke',
  'voiceOver',
  'dynamicType',
  'elevation',
];

export function evaluatePhase1Gate(record) {
  const blockers = [];
  const approvedWaiverScope = new Set(
    (record?.waivers ?? [])
      .filter((waiver) => waiver?.status === 'approved')
      .flatMap((waiver) => waiver?.scope ?? []),
  );
  if (record?.schemaVersion !== 1) blockers.push('phase1 gate schemaVersion must be 1');
  for (const packageId of requiredPackages) {
    const item = record?.packages?.[packageId];
    if (!passing.has(item?.status)) blockers.push(`${packageId}: ${item?.status ?? 'missing'}`);
  }
  for (const caseId of requiredAcceptance) {
    const item = record?.acceptance?.[caseId];
    if (item?.status === 'waived') {
      if (!approvedWaiverScope.has(caseId)) {
        blockers.push(`${caseId}: waived without an approved scoped waiver`);
      }
    } else if (!passing.has(item?.status)) {
      blockers.push(`${caseId}: ${item?.status ?? 'missing'}`);
    }
  }
  if (record?.deferred?.measuredEnergy !== 'WP-307/WP-503') {
    blockers.push('measured energy must remain explicitly deferred to WP-307/WP-503');
  }
  return { status: blockers.length === 0 ? 'passed' : 'blocked', blockers };
}

export const hostedCiClassifications = ['applicable-clean', 'avoidable-failure', 'excluded'];

function compareAssessments(left, right) {
  return (
    Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
    left.runId.localeCompare(right.runId)
  );
}

export function summarizeHostedCiWindow(ledger) {
  const start = Date.parse(ledger.startsAfter);
  if (!Number.isFinite(start)) throw new Error('hosted CI window start is invalid');
  if (!Number.isSafeInteger(ledger.requiredApplicableRuns) || ledger.requiredApplicableRuns < 1) {
    throw new Error('hosted CI required run count is invalid');
  }

  const seen = new Set();
  for (const assessment of ledger.assessments) {
    if (seen.has(assessment.runId)) throw new Error('hosted CI run IDs must be unique');
    seen.add(assessment.runId);
    if (!hostedCiClassifications.includes(assessment.classification)) {
      throw new Error('hosted CI classification is invalid');
    }
    const createdAt = Date.parse(assessment.createdAt);
    if (!Number.isFinite(createdAt) || createdAt <= start) {
      throw new Error('hosted CI assessments must occur after the window start');
    }
    if (assessment.reason.trim().length === 0) {
      throw new Error('hosted CI assessment reason is required');
    }
  }

  const applicable = ledger.assessments
    .filter(({ classification }) => classification !== 'excluded')
    .sort(compareAssessments)
    .slice(0, ledger.requiredApplicableRuns);
  const avoidableFailureCount = applicable.filter(
    ({ classification }) => classification === 'avoidable-failure',
  ).length;
  const evaluatedApplicableRuns = applicable.length;
  const status =
    avoidableFailureCount > 0
      ? 'failed'
      : evaluatedApplicableRuns >= ledger.requiredApplicableRuns
        ? 'passed'
        : 'collecting';

  return {
    startsAfter: ledger.startsAfter,
    requiredApplicableRuns: ledger.requiredApplicableRuns,
    evaluatedApplicableRuns,
    avoidableFailureCount,
    status,
  };
}

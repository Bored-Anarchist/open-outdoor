import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { summarizeHostedCiWindow } from '../../../tools/hosted-ci-window-lib.mjs';
import { evaluatePhase0Gate } from '../../../tools/phase0-gate-lib.mjs';

const record = JSON.parse(readFileSync('config/phase0-gate.json', 'utf8'));
const ledger = JSON.parse(readFileSync('config/hosted-ci-window.json', 'utf8'));

describe('WP-009 Phase 0 gate evaluation', () => {
  it('T-REL-001-C09 matches the current passed gate declaration', () => {
    const result = evaluatePhase0Gate(record);
    expect(result).toEqual({ status: 'passed', blockers: [] });
    expect(record.gateStatus).toBe(result.status);
  });

  it('T-REL-001-C10 passes only when every package, budget, and clean window passes', () => {
    const accepted = structuredClone(record);
    expect(evaluatePhase0Gate(accepted)).toEqual({ status: 'passed', blockers: [] });

    const packagePending = structuredClone(accepted);
    packagePending.packages['WP-007'].status = 'physical-pending';
    expect(evaluatePhase0Gate(packagePending).blockers).toContain('WP-007: physical-pending');

    const budgetPending = structuredClone(accepted);
    budgetPending.budgets['BUD-MEM-001'].status = 'physical-pending';
    expect(evaluatePhase0Gate(budgetPending).blockers).toContain('BUD-MEM-001: physical-pending');

    const cleanWindowIncomplete = structuredClone(accepted);
    const requiredRuns = cleanWindowIncomplete.hostedCi.cleanWindow.requiredApplicableRuns;
    cleanWindowIncomplete.hostedCi.cleanWindow.evaluatedApplicableRuns = requiredRuns - 1;
    expect(evaluatePhase0Gate(cleanWindowIncomplete).blockers).toContain(
      'hosted CI: clean window incomplete (19/20)',
    );
  });

  it('T-REL-004-C11 evaluates only the bounded applicable-run window', () => {
    const sample = structuredClone(ledger);
    sample.assessments = Array.from({ length: 21 }, (_, index) => ({
      runId: String(index + 1),
      workflow: 'windows-quality',
      createdAt: '2026-08-22T00:' + String(index).padStart(2, '0') + ':00Z',
      classification: 'applicable-clean',
      reason: 'Applicable run completed without avoidable failure.',
    }));
    expect(summarizeHostedCiWindow(sample)).toMatchObject({
      evaluatedApplicableRuns: 20,
      avoidableFailureCount: 0,
      status: 'passed',
    });
  });

  it('T-REL-004-C12 fails a bounded window containing an avoidable failure', () => {
    const sample = structuredClone(ledger);
    sample.assessments = [
      {
        runId: 'avoidable-1',
        workflow: 'windows-quality',
        createdAt: '2026-08-22T00:00:00Z',
        classification: 'avoidable-failure',
        reason: 'Change was pushed without the required local gate.',
      },
    ];
    expect(summarizeHostedCiWindow(sample)).toMatchObject({
      evaluatedApplicableRuns: 1,
      avoidableFailureCount: 1,
      status: 'failed',
    });
  });
});

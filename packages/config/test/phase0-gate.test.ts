import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluatePhase0Gate } from '../../../tools/phase0-gate-lib.mjs';

const record = JSON.parse(readFileSync('config/phase0-gate.json', 'utf8'));

describe('WP-009 Phase 0 gate evaluation', () => {
  it('T-REL-001-C09 reports every current physical and budget blocker', () => {
    const result = evaluatePhase0Gate(record);
    expect(result.status).toBe('blocked');
    expect(result.blockers).toContain('WP-007: physical-pending');
    expect(result.blockers).toContain('BUD-MEM-001: physical-pending');
    expect(result.blockers).toContain('BUD-ENE-HIGH-ACCURACY: blocked');
    expect(result.blockers).toContain('hosted CI: avoidable jobs detected');
  });

  it('T-REL-001-C10 passes only when every package and prerequisite budget passes', () => {
    const accepted = structuredClone(record);
    for (const item of Object.values(accepted.packages)) item.status = 'accepted';
    for (const item of Object.values(accepted.budgets)) item.status = 'passed';
    accepted.hostedCi.avoidableJobsDetected = false;
    expect(evaluatePhase0Gate(accepted)).toEqual({ status: 'passed', blockers: [] });
  });
});

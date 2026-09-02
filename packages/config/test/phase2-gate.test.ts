import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluatePhase2Gate } from '../../../tools/phase2-gate-lib.mjs';

const record = JSON.parse(readFileSync('config/phase2-gate.json', 'utf8'));

describe('Phase 2 data-alpha gate', () => {
  it('reflects the explicitly approved guided live run', () => {
    const result = evaluatePhase2Gate(record);
    expect(result.status).toBe('passed');
    expect(record.gateStatus).toBe(result.status);
    expect(result.blockers).toEqual([]);
  });

  it('passes only accepted packages, acceptance criteria, and an explicit reviewed report', () => {
    const candidate = structuredClone(record);
    for (const item of Object.values(candidate.packages) as { status: string }[]) {
      item.status = 'accepted';
    }
    for (const item of Object.values(candidate.acceptance) as { status: string }[]) {
      item.status = 'passed';
    }
    candidate.review = {
      reportSha256: 'a'.repeat(64),
      acceptedAt: '2026-08-31',
      acceptedBy: 'project owner',
      residualRisk: 'Official sources can change after the acceptance snapshot.',
    };
    expect(evaluatePhase2Gate(candidate)).toEqual({ status: 'passed', blockers: [] });
  });

  it('does not allow implementation or self-declared criteria to replace review evidence', () => {
    const candidate = structuredClone(record);
    candidate.packages['WP-201'].status = 'implemented';
    candidate.review.acceptedAt = null;
    candidate.review.acceptedBy = null;
    expect(evaluatePhase2Gate(candidate)).toEqual({
      status: 'blocked',
      blockers: ['WP-201: implemented', 'review: explicit reviewer acceptance is missing'],
    });
  });
});

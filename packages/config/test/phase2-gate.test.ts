import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluatePhase2Gate } from '../../../tools/phase2-gate-lib.mjs';

const record = JSON.parse(readFileSync('config/phase2-gate.json', 'utf8'));

describe('Phase 2 data-alpha gate', () => {
  it('keeps the declared gate blocked until the guided live run and review pass', () => {
    const result = evaluatePhase2Gate(record);
    expect(result.status).toBe('blocked');
    expect(record.gateStatus).toBe(result.status);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'WP-201: implemented',
        'liveSourceAvailability: pending',
        'review: explicit reviewer acceptance is missing',
      ]),
    );
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
    for (const item of Object.values(candidate.acceptance) as { status: string }[]) {
      item.status = 'passed';
    }
    candidate.review.reportSha256 = 'b'.repeat(64);
    expect(evaluatePhase2Gate(candidate).status).toBe('blocked');
  });
});

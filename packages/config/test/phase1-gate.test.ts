import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluatePhase1Gate } from '../../../tools/phase1-gate-lib.mjs';

const record = JSON.parse(readFileSync('config/phase1-gate.json', 'utf8'));

describe('WP-109 Phase 1 gate evaluation', () => {
  it('keeps the declared physical-pending matrix blocked', () => {
    const result = evaluatePhase1Gate(record);
    expect(result.status).toBe('blocked');
    expect(record.gateStatus).toBe(result.status);
  });

  it('does not treat implementation alone as acceptance', () => {
    const candidate = structuredClone(record);
    for (const item of Object.values(candidate.packages) as { status: string }[]) {
      item.status = 'implemented';
    }
    for (const item of Object.values(candidate.acceptance) as { status: string }[]) {
      item.status = 'passed';
    }
    const result = evaluatePhase1Gate(candidate);
    expect(result.status).toBe('blocked');
    expect(result.blockers).toContain('WP-101: implemented');
  });

  it('passes only an accepted package matrix and passed acceptance matrix', () => {
    const candidate = structuredClone(record);
    for (const item of Object.values(candidate.packages) as { status: string }[]) {
      item.status = 'accepted';
    }
    for (const item of Object.values(candidate.acceptance) as { status: string }[]) {
      item.status = 'passed';
    }
    expect(evaluatePhase1Gate(candidate)).toEqual({ status: 'passed', blockers: [] });
  });

  it('fails missing evidence state and an incorrect energy deferral', () => {
    const candidate = structuredClone(record);
    delete candidate.acceptance.elevation;
    candidate.deferred.measuredEnergy = 'done';
    expect(evaluatePhase1Gate(candidate).blockers).toEqual(
      expect.arrayContaining([
        'elevation: missing',
        'measured energy must remain explicitly deferred to WP-307/WP-503',
      ]),
    );
  });
});

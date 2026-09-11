import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createGuidedSession,
  observeGuidedStep,
  parseGuidedSession,
  productionGuidedSteps,
} from '../src/production-guided';
const environment = {
  sourceCommit: 'a'.repeat(40),
  binarySha256: 'b'.repeat(64),
  deviceModelIdentifier: 'iPhone14,7',
  systemVersion: '26.6',
  residentMemoryMiB: 100,
  encryptedBackupRoundTripPassed: true,
  wrongSecretRejected: true,
};
const session = () => createGuidedSession(environment);
describe('production guided observations', () => {
  it('covers the canonical 99 accessibility cases, eight measurements and six field runs', () => {
    const profile = JSON.parse(readFileSync('config/production-quality-profile.json', 'utf8'));
    expect(
      productionGuidedSteps.filter((s) => s.kind === 'accessibility').map((s) => s.id),
    ).toEqual(
      profile.accessibilityFlows.flatMap((f: string) =>
        profile.accessibilitySettings.map((s: string) => `${f}/${s}`),
      ),
    );
    expect(productionGuidedSteps.filter((s) => s.kind === 'measurement').map((s) => s.id)).toEqual(
      Object.keys(profile.measurements).map((k) => `measurement/${k}`),
    );
    expect(productionGuidedSteps.filter((s) => s.kind === 'field')).toHaveLength(6);
    expect(new Set(productionGuidedSteps.map((s) => s.id)).size).toBe(productionGuidedSteps.length);
  });
  it('persists and resumes exact-candidate observations without accepting a release', () => {
    const original = session();
    const next = observeGuidedStep(
      original,
      productionGuidedSteps[0].id,
      'observed-pass',
      '2026-09-10T10:00:00Z',
    );
    expect(original.steps[0].status).toBe('pending');
    expect(parseGuidedSession(JSON.stringify(next), environment).steps[0].status).toBe(
      'observed-pass',
    );
    expect(next.releaseAcceptance).toBe('not-evaluated');
  });
  it('blocks stale identities and missing commit bindings', () => {
    expect(() =>
      parseGuidedSession(JSON.stringify(session()), {
        ...environment,
        binarySha256: 'c'.repeat(64),
      }),
    ).toThrow();
    expect(() => createGuidedSession({ ...environment, sourceCommit: 'unknown' })).toThrow();
  });
  it('rejects extraneous private data, missing and duplicate observations', () => {
    for (const mutate of [
      (s: any) => (s.coordinates = [1, 2]),
      (s: any) => s.steps.pop(),
      (s: any) => (s.steps[1] = s.steps[0]),
      (s: any) => (s.steps[0].notes = 'private'),
    ]) {
      const value = session();
      mutate(value);
      expect(() => parseGuidedSession(JSON.stringify(value))).toThrow();
    }
  });
  it('cannot mark physical measurements or endurance passed by checklist', () => {
    for (const step of productionGuidedSteps.filter((s) =>
      ['measurement', 'field'].includes(s.kind),
    )) {
      expect(() =>
        observeGuidedStep(session(), step.id, 'observed-pass', '2026-09-10T10:00:00Z'),
      ).toThrow();
      const forged = session();
      const item = forged.steps.find((s) => s.id === step.id)!;
      item.status = 'observed-pass';
      item.updatedAt = '2026-09-10T10:00:00Z';
      expect(() => parseGuidedSession(JSON.stringify(forged))).toThrow();
    }
  });
  it('records failed and external observations without auto-promoting them', () => {
    const s = observeGuidedStep(
      session(),
      'field/balanced/1',
      'external-required',
      '2026-09-10T10:00:00Z',
    );
    expect(
      parseGuidedSession(JSON.stringify(s)).steps.find((s) => s.id === 'field/balanced/1')?.status,
    ).toBe('external-required');
  });
  it('rejects malformed times and unsupported device claims', () => {
    expect(() =>
      observeGuidedStep(session(), productionGuidedSteps[0].id, 'failed', 'invalid'),
    ).toThrow();
    const s = createGuidedSession({ ...environment, deviceModelIdentifier: 'arm64' });
    expect(s.preflight.passed).toBe(false);
    s.preflight.passed = true;
    expect(() => parseGuidedSession(JSON.stringify(s))).toThrow();
  });
});

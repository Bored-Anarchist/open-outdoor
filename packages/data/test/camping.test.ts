import { describe, expect, it } from 'vitest';
import {
  CAMPING_EVALUATOR_VERSION,
  CAMPING_STATUSES,
  evaluateCampingStatus,
  type CampingQuery,
  type CampingRule,
  type CampingRuleKind,
} from '../src/index.js';

const evaluatedAt = '2026-09-01T00:00:00.000Z';

function rule(
  id: string,
  kind: CampingRuleKind,
  overrides: Partial<CampingRule> = {},
): CampingRule {
  return {
    id,
    version: '1.0.0',
    kind,
    name: id,
    authority: kind === 'emergency-closure' ? 'order' : 'regulation',
    authorityName: 'Synthetic fixture authority',
    scope: { kind: 'land-unit', landUnitId: 'alpha-unit', geometry: null },
    activities: ['primitive-camping'],
    interval: { start: '2026-01-01T00:00:00.000Z', end: null, quality: 'known' },
    reviewedAt: '2026-08-31T00:00:00.000Z',
    staleAfterSeconds: 30 * 24 * 60 * 60,
    mandatory: true,
    supersedes: [],
    conflictsWith: [],
    sourceRecordId: `source-${id}`,
    explanation: `Synthetic ${kind} rule.`,
    ...overrides,
  };
}

function query(overrides: Partial<CampingQuery> = {}): CampingQuery {
  return {
    point: [-74.2, 43.2],
    evaluatedAt,
    activity: 'primitive-camping',
    landUnitId: 'alpha-unit',
    ownership: 'supported-public-presumption',
    withinDesignatedSite: true,
    evidence: { ownership: 'current', unitRules: 'current', restrictions: 'current' },
    rules: [],
    accessEvidence: 'current',
    access: [],
    ...overrides,
  };
}

describe('WP-205 camping-status evaluator', () => {
  it('T-UNIT-001-C01 produces all seven versioned statuses with deterministic precedence', () => {
    const cases: readonly [CampingQuery, (typeof CAMPING_STATUSES)[number]][] = [
      [
        query({
          evidence: { ownership: 'current', unitRules: 'missing', restrictions: 'current' },
        }),
        'generally-eligible',
      ],
      [query({ rules: [rule('allowed', 'affirmative-allowance')] }), 'verified-allowed'],
      [query({ rules: [rule('limited', 'restriction')] }), 'restricted'],
      [query({ rules: [rule('permit', 'permit-required')] }), 'permit-required'],
      [query({ rules: [rule('ban', 'prohibition')] }), 'prohibited'],
      [query({ rules: [rule('closure', 'emergency-closure')] }), 'temporary-closure'],
      [query({ ownership: 'unknown' }), 'unknown'],
    ];

    const results = cases.map(([input, expected]) => {
      const result = evaluateCampingStatus(input);
      expect(result.status).toBe(expected);
      expect(result.evaluatorVersion).toBe(CAMPING_EVALUATOR_VERSION);
      return result.status;
    });
    expect(new Set(results)).toEqual(new Set(CAMPING_STATUSES));
  });

  it('T-UNIT-001-C02 excludes private inholdings before applying public-land rules', () => {
    const result = evaluateCampingStatus(
      query({ ownership: 'private-inholding', rules: [rule('allowed', 'affirmative-allowance')] }),
    );
    expect(result).toMatchObject({
      status: 'unknown',
      winningRuleId: null,
      reasonCodes: ['private-inholding-excluded'],
    });
  });

  it('T-UNIT-001-C03 prohibits outside designated sites and refuses unknown membership', () => {
    const designated = rule('designated-only', 'designated-sites-only');
    expect(
      evaluateCampingStatus(query({ withinDesignatedSite: false, rules: [designated] })),
    ).toMatchObject({ status: 'prohibited', reasonCodes: ['outside-required-designated-site'] });
    expect(
      evaluateCampingStatus(query({ withinDesignatedSite: 'unknown', rules: [designated] })),
    ).toMatchObject({ status: 'unknown', reasonCodes: ['designated-site-membership-unknown'] });
  });

  it('T-UNIT-001-C04 blocks positives on stale mandatory or missing safety evidence', () => {
    const stale = rule('stale-allowance', 'affirmative-allowance', {
      reviewedAt: '2025-01-01T00:00:00.000Z',
    });
    expect(evaluateCampingStatus(query({ rules: [stale] }))).toMatchObject({
      status: 'unknown',
      reasonCodes: expect.arrayContaining(['stale-mandatory-input']),
    });
    expect(
      evaluateCampingStatus(
        query({
          evidence: { ownership: 'current', unitRules: 'current', restrictions: 'missing' },
        }),
      ),
    ).toMatchObject({
      status: 'unknown',
      reasonCodes: expect.arrayContaining(['restrictions-evidence-missing']),
    });
    expect(
      evaluateCampingStatus(
        query({
          evidence: { ownership: 'current', unitRules: 'conflicting', restrictions: 'current' },
        }),
      ),
    ).toMatchObject({
      status: 'unknown',
      reasonCodes: expect.arrayContaining(['unitRules-evidence-conflicting']),
    });
    expect(
      evaluateCampingStatus(
        query({
          rules: [
            rule('stale-ban', 'prohibition', {
              reviewedAt: '2025-01-01T00:00:00.000Z',
            }),
          ],
        }),
      ),
    ).toMatchObject({ status: 'prohibited', reasonCodes: ['stale-prohibition-retained'] });
  });

  it('T-UNIT-001-C05 explains equal-authority conflicts and honors explicit supersession', () => {
    const first = rule('allow-a', 'affirmative-allowance', { conflictsWith: ['allow-b'] });
    const second = rule('allow-b', 'affirmative-allowance');
    expect(evaluateCampingStatus(query({ rules: [first, second] }))).toMatchObject({
      status: 'unknown',
      reasonCodes: expect.arrayContaining(['equal-authority-conflict']),
      conflicts: [['allow-a', 'allow-b']],
    });

    const replacement = rule('replacement', 'affirmative-allowance', {
      supersedes: ['old-ban'],
    });
    const superseded = evaluateCampingStatus(
      query({ rules: [rule('old-ban', 'prohibition'), replacement] }),
    );
    expect(superseded.status).toBe('verified-allowed');
    expect(superseded.considered).toContainEqual(
      expect.objectContaining({ id: 'old-ban', accepted: false, superseded: true }),
    );
  });

  it('T-UNIT-001-C06 evaluates access independently from camping eligibility', () => {
    const result = evaluateCampingStatus(
      query({
        rules: [rule('allowed', 'affirmative-allowance')],
        access: [
          {
            id: 'closed-road',
            status: 'closed',
            authority: 'order',
            interval: { start: null, end: null, quality: 'known' },
            reviewedAt: '2026-08-31T00:00:00.000Z',
            staleAfterSeconds: 2 * 86_400,
            explanation: 'Synthetic road closure.',
          },
        ],
      }),
    );
    expect(result.status).toBe('verified-allowed');
    expect(result.access).toEqual({
      status: 'closed',
      reasonCodes: ['access-closed'],
      winningDirectiveId: 'closed-road',
    });
  });
});

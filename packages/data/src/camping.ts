import type { CanonicalGeometry, EffectiveInterval, Position } from './canonical.js';

export const CAMPING_EVALUATOR_VERSION = '1.0.0' as const;
export const CAMPING_STATUSES = [
  'generally-eligible',
  'verified-allowed',
  'restricted',
  'permit-required',
  'prohibited',
  'temporary-closure',
  'unknown',
] as const;

export type CampingStatus = (typeof CAMPING_STATUSES)[number];
export type CampingRuleKind =
  | 'affirmative-allowance'
  | 'prohibition'
  | 'emergency-closure'
  | 'designated-sites-only'
  | 'permit-required'
  | 'restriction';
export type EvidenceState = 'current' | 'missing' | 'stale' | 'conflicting';
export type AuthorityKind = 'observation' | 'guidance' | 'management-plan' | 'regulation' | 'order';

export interface CampingRuleScope {
  readonly kind: 'statewide' | 'land-unit' | 'geometry' | 'designated-site';
  readonly landUnitId: string | null;
  readonly geometry: CanonicalGeometry | null;
}

export interface CampingRule {
  readonly id: string;
  readonly version: string;
  readonly kind: CampingRuleKind;
  readonly name: string;
  readonly authority: AuthorityKind;
  readonly authorityName: string;
  readonly scope: CampingRuleScope;
  readonly activities: readonly string[];
  readonly interval: EffectiveInterval;
  readonly reviewedAt: string;
  readonly staleAfterSeconds: number;
  readonly mandatory: boolean;
  readonly supersedes: readonly string[];
  readonly conflictsWith: readonly string[];
  readonly sourceRecordId: string;
  readonly explanation: string;
}

export interface AccessDirective {
  readonly id: string;
  readonly status: 'open' | 'restricted' | 'closed';
  readonly authority: AuthorityKind;
  readonly interval: EffectiveInterval;
  readonly reviewedAt: string;
  readonly staleAfterSeconds: number;
  readonly explanation: string;
}

export interface CampingEvidenceState {
  readonly ownership: EvidenceState;
  readonly unitRules: EvidenceState;
  readonly restrictions: EvidenceState;
}

export interface CampingQuery {
  readonly point: Position;
  readonly evaluatedAt: string;
  readonly activity: string;
  readonly landUnitId: string | null;
  readonly ownership:
    'supported-public-presumption' | 'verified-public' | 'private-inholding' | 'unknown';
  readonly withinDesignatedSite: boolean | 'unknown';
  readonly evidence: CampingEvidenceState;
  readonly rules: readonly CampingRule[];
  readonly accessEvidence: EvidenceState;
  readonly access: readonly AccessDirective[];
}

export interface ConsideredCampingInput {
  readonly id: string;
  readonly accepted: boolean;
  readonly reasons: readonly string[];
  readonly stale: boolean;
  readonly superseded: boolean;
}

export interface AccessEvaluation {
  readonly status: 'open' | 'restricted' | 'closed' | 'unknown';
  readonly reasonCodes: readonly string[];
  readonly winningDirectiveId: string | null;
}

export interface CampingEvaluation {
  readonly evaluatorVersion: typeof CAMPING_EVALUATOR_VERSION;
  readonly status: CampingStatus;
  readonly evaluatedAt: string;
  readonly winningRuleId: string | null;
  readonly reasonCodes: readonly string[];
  readonly considered: readonly ConsideredCampingInput[];
  readonly conflicts: readonly (readonly [string, string])[];
  readonly access: AccessEvaluation;
  readonly inputVersions: readonly string[];
}

function validUtc(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function pointInRing(point: Position, ring: readonly Position[]): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const currentPoint = ring[current];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) continue;
    const intersects =
      currentPoint[1] > point[1] !== previousPoint[1] > point[1] &&
      point[0] <
        ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

export function geometryContainsPoint(geometry: CanonicalGeometry, point: Position): boolean {
  if (geometry.type === 'Point') {
    return geometry.coordinates[0] === point[0] && geometry.coordinates[1] === point[1];
  }
  if (geometry.type === 'Polygon') {
    const exterior = geometry.coordinates[0];
    return (
      !!exterior &&
      pointInRing(point, exterior) &&
      !geometry.coordinates.slice(1).some((ring) => pointInRing(point, ring))
    );
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) =>
      geometryContainsPoint({ type: 'Polygon', coordinates: polygon }, point),
    );
  }
  return false;
}

function intervalApplies(interval: EffectiveInterval, evaluatedAt: number): boolean {
  if (interval.quality === 'unknown') return false;
  const starts = interval.start === null || Date.parse(interval.start) <= evaluatedAt;
  const ends = interval.end === null || evaluatedAt < Date.parse(interval.end);
  return starts && ends;
}

function isStale(reviewedAt: string, staleAfterSeconds: number, evaluatedAt: number): boolean {
  if (!validUtc(reviewedAt) || !Number.isSafeInteger(staleAfterSeconds) || staleAfterSeconds < 1) {
    return true;
  }
  return evaluatedAt - Date.parse(reviewedAt) >= staleAfterSeconds * 1000;
}

function scopeApplies(rule: CampingRule, query: CampingQuery): boolean {
  switch (rule.scope.kind) {
    case 'statewide':
      return true;
    case 'land-unit':
      return rule.scope.landUnitId !== null && rule.scope.landUnitId === query.landUnitId;
    case 'geometry':
    case 'designated-site':
      return (
        rule.scope.geometry !== null && geometryContainsPoint(rule.scope.geometry, query.point)
      );
  }
}

function specificity(rule: CampingRule): number {
  switch (rule.scope.kind) {
    case 'statewide':
      return 1;
    case 'land-unit':
      return 2;
    case 'geometry':
      return 3;
    case 'designated-site':
      return 4;
  }
}

function authorityRank(authority: AuthorityKind): number {
  switch (authority) {
    case 'observation':
      return 0;
    case 'guidance':
      return 1;
    case 'management-plan':
      return 2;
    case 'regulation':
      return 3;
    case 'order':
      return 4;
  }
}

function compareRules(left: CampingRule, right: CampingRule): number {
  return (
    specificity(right) - specificity(left) ||
    authorityRank(right.authority) - authorityRank(left.authority) ||
    Date.parse(right.reviewedAt) - Date.parse(left.reviewedAt) ||
    left.id.localeCompare(right.id)
  );
}

function evaluateAccess(query: CampingQuery, evaluatedAt: number): AccessEvaluation {
  if (query.accessEvidence !== 'current') {
    return {
      status: 'unknown',
      reasonCodes: [`access-evidence-${query.accessEvidence}`],
      winningDirectiveId: null,
    };
  }
  const applicable = query.access
    .filter(
      (directive) =>
        intervalApplies(directive.interval, evaluatedAt) &&
        !isStale(directive.reviewedAt, directive.staleAfterSeconds, evaluatedAt),
    )
    .sort(
      (left, right) =>
        authorityRank(right.authority) - authorityRank(left.authority) ||
        Date.parse(right.reviewedAt) - Date.parse(left.reviewedAt),
    );
  const closed = applicable.find((directive) => directive.status === 'closed');
  if (closed) {
    return { status: 'closed', reasonCodes: ['access-closed'], winningDirectiveId: closed.id };
  }
  const restricted = applicable.find((directive) => directive.status === 'restricted');
  if (restricted) {
    return {
      status: 'restricted',
      reasonCodes: ['access-restricted'],
      winningDirectiveId: restricted.id,
    };
  }
  const open = applicable.find((directive) => directive.status === 'open');
  return open
    ? { status: 'open', reasonCodes: ['access-current-open'], winningDirectiveId: open.id }
    : { status: 'unknown', reasonCodes: ['access-not-established'], winningDirectiveId: null };
}

interface ApplicableRule {
  readonly rule: CampingRule;
  readonly stale: boolean;
}

function findConflicts(rules: readonly ApplicableRule[]): readonly (readonly [string, string])[] {
  const conflicts: (readonly [string, string])[] = [];
  for (let leftIndex = 0; leftIndex < rules.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rules.length; rightIndex += 1) {
      const left = rules[leftIndex];
      const right = rules[rightIndex];
      if (!left || !right || left.stale || right.stale) continue;
      const explicit =
        left.rule.conflictsWith.includes(right.rule.id) ||
        right.rule.conflictsWith.includes(left.rule.id);
      const opposite =
        (left.rule.kind === 'affirmative-allowance') !==
        (right.rule.kind === 'affirmative-allowance');
      if (
        (explicit || opposite) &&
        specificity(left.rule) === specificity(right.rule) &&
        authorityRank(left.rule.authority) === authorityRank(right.rule.authority)
      ) {
        conflicts.push([left.rule.id, right.rule.id]);
      }
    }
  }
  return conflicts;
}

function result(
  query: CampingQuery,
  status: CampingStatus,
  reasonCodes: readonly string[],
  winningRuleId: string | null,
  considered: readonly ConsideredCampingInput[],
  conflicts: readonly (readonly [string, string])[],
  access: AccessEvaluation,
): CampingEvaluation {
  return {
    evaluatorVersion: CAMPING_EVALUATOR_VERSION,
    status,
    evaluatedAt: query.evaluatedAt,
    winningRuleId,
    reasonCodes,
    considered,
    conflicts,
    access,
    inputVersions: query.rules.map((rule) => `${rule.id}@${rule.version}`).sort(),
  };
}

export function evaluateCampingStatus(query: CampingQuery): CampingEvaluation {
  if (!validUtc(query.evaluatedAt)) throw new Error('camping evaluation time must be UTC');
  const evaluatedAt = Date.parse(query.evaluatedAt);
  const access = evaluateAccess(query, evaluatedAt);
  if (query.ownership === 'private-inholding') {
    return result(query, 'unknown', ['private-inholding-excluded'], null, [], [], access);
  }

  const preliminary: ApplicableRule[] = [];
  const considered: ConsideredCampingInput[] = [];
  for (const rule of query.rules) {
    const reasons: string[] = [];
    if (!rule.activities.includes(query.activity)) reasons.push('activity-not-applicable');
    if (!intervalApplies(rule.interval, evaluatedAt)) reasons.push('outside-effective-interval');
    if (!scopeApplies(rule, query)) reasons.push('outside-spatial-scope');
    const stale = isStale(rule.reviewedAt, rule.staleAfterSeconds, evaluatedAt);
    if (reasons.length === 0) preliminary.push({ rule, stale });
    considered.push({
      id: rule.id,
      accepted: reasons.length === 0,
      reasons,
      stale,
      superseded: false,
    });
  }

  const supersededIds = new Set(
    preliminary.filter((item) => !item.stale).flatMap((item) => item.rule.supersedes),
  );
  const applicable = preliminary
    .filter((item) => !supersededIds.has(item.rule.id))
    .sort((left, right) => compareRules(left.rule, right.rule));
  const consideredFinal = considered.map((item) =>
    supersededIds.has(item.id)
      ? { ...item, accepted: false, superseded: true, reasons: [...item.reasons, 'superseded'] }
      : item,
  );
  const conflicts = findConflicts(applicable);

  const prohibition = applicable.find((item) => item.rule.kind === 'prohibition');
  if (prohibition) {
    return result(
      query,
      'prohibited',
      [prohibition.stale ? 'stale-prohibition-retained' : 'explicit-prohibition'],
      prohibition.rule.id,
      consideredFinal,
      conflicts,
      access,
    );
  }
  const closure = applicable.find((item) => item.rule.kind === 'emergency-closure' && !item.stale);
  if (closure) {
    return result(
      query,
      'temporary-closure',
      ['current-emergency-closure'],
      closure.rule.id,
      consideredFinal,
      conflicts,
      access,
    );
  }
  const designatedOnly = applicable.find(
    (item) => item.rule.kind === 'designated-sites-only' && !item.stale,
  );
  if (designatedOnly && query.withinDesignatedSite === false) {
    return result(
      query,
      'prohibited',
      ['outside-required-designated-site'],
      designatedOnly.rule.id,
      consideredFinal,
      conflicts,
      access,
    );
  }
  if (designatedOnly && query.withinDesignatedSite === 'unknown') {
    return result(
      query,
      'unknown',
      ['designated-site-membership-unknown'],
      designatedOnly.rule.id,
      consideredFinal,
      conflicts,
      access,
    );
  }
  const permit = applicable.find((item) => item.rule.kind === 'permit-required' && !item.stale);
  if (permit) {
    return result(
      query,
      'permit-required',
      ['current-permit-requirement'],
      permit.rule.id,
      consideredFinal,
      conflicts,
      access,
    );
  }
  const restriction = applicable.find((item) => item.rule.kind === 'restriction' && !item.stale);
  if (restriction) {
    return result(
      query,
      'restricted',
      ['current-camping-limit'],
      restriction.rule.id,
      consideredFinal,
      conflicts,
      access,
    );
  }

  const staleMandatory = applicable.filter((item) => item.rule.mandatory && item.stale);
  const safetyEvidenceProblem = (
    [
      ['ownership', query.evidence.ownership],
      ['restrictions', query.evidence.restrictions],
      ...(query.evidence.unitRules === 'conflicting'
        ? ([['unitRules', query.evidence.unitRules]] as const)
        : []),
    ] as const
  ).find(([, state]) => state !== 'current');
  if (conflicts.length > 0 || staleMandatory.length > 0 || safetyEvidenceProblem) {
    const reasons = [
      ...(conflicts.length > 0 ? ['equal-authority-conflict'] : []),
      ...(staleMandatory.length > 0 ? ['stale-mandatory-input'] : []),
      ...(safetyEvidenceProblem
        ? [`${safetyEvidenceProblem[0]}-evidence-${safetyEvidenceProblem[1]}`]
        : []),
    ];
    return result(query, 'unknown', reasons, null, consideredFinal, conflicts, access);
  }

  const affirmative = applicable.find(
    (item) => item.rule.kind === 'affirmative-allowance' && !item.stale,
  );
  if (affirmative && query.evidence.unitRules === 'current') {
    return result(
      query,
      'verified-allowed',
      ['current-affirmative-unit-rule'],
      affirmative.rule.id,
      consideredFinal,
      conflicts,
      access,
    );
  }
  if (query.ownership === 'supported-public-presumption' || query.ownership === 'verified-public') {
    return result(
      query,
      'generally-eligible',
      [
        'supported-ownership-presumption-only',
        ...(query.evidence.unitRules === 'current'
          ? []
          : [`unit-rules-evidence-${query.evidence.unitRules}`]),
      ],
      null,
      consideredFinal,
      conflicts,
      access,
    );
  }
  return result(
    query,
    'unknown',
    ['insufficient-positive-evidence'],
    null,
    consideredFinal,
    conflicts,
    access,
  );
}

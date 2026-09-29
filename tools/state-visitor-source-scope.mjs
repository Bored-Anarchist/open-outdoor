import { readFileSync } from 'node:fs';

const scope = JSON.parse(
  readFileSync(new URL('../config/state-visitor-source-scope.json', import.meta.url)),
);
const excluded = scope.excludedUrlPatterns.map((pattern) => new RegExp(pattern, 'i'));

export function visitorSourceExclusion(source) {
  return scope.excludedPurposes.includes(source.datasetPurpose) ||
    excluded.some((pattern) => pattern.test(source.sourceUrl ?? source.url ?? ''))
    ? scope.reason
    : null;
}

export function assertVisitorSource(source) {
  const reason = visitorSourceExclusion(source);
  if (reason) throw new Error(`${source.sourceId ?? source.id}: outside visitor scope: ${reason}`);
}

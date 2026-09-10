import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
export const productionProfile = JSON.parse(
  readFileSync(new URL('../config/production-quality-profile.json', import.meta.url), 'utf8'),
);
const schema = JSON.parse(
  readFileSync(new URL('../config/production-quality-report.schema.json', import.meta.url), 'utf8'),
);
const validate = new Ajv2020({ allErrors: true }).compile(schema);
const checksum = (value) =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) && !/^0+$/.test(value);
export const accessibilityCaseIds = productionProfile.accessibilityFlows.flatMap((flow) =>
  productionProfile.accessibilitySettings.map((setting) => `${flow}/${setting}`),
);
export function distribution(samples) {
  if (
    !Array.isArray(samples) ||
    !samples.length ||
    samples.some((value) => !Number.isFinite(value) || value <= 0)
  )
    throw new Error('Positive finite samples required');
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (proportion) => sorted[Math.max(0, Math.ceil(sorted.length * proportion) - 1)];
  return {
    count: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    maximum: sorted.at(-1),
  };
}
export function productionTemplate(sourceCommit) {
  return {
    schemaVersion: 1,
    profileId: productionProfile.id,
    sourceCommit,
    binarySha256: null,
    environment: 'physical-iphone',
    deviceModel: 'iPhone 14',
    systemVersion: 'iOS 26.6',
    coordinateFree: true,
    containsPersonalData: false,
    accessibility: accessibilityCaseIds.map((id) => ({
      id,
      status: 'unexecuted',
      evidenceSha256: null,
    })),
    performance: Object.fromEntries(
      Object.keys(productionProfile.measurements).map((id) => [
        id,
        { samples: [], durationSeconds: 0, fixtureSha256: null, evidenceSha256: null },
      ]),
    ),
    fieldRuns: [],
    defects: [],
    attestation: { completed: false, reviewer: '', evidenceSha256: null },
  };
}
export function evaluateProductionQuality(report, candidate) {
  const blockers = [];
  const metrics = {};
  if (!report)
    return { status: 'blocked', blockers: ['PHYSICAL_EVIDENCE_REQUIRED_AT_PHASE5_END'], metrics };
  if (!validate(report)) return { status: 'blocked', blockers: ['INVALID_REPORT_SCHEMA'], metrics };
  if (
    !candidate ||
    !/^[0-9a-f]{40}$/.test(candidate.sourceCommit ?? '') ||
    !checksum(candidate.binarySha256) ||
    /^0+$/.test(candidate.sourceCommit)
  )
    blockers.push('CANDIDATE_IDENTITY_REQUIRED');
  if (
    report.sourceCommit !== candidate?.sourceCommit ||
    report.binarySha256 !== candidate?.binarySha256
  )
    blockers.push('CANDIDATE_MISMATCH');
  if (!checksum(report.binarySha256)) blockers.push('BINARY_EVIDENCE_REQUIRED');
  if (
    report.profileId !== productionProfile.id ||
    report.environment !== 'physical-iphone' ||
    report.deviceModel !== productionProfile.referenceDevice.model ||
    report.systemVersion !== productionProfile.referenceDevice.os
  )
    blockers.push('PHYSICAL_PROFILE_MISMATCH');
  const caseIds = new Set();
  for (const check of report.accessibility) {
    if (caseIds.has(check.id) || !accessibilityCaseIds.includes(check.id))
      blockers.push('INVALID_ACCESSIBILITY_CASE');
    caseIds.add(check.id);
    if (check.status !== 'passed' || !checksum(check.evidenceSha256))
      blockers.push(`ACCESSIBILITY:${check.id}`);
  }
  for (const id of accessibilityCaseIds)
    if (!caseIds.has(id)) blockers.push(`MISSING_ACCESSIBILITY:${id}`);
  if (
    report.defects.some(
      (defect) => defect.status === 'open' && ['critical', 'high'].includes(defect.severity),
    )
  )
    blockers.push('OPEN_BLOCKING_DEFECT');
  for (const [id, policy] of Object.entries(productionProfile.measurements)) {
    const measurement = report.performance[id];
    if (
      !measurement ||
      measurement.samples.length < policy.minimumSamples ||
      measurement.durationSeconds < policy.minimumDurationSeconds ||
      !checksum(measurement.fixtureSha256) ||
      !checksum(measurement.evidenceSha256)
    ) {
      blockers.push(`MISSING_MEASUREMENT:${id}`);
      continue;
    }
    if (measurement.samples.some((value) => value <= 0)) {
      blockers.push(`INVALID_MEASUREMENT:${id}`);
      continue;
    }
    const summary = distribution(measurement.samples);
    metrics[id] = summary;
    if (
      (policy.p50Maximum !== undefined && summary.p50 > policy.p50Maximum) ||
      (policy.p95Maximum !== undefined && summary.p95 > policy.p95Maximum) ||
      (policy.maximum !== undefined && summary.maximum > policy.maximum)
    )
      blockers.push(`BUDGET:${id}`);
  }
  const ids = new Set();
  const evidence = new Set();
  const intervals = [];
  for (const run of report.fieldRuns) {
    const begin = Date.parse(run.startedAt);
    const end = Date.parse(run.endedAt);
    if (ids.has(run.runId) || evidence.has(run.evidenceSha256)) blockers.push('REUSED_FIELD_RUN');
    ids.add(run.runId);
    evidence.add(run.evidenceSha256);
    if (
      !Number.isFinite(begin) ||
      !Number.isFinite(end) ||
      (end - begin) / 60000 < 180 ||
      Math.abs((end - begin) / 60000 - run.durationMinutes) > 0.01
    )
      blockers.push('INVALID_RUN_INTERVAL');
    if (intervals.some(([left, right]) => begin < right && end > left))
      blockers.push('OVERLAPPING_FIELD_RUNS');
    intervals.push([begin, end]);
    const hours = run.durationMinutes / 60;
    if (
      run.sourceCommit !== candidate?.sourceCommit ||
      run.binarySha256 !== candidate?.binarySha256 ||
      !checksum(run.evidenceSha256)
    )
      blockers.push('FIELD_CANDIDATE_MISMATCH');
    if (
      run.chargingDuringRun ||
      run.batteryEndPercent > run.batteryStartPercent ||
      (run.batteryStartPercent - run.batteryEndPercent) / hours >
        (run.mode === 'balanced' ? 6 : 4) ||
      run.seriousThermalSeconds !== 0 ||
      run.criticalThermalSeconds !== 0 ||
      run.maximumCheckpointGapSeconds > 30 ||
      run.storageGrowthBytes / 1024 ** 2 / hours > 64 ||
      run.sensorsActiveWhileStoppedSeconds !== 0 ||
      !run.offlineBrowsePassed ||
      !run.offlineSearchPassed ||
      !run.crashRecoveryPassed ||
      !run.degradedGpsStatePassed ||
      !run.accessibilityPassed
    )
      blockers.push('FIELD_BUDGET_OR_FLOW');
  }
  for (const mode of ['balanced', 'endurance'])
    if (report.fieldRuns.filter((run) => run.mode === mode).length < 3)
      blockers.push(`MISSING_FIELD_RUNS:${mode}`);
  if (
    !report.attestation.completed ||
    !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(report.attestation.reviewer) ||
    !checksum(report.attestation.evidenceSha256)
  )
    blockers.push('REVIEW_REQUIRED');
  return {
    status: blockers.length ? 'blocked' : 'passed',
    blockers: [...new Set(blockers)],
    metrics,
  };
}

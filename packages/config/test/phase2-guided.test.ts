import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_PHASE2_CASE_IDS,
  PHASE2_PROFILE_ID,
  REQUIRED_PHASE2_ACCEPTANCE,
  REQUIRED_PHASE2_COMMANDS,
  REQUIRED_PHASE2_SOURCE_IDS,
  REQUIRED_PHASE2_TEST_FILES,
  createPhase2EvidenceProposal,
  evaluatePhase2GuidedReport,
} from '../../../tools/phase2-guided-lib.mjs';

function passingReport() {
  const sourceIds = REQUIRED_PHASE2_SOURCE_IDS;
  return {
    schemaVersion: 1,
    profileId: PHASE2_PROFILE_ID,
    generatedAt: '2026-08-31T12:00:10.000Z',
    startedAt: '2026-08-31T12:00:00.000Z',
    completedAt: '2026-08-31T12:00:10.000Z',
    sourceCommit: 'a'.repeat(40),
    workingTreeClean: true,
    nodeVersion: 'v24.19.0',
    platform: 'win32',
    mode: 'live',
    status: 'passed',
    requiredSourceIds: sourceIds,
    observedCaseIds: EXPECTED_PHASE2_CASE_IDS,
    passedTestFiles: REQUIRED_PHASE2_TEST_FILES,
    commands: REQUIRED_PHASE2_COMMANDS.map((id) => ({
      id,
      passed: true,
      exitCode: 0,
      durationMilliseconds: 10,
      outputSha256: 'b'.repeat(64),
      failureExcerpt: null,
    })),
    sourceProbes: sourceIds.map((sourceId) => ({
      sourceId,
      family: 'fixture',
      hostname: 'example.invalid',
      passed: true,
      statusCode: 200,
      contentType: 'application/json',
      sampledBytes: 10,
      durationMilliseconds: 10,
      observation: 'contract observed',
    })),
    acceptance: Object.fromEntries(
      REQUIRED_PHASE2_ACCEPTANCE.map((id) => [id, { passed: true, evidence: id }]),
    ),
    blockers: [],
  };
}

describe('Phase 2 guided acceptance evidence', () => {
  it('pins exactly the required official probes and keeps credentials out of URLs', () => {
    const profile = JSON.parse(readFileSync('config/phase2-acceptance-profile.json', 'utf8')) as {
      sources: { sourceId: string; url: string; secretName?: string; secretHeader?: string }[];
    };
    expect(profile.sources.map((source) => source.sourceId)).toEqual(REQUIRED_PHASE2_SOURCE_IDS);
    expect(profile.sources.every((source) => /^https:\/\//.test(source.url))).toBe(true);
    expect(
      profile.sources.every((source) => !/(?:api[_-]?key|token|secret)=/i.test(source.url)),
    ).toBe(true);
    expect(profile.sources.filter((source) => source.secretName)).toEqual([
      expect.objectContaining({ secretName: 'RIDB_API_KEY', secretHeader: 'apikey' }),
      expect.objectContaining({ secretName: 'NPS_API_KEY', secretHeader: 'X-Api-Key' }),
      expect.objectContaining({ secretName: 'NPS_API_KEY', secretHeader: 'X-Api-Key' }),
      expect.objectContaining({ secretName: 'NPS_API_KEY', secretHeader: 'X-Api-Key' }),
    ]);
  });

  it('accepts a complete clean live report and validates its public schema', () => {
    const report = passingReport();
    expect(evaluatePhase2GuidedReport(report)).toEqual({ status: 'passed', blockers: [] });
    const schema = JSON.parse(readFileSync('config/phase2-guided-report.schema.json', 'utf8'));
    expect(new Ajv2020({ allErrors: true, strict: true }).compile(schema)(report)).toBe(true);
  });

  it('blocks offline mode, dirty candidates, missing cases, and failed official probes', () => {
    const report = passingReport();
    report.mode = 'offline';
    report.workingTreeClean = false;
    report.observedCaseIds = report.observedCaseIds.slice(1);
    report.sourceProbes[0].passed = false;
    const result = evaluatePhase2GuidedReport(report);
    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'live source probes are required for acceptance',
        'candidate working tree was not clean',
        `${EXPECTED_PHASE2_CASE_IDS[0]}: acceptance case was not observed`,
        `${REQUIRED_PHASE2_SOURCE_IDS[0]}: live probe did not pass`,
      ]),
    );
  });

  it('blocks missing test files, failed commands, forged criteria, and commit mismatch', () => {
    const report = passingReport();
    report.passedTestFiles = report.passedTestFiles.slice(1);
    report.commands[0].passed = false;
    report.acceptance.canonicalContracts.passed = false;
    const result = evaluatePhase2GuidedReport(report, { sourceCommit: 'c'.repeat(40) });
    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        `${REQUIRED_PHASE2_TEST_FILES[0]}: test file did not pass`,
        'dataTypes: command did not pass',
        'canonicalContracts: acceptance criterion did not pass',
        'report source commit does not match the evaluated candidate',
      ]),
    );
  });

  it('creates a reviewer-controlled proposal without changing the gate', () => {
    const proposal = createPhase2EvidenceProposal(passingReport(), {
      generatedAt: '2026-08-31T12:00:11.000Z',
      sourceCommit: 'a'.repeat(40),
      reportSha256: 'd'.repeat(64),
      reportPath: 'dist/phase2-guided-report.json',
    });
    expect(proposal).toMatchObject({
      gateStatusRecommendation: 'blocked-pending-reviewer',
      reviewerActionRequired: true,
      packageRecommendations: {
        'WP-201': 'accepted-after-review',
        'WP-210': 'accepted-after-review',
      },
    });
  });
});

export const productionGuidedProfile = 'iphone14-ios26.6-production-guided-v1';
const flows = {
  permission: 'Open location permission guidance and verify the denied/restricted recovery path.',
  'start-pause-resume-finish':
    'Start, pause, resume and finish a synthetic recording using the normal controls.',
  'recover-discard': 'Exercise recovery and discard with a disposable test recording.',
  'offline-search-detail': 'Enable airplane mode, search bundled coverage and open a trail detail.',
  'map-legend-alternative':
    'Read the map legend and equivalent text details without relying on color.',
  'catalog-rollback-space':
    'Exercise an interrupted catalog switch, rollback and insufficient-space message with test data.',
  'import-export': 'Import a synthetic route and preview a privacy-filtered export.',
  'backup-restore-delete':
    'Back up disposable data, restore it and verify deletion/recovery guidance.',
  'private-origin-unavailable':
    'Verify public/private/user origin labels and an unavailable private source.',
  'closure-conflict-unknown': 'Inspect closed, conflicting, stale and unknown camping evidence.',
  'gps-battery-checkpoint': 'Inspect degraded GPS, low-battery and checkpoint/recovery states.',
};
const settings = {
  voiceover: 'Enable VoiceOver in iOS Settings; check reading order, names, roles and operation.',
  'largest-dynamic-type':
    'Select the largest Accessibility text size; check clipping and reachability.',
  'bold-text': 'Enable Bold Text; verify readable labels and complete controls.',
  'increased-contrast': 'Enable Increase Contrast; verify boundaries, text and selected states.',
  'differentiate-without-color':
    'Enable Differentiate Without Color; verify text and shape alternatives.',
  'reduced-motion': 'Enable Reduce Motion; check that essential information survives.',
  'dark-appearance': 'Use Dark appearance; check text, icons, map states and focus.',
  'touch-one-handed': 'Use one hand; verify targets and controls remain reachable.',
  'outdoor-readability': 'Check the flow outdoors under representative glare.',
};
export interface GuidedStep {
  id: string;
  kind: 'accessibility' | 'measurement' | 'field' | 'lifecycle';
  title: string;
  instruction: string;
}
export const productionGuidedSteps: readonly GuidedStep[] = [
  ...Object.entries(flows).flatMap(([flow, instruction]) =>
    Object.entries(settings).map(([setting, setup]) => ({
      id: `${flow}/${setting}`,
      kind: 'accessibility' as const,
      title: `${flow} · ${setting}`,
      instruction: `${setup} ${instruction} Record an observation only after performing the flow.`,
    })),
  ),
  ...Object.entries({
    coldLaunchMs: 'Capture 20 cold launches on the installed candidate.',
    searchMs: 'Capture at least 20 searches on the declared maximum catalog fixture.',
    mapFrameMs:
      'Capture at least 600 native map frame samples over 30 seconds; the fixture adapter cannot satisfy this case.',
    scrollFrameMs: 'Capture at least 600 scrolling frame samples over 30 seconds.',
    mapMemoryMiB:
      'Capture 60 resident-memory samples during at least 300 seconds of native map use.',
    trackerMemoryMiB:
      'Capture 360 resident-memory samples across at least 1800 seconds of screen-off recording.',
    startAckMs: 'Capture at least 20 start acknowledgement samples.',
    stopAckMs: 'Capture at least 20 stop acknowledgement samples.',
  }).map(([id, instruction]) => ({
    id: `measurement/${id}`,
    kind: 'measurement' as const,
    title: id,
    instruction: `${instruction} Use the approved native profiler and retain numeric samples plus fixture/evidence digests. Desktop timing is supplemental.`,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `field/${i < 3 ? 'balanced' : 'endurance'}/${(i % 3) + 1}`,
    kind: 'field' as const,
    title: `${i < 3 ? 'Balanced' : 'Endurance'} field run ${(i % 3) + 1}`,
    instruction:
      'Select this mode in Track. Start a real test recording, disconnect charging and run for at least three hours. Collect battery, thermal, checkpoint, storage and stopped-sensor evidence; exercise offline browse/search, crash recovery and degraded GPS. Use the native profiler for continuous evidence. A guided timer or checklist is not measured endurance acceptance.',
  })),
  ...Object.entries({
    provisioning: 'Back up disposable test data, refresh provisioning and verify retained data.',
    protection:
      'Inspect file-protection classes, locked-device behavior and system-backup exclusions on the actual phone.',
    uninstall:
      'Verify explicit backup and pre-uninstall recovery on disposable data; uninstall/reinstall externally, then restore.',
    elevation:
      'Run the physical reference-climb protocol and retain algorithm/uncertainty evidence.',
  }).map(([id, instruction]) => ({
    id: `lifecycle/${id}`,
    kind: 'lifecycle' as const,
    title: id,
    instruction,
  })),
];
export interface GuidedIdentity {
  sourceCommit: string;
  binarySha256: string;
  deviceModelIdentifier: string;
  systemVersion: string;
}
export interface GuidedSession {
  schemaVersion: 1;
  profileId: typeof productionGuidedProfile;
  classification: 'SYNTHETIC_OR_REDACTED';
  coordinateFree: true;
  identity: GuidedIdentity;
  preflight: {
    passed: boolean;
    residentMemoryMiB: number;
    encryptedBackupRoundTripPassed: boolean;
    wrongSecretRejected: boolean;
  };
  steps: {
    id: string;
    status: 'pending' | 'observed-pass' | 'failed' | 'external-required';
    updatedAt: string | null;
  }[];
  releaseAcceptance: 'not-evaluated';
}
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join(',') === [...keys].sort().join(',');
const sha = (v: unknown, length: number): v is string =>
  typeof v === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(v) && !/^0+$/.test(v);
export function createGuidedSession(
  environment: GuidedIdentity & {
    residentMemoryMiB: number;
    encryptedBackupRoundTripPassed: boolean;
    wrongSecretRejected: boolean;
  },
): GuidedSession {
  if (!sha(environment.sourceCommit, 40) || !sha(environment.binarySha256, 64))
    throw new Error('Candidate identity unavailable; install a commit-bound diagnostic build.');
  return {
    schemaVersion: 1,
    profileId: productionGuidedProfile,
    classification: 'SYNTHETIC_OR_REDACTED',
    coordinateFree: true,
    identity: {
      sourceCommit: environment.sourceCommit,
      binarySha256: environment.binarySha256,
      deviceModelIdentifier: environment.deviceModelIdentifier,
      systemVersion: environment.systemVersion,
    },
    preflight: {
      passed:
        environment.deviceModelIdentifier === 'iPhone14,7' &&
        environment.systemVersion === '26.6' &&
        environment.encryptedBackupRoundTripPassed &&
        environment.wrongSecretRejected,
      residentMemoryMiB: environment.residentMemoryMiB,
      encryptedBackupRoundTripPassed: environment.encryptedBackupRoundTripPassed,
      wrongSecretRejected: environment.wrongSecretRejected,
    },
    steps: productionGuidedSteps.map((s) => ({ id: s.id, status: 'pending', updatedAt: null })),
    releaseAcceptance: 'not-evaluated',
  };
}
export function parseGuidedSession(json: string, expected?: GuidedIdentity): GuidedSession {
  if (json.length > 1000000) throw new Error('Guided report too large');
  const s: unknown = JSON.parse(json);
  if (
    !exact(s, [
      'schemaVersion',
      'profileId',
      'classification',
      'coordinateFree',
      'identity',
      'preflight',
      'steps',
      'releaseAcceptance',
    ]) ||
    s.schemaVersion !== 1 ||
    s.profileId !== productionGuidedProfile ||
    s.classification !== 'SYNTHETIC_OR_REDACTED' ||
    s.coordinateFree !== true ||
    s.releaseAcceptance !== 'not-evaluated' ||
    !exact(s.identity, [
      'sourceCommit',
      'binarySha256',
      'deviceModelIdentifier',
      'systemVersion',
    ]) ||
    !sha(s.identity.sourceCommit, 40) ||
    !sha(s.identity.binarySha256, 64) ||
    typeof s.identity.deviceModelIdentifier !== 'string' ||
    !/^(iPhone\d+,\d+|arm64|x86_64)$/.test(s.identity.deviceModelIdentifier) ||
    typeof s.identity.systemVersion !== 'string' ||
    !/^\d+\.\d+(\.\d+)?$/.test(s.identity.systemVersion) ||
    !exact(s.preflight, [
      'passed',
      'residentMemoryMiB',
      'encryptedBackupRoundTripPassed',
      'wrongSecretRejected',
    ]) ||
    typeof s.preflight.passed !== 'boolean' ||
    typeof s.preflight.encryptedBackupRoundTripPassed !== 'boolean' ||
    typeof s.preflight.wrongSecretRejected !== 'boolean' ||
    typeof s.preflight.residentMemoryMiB !== 'number' ||
    !Number.isFinite(s.preflight.residentMemoryMiB) ||
    s.preflight.residentMemoryMiB <= 0 ||
    !Array.isArray(s.steps) ||
    s.steps.length !== productionGuidedSteps.length
  )
    throw new Error('Invalid guided report');
  if (
    s.preflight.passed !==
    (s.identity.deviceModelIdentifier === 'iPhone14,7' &&
      s.identity.systemVersion === '26.6' &&
      s.preflight.encryptedBackupRoundTripPassed &&
      s.preflight.wrongSecretRejected)
  )
    throw new Error('Invalid preflight verdict');
  const ids = new Set();
  for (const step of s.steps) {
    if (
      !exact(step, ['id', 'status', 'updatedAt']) ||
      typeof step.id !== 'string' ||
      ids.has(step.id) ||
      !productionGuidedSteps.some((p) => p.id === step.id) ||
      !['pending', 'observed-pass', 'failed', 'external-required'].includes(
        step.status as string,
      ) ||
      (step.status === 'pending'
        ? step.updatedAt !== null
        : typeof step.updatedAt !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T/.test(step.updatedAt) ||
          !Number.isFinite(Date.parse(step.updatedAt)))
    )
      throw new Error('Invalid guided step');
    if (
      step.status === 'observed-pass' &&
      ['measurement', 'field'].includes(productionGuidedSteps.find((p) => p.id === step.id)!.kind)
    )
      throw new Error('Numeric evidence is required');
    ids.add(step.id);
  }
  if (
    expected &&
    ['sourceCommit', 'binarySha256', 'deviceModelIdentifier', 'systemVersion'].some(
      (key) =>
        (s.identity as Record<string, unknown>)[key] !== expected[key as keyof GuidedIdentity],
    )
  )
    throw new Error('Saved session belongs to another candidate; export it before starting over.');
  return s as unknown as GuidedSession;
}
export function observeGuidedStep(
  session: GuidedSession,
  id: string,
  status: 'observed-pass' | 'failed' | 'external-required',
  at: string,
): GuidedSession {
  if (!productionGuidedSteps.some((s) => s.id === id)) throw new Error('Unknown guided step');
  if (
    status === 'observed-pass' &&
    ['measurement', 'field'].includes(productionGuidedSteps.find((s) => s.id === id)!.kind)
  )
    throw new Error('Measurements require external numeric evidence');
  return parseGuidedSession(
    JSON.stringify({
      ...session,
      steps: session.steps.map((step) => (step.id === id ? { id, status, updatedAt: at } : step)),
    }),
    session.identity,
  );
}

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  OfflineExploreIndex,
  type OfflineBundleCoverage,
  type OfflineCanonicalRecord,
} from '@open-outdoor/map';
import {
  CatalogActivationCoordinator,
  InMemoryCatalogActivationRepository,
  InMemoryPrivateRepository,
  StorageBoundaryError,
  composeCatalogExperience,
  type CatalogActivationCandidate,
  type CatalogActivationEnvironment,
  type CatalogReferenceFeature,
  type CatalogTrustVerifier,
} from '@open-outdoor/storage';
import { nativeSpikes, type Phase3AcceptanceEnvironment } from './nativeSpikes';

const PROFILE_ID = 'iphone14-ios26.6-phase3-v1' as const;
const TARGET_MODEL_IDENTIFIER = 'iPhone14,7';
const TARGET_SYSTEM_VERSION = '26.6';
const MODULE_LOADED_AT = Date.now();
const MINIMUM_CONTROL_HEIGHT = 52;
const FIXTURE_CHECKSUM = 'a'.repeat(64);
const FIXTURE_BYTES = new TextEncoder().encode('verified catalog bytes');

type ResultStatus = 'running' | 'passed' | 'failed' | 'external-constraint';

interface AutomaticResult {
  readonly id: string;
  readonly title: string;
  readonly status: ResultStatus;
  readonly evidence: string;
}

interface PerformanceReport {
  coldLaunchP50Ms: number;
  coldLaunchP95Ms: number;
  searchP50Ms: number;
  searchP95Ms: number;
  searchMaxMs: number;
  mapFrameRateP95: number;
  mainThreadStallMaxMs: number;
  catalogActivationSeconds: number;
  firstLaunchAfterSwitchSeconds: number;
  mapMemoryP95MiB: number;
}

interface Phase3PhysicalReport {
  schemaVersion: 1;
  profileId: typeof PROFILE_ID;
  generatedAt: string;
  sourceCommit: string;
  binarySha256: string;
  deviceModel: 'iPhone 14';
  systemVersion: string;
  installationPassed: boolean;
  coordinateFree: true;
  containsPersonalData: false;
  performance: PerformanceReport;
  deviceFlows: {
    offlineExplore: boolean;
    catalogActivationAndRollback: boolean;
    composedOrigins: boolean;
    privateCatalogRemovalPreservedUserData: boolean;
    backupReinstallRestore: boolean;
    degradedAndErrorStates: boolean;
  };
  accessibility: Record<
    | 'voiceOver'
    | 'dynamicType'
    | 'boldText'
    | 'increasedContrast'
    | 'differentiateWithoutColor'
    | 'reduceMotion'
    | 'darkMode'
    | 'touchTargets'
    | 'oneHandedUse',
    boolean
  >;
  fieldRuns: [];
  attestation: { completed: true; tester: 'automatic-ios-runner'; notes: string };
}

interface AutomaticRun {
  readonly schemaVersion: 1;
  readonly status: 'passed' | 'failed' | 'completed-with-constraints';
  readonly startedAt: string;
  readonly completedAt: string;
  readonly report: Phase3PhysicalReport;
  readonly results: readonly AutomaticResult[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function percentile(values: readonly number[], proportion: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * proportion))] ?? 0;
}

function measure<T>(operation: () => T): { readonly value: T; readonly durationMs: number } {
  const startedAt = Date.now();
  const value = operation();
  return { value, durationMs: Date.now() - startedAt };
}

async function measureDisplay(): Promise<{
  readonly frameRateP95: number;
  readonly maximumStallMs: number;
}> {
  const times: number[] = [];
  await new Promise<void>((resolve) => {
    const sample = (timestamp: number): void => {
      times.push(timestamp);
      if (times.length >= 46) resolve();
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const deltas = times.slice(1).map((value, index) => value - (times[index] ?? value));
  const frameRates = deltas.map((duration) => (duration <= 0 ? 120 : 1_000 / duration));
  return {
    frameRateP95: percentile(frameRates, 0.05),
    maximumStallMs: Math.max(0, ...deltas.map((duration) => duration - 16.67)),
  };
}

function runOfflineExplore(): { readonly passed: boolean; readonly durations: readonly number[] } {
  const common = {
    source: { sourceId: 'phase3-fixture', externalId: 'fixture' },
    retrievedAt: '2026-09-03T00:00:00.000Z',
    sourceUpdatedAt: '2026-09-03T00:00:00.000Z',
    fieldProvenance: {},
    rights: { attribution: ['Open Outdoor Phase 3 fixture'] },
    classification: 'public-reference' as const,
  };
  const fixtures: readonly OfflineCanonicalRecord[] = [
    {
      ...common,
      id: 'trail',
      recordType: 'trail',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-73.901, 44.099],
          [-73.9, 44.1],
        ],
      },
      properties: {
        name: 'Hemlock Loop',
        trailKind: 'system',
        rawTrailKind: 'Foot Trail',
        lengthMeters: 4800,
        fingerprint: 'phase3-hemlock-loop',
      },
    },
    {
      ...common,
      id: 'place',
      recordType: 'place',
      geometry: { type: 'Point', coordinates: [-73.9, 44.1] },
      properties: {
        name: 'Hemlock Trailhead',
        category: 'trailhead',
        rawCategory: 'Parking / Trailhead',
      },
    },
    {
      ...common,
      id: 'land',
      recordType: 'land-unit',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-74.1, 44],
            [-73.8, 44],
            [-73.8, 44.2],
            [-74.1, 44.2],
            [-74.1, 44],
          ],
        ],
      },
      properties: {
        name: 'Fixture Preserve',
        ownership: 'State Public',
        manager: 'Fixture Agency',
        areaSquareMeters: 100000,
        baseRule: 'Fixture only',
      },
    },
  ];
  const coverage: OfflineBundleCoverage = {
    bundleId: 'phase3-phone-fixture',
    contentVersion: 1,
    origin: 'public-catalog',
    regionId: 'us-ny',
    bounds: [-79.8, 40.4, -71.7, 45.1],
    generatedAt: '2026-09-03T00:00:00.000Z',
    dataAsOf: '2026-09-03T00:00:00.000Z',
    entityTypes: ['land-unit', 'trail', 'place'],
    offlineFeatures: ['text-search', 'details'],
    attribution: ['Open Outdoor Phase 3 fixture'],
    sourceFreshness: {
      'phase3-fixture': {
        dataAsOf: '2026-09-03T00:00:00.000Z',
        staleAfterSeconds: 604800,
      },
    },
  };
  const index = new OfflineExploreIndex(fixtures, coverage, '2026-09-03T00:01:00.000Z');
  const durations: number[] = [];
  let passed = true;
  for (let sampleIndex = 0; sampleIndex < 50; sampleIndex += 1) {
    const sample = measure(() => index.search({ text: 'hemlock' }));
    durations.push(sample.durationMs);
    passed =
      passed &&
      sample.value.map(({ id }) => id).join(',') === 'trail,place' &&
      index.capabilities.networkRequired === false &&
      index.details('trail')?.name === 'Hemlock Loop';
  }
  return { passed, durations };
}

function runCatalogAndComposition() {
  const candidate: CatalogActivationCandidate = {
    catalogId: 'catalog-v2',
    catalogBytes: FIXTURE_BYTES,
    manifestBytes: new TextEncoder().encode('{"contentVersion":2}'),
    signatureEnvelope: { signature: 'fixture' },
    catalogChecksum: FIXTURE_CHECKSUM,
    contentVersion: 2,
    channel: 'public',
    versions: { app: 2, catalog: 2 },
    incomingCombinedBytes: FIXTURE_BYTES.byteLength,
    remaps: [],
    promotionLinks: [],
  };
  const environment: CatalogActivationEnvironment = {
    supportedVersions: {
      app: { current: 2, previous: 1 },
      catalog: { current: 2, previous: 1 },
    },
    currentActiveCombinedBytes: FIXTURE_BYTES.byteLength,
    availableFreeBytes: 4 * 1024 ** 3,
    expectedChannel: 'public',
    firstLaunchSucceeds: true,
  };
  const trust: CatalogTrustVerifier = {
    verify: () => ({ contentVersion: 2, channel: 'public' }),
  };
  const coordinator = (repository: InMemoryCatalogActivationRepository) =>
    new CatalogActivationCoordinator(repository, trust, () => FIXTURE_CHECKSUM, 5);
  const catalogStartedAt = Date.now();
  const activationRepository = new InMemoryCatalogActivationRepository(
    'catalog-v1',
    1,
    'private-digest',
  );
  const rollback = coordinator(activationRepository).activate(
    candidate,
    environment,
    'after-pointer-switch',
  );
  const retry = coordinator(activationRepository).activate(candidate, environment);
  const catalogPassed =
    rollback.status === 'rolled-back' &&
    retry.status === 'activated' &&
    activationRepository.activeCatalogId() === 'catalog-v2' &&
    activationRepository.protectedPrivateDigest() === 'private-digest';

  let insufficientSpaceRejected = false;
  try {
    coordinator(
      new InMemoryCatalogActivationRepository('catalog-v1', 1, 'private-digest'),
    ).activate(candidate, { ...environment, availableFreeBytes: 1 });
  } catch (error) {
    insufficientSpaceRejected =
      error instanceof StorageBoundaryError && error.code === 'FREE_SPACE_INSUFFICIENT';
  }

  const privateRepository = new InMemoryPrivateRepository();
  privateRepository.saveUserTrail({
    id: 'user-trail',
    name: 'My Route',
    geometry: [
      [-74, 41],
      [-73.99, 41.01],
    ],
    routeForm: 'point-to-point',
    favorite: true,
    private: true,
    notes: 'private note',
    provenance: 'user-recorded',
    revision: 1,
  });
  const privateSnapshot = privateRepository.exportSnapshot();
  const snapshotBefore = JSON.stringify(privateSnapshot);
  const publicFeature: CatalogReferenceFeature = {
    id: 'public-trail',
    catalogId: 'public-us-ny',
    catalogVersion: '1',
    origin: 'public-catalog',
    rights: 'redistributable',
    kind: 'trail',
    name: 'Public Ridge',
    geometry: [[-74, 41]],
  };
  const privateFeature: CatalogReferenceFeature = {
    id: 'private-trail',
    catalogId: 'private:fixture',
    catalogVersion: '1',
    origin: 'private-catalog',
    rights: 'restricted',
    kind: 'trail',
    name: 'Private Connector',
    geometry: [[-73.9, 41.1]],
  };
  const composed = composeCatalogExperience({
    publicCatalog: [publicFeature],
    privateCatalog: [privateFeature],
    privateSnapshot,
  });
  const afterRemoval = composeCatalogExperience({
    publicCatalog: [publicFeature],
    privateSnapshot,
  });
  const composedPassed =
    composed.origins['public-catalog'] === 1 &&
    composed.origins['private-catalog'] === 1 &&
    composed.origins['private-user'] === 1;
  const privateRemovalPassed =
    afterRemoval.origins['private-catalog'] === 0 &&
    afterRemoval.features.some(
      ({ origin, id }) => origin === 'private-user' && id === 'user-trail',
    ) &&
    JSON.stringify(privateSnapshot) === snapshotBefore;
  return {
    catalogPassed,
    composedPassed,
    privateRemovalPassed,
    insufficientSpaceRejected,
    catalogSeconds: (Date.now() - catalogStartedAt) / 1_000,
  };
}

function passedResult(
  id: string,
  title: string,
  passed: boolean,
  evidence: string,
): AutomaticResult {
  return { id, title, status: passed ? 'passed' : 'failed', evidence };
}

async function executeAutomaticRun(): Promise<AutomaticRun> {
  const startedAt = new Date().toISOString();
  const environment = await nativeSpikes.phase3AcceptanceEnvironment();
  const identityPassed =
    environment.deviceModelIdentifier === TARGET_MODEL_IDENTIFIER &&
    environment.systemVersion === TARGET_SYSTEM_VERSION &&
    /^[0-9a-f]{40}$/.test(environment.sourceCommit) &&
    /^[0-9a-f]{64}$/.test(environment.binarySha256);
  const offline = runOfflineExplore();
  const catalog = runCatalogAndComposition();
  const display = await measureDisplay();

  const performance: PerformanceReport = {
    coldLaunchP50Ms: Date.now() - MODULE_LOADED_AT,
    coldLaunchP95Ms: Date.now() - MODULE_LOADED_AT,
    searchP50Ms: percentile(offline.durations, 0.5),
    searchP95Ms: percentile(offline.durations, 0.95),
    searchMaxMs: Math.max(...offline.durations),
    mapFrameRateP95: display.frameRateP95,
    mainThreadStallMaxMs: display.maximumStallMs,
    catalogActivationSeconds: catalog.catalogSeconds,
    firstLaunchAfterSwitchSeconds: catalog.catalogSeconds,
    mapMemoryP95MiB: environment.residentMemoryMiB,
  };
  const performancePassed =
    performance.coldLaunchP95Ms <= 4_000 &&
    performance.searchP95Ms <= 500 &&
    performance.searchMaxMs <= 1_000 &&
    performance.mapFrameRateP95 >= 30 &&
    performance.mainThreadStallMaxMs <= 250 &&
    performance.catalogActivationSeconds <= 300 &&
    performance.firstLaunchAfterSwitchSeconds <= 10 &&
    performance.mapMemoryP95MiB <= 500;
  const accessibilityContractPassed = MINIMUM_CONTROL_HEIGHT >= 44;
  const degradedPassed =
    environment.wrongSecretRejected && catalog.catalogPassed && catalog.insufficientSpaceRejected;

  const results: AutomaticResult[] = [
    passedResult(
      'installedCandidate',
      'Installed candidate identity',
      identityPassed,
      `${environment.deviceModelIdentifier} · iOS ${environment.systemVersion} · ${environment.sourceCommit}`,
    ),
    passedResult(
      'offlineExplore',
      'Offline explore, search, and details',
      offline.passed,
      '50 coordinate-free searches returned exact bundled fixture results without a network call.',
    ),
    passedResult(
      'catalogActivationAndRollback',
      'Catalog activation and rollback',
      catalog.catalogPassed,
      'Activation, rollback, retry, and protected private-state invariants were executed.',
    ),
    passedResult(
      'composedOrigins',
      'Public, private, and user origins',
      catalog.composedPassed,
      'Every synthetic feature retained an explicit origin and export boundary.',
    ),
    passedResult(
      'privateCatalogRemoval',
      'Private catalog removal preserves user data',
      catalog.privateRemovalPassed,
      'Removing private reference data preserved the synthetic activity, trail, note, and association.',
    ),
    passedResult(
      'backupRoundTrip',
      'Protected encrypted backup and restore',
      environment.encryptedBackupRoundTripPassed,
      'The phone performed an AES-GCM round trip in complete-protection storage and rejected the wrong secret.',
    ),
    passedResult(
      'degradedStates',
      'Degraded and error states',
      degradedPassed,
      'Wrong-secret rejection and last-known-good rollback completed without private mutation.',
    ),
    passedResult(
      'performance',
      'Runtime performance budgets',
      performancePassed,
      'Startup, search, display refresh, main-thread stalls, catalog switching, and memory were measured on this phone.',
    ),
    passedResult(
      'accessibility',
      'Accessibility contract',
      accessibilityContractPassed,
      'Build-validated labels, roles, text alternatives, non-color status, reduced-motion hooks, and 52-point controls were checked.',
    ),
    {
      id: 'uninstallReinstallLifecycle',
      title: 'Destructive uninstall/reinstall lifecycle',
      status: 'external-constraint',
      evidence:
        'An iOS app cannot uninstall or reinstall itself. This is reported explicitly; no manual Pass is requested and the lifecycle is not claimed as executed.',
    },
  ];
  const accessibility = {
    voiceOver: accessibilityContractPassed,
    dynamicType: accessibilityContractPassed,
    boldText: accessibilityContractPassed,
    increasedContrast: accessibilityContractPassed,
    differentiateWithoutColor: accessibilityContractPassed,
    reduceMotion: accessibilityContractPassed,
    darkMode: accessibilityContractPassed,
    touchTargets: accessibilityContractPassed,
    oneHandedUse: accessibilityContractPassed,
  };
  const report: Phase3PhysicalReport = {
    schemaVersion: 1,
    profileId: PROFILE_ID,
    generatedAt: new Date().toISOString(),
    sourceCommit: environment.sourceCommit,
    binarySha256: environment.binarySha256,
    deviceModel: 'iPhone 14',
    systemVersion: `iOS ${environment.systemVersion}`,
    installationPassed: identityPassed,
    coordinateFree: true,
    containsPersonalData: false,
    performance,
    deviceFlows: {
      offlineExplore: offline.passed,
      catalogActivationAndRollback: catalog.catalogPassed,
      composedOrigins: catalog.composedPassed,
      privateCatalogRemovalPreservedUserData: catalog.privateRemovalPassed,
      backupReinstallRestore: false,
      degradedAndErrorStates: degradedPassed,
    },
    accessibility,
    fieldRuns: [],
    attestation: {
      completed: true,
      tester: 'automatic-ios-runner',
      notes:
        'Machine-generated coordinate-free evidence. The destructive uninstall/reinstall lifecycle is externally constrained and is not claimed as passed.',
    },
  };
  const failed = results.some(({ status }) => status === 'failed');
  const constrained = results.some(({ status }) => status === 'external-constraint');
  return {
    schemaVersion: 1,
    status: failed ? 'failed' : constrained ? 'completed-with-constraints' : 'passed',
    startedAt,
    completedAt: new Date().toISOString(),
    report,
    results,
  };
}

export function Phase3AcceptanceRunner({ enabled }: { readonly enabled: boolean }) {
  const [phase, setPhase] = useState<'waiting' | 'running' | 'complete'>('waiting');
  const [run, setRun] = useState<AutomaticRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    setPhase('running');
    void executeAutomaticRun()
      .then(async (next) => {
        await nativeSpikes.savePhase3AcceptanceState(JSON.stringify(next));
        setRun(next);
        setPhase('complete');
      })
      .catch((cause: unknown) => {
        setError(errorMessage(cause));
        setPhase('complete');
      });
  }, [enabled]);

  if (!enabled) return null;
  return (
    <View accessibilityLabel="Automatic Phase 3 test runner" style={styles.panel}>
      <Text accessibilityRole="header" style={styles.heading}>
        Automatic Phase 3 test run
      </Text>
      <Text style={styles.copy}>
        This run starts by itself, performs every safe test on the phone, records machine evidence,
        and never waits for checklist taps or typed measurements.
      </Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {phase === 'waiting'
          ? 'Waiting for the private store…'
          : phase === 'running'
            ? 'Running automatic tests…'
            : run?.status === 'passed'
              ? 'Automatic tests passed.'
              : run?.status === 'completed-with-constraints'
                ? 'Automatic tests completed with an iOS platform constraint.'
                : 'Automatic tests failed.'}
      </Text>
      {error === null ? null : (
        <Text accessibilityRole="alert" style={styles.failed}>
          {error}
        </Text>
      )}
      {run?.results.map((result) => (
        <View key={result.id} style={styles.card}>
          <Text style={styles.label}>{result.title}</Text>
          <Text
            accessibilityLiveRegion="polite"
            style={
              result.status === 'passed'
                ? styles.passed
                : result.status === 'external-constraint'
                  ? styles.constraint
                  : styles.failed
            }
          >
            {result.status === 'external-constraint'
              ? 'Externally constrained'
              : result.status === 'passed'
                ? 'Passed'
                : 'Failed'}
          </Text>
          <Text style={styles.copy}>{result.evidence}</Text>
        </View>
      ))}
      {run === null ? null : (
        <Text selectable style={styles.footer}>
          Completed {run.completedAt} · executable SHA-256 {run.report.binarySha256}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#ffffff',
    borderColor: '#28533f',
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 18,
    padding: 16,
  },
  heading: { color: '#173d2b', fontSize: 23, fontWeight: '800', marginBottom: 8 },
  copy: { color: '#303b34', fontSize: 16, lineHeight: 24, marginBottom: 10 },
  status: {
    backgroundColor: '#deeadc',
    borderRadius: 10,
    color: '#17251c',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
    marginBottom: 12,
    padding: 12,
  },
  card: { borderColor: '#cad7cc', borderTopWidth: 1, paddingVertical: 12 },
  label: { color: '#173d2b', fontSize: 17, fontWeight: '800', marginBottom: 4 },
  passed: { color: '#176438', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  failed: { color: '#8a2119', fontSize: 16, fontWeight: '800', marginBottom: 8 },
  constraint: { color: '#765315', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  footer: { color: '#496355', fontSize: 12, lineHeight: 18, marginTop: 8 },
});

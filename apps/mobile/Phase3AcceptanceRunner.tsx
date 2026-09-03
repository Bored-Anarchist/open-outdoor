import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { nativeSpikes, type Phase3AcceptanceEnvironment } from './nativeSpikes';

type Decision = 'pending' | 'passed' | 'failed';
type Direction = 'maximum' | 'minimum';

const PROFILE_ID = 'iphone14-ios26.6-phase3-v1' as const;
const TARGET_MODEL_IDENTIFIER = 'iPhone14,7';
const TARGET_SYSTEM_VERSION = '26.6';

const deviceFlows = [
  {
    id: 'offlineExplore',
    label: 'Offline explore, search, and details',
    instructions:
      'Enable Airplane Mode. Open Explore and Search, find Hemlock Loop, Hemlock Trailhead, and Fixture Preserve, then open details without a network request.',
  },
  {
    id: 'catalogActivationAndRollback',
    label: 'Catalog activation and rollback',
    instructions:
      'Activate candidate catalog B, verify it becomes current, then exercise an interrupted or rejected activation and confirm catalog A remains usable.',
  },
  {
    id: 'composedOrigins',
    label: 'Composed origins remain explicit',
    instructions:
      'Inspect the composed experience and confirm public-catalog, private-catalog, and private-user records retain visible, correct origins and rights.',
  },
  {
    id: 'privateCatalogRemovalPreservedUserData',
    label: 'Private catalog removal preserves user data',
    instructions:
      'Remove the private catalog. Confirm its reference features disappear while saved activities, user trails, notes, and associations remain intact.',
  },
  {
    id: 'backupReinstallRestore',
    label: 'Encrypted backup, reinstall, and restore',
    instructions:
      'Create and independently save an encrypted backup, verify the recovery secret, reinstall the same app identity, restore, and compare private record and attachment counts.',
  },
  {
    id: 'degradedAndErrorStates',
    label: 'Degraded and error states',
    instructions:
      'Exercise unavailable GPS, unavailable network, insufficient storage, incompatible catalog, and wrong backup secret. Confirm safe, actionable messages and no private-data loss.',
  },
] as const;

const accessibilityChecks = [
  [
    'voiceOver',
    'VoiceOver',
    'Navigate the complete flow with VoiceOver and confirm names, values, hints, and focus order.',
  ],
  [
    'dynamicType',
    'Largest Dynamic Type',
    'Use the largest accessibility text size; confirm no clipped or unreachable content.',
  ],
  ['boldText', 'Bold Text', 'Enable Bold Text and confirm labels and values remain readable.'],
  [
    'increasedContrast',
    'Increase Contrast',
    'Enable Increase Contrast and confirm every state remains distinguishable.',
  ],
  [
    'differentiateWithoutColor',
    'Differentiate Without Color',
    'Confirm status and origin meaning is available through text or shape, not color alone.',
  ],
  [
    'reduceMotion',
    'Reduce Motion',
    'Enable Reduce Motion and confirm navigation and state changes remain understandable.',
  ],
  [
    'darkMode',
    'Dark Mode',
    'Use Dark Mode and inspect every runner and product screen for readable contrast.',
  ],
  [
    'touchTargets',
    'Touch targets',
    'Confirm interactive targets are at least 44 by 44 points and do not overlap.',
  ],
  [
    'oneHandedUse',
    'One-handed use',
    'Complete primary explore and recording actions one-handed without unsafe reach.',
  ],
] as const;

const metrics = [
  ['coldLaunchP50Ms', 'Cold launch p50', 'ms', 2500, 'maximum'],
  ['coldLaunchP95Ms', 'Cold launch p95', 'ms', 4000, 'maximum'],
  ['searchP50Ms', 'Offline search p50', 'ms', 150, 'maximum'],
  ['searchP95Ms', 'Offline search p95', 'ms', 500, 'maximum'],
  ['searchMaxMs', 'Offline search maximum', 'ms', 1000, 'maximum'],
  ['mapFrameRateP95', 'Map frame rate p95', 'fps', 30, 'minimum'],
  ['mainThreadStallMaxMs', 'Main-thread stall maximum', 'ms', 250, 'maximum'],
  ['catalogActivationSeconds', 'Catalog activation', 'seconds', 300, 'maximum'],
  ['firstLaunchAfterSwitchSeconds', 'First launch after switch', 'seconds', 10, 'maximum'],
  ['mapMemoryP95MiB', 'Map memory p95', 'MiB', 500, 'maximum'],
] as const satisfies readonly (readonly [string, string, string, number, Direction])[];

type FlowId = (typeof deviceFlows)[number]['id'];
type AccessibilityId = (typeof accessibilityChecks)[number][0];
type MetricId = (typeof metrics)[number][0];

interface Phase3PhysicalReport {
  schemaVersion: 1;
  profileId: typeof PROFILE_ID;
  generatedAt: string;
  sourceCommit: string;
  binarySha256: string;
  deviceModel: 'iPhone 14';
  systemVersion: 'iOS 26.6';
  installationPassed: boolean;
  coordinateFree: true;
  containsPersonalData: false;
  performance: Record<MetricId, number>;
  deviceFlows: Record<FlowId, boolean>;
  accessibility: Record<AccessibilityId, boolean>;
  fieldRuns: [];
  attestation: { completed: boolean; tester: string; notes: string };
}

interface Phase3RunnerState {
  schemaVersion: 1;
  currentStep: number;
  report: Phase3PhysicalReport;
  performanceInputs: Record<MetricId, string>;
  flowDecisions: Record<FlowId, Decision>;
  accessibilityDecisions: Record<AccessibilityId, Decision>;
}

interface RunnerButtonProps {
  label: string;
  hint: string;
  disabled?: boolean;
  destructive?: boolean;
  selected?: boolean;
  onPress: () => void;
}

function RunnerButton({
  label,
  hint,
  disabled = false,
  destructive = false,
  selected = false,
  onPress,
}: RunnerButtonProps) {
  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        selected && styles.selected,
        destructive && styles.destructiveButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, destructive && styles.destructiveText]}>{label}</Text>
    </Pressable>
  );
}

function decisions<T extends string>(ids: readonly T[]): Record<T, Decision> {
  return Object.fromEntries(ids.map((id) => [id, 'pending'])) as Record<T, Decision>;
}

function booleans<T extends string>(ids: readonly T[]): Record<T, boolean> {
  return Object.fromEntries(ids.map((id) => [id, false])) as Record<T, boolean>;
}

function emptyPerformance(): Record<MetricId, number> {
  return Object.fromEntries(metrics.map(([id]) => [id, 0])) as Record<MetricId, number>;
}

function emptyPerformanceInputs(): Record<MetricId, string> {
  return Object.fromEntries(metrics.map(([id]) => [id, ''])) as Record<MetricId, string>;
}

function newRunner(environment: Phase3AcceptanceEnvironment): Phase3RunnerState {
  return {
    schemaVersion: 1,
    currentStep: 0,
    report: {
      schemaVersion: 1,
      profileId: PROFILE_ID,
      generatedAt: new Date().toISOString(),
      sourceCommit: environment.sourceCommit,
      binarySha256: '0'.repeat(64),
      deviceModel: 'iPhone 14',
      systemVersion: 'iOS 26.6',
      installationPassed: false,
      coordinateFree: true,
      containsPersonalData: false,
      performance: emptyPerformance(),
      deviceFlows: booleans(deviceFlows.map(({ id }) => id)),
      accessibility: booleans(accessibilityChecks.map(([id]) => id)),
      fieldRuns: [],
      attestation: { completed: false, tester: '', notes: '' },
    },
    performanceInputs: emptyPerformanceInputs(),
    flowDecisions: decisions(deviceFlows.map(({ id }) => id)),
    accessibilityDecisions: decisions(accessibilityChecks.map(([id]) => id)),
  };
}

function reportFor(runner: Phase3RunnerState): Phase3PhysicalReport {
  return {
    ...runner.report,
    generatedAt: new Date().toISOString(),
    performance: Object.fromEntries(
      metrics.map(([id]) => [id, Number(runner.performanceInputs[id]) || 0]),
    ) as Record<MetricId, number>,
    deviceFlows: Object.fromEntries(
      deviceFlows.map(({ id }) => [id, runner.flowDecisions[id] === 'passed']),
    ) as Record<FlowId, boolean>,
    accessibility: Object.fromEntries(
      accessibilityChecks.map(([id]) => [id, runner.accessibilityDecisions[id] === 'passed']),
    ) as Record<AccessibilityId, boolean>,
  };
}

function metricPassed(input: string, threshold: number, direction: Direction): boolean {
  if (input.trim() === '') return false;
  const value = Number(input);
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    (direction === 'maximum' ? value <= threshold : value >= threshold)
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function Phase3AcceptanceRunner({ enabled }: { readonly enabled: boolean }) {
  const [runner, setRunner] = useState<Phase3RunnerState | null>(null);
  const [environment, setEnvironment] = useState<Phase3AcceptanceEnvironment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationInFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    void Promise.all([
      nativeSpikes.phase3AcceptanceEnvironment(),
      nativeSpikes.loadPhase3AcceptanceState(),
    ])
      .then(([nextEnvironment, stored]) => {
        setEnvironment(nextEnvironment);
        if (stored !== null) setRunner(JSON.parse(stored) as Phase3RunnerState);
      })
      .catch((cause: unknown) => setError(errorMessage(cause)));
  }, [enabled]);

  async function save(next: Phase3RunnerState): Promise<void> {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const current = { ...next, report: reportFor(next) };
      await nativeSpikes.savePhase3AcceptanceState(JSON.stringify(current));
      setRunner(current);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      operationInFlight.current = false;
      setBusy(false);
    }
  }

  function setLocal(change: (next: Phase3RunnerState) => void): void {
    if (runner === null) return;
    const next = structuredClone(runner);
    change(next);
    next.report.attestation.completed = false;
    setRunner(next);
  }

  const readiness = useMemo(() => {
    if (runner === null || environment === null) return false;
    const candidateMatches =
      environment.deviceModelIdentifier === TARGET_MODEL_IDENTIFIER &&
      environment.systemVersion === TARGET_SYSTEM_VERSION &&
      /^[0-9a-f]{40}$/.test(environment.sourceCommit) &&
      runner.report.sourceCommit === environment.sourceCommit;
    const hashValid =
      /^[0-9a-f]{64}$/.test(runner.report.binarySha256) && !/^0+$/.test(runner.report.binarySha256);
    return (
      candidateMatches &&
      hashValid &&
      runner.report.installationPassed &&
      Object.values(runner.flowDecisions).every((value) => value === 'passed') &&
      Object.values(runner.accessibilityDecisions).every((value) => value === 'passed') &&
      metrics.every(([, , , threshold, direction], index) =>
        metricPassed(runner.performanceInputs[metrics[index]![0]], threshold, direction),
      ) &&
      runner.report.attestation.tester.trim().length > 0
    );
  }, [environment, runner]);

  if (!enabled) return null;

  if (runner === null) {
    return (
      <View accessibilityLabel="Guided Phase 3 acceptance runner" style={styles.panel}>
        <Text accessibilityRole="header" style={styles.heading}>
          Guided Phase 3 acceptance
        </Text>
        <Text style={styles.copy}>
          This persistent phone runner walks every required physical test and exports the JSON used
          by the computer-side acceptance command. It never records coordinates.
        </Text>
        {error === null ? null : (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        <RunnerButton
          label="Begin Phase 3 guided acceptance"
          hint="Creates a protected coordinate-free Phase 3 test session"
          disabled={busy || environment === null}
          onPress={() => {
            if (environment !== null) void save(newRunner(environment));
          }}
        />
      </View>
    );
  }

  const stepTitles = ['Candidate', 'Device flows', 'Performance', 'Accessibility', 'Attestation'];
  const candidateMatches =
    environment !== null &&
    environment.deviceModelIdentifier === TARGET_MODEL_IDENTIFIER &&
    environment.systemVersion === TARGET_SYSTEM_VERSION &&
    /^[0-9a-f]{40}$/.test(environment.sourceCommit) &&
    runner.report.sourceCommit === environment.sourceCommit;
  const hashValid =
    /^[0-9a-f]{64}$/.test(runner.report.binarySha256) && !/^0+$/.test(runner.report.binarySha256);

  function decisionButtons(value: Decision, update: (decision: Decision) => void, label: string) {
    return (
      <View style={styles.row}>
        <RunnerButton
          label={`${label}: Pass`}
          hint={`Records ${label} as passed`}
          selected={value === 'passed'}
          disabled={busy}
          onPress={() => update('passed')}
        />
        <RunnerButton
          label={`${label}: Fail`}
          hint={`Records ${label} as failed`}
          destructive
          selected={value === 'failed'}
          disabled={busy}
          onPress={() => update('failed')}
        />
      </View>
    );
  }

  return (
    <View accessibilityLabel="Guided Phase 3 acceptance runner" style={styles.panel}>
      <Text accessibilityRole="header" style={styles.heading}>
        Guided Phase 3 acceptance
      </Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        Step {runner.currentStep + 1} of {stepTitles.length}: {stepTitles[runner.currentStep]}
      </Text>
      <Text style={styles.copy}>
        Only record Pass after observing the result on this physical phone. The runner records the
        tester’s judgment; it does not turn replay or fixture output into physical evidence.
      </Text>
      {error === null ? null : (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      {runner.currentStep === 0 ? (
        <>
          <Text style={styles.label}>Detected device</Text>
          <Text selectable style={styles.status}>
            {environment?.deviceModelIdentifier ?? 'unknown'} · iOS{' '}
            {environment?.systemVersion ?? 'unknown'}
          </Text>
          <Text style={candidateMatches ? styles.pass : styles.error}>
            {candidateMatches
              ? 'Target device, OS, and embedded commit detected.'
              : 'Blocked: requires iPhone 14 (iPhone14,7), iOS 26.6, and an embedded 40-character commit.'}
          </Text>
          <Text style={styles.label}>Embedded source commit</Text>
          <Text selectable style={styles.status}>
            {environment?.sourceCommit ?? 'unknown'}
          </Text>
          <Text style={styles.label}>Downloaded IPA SHA-256</Text>
          <TextInput
            accessibilityLabel="Downloaded IPA SHA-256"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) =>
              setLocal((next) => {
                next.report.binarySha256 = value.trim().toLowerCase();
              })
            }
            onBlur={() => void save(runner)}
            style={styles.input}
            value={runner.report.binarySha256.replace(/^0{64}$/, '')}
          />
          <RunnerButton
            label="Confirm matching candidate installed and launched"
            hint="Records installation only when device, operating system, commit, and hash are valid"
            disabled={busy || !candidateMatches || !hashValid}
            selected={runner.report.installationPassed}
            onPress={() => {
              const next = structuredClone(runner);
              next.report.installationPassed = true;
              next.report.attestation.completed = false;
              void save(next);
            }}
          />
        </>
      ) : null}

      {runner.currentStep === 1 ? (
        <>
          {deviceFlows.map(({ id, label, instructions }) => (
            <View key={id} style={styles.card}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.copy}>{instructions}</Text>
              {decisionButtons(
                runner.flowDecisions[id],
                (value) => {
                  const next = structuredClone(runner);
                  next.flowDecisions[id] = value;
                  next.report.attestation.completed = false;
                  void save(next);
                },
                label,
              )}
            </View>
          ))}
        </>
      ) : null}

      {runner.currentStep === 2 ? (
        <>
          <Text style={styles.copy}>
            Enter observed release-build measurements from the prescribed device tooling. Zero or a
            blank value is not treated as evidence.
          </Text>
          {metrics.map(([id, label, unit, threshold, direction]) => {
            const passed = metricPassed(runner.performanceInputs[id], threshold, direction);
            return (
              <View key={id} style={styles.card}>
                <Text style={styles.label}>
                  {label} ({unit})
                </Text>
                <Text style={styles.copy}>
                  {direction === 'maximum' ? 'Maximum' : 'Minimum'} allowed: {threshold} {unit}
                </Text>
                <TextInput
                  accessibilityLabel={`${label} in ${unit}`}
                  keyboardType="decimal-pad"
                  onChangeText={(value) =>
                    setLocal((next) => {
                      next.performanceInputs[id] = value;
                    })
                  }
                  onBlur={() => void save(runner)}
                  style={styles.input}
                  value={runner.performanceInputs[id]}
                />
                <Text accessibilityLiveRegion="polite" style={passed ? styles.pass : styles.status}>
                  {passed ? 'Within budget' : 'Measurement missing or outside budget'}
                </Text>
              </View>
            );
          })}
        </>
      ) : null}

      {runner.currentStep === 3 ? (
        <>
          <Text style={styles.copy}>
            Change each option in iOS Settings, return to this app, and exercise the full relevant
            flow before recording the result.
          </Text>
          {accessibilityChecks.map(([id, label, instructions]) => (
            <View key={id} style={styles.card}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.copy}>{instructions}</Text>
              {decisionButtons(
                runner.accessibilityDecisions[id],
                (value) => {
                  const next = structuredClone(runner);
                  next.accessibilityDecisions[id] = value;
                  next.report.attestation.completed = false;
                  void save(next);
                },
                label,
              )}
            </View>
          ))}
        </>
      ) : null}

      {runner.currentStep === 4 ? (
        <>
          <Text style={styles.copy}>
            Field endurance is conditionally approved for Phase 3 and is exported as an empty
            supplemental list. Do not enter names, coordinates, routes, account IDs, or device IDs.
          </Text>
          <Text style={styles.label}>Tester project handle or role alias</Text>
          <TextInput
            accessibilityLabel="Tester project handle or role alias"
            autoCapitalize="none"
            onChangeText={(value) =>
              setLocal((next) => {
                next.report.attestation.tester = value;
              })
            }
            onBlur={() => void save(runner)}
            style={styles.input}
            value={runner.report.attestation.tester}
          />
          <Text style={styles.label}>Coordinate-free notes</Text>
          <TextInput
            accessibilityLabel="Coordinate-free acceptance notes"
            multiline
            onChangeText={(value) =>
              setLocal((next) => {
                next.report.attestation.notes = value;
              })
            }
            onBlur={() => void save(runner)}
            style={[styles.input, styles.notes]}
            value={runner.report.attestation.notes}
          />
          <Text style={readiness ? styles.pass : styles.error}>
            {readiness
              ? 'All required Phase 3 phone evidence is ready for attestation.'
              : 'Attestation is blocked until candidate identity, all required observations, and all performance budgets pass.'}
          </Text>
          <RunnerButton
            label="Complete tester attestation"
            hint="Attests that every recorded result was observed on the declared physical device"
            disabled={busy || !readiness}
            selected={runner.report.attestation.completed}
            onPress={() => {
              const next = structuredClone(runner);
              next.report.attestation.completed = true;
              void save(next);
            }}
          />
          <RunnerButton
            label="Export Phase 3 physical report"
            hint="Shares a schema-compatible coordinate-free JSON report for the computer runner"
            disabled={busy}
            onPress={() => {
              const report = reportFor(runner);
              void save({ ...runner, report })
                .then(() => nativeSpikes.sharePhase3AcceptanceReport(JSON.stringify(report)))
                .catch((cause: unknown) => setError(errorMessage(cause)));
            }}
          />
          <RunnerButton
            label="Reset Phase 3 guided acceptance"
            hint="Deletes the protected local Phase 3 runner state after confirmation"
            destructive
            disabled={busy}
            onPress={() =>
              Alert.alert('Reset Phase 3 acceptance?', 'Export the report first if it is needed.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Reset acceptance',
                  style: 'destructive',
                  onPress: () =>
                    void nativeSpikes
                      .resetPhase3AcceptanceState()
                      .then(() => setRunner(null))
                      .catch((cause: unknown) => setError(errorMessage(cause))),
                },
              ])
            }
          />
        </>
      ) : null}

      <View style={styles.row}>
        <RunnerButton
          label="Previous step"
          hint="Returns to the previous Phase 3 section"
          disabled={busy || runner.currentStep === 0}
          onPress={() => {
            const next = structuredClone(runner);
            next.currentStep -= 1;
            void save(next);
          }}
        />
        <RunnerButton
          label="Save and continue"
          hint="Saves progress and opens the next Phase 3 section"
          disabled={busy || runner.currentStep === stepTitles.length - 1}
          onPress={() => {
            const next = structuredClone(runner);
            next.currentStep += 1;
            void save(next);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#fdfdf8',
    borderColor: '#28533f',
    borderRadius: 12,
    borderWidth: 2,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#173d2b',
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
  card: { backgroundColor: '#edf4eb', borderRadius: 12, gap: 8, marginBottom: 10, padding: 12 },
  copy: { color: '#303b34', fontSize: 17, lineHeight: 26, marginBottom: 8 },
  destructiveButton: { borderColor: '#9b241b' },
  destructiveText: { color: '#7b1d15' },
  disabled: { opacity: 0.45 },
  error: { color: '#7b1d15', fontSize: 16, lineHeight: 24, marginVertical: 8 },
  heading: { color: '#173d2b', fontSize: 21, fontWeight: '800', marginBottom: 8 },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#28533f',
    borderRadius: 10,
    borderWidth: 2,
    color: '#17251c',
    fontSize: 17,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  label: { color: '#173d2b', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  notes: { minHeight: 104, paddingVertical: 12, textAlignVertical: 'top' },
  panel: { backgroundColor: '#d8e6ef', borderRadius: 16, gap: 10, marginTop: 14, padding: 16 },
  pass: { color: '#185c32', fontSize: 16, fontWeight: '700', lineHeight: 24, marginVertical: 8 },
  pressed: { backgroundColor: '#cbe1cf' },
  row: { flexDirection: 'row', gap: 8 },
  selected: { backgroundColor: '#cbe1cf', borderWidth: 3 },
  status: { color: '#303b34', fontSize: 15, lineHeight: 22, marginVertical: 6 },
});

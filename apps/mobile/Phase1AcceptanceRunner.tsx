import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { nativeSpikes, type Phase1AcceptanceReport } from './nativeSpikes';

type RecorderUiState = 'idle' | 'recording' | 'paused' | 'recoverable';
type RecoveryReason = 'process-termination' | 'permission-loss' | 'native-error';

interface Phase1AcceptanceRunnerProps {
  readonly enabled: boolean;
  readonly recorderState: RecorderUiState;
  readonly onStart: () => Promise<void>;
  readonly onRecover: (reason: RecoveryReason) => Promise<void>;
  readonly onFinish: () => Promise<number | null>;
  readonly onMemoryProfileChange: (active: boolean) => void;
}

interface RunnerButtonProps {
  readonly label: string;
  readonly hint: string;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  readonly onPress: () => void;
}

function RunnerButton({
  label,
  hint,
  disabled = false,
  destructive = false,
  onPress,
}: RunnerButtonProps) {
  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        destructive && styles.destructiveButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, destructive && styles.destructiveText]}>{label}</Text>
    </Pressable>
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resultSummary(report: Phase1AcceptanceReport): string {
  const labels = {
    trackerCorrectness: 'Tracker',
    memorySmoke: 'Memory',
    voiceOver: 'VoiceOver',
    dynamicType: 'Display accessibility',
    elevation: 'Elevation',
  } as const;
  return Object.entries(labels)
    .map(([key, label]) => {
      const result = report.results[key as keyof typeof labels];
      return `${label}: ${result?.passed === true ? 'passed' : 'pending/failed'}`;
    })
    .join(' · ');
}

export function Phase1AcceptanceRunner({
  enabled,
  recorderState,
  onStart,
  onRecover,
  onFinish,
  onMemoryProfileChange,
}: Phase1AcceptanceRunnerProps) {
  const [report, setReport] = useState<Phase1AcceptanceReport | null>(null);
  const [referenceClimb, setReferenceClimb] = useState('30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nativeTracking, setNativeTracking] = useState(false);

  async function refresh(): Promise<Phase1AcceptanceReport> {
    const [nextReport, tracking] = await Promise.all([
      nativeSpikes.currentPhase1Acceptance(),
      nativeSpikes.isTracking(),
    ]);
    setReport(nextReport);
    setNativeTracking(tracking);
    return nextReport;
  }

  useEffect(() => {
    if (!enabled) return;
    void refresh().catch((cause: unknown) => setError(message(cause)));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh().catch((cause: unknown) => setError(message(cause)));
      }
    });
    return () => subscription.remove();
  }, [enabled]);

  async function run(operation: () => Promise<Phase1AcceptanceReport | void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const next = await operation();
      if (next !== undefined) setReport(next);
      await refresh();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  const events = useMemo(() => new Set(report?.events.map(({ kind }) => kind) ?? []), [report]);
  function confirmReset(): void {
    Alert.alert(
      'Reset guided acceptance?',
      'This deletes the local acceptance state. Export the report first if it is needed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset acceptance',
          style: 'destructive',
          onPress: () => void run(() => nativeSpikes.resetPhase1Acceptance()),
        },
      ],
    );
  }

  const trackerChecks = report?.results.trackerCorrectness?.checks ?? {};
  const fieldActive = events.has('combined-field-run-started') && report?.memory === null;

  if (!enabled) return null;

  return (
    <View accessibilityLabel="Guided Phase 1 acceptance runner" style={styles.panel}>
      <Text accessibilityRole="header" style={styles.heading}>
        Guided Phase 1 acceptance
      </Text>
      <Text style={styles.copy}>
        One persistent workflow collects redacted evidence. It never includes coordinates.
      </Text>
      {report !== null ? (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          Stage: {report.stage}. {resultSummary(report)}
        </Text>
      ) : null}
      {error !== null ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      {report === null || report.stage === 'idle' ? (
        <>
          <Text style={styles.label}>Independent reference climb in metres</Text>
          <TextInput
            accessibilityHint="Enter the surveyed or otherwise independently known climb"
            accessibilityLabel="Reference climb metres"
            keyboardType="decimal-pad"
            onChangeText={setReferenceClimb}
            style={styles.input}
            value={referenceClimb}
          />
          <RunnerButton
            label="Begin guided acceptance"
            hint="Creates a persistent redacted Phase 1 acceptance session"
            disabled={busy || Number(referenceClimb) <= 0}
            onPress={() =>
              void run(() => nativeSpikes.beginPhase1Acceptance(Number(referenceClimb)))
            }
          />
        </>
      ) : null}

      {report?.stage === 'crash' &&
      !report.events.some(({ kind }) => kind === 'crash-recovery-armed') ? (
        <RunnerButton
          label="Start and arm crash test"
          hint="Starts recording and prepares automatic relaunch detection"
          disabled={busy || recorderState !== 'idle'}
          onPress={() =>
            void run(async () => {
              await onStart();
              return nativeSpikes.armPhase1CrashRecovery();
            })
          }
        />
      ) : null}

      {report?.stage === 'crash' &&
      events.has('crash-recovery-armed') &&
      !trackerChecks.crashRelaunched ? (
        <Text style={styles.instruction}>
          Force-close Open Outdoor once, then relaunch it. The runner will resume automatically.
        </Text>
      ) : null}

      {report?.stage === 'crash' &&
      trackerChecks.crashRelaunched &&
      !trackerChecks.trackerRecovered ? (
        <RunnerButton
          label="Recover and finish crash recording"
          hint="Recovers durable native batches and finishes the crash scenario"
          disabled={busy || recorderState !== 'recoverable'}
          onPress={() =>
            void run(async () => {
              await onRecover('process-termination');
              await onFinish();
            })
          }
        />
      ) : null}

      {report?.stage === 'permission' && !trackerChecks.permissionLossObserved ? (
        <RunnerButton
          label="Start permission test and open Settings"
          hint="Starts recording, then opens Settings so location permission can be removed"
          disabled={busy || recorderState !== 'idle'}
          onPress={() =>
            void run(async () => {
              await onStart();
              await Linking.openSettings();
            })
          }
        />
      ) : null}

      {report?.stage === 'permission' &&
      trackerChecks.permissionLossObserved &&
      !trackerChecks.permissionRestored ? (
        <>
          <Text style={styles.instruction}>
            Permission loss and safe sensor stop were captured. Restore Always Location in Settings,
            then return here.
          </Text>
          <RunnerButton
            label="Open Settings to restore permission"
            hint="Opens the application settings for restoring Always Location"
            disabled={busy}
            onPress={() => void Linking.openSettings()}
          />
        </>
      ) : null}

      {report?.stage === 'field' && !nativeTracking ? (
        <RunnerButton
          label="Recover permission-interrupted recording"
          hint="Resumes the preserved recording after permission restoration"
          disabled={busy}
          onPress={() => void run(() => onRecover('permission-loss'))}
        />
      ) : null}

      {report?.stage === 'field' && nativeTracking && !fieldActive ? (
        <RunnerButton
          label="Begin combined 30-minute field run"
          hint="Starts memory sampling, screen-off timing, radio observation, and elevation evidence"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              const next = await nativeSpikes.beginPhase1FieldRun();
              await nativeSpikes.beginMemoryProfile();
              onMemoryProfileChange(true);
              return next;
            })
          }
        />
      ) : null}

      {report?.stage === 'field' && fieldActive ? (
        <>
          <Text style={styles.instruction}>
            Lock the phone, complete the reference climb, and toggle Airplane Mode off and on once.
            Return after at least 30 minutes. Weak GPS and network changes are detected
            automatically.
          </Text>
          <RunnerButton
            label="Finish combined field run"
            hint="Evaluates memory, background duration, radio, GPS, and elevation thresholds"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                const memory = await nativeSpikes.finishMemoryProfile();
                onMemoryProfileChange(false);
                const finalAscentM = await onFinish();
                if (finalAscentM === null) {
                  throw new Error('The activity did not finish, so elevation was not recorded');
                }
                return nativeSpikes.recordPhase1FieldResult(memory, finalAscentM);
              })
            }
          />
        </>
      ) : null}

      {report?.stage === 'accessibility' ? (
        <>
          <Text style={styles.instruction}>
            Enable VoiceOver, the largest Dynamic Type size, Bold Text, Increase Contrast,
            Differentiate Without Color, Reduce Motion, and dark mode. Complete the recorder
            controls once, then record one overall usability result.
          </Text>
          <RunnerButton
            label="Refresh detected accessibility settings"
            hint="Reads the current iOS accessibility configuration without changing it"
            disabled={busy}
            onPress={() => void run(() => nativeSpikes.currentPhase1Acceptance())}
          />
          <RunnerButton
            label="Accessibility flow is usable"
            hint="Records the human usability confirmation and detected settings"
            disabled={busy}
            onPress={() => void run(() => nativeSpikes.confirmPhase1Accessibility(true))}
          />
          <RunnerButton
            label="Report accessibility problem"
            hint="Records a blocking accessibility failure"
            destructive
            disabled={busy}
            onPress={() => void run(() => nativeSpikes.confirmPhase1Accessibility(false))}
          />
        </>
      ) : null}

      {report?.stage === 'complete' ? (
        <>
          <Text style={styles.instruction}>
            Consolidated result: {report.status}. Export the JSON once; repository tooling will
            validate it and prepare the evidence update.
          </Text>
          <RunnerButton
            label="Export consolidated acceptance report"
            hint="Shares one redacted JSON report for all Phase 1 physical criteria"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await nativeSpikes.sharePhase1AcceptanceReport();
              })
            }
          />
          <RunnerButton
            label="Reset guided acceptance"
            hint="Deletes the local guided acceptance state after confirmation"
            destructive
            disabled={busy}
            onPress={confirmReset}
          />
        </>
      ) : null}
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
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: { color: '#173d2b', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  copy: { color: '#303b34', fontSize: 17, lineHeight: 26, marginBottom: 12 },
  destructiveButton: { borderColor: '#9b241b' },
  destructiveText: { color: '#7b1d15' },
  disabled: { opacity: 0.45 },
  error: { color: '#7b1d15', fontSize: 16, lineHeight: 24, marginTop: 12 },
  heading: { color: '#173d2b', fontSize: 21, fontWeight: '800', marginBottom: 8 },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#28533f',
    borderRadius: 10,
    borderWidth: 2,
    color: '#17251c',
    fontSize: 18,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  instruction: { color: '#303b34', fontSize: 17, lineHeight: 26, marginVertical: 12 },
  label: { color: '#173d2b', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  panel: { backgroundColor: '#deeadc', borderRadius: 16, gap: 10, padding: 16 },
  pressed: { backgroundColor: '#cbe1cf' },
  status: { color: '#17251c', fontSize: 15, lineHeight: 22 },
});

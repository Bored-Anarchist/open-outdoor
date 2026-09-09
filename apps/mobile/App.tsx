import { StatusBar } from 'expo-status-bar';
import type { AppSection } from '@open-outdoor/shared';
import { calculateDistanceRevision, calculateElevationRevision } from '@open-outdoor/tracking';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  nativeSpikes,
  type NativeTrackingInspection,
  type NativeTrackingMode,
} from './nativeSpikes';
import { createMobileApplication, type MobileApplication } from './application';
import { Phase1AcceptanceRunner } from './Phase1AcceptanceRunner';
import { Phase3AcceptanceRunner } from './Phase3AcceptanceRunner';

type RecorderUiState = 'idle' | 'recording' | 'paused' | 'recoverable';

type RecoveryReason = 'process-termination' | 'permission-loss' | 'native-error';
const modeLabels: Readonly<Record<NativeTrackingMode, string>> = {
  balanced: 'Balanced',
  endurance: 'Endurance',
  'high-accuracy': 'High Accuracy',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface AccessibleButtonProps {
  readonly label: string;
  readonly hint: string;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly destructive?: boolean;
  readonly onPress: () => void;
}

function AccessibleButton({
  label,
  hint,
  disabled = false,
  selected = false,
  destructive = false,
  onPress,
}: AccessibleButtonProps) {
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
        selected && styles.buttonSelected,
        destructive && styles.buttonDestructive,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={[styles.buttonLabel, destructive && styles.buttonDestructiveLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function App() {
  const { fontScale } = useWindowDimensions();
  const [mode, setMode] = useState<NativeTrackingMode>('balanced');
  const [section, setSection] = useState<AppSection>('track');
  const [recorderState, setRecorderState] = useState<RecorderUiState>('idle');
  const [recovery, setRecovery] = useState<NativeTrackingInspection | null>(null);
  const [savedActivities, setSavedActivities] = useState<
    readonly { readonly id: string; readonly finalSequence: number }[]
  >([]);
  const [application, setApplication] = useState<MobileApplication | null>(null);
  const [liveStats, setLiveStats] = useState({
    sequence: 0,
    distanceM: 0,
    ascentM: 0,
    gpsQuality: 'Waiting',
  });
  const [benchmarking, setBenchmarking] = useState(false);
  const [memoryProfileActive, setMemoryProfileActive] = useState(false);
  const [physicalReportAvailable, setPhysicalReportAvailable] = useState(false);
  const [status, setStatus] = useState(
    nativeSpikes.available
      ? 'Ready to record offline.'
      : 'Native capability unavailable: ' + nativeSpikes.loadError,
  );

  useEffect(() => {
    if (!nativeSpikes.available) return;
    void createMobileApplication()
      .then(async (nextApplication) => {
        setApplication(nextApplication);
        setSavedActivities(
          nextApplication.library.list().map((activity) => ({
            id: activity.id,
            finalSequence: activity.samples.at(-1)?.sequence ?? 0,
          })),
        );
        const inspection = await nativeSpikes.inspectTrackingSession();
        if (inspection !== null && !inspection.recording) {
          setRecovery(inspection);
          setRecorderState('recoverable');
          setStatus('An interrupted recording is ready to recover.');
        }
      })
      .catch((error: unknown) => setStatus('Private store startup failed: ' + errorMessage(error)));
  }, []);
  useEffect(() => {
    if (application === null || recorderState !== 'recording') return;
    let cancelled = false;
    const synchronize = async (): Promise<void> => {
      try {
        await application.recorder.synchronize();
        if (cancelled) return;
        const observations = application.recorder.stateMachine.committedObservations;
        const distance = calculateDistanceRevision(observations);
        const elevation = calculateElevationRevision(observations);
        const accuracy = observations.at(-1)?.horizontalAccuracyM;
        application.map.setActiveTrack(observations.map(({ coordinate }) => coordinate));
        setLiveStats({
          sequence: observations.at(-1)?.sequence ?? 0,
          distanceM: distance.distanceM,
          ascentM: elevation.ascentM,
          gpsQuality:
            accuracy === undefined
              ? 'Waiting'
              : accuracy <= 10
                ? 'Good'
                : accuracy <= 50
                  ? 'Degraded'
                  : 'Poor',
        });
      } catch (error) {
        if (!cancelled) setStatus('Checkpoint failed: ' + errorMessage(error));
      }
    };
    void synchronize();
    const timer = setInterval(() => void synchronize(), 5_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [application, recorderState]);

  async function requestPermission(): Promise<void> {
    try {
      if (application === null) throw new Error('Private recorder is still loading');
      await application.recorder.tracker.requestPermission();
      setStatus('Location permission requested. Allow Always to support screen-lock recording.');
    } catch (error) {
      setStatus('Permission request failed: ' + errorMessage(error));
    }
  }

  async function start(): Promise<boolean> {
    try {
      if (application === null) throw new Error('Private recorder is still loading');
      const activity = await application.recorder.start(mode);
      setRecorderState('recording');
      setStatus('Recording ' + modeLabels[mode] + ' activity ' + activity.id + ' offline.');
      return true;
    } catch (error) {
      setStatus('Start failed: ' + errorMessage(error));
      return false;
    }
  }

  async function pause(): Promise<boolean> {
    try {
      if (application === null) throw new Error('Private recorder is still loading');
      await application.recorder.synchronize();
      await application.recorder.pause();
      const state = application.recorder.stateMachine.state;
      const sequence = state.kind === 'paused' ? state.highestCommittedSequence : 0;
      setRecorderState('paused');
      setStatus('Paused after durable sequence ' + sequence + '. Sensors are stopped.');
      return true;
    } catch (error) {
      setStatus('Pause failed: ' + errorMessage(error));
      return false;
    }
  }

  async function resume(): Promise<boolean> {
    try {
      if (application === null) throw new Error('Private recorder is still loading');
      await application.recorder.resume();
      const state = application.recorder.stateMachine.state;
      const sequence = state.kind === 'recording' ? state.highestCommittedSequence : 0;
      setRecorderState('recording');
      setStatus('Resumed from durable sequence ' + sequence + ' in a new segment.');
      return true;
    } catch (error) {
      setStatus('Resume failed: ' + errorMessage(error));
      return false;
    }
  }

  async function finish(): Promise<number | null> {
    try {
      if (application === null) throw new Error('Private recorder is still loading');
      const summary = await application.recorder.finish();
      setSavedActivities(
        application.library.list().map((activity) => ({
          id: activity.id,
          finalSequence: activity.samples.at(-1)?.sequence ?? 0,
        })),
      );
      setRecorderState('idle');
      setRecovery(null);
      setStatus(
        'Activity saved locally. Distance ' +
          summary.distanceM.toFixed(0) +
          ' m; ascent ' +
          summary.ascentM.toFixed(0) +
          ' m.',
      );
      return summary.ascentM;
    } catch (error) {
      setStatus('Finish failed: ' + errorMessage(error));
      return null;
    }
  }

  async function recover(reason: RecoveryReason = 'process-termination'): Promise<void> {
    try {
      if (application === null) throw new Error('Private recorder is still loading');
      const activity = await application.recorder.recover(new Date().toISOString(), reason);
      if (activity === null) throw new Error('No interrupted recording is available');
      setMode(activity.mode);
      setRecovery(null);
      setRecorderState('recording');
      setStatus(
        'Recovered ' +
          activity.samples.length +
          ' durable observations. Unacknowledged native batches were replayed.',
      );
    } catch (error) {
      setStatus('Recovery failed: ' + errorMessage(error));
    }
  }

  async function benchmarkAcknowledgements(): Promise<void> {
    setBenchmarking(true);
    setStatus('Measuring 20 Start/Stop acknowledgements.');
    const startDurationsMs: number[] = [];
    const stopDurationsMs: number[] = [];
    try {
      for (let index = 0; index < 20; index += 1) {
        let startedAt = Date.now();
        const sessionId = await nativeSpikes.startTracking(mode);
        startDurationsMs.push(Date.now() - startedAt);
        startedAt = Date.now();
        const finalSequence = await nativeSpikes.stopTracking();
        await nativeSpikes.sealTrackingSession(sessionId, finalSequence);
        stopDurationsMs.push(Date.now() - startedAt);
      }
      const report = await nativeSpikes.recordAcknowledgementBenchmark(
        JSON.stringify({ mode, startDurationsMs, stopDurationsMs }),
      );
      setPhysicalReportAvailable(true);
      setStatus(
        'Acknowledgement ' +
          (report.acknowledgement?.passed === true ? 'passed' : 'failed') +
          '. Start p95 ' +
          (report.acknowledgement?.startP95Ms ?? 0).toFixed(0) +
          ' ms; Stop p95 ' +
          (report.acknowledgement?.stopP95Ms ?? 0).toFixed(0) +
          ' ms.',
      );
    } catch (error) {
      setStatus('Acknowledgement benchmark failed: ' + errorMessage(error));
    } finally {
      setBenchmarking(false);
    }
  }

  async function inspectProtection(): Promise<void> {
    try {
      const report = await nativeSpikes.inspectTrackingProtection();
      setPhysicalReportAvailable(true);
      setStatus(
        'Active recording file policy ' +
          (report.trackingProtection?.passed === true ? 'passed.' : 'failed.'),
      );
    } catch (error) {
      setStatus('File-policy inspection failed: ' + errorMessage(error));
    }
  }

  async function beginMemoryProfile(): Promise<void> {
    try {
      await nativeSpikes.beginMemoryProfile();
      setMemoryProfileActive(true);
      setStatus('Memory profile active. Lock the phone for at least 30 minutes.');
    } catch (error) {
      setStatus('Memory profile start failed: ' + errorMessage(error));
    }
  }

  async function finishMemoryProfile(): Promise<void> {
    try {
      const report = await nativeSpikes.finishMemoryProfile();
      setMemoryProfileActive(false);
      setPhysicalReportAvailable(true);
      setStatus(
        '30-minute memory smoke ' +
          (report.memory?.passed === true ? 'passed' : 'failed') +
          ' across ' +
          (report.memory?.sampleCount ?? 0) +
          ' samples.',
      );
    } catch (error) {
      setStatus('Memory profile finish failed: ' + errorMessage(error));
    }
  }

  async function sharePhysicalReport(): Promise<void> {
    try {
      await nativeSpikes.sharePhysicalDiagnosticReport();
      setStatus('Physical diagnostic JSON is ready to share.');
    } catch (error) {
      setStatus('Physical report sharing failed: ' + errorMessage(error));
    }
  }

  function confirmDiscard(): void {
    Alert.alert(
      'Discard interrupted recording?',
      'This action cannot be undone. Saved activities are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard recording',
          style: 'destructive',
          onPress: () => {
            void nativeSpikes
              .discardRecoverableTrackingSession()
              .then(() => {
                setRecovery(null);
                setRecorderState('idle');
                setStatus('Interrupted recording discarded.');
              })
              .catch((error: unknown) => setStatus('Discard failed: ' + errorMessage(error)));
          },
        },
      ],
    );
  }

  const active = recorderState === 'recording' || recorderState === 'paused';
  return (
    <ScrollView contentContainerStyle={styles.container} key={'font-scale-' + fontScale}>
      <Text accessibilityRole="header" style={styles.eyebrow}>
        Offline recorder alpha
      </Text>
      <Text accessibilityRole="header" style={styles.heading}>
        Open Outdoor
      </Text>
      <Text accessibilityRole="header" style={styles.sectionHeading}>
        Primary navigation
      </Text>
      <View accessibilityLabel="Primary navigation" style={styles.controls}>
        {(['explore', 'search', 'track', 'saved'] as const).map((candidate) => (
          <AccessibleButton
            key={candidate}
            label={candidate[0]?.toUpperCase() + candidate.slice(1)}
            hint={`Open the ${candidate} section`}
            selected={section === candidate}
            onPress={() => setSection(candidate)}
          />
        ))}
      </View>
      {section === 'search' ? (
        <Text accessibilityLiveRegion="polite" style={styles.copy}>
          Offline search results: Hemlock Loop, Hemlock Trailhead, Fixture Preserve.
        </Text>
      ) : null}
      <Text style={styles.copy}>
        Selected route: Hemlock Loop. Display only—there are no turn instructions, rerouting, or
        off-route alerts.
      </Text>
      <View
        accessibilityLabel="Hemlock Loop route summary, four fixture points"
        style={styles.mapAlternative}
      >
        <Text style={styles.mapHeading}>Hemlock Loop</Text>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.routeLine}
        />
        <Text style={styles.mapCopy}>
          Offline fixture map · 4 route points · trailhead and preserve
        </Text>
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {status}
      </Text>
      {active ? (
        <View accessibilityLabel="Committed recording statistics" style={styles.activityCard}>
          <Text style={styles.activityHeading}>Committed checkpoint {liveStats.sequence}</Text>
          <Text style={styles.copy}>
            {liveStats.distanceM.toFixed(0)} m distance · {liveStats.ascentM.toFixed(0)} m ascent ·
            GPS {liveStats.gpsQuality} · Battery impact {modeLabels[mode]}
          </Text>
        </View>
      ) : null}

      {!nativeSpikes.available ? (
        <View accessibilityRole="alert" style={styles.alert}>
          <Text style={styles.alertHeading}>Native capability unavailable</Text>
          <Text selectable style={styles.alertCopy}>
            {nativeSpikes.loadError}
          </Text>
        </View>
      ) : null}

      <Text accessibilityRole="header" style={styles.sectionHeading}>
        Tracking mode
      </Text>
      <Text style={styles.copy}>
        Balanced is the default. High Accuracy is always an explicit choice.
      </Text>
      <View style={styles.controls}>
        {(Object.keys(modeLabels) as NativeTrackingMode[]).map((candidate) => (
          <AccessibleButton
            key={candidate}
            label={modeLabels[candidate]}
            hint={'Select ' + modeLabels[candidate] + ' tracking mode'}
            selected={candidate === mode}
            disabled={!nativeSpikes.available || active || recorderState === 'recoverable'}
            onPress={() => setMode(candidate)}
          />
        ))}
      </View>

      <Text accessibilityRole="header" style={styles.sectionHeading}>
        Recorder controls
      </Text>
      <View style={styles.controls}>
        <AccessibleButton
          label="Request Always Location"
          hint="Opens the iOS location permission prompt"
          disabled={!nativeSpikes.available || active}
          onPress={() => void requestPermission()}
        />
        <AccessibleButton
          label="Start recording"
          hint="Starts offline location and elevation recording"
          disabled={!nativeSpikes.available || recorderState !== 'idle'}
          onPress={() => void start()}
        />
        <AccessibleButton
          label="Pause recording"
          hint="Stops sensors and excludes paused distance and elevation"
          disabled={recorderState !== 'recording'}
          onPress={() => void pause()}
        />
        <AccessibleButton
          label="Resume recording"
          hint="Restarts sensors in a new activity segment"
          disabled={recorderState !== 'paused'}
          onPress={() => void resume()}
        />
        <AccessibleButton
          label="Finish and save recording"
          hint="Stops sensors and saves the private activity"
          disabled={!active}
          onPress={() => void finish()}
        />
        <AccessibleButton
          label="Recover interrupted recording"
          hint="Continues from the last durable checkpoint"
          disabled={recorderState !== 'recoverable' || recovery === null}
          onPress={() => void recover()}
        />
        <AccessibleButton
          label="Discard interrupted recording"
          hint="Requires confirmation before permanently discarding recovery"
          destructive
          disabled={recorderState !== 'recoverable' || recovery === null}
          onPress={confirmDiscard}
        />
      </View>

      {nativeSpikes.phase0DiagnosticsEnabled ? (
        <>
          <Text accessibilityRole="header" style={styles.sectionHeading}>
            Physical acceptance evidence
          </Text>
          <Text style={styles.copy}>
            Diagnostic JSON contains timings, memory sizes, and file policy only—never coordinates.
          </Text>
          <Phase3AcceptanceRunner enabled={application !== null} />
          <Phase1AcceptanceRunner
            enabled={application !== null}
            onFinish={finish}
            onMemoryProfileChange={setMemoryProfileActive}
            onPause={pause}
            onResume={resume}
            onRecover={recover}
            onStart={start}
            recorderState={recorderState}
          />
          <Text style={styles.copy}>Advanced individual diagnostics:</Text>
          <View style={styles.controls}>
            <AccessibleButton
              label="Measure 20 Start/Stop acknowledgements"
              hint="Runs the physical recording acknowledgement benchmark"
              disabled={
                active || recorderState === 'recoverable' || benchmarking || memoryProfileActive
              }
              onPress={() => void benchmarkAcknowledgements()}
            />
            <AccessibleButton
              label="Inspect active tracking protection"
              hint="Checks protection and system backup exclusion without reading coordinates"
              disabled={recorderState !== 'recording' || benchmarking}
              onPress={() => void inspectProtection()}
            />
            <AccessibleButton
              label="Begin 30-minute memory profile"
              hint="Begins screen-lock memory sampling for the active recorder"
              disabled={recorderState !== 'recording' || benchmarking || memoryProfileActive}
              onPress={() => void beginMemoryProfile()}
            />
            <AccessibleButton
              label="Finish 30-minute memory profile"
              hint="Stops memory sampling and computes the binding p95 result"
              disabled={!memoryProfileActive}
              onPress={() => void finishMemoryProfile()}
            />
            <AccessibleButton
              label="Share physical diagnostic JSON"
              hint="Shares the redacted physical acceptance report"
              disabled={!physicalReportAvailable || benchmarking || memoryProfileActive}
              onPress={() => void sharePhysicalReport()}
            />
          </View>
        </>
      ) : null}

      <Text accessibilityRole="header" style={styles.sectionHeading}>
        Saved activities
      </Text>
      {savedActivities.length === 0 ? (
        <Text style={styles.copy}>No saved activities yet.</Text>
      ) : (
        savedActivities.map((activity) => (
          <View key={activity.id} style={styles.activityCard}>
            <Text style={styles.activityHeading}>Private recorded activity</Text>
            <Text style={styles.copy}>
              {activity.id} · {activity.finalSequence} durable observations
            </Text>
          </View>
        ))
      )}
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  activityCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    marginBottom: 12,
    padding: 16,
  },
  activityHeading: { color: '#173d2b', fontSize: 18, fontWeight: '700' },
  alert: {
    backgroundColor: '#fff0ee',
    borderColor: '#a5251b',
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 12,
    padding: 16,
  },
  alertCopy: { color: '#5f1711', fontSize: 16, lineHeight: 24 },
  alertHeading: { color: '#7b1d15', fontSize: 18, fontWeight: '700', marginBottom: 6 },
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
  buttonDestructive: { borderColor: '#9b241b' },
  buttonDestructiveLabel: { color: '#7b1d15' },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: {
    color: '#173d2b',
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
  buttonPressed: { backgroundColor: '#d8e6d8' },
  buttonSelected: { backgroundColor: '#cbe1cf', borderWidth: 3 },
  container: { backgroundColor: '#f3f1e8', flexGrow: 1, padding: 24 },
  controls: { gap: 12 },
  copy: { color: '#303b34', fontSize: 17, lineHeight: 26, marginBottom: 14 },
  eyebrow: { color: '#496355', fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  heading: { color: '#173d2b', fontSize: 34, fontWeight: '800', marginBottom: 10 },
  mapAlternative: {
    backgroundColor: '#cfe2ce',
    borderColor: '#35634d',
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 16,
    minHeight: 176,
    padding: 18,
  },
  mapCopy: { color: '#244737', fontSize: 16, lineHeight: 23 },
  mapHeading: { color: '#173d2b', fontSize: 21, fontWeight: '800' },
  routeLine: { backgroundColor: '#a72d2d', borderRadius: 8, height: 8, marginVertical: 36 },
  sectionHeading: {
    color: '#173d2b',
    fontSize: 23,
    fontWeight: '800',
    marginBottom: 10,
    marginTop: 24,
  },
  status: {
    backgroundColor: '#deeadc',
    borderRadius: 12,
    color: '#17251c',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
    padding: 16,
  },
});

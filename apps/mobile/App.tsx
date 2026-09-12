import {
  AccessibilityContext,
  ProductText as Text,
  useDeviceAccessibility,
  useAnnouncement,
} from './accessibility';
import { campingLegend } from '@open-outdoor/map';
import { StatusBar } from 'expo-status-bar';
import {
  appearances,
  accessibleAppearance,
  ForegroundTask,
  boundedDisplayPoints,
  designTokens as t,
  type Appearance,
  type Palette,
  type AppSection,
} from '@open-outdoor/shared';
import {
  AppearanceContext,
  ProductButton as AccessibleButton,
  FieldNotice,
  ProductCard,
  OriginBadge,
  ProductMetric,
  usePalette,
} from './ProductComponents';
import { calculateDistanceRevision, calculateElevationRevision } from '@open-outdoor/tracking';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import {
  nativeSpikes,
  type NativeTrackingInspection,
  type NativeTrackingMode,
} from './nativeSpikes';
import {
  createMobileApplication,
  createOutdoorMapAdapter,
  type MobileApplication,
} from './application';
import { Phase1AcceptanceRunner } from './Phase1AcceptanceRunner';
import { OutdoorMap } from './OutdoorMap';
import { Phase5AcceptanceRunner } from './Phase5AcceptanceRunner';
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

export default function App() {
  const systemAppearance = useColorScheme();
  const [override, setOverride] = useState<Appearance | null>(null);
  const accessibility = useDeviceAccessibility();
  const appearance = accessibleAppearance(
    systemAppearance,
    override,
    accessibility.increasedContrast,
  );
  return (
    <AccessibilityContext.Provider value={accessibility}>
      <AppearanceContext.Provider value={appearance}>
        <AppContent appearance={appearance} onAppearance={setOverride} />
      </AppearanceContext.Provider>
    </AccessibilityContext.Provider>
  );
}

function AppContent({
  appearance,
  onAppearance,
}: {
  appearance: Appearance;
  onAppearance: (value: Appearance | null) => void;
}) {
  const palette = usePalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const map = useMemo(createOutdoorMapAdapter, []);
  const lastRenderedCheckpoint = useRef('');
  const [legendOpen, setLegendOpen] = useState(false);
  const [mode, setMode] = useState<NativeTrackingMode>('balanced');
  const [section, setSection] = useState<AppSection>('explore');
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

  useAnnouncement(status);

  useEffect(() => {
    if (!nativeSpikes.available) return;
    void createMobileApplication(map)
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
  }, [map]);
  useEffect(() => {
    if (application === null || recorderState !== 'recording') return;
    let cancelled = false;
    const synchronize = async (): Promise<void> => {
      try {
        await application.recorder.synchronize();
        if (cancelled || AppState.currentState !== 'active') return;
        const state = application.recorder.stateMachine.state;
        if (state.kind !== 'recording') return;
        const revision = state.sessionId + ':' + state.highestCommittedSequence;
        if (lastRenderedCheckpoint.current === revision) return;
        const observations = application.recorder.stateMachine.committedObservations;
        const distance = calculateDistanceRevision(observations);
        const elevation = calculateElevationRevision(observations);
        const accuracy = observations.at(-1)?.horizontalAccuracyM;
        const display = boundedDisplayPoints(observations);
        application.map.setActiveTrack(
          display.map(({ coordinate }) => coordinate),
          display.flatMap((point, index) =>
            index > 0 && point.segment !== display[index - 1]?.segment ? [index] : [],
          ),
        );
        lastRenderedCheckpoint.current = revision;
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
    const refresh = new ForegroundTask({ run: synchronize, onError: () => {}, intervalMs: 5_000 });
    refresh.setEligible(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (value) =>
      refresh.setEligible(value === 'active'),
    );
    return () => {
      cancelled = true;
      refresh.dispose();
      subscription.remove();
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text accessibilityRole="header" style={styles.eyebrow}>
        Clear information for time outside.
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
            icon={candidate}
            label={candidate[0]?.toUpperCase() + candidate.slice(1)}
            hint={`Open the ${candidate} section`}
            selected={section === candidate}
            onPress={() => setSection(candidate)}
          />
        ))}
      </View>
      {section === 'explore' || section === 'search' ? (
        <>
          <Text>Display only: there are no turn instructions, rerouting, or off-route alerts.</Text>
          <OutdoorMap adapter={map} />
          <AccessibleButton
            label="Land and camping legend"
            hint="Expand or collapse status explanations"
            expanded={legendOpen}
            onPress={() => setLegendOpen(!legendOpen)}
          />
          {legendOpen ? (
            <ProductCard title="Land and camping status">
              {campingLegend.map((entry) => (
                <Text key={entry.id} style={styles.copy}>
                  {entry.mark} · {entry.label}: {entry.explanation}
                </Text>
              ))}
            </ProductCard>
          ) : null}
        </>
      ) : null}
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {status}
      </Text>
      {recorderState !== 'idle' ? <FieldNotice state={recorderState} /> : null}
      {active ? (
        <ProductCard title="Recording statistics">
          <Text style={styles.activityHeading}>Committed checkpoint {liveStats.sequence}</Text>
          <ProductMetric label="Distance" value={`${liveStats.distanceM.toFixed(0)} m`} />
          <ProductMetric label="Ascent" value={`${liveStats.ascentM.toFixed(0)} m`} />
          <ProductMetric
            label="GPS"
            value={liveStats.gpsQuality}
            degraded={liveStats.gpsQuality === 'Degraded' || liveStats.gpsQuality === 'Poor'}
          />
          <ProductMetric label="Recording mode" value={modeLabels[mode]} />
        </ProductCard>
      ) : null}

      {!nativeSpikes.available ? (
        <View accessibilityRole="alert" style={styles.alert}>
          <Text style={styles.alertHeading}>Native capability unavailable</Text>
          <Text selectable style={styles.alertCopy}>
            {nativeSpikes.loadError}
          </Text>
        </View>
      ) : null}

      {section !== 'track' && active ? (
        <AccessibleButton
          label="Return to recording controls"
          hint="Open Track to pause or finish your activity"
          icon="track"
          onPress={() => setSection('track')}
        />
      ) : null}
      {section === 'track' ? (
        <>
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
              onPress={requestPermission}
            />
            <AccessibleButton
              label="Start recording"
              hint="Starts offline location and elevation recording"
              disabled={application === null || recorderState !== 'idle'}
              onPress={start}
            />
            <AccessibleButton
              label="Pause recording"
              hint="Stops sensors and excludes paused distance and elevation"
              disabled={recorderState !== 'recording'}
              onPress={pause}
            />
            <AccessibleButton
              label="Resume recording"
              hint="Restarts sensors in a new activity segment"
              disabled={recorderState !== 'paused'}
              onPress={resume}
            />
            <AccessibleButton
              label="Finish and save recording"
              hint="Stops sensors and saves the private activity"
              disabled={!active}
              onPress={finish}
            />
            <AccessibleButton
              label="Recover interrupted recording"
              hint="Continues from the last durable checkpoint"
              disabled={recorderState !== 'recoverable' || recovery === null}
              onPress={() => recover()}
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
                Diagnostic JSON contains timings, memory sizes, and file policy only—never
                coordinates.
              </Text>
              <Phase5AcceptanceRunner enabled={application !== null} />
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
        </>
      ) : null}
      {section === 'saved' ? (
        <>
          <Text accessibilityRole="header" style={styles.sectionHeading}>
            Saved activities
          </Text>
          {savedActivities.length === 0 ? (
            <FieldNotice
              state="empty"
              detail="No saved activities yet. Start a recording from Track to create a private activity."
            />
          ) : (
            savedActivities.map((activity) => (
              <ProductCard key={activity.id} title="Private recorded activity">
                <OriginBadge origin="user" />
                <Text style={styles.copy}>
                  {activity.id} · {activity.finalSequence} durable observations
                </Text>
              </ProductCard>
            ))
          )}
        </>
      ) : null}
      <ProductCard title="Appearance">
        <View style={styles.controls}>
          <AccessibleButton
            label="Use device appearance"
            hint="Follow the device light or dark setting"
            onPress={() => onAppearance(null)}
          />
          {appearances.map((value) => (
            <AccessibleButton
              key={value}
              label={value}
              hint={`Use ${value} appearance`}
              selected={appearance === value}
              onPress={() => onAppearance(value)}
            />
          ))}
        </View>
      </ProductCard>
      <StatusBar style={appearance === 'light' ? 'dark' : 'light'} />
    </ScrollView>
  );
}

function createStyles(p: Palette) {
  return StyleSheet.create({
    searchInput: {
      color: p.text,
      backgroundColor: p.surface,
      borderColor: p.border,
      borderWidth: 2,
      borderRadius: t.radius.control,
      minHeight: t.target.minimum,
      padding: t.space.md,
      fontSize: t.type.body,
    },
    activityHeading: { color: p.text, fontSize: t.type.body, fontWeight: '700' },
    alert: {
      backgroundColor: p.surface,
      borderColor: p.danger,
      borderRadius: t.radius.card,
      borderWidth: 2,
      marginBottom: t.space.lg,
      padding: t.space.lg,
    },
    alertCopy: { color: p.text, fontSize: t.type.body, lineHeight: t.type.lineHeight },
    alertHeading: {
      color: p.danger,
      fontSize: t.type.title,
      fontWeight: '700',
      marginBottom: t.space.sm,
    },
    container: { backgroundColor: p.background, flexGrow: 1, padding: t.space.xl },
    controls: { gap: t.space.md },
    copy: {
      color: p.text,
      fontSize: t.type.body,
      lineHeight: t.type.lineHeight,
      marginBottom: t.space.lg,
    },
    eyebrow: { color: p.muted, fontSize: t.type.caption, fontWeight: '700' },
    heading: {
      color: p.text,
      fontSize: t.type.display,
      fontWeight: '800',
      marginBottom: t.space.md,
    },
    mapAlternative: {
      backgroundColor: p.land,
      borderColor: p.border,
      borderRadius: t.radius.card,
      borderWidth: 2,
      marginBottom: t.space.lg,
      minHeight: 176,
      padding: t.space.lg,
    },
    mapCopy: { color: p.text, fontSize: t.type.body, lineHeight: t.type.lineHeight },
    mapHeading: { color: p.text, fontSize: t.type.title, fontWeight: '800' },
    routeLine: {
      backgroundColor: p.route,
      borderRadius: t.radius.badge,
      height: 8,
      marginVertical: t.space.xxl,
    },
    sectionHeading: {
      color: p.text,
      fontSize: t.type.title,
      fontWeight: '800',
      marginBottom: t.space.md,
      marginTop: t.space.xl,
    },
    status: {
      backgroundColor: p.selected,
      borderRadius: t.radius.card,
      color: p.text,
      fontSize: t.type.body,
      lineHeight: t.type.lineHeight,
      marginBottom: t.space.lg,
      padding: t.space.lg,
    },
  });
}

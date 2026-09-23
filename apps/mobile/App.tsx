import {
  AccessibilityContext,
  ProductText as Text,
  useDeviceAccessibility,
  useAnnouncement,
} from './accessibility';

import { StatusBar } from 'expo-status-bar';

import {
  appearances,
  accessibleAppearance,
  ForegroundTask,
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
  ProductNavigation,
  ProductIcon,
  usePalette,
} from './ProductComponents';

import { recordedHikeDisplay, storedHikeObservations } from '@open-outdoor/recorder';

import type { RecordedActivity } from '@open-outdoor/storage';

import type { HikeCaptureView } from './HikeCaptureControls';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  Alert,
  AppState,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';

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

import { OutdoorMap } from './OutdoorMap';

import { useImportedMapDatasets } from './useImportedMapDatasets';

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

  const importedDatasets = useImportedMapDatasets();

  const lastRenderedCheckpoint = useRef('');

  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const [mode, setMode] = useState<NativeTrackingMode>('balanced');

  const [section, setSection] = useState<AppSection>('explore');

  const [recorderState, setRecorderState] = useState<RecorderUiState>('idle');

  const [recovery, setRecovery] = useState<NativeTrackingInspection | null>(null);

  const captureOperation = useRef(false);

  const [captureBusy, setCaptureBusy] = useState(false);

  const captureMetadata = useRef<Pick<HikeCaptureView, 'id' | 'name' | 'plannedFeatureId'> | null>(
    null,
  );

  const [captureView, setCaptureView] = useState<HikeCaptureView | null>(null);

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

  function showStoredCapture(
    app: MobileApplication,

    activity: RecordedActivity,

    state: HikeCaptureView['state'],
  ): void {
    const snapshot = app.repository.exportSnapshot();

    const plannedFeatureId =
      snapshot.associations.find((association) => association.id === `hike-plan-${activity.id}`)
        ?.catalogTrailId ?? undefined;

    const revision =
      state === 'saved'
        ? snapshot.revisions

            .filter((revision) => revision.activityId === activity.id)

            .sort((a, b) => b.revision - a.revision)[0]
        : undefined;

    const display = recordedHikeDisplay(storedHikeObservations(activity), revision);

    captureMetadata.current = {
      id: activity.id,

      name: activity.name,

      ...(plannedFeatureId ? { plannedFeatureId } : {}),
    };

    setCaptureView({ ...captureMetadata.current, state, display });

    app.map.setActiveTrack(display.coordinates, display.breaks);

    app.map.setSelectedFeature(plannedFeatureId ?? null);

    lastRenderedCheckpoint.current = '';
  }

  function refreshCapturedDisplay(state: 'recording' | 'paused'): void {
    if (!application || !captureMetadata.current) return;

    const display = recordedHikeDisplay(application.recorder.stateMachine.committedObservations);

    application.map.setActiveTrack(display.coordinates, display.breaks);

    setCaptureView({ ...captureMetadata.current, state, display });

    setLiveStats({
      sequence: display.sequence,

      distanceM: display.route?.distanceM ?? 0,

      ascentM: display.route?.ascentM ?? 0,

      gpsQuality: display.gpsQuality,
    });
  }

  async function showSavedCapture(id: string): Promise<void> {
    if (!application || recorderState !== 'idle' || captureOperation.current) return;

    const activity = application.library.list().find((activity) => activity.id === id);

    if (!activity) return;

    showStoredCapture(application, activity, 'saved');

    setSection('explore');

    setStatus('Saved private hike opened on the map.');
  }

  async function drainPausedCapture(): Promise<void> {
    if (!application) return;

    for (let batch = 0; batch < 10_000; batch++) {
      const state = application.recorder.stateMachine.state;

      const before = state.kind === 'paused' ? state.highestCommittedSequence : 0;

      const after = await application.recorder.synchronize();

      if (after === before) return;
    }

    throw new Error('Tracking spool exceeded the bounded drain limit');
  }

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

          const interrupted = nextApplication.library

            .list()

            .find((activity) => activity.id === `activity-${inspection.sessionId}`);

          if (interrupted) showStoredCapture(nextApplication, interrupted, 'recoverable');
        }
      })

      .catch((error: unknown) => setStatus('Private store startup failed: ' + errorMessage(error)));
  }, [map]);

  useEffect(() => {
    if (application === null || recorderState !== 'recording') return;

    let cancelled = false;

    const synchronize = async (): Promise<void> => {
      try {
        if (captureOperation.current) return;

        await application.recorder.synchronize();

        if (cancelled || AppState.currentState !== 'active') return;

        const state = application.recorder.stateMachine.state;

        if (state.kind !== 'recording') return;

        const revision = state.sessionId + ':' + state.highestCommittedSequence;

        if (lastRenderedCheckpoint.current === revision) return;

        refreshCapturedDisplay('recording');

        lastRenderedCheckpoint.current = revision;
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

  async function start(name = 'Recorded hike', plannedFeatureId?: string): Promise<boolean> {
    if (captureOperation.current) return false;

    captureOperation.current = true;

    setCaptureBusy(true);

    try {
      if (application === null) throw new Error('Private recorder is still loading');

      const activity = await application.recorder.start(
        mode,

        name,

        new Date().toISOString(),

        plannedFeatureId,
      );

      showStoredCapture(application, activity, 'recording');

      setLiveStats({ sequence: 0, distanceM: 0, ascentM: 0, gpsQuality: 'Waiting' });

      setRecorderState('recording');

      setStatus('Recording ' + modeLabels[mode] + ' activity ' + activity.id + ' offline.');

      return true;
    } catch (error) {
      setStatus('Start failed: ' + errorMessage(error));

      return false;
    } finally {
      captureOperation.current = false;

      setCaptureBusy(false);
    }
  }

  async function pause(): Promise<boolean> {
    if (captureOperation.current) return false;

    captureOperation.current = true;

    setCaptureBusy(true);

    try {
      if (application === null) throw new Error('Private recorder is still loading');

      await application.recorder.synchronize();

      await application.recorder.pause();

      setRecorderState('paused');

      await drainPausedCapture();

      refreshCapturedDisplay('paused');

      const state = application.recorder.stateMachine.state;

      const sequence = state.kind === 'paused' ? state.highestCommittedSequence : 0;

      setRecorderState('paused');

      setStatus('Paused after durable sequence ' + sequence + '. Sensors are stopped.');

      return true;
    } catch (error) {
      setStatus('Pause failed: ' + errorMessage(error));

      return false;
    } finally {
      captureOperation.current = false;

      setCaptureBusy(false);
    }
  }

  async function resume(): Promise<boolean> {
    if (captureOperation.current) return false;

    captureOperation.current = true;

    setCaptureBusy(true);

    try {
      if (application === null) throw new Error('Private recorder is still loading');

      await application.recorder.resume();

      refreshCapturedDisplay('recording');

      const state = application.recorder.stateMachine.state;

      const sequence = state.kind === 'recording' ? state.highestCommittedSequence : 0;

      setRecorderState('recording');

      setStatus('Resumed from durable sequence ' + sequence + ' in a new segment.');

      return true;
    } catch (error) {
      setStatus('Resume failed: ' + errorMessage(error));

      return false;
    } finally {
      captureOperation.current = false;

      setCaptureBusy(false);
    }
  }

  async function finish(): Promise<number | null> {
    if (captureOperation.current) return null;

    captureOperation.current = true;

    setCaptureBusy(true);

    try {
      if (application === null) throw new Error('Private recorder is still loading');

      const summary = await application.recorder.finish();

      showStoredCapture(application, summary.activity, 'saved');

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
    } finally {
      captureOperation.current = false;

      setCaptureBusy(false);
    }
  }

  async function recover(reason: RecoveryReason = 'process-termination'): Promise<void> {
    if (captureOperation.current) return;

    captureOperation.current = true;

    setCaptureBusy(true);

    try {
      if (application === null) throw new Error('Private recorder is still loading');

      const activity = await application.recorder.recover(new Date().toISOString(), reason);

      if (activity === null) throw new Error('No interrupted recording is available');

      showStoredCapture(application, activity, 'recording');

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
    } finally {
      captureOperation.current = false;

      setCaptureBusy(false);
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

                setCaptureView(null);

                captureMetadata.current = null;

                map.setActiveTrack([]);

                setStatus('Interrupted recording discarded.');
              })

              .catch((error: unknown) => setStatus('Discard failed: ' + errorMessage(error)));
          },
        },
      ],
    );
  }

  const active = recorderState === 'recording' || recorderState === 'paused';

  const savedPlaces = application?.repository.listPlaceJournal() ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <View style={{ backgroundColor: palette.accent, borderRadius: 13, padding: 9 }}>
            <ProductIcon name="explore" color={palette.onAccent} size={25} />
          </View>

          <Text style={styles.brand}>Open Outdoor</Text>
        </View>

        <Text accessibilityRole="header" style={styles.heading}>
          {
            {
              explore: 'Explore outdoors',
              search: 'Find a place',
              track: 'Record a hike',
              saved: 'Your hikes',
            }[section]
          }
        </Text>

        <Text style={styles.intro}>
          {
            {
              explore: 'Trails, open spaces and places to pause.',
              search: 'Search the places on your offline map.',
              track: 'Keep a record of where the day takes you.',
              saved: 'The routes and memories you bring home.',
            }[section]
          }
        </Text>

        {section === 'explore' || section === 'search' ? (
          <>
            <OutdoorMap
              adapter={map}

              section={section}

              placeJournal={application?.placeJournal ?? null}

              imports={importedDatasets}

              capture={{
                state: recorderState,

                available: application !== null,

                busy: captureBusy,

                view: captureView,

                status,

                onStart: start,

                onPause: pause,

                onResume: resume,

                onFinish: finish,

                onRecover: () => recover(),

                onDiscard: confirmDiscard,

                onRequestPermission: requestPermission,
              }}
            />
          </>
        ) : null}

        {section === 'track' || active || recorderState === 'recoverable' ? (
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            {status}
          </Text>
        ) : null}

        {recorderState !== 'idle' ? <FieldNotice state={recorderState} /> : null}

        {section === 'track' && !nativeSpikes.available ? (
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
            <ProductCard
              title={
                recorderState === 'recording'
                  ? 'Recording now'
                  : recorderState === 'paused'
                    ? 'Recording paused'
                    : recorderState === 'recoverable'
                      ? 'Continue your hike'
                      : 'Ready to record'
              }
            >
              {active ? (
                <Text style={styles.activityHeading}>
                  Committed checkpoint {liveStats.sequence}
                </Text>
              ) : null}

              <View style={styles.metricGrid}>
                <ProductMetric
                  label="Distance"
                  value={active ? `${liveStats.distanceM.toFixed(0)} m` : null}
                />

                <ProductMetric
                  label="Ascent"
                  value={active ? `${liveStats.ascentM.toFixed(0)} m` : null}
                />

                <ProductMetric
                  label="GPS"
                  value={active ? liveStats.gpsQuality : null}
                  degraded={
                    active &&
                    (liveStats.gpsQuality === 'Degraded' || liveStats.gpsQuality === 'Poor')
                  }
                />

                <ProductMetric label="Recording mode" value={modeLabels[mode]} />
              </View>

              {recorderState === 'idle' ? (
                <AccessibleButton
                  label="Start recording"
                  hint="Starts offline location and elevation recording"
                  primary
                  disabled={application === null || captureBusy}
                  onPress={start}
                />
              ) : recorderState === 'recording' ? (
                <AccessibleButton
                  label="Pause recording"
                  hint="Stops sensors and excludes paused distance and elevation"
                  primary
                  disabled={captureBusy}
                  onPress={pause}
                />
              ) : recorderState === 'paused' ? (
                <AccessibleButton
                  label="Resume recording"
                  hint="Restarts sensors in a new activity segment"
                  primary
                  disabled={captureBusy}
                  onPress={resume}
                />
              ) : (
                <AccessibleButton
                  label="Recover interrupted recording"
                  hint="Continues from the last durable checkpoint"
                  primary
                  disabled={recovery === null || captureBusy}
                  onPress={() => recover()}
                />
              )}
            </ProductCard>

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
              Other recording actions
            </Text>

            <View style={styles.controls}>
              {recorderState === 'idle' ? (
                <AccessibleButton
                  label="Request Always Location"
                  hint="Opens the iOS location permission prompt"
                  disabled={!nativeSpikes.available}
                  onPress={requestPermission}
                />
              ) : null}

              {active ? (
                <AccessibleButton
                  label="Finish and save recording"
                  hint="Stops sensors and saves the private activity"
                  disabled={captureBusy}
                  onPress={finish}
                />
              ) : null}

              {recorderState === 'recoverable' ? (
                <AccessibleButton
                  label="Discard interrupted recording"
                  hint="Requires confirmation before permanently discarding recovery"
                  destructive
                  disabled={recovery === null || captureBusy}
                  onPress={confirmDiscard}
                />
              ) : null}
            </View>

            {nativeSpikes.phase0DiagnosticsEnabled ? (
              <>
                <Text accessibilityRole="header" style={styles.sectionHeading}>
                  Advanced diagnostics
                </Text>

                <Text style={styles.copy}>
                  Diagnostic JSON contains timings, memory sizes, and file policy only—never
                  coordinates.
                </Text>

                <View style={styles.controls}>
                  <AccessibleButton
                    label="Measure 20 Start/Stop acknowledgements"

                    hint="Runs the physical recording acknowledgement benchmark"

                    disabled={
                      active ||
                      recorderState === 'recoverable' ||
                      benchmarking ||
                      memoryProfileActive
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
              Saved places
            </Text>

            {savedPlaces.length === 0 ? (
              <Text style={styles.copy}>Your private place notes will appear here.</Text>
            ) : (
              savedPlaces.map((place) => (
                <ProductCard key={place.featureId} title={place.featureName}>
                  <OriginBadge origin="user" />

                  {place.note ? <Text style={styles.copy}>{place.note}</Text> : null}

                  <Text style={styles.copy}>
                    {place.checkIns.length} private check-ins saved on this device
                  </Text>

                  <AccessibleButton
                    label="Find on current map"
                    hint="Opens Explore and selects this place if its dataset is loaded"
                    onPress={() => {
                      map.setSelectedFeature(place.featureId);
                      setSection('explore');
                    }}
                  />
                </ProductCard>
              ))
            )}

            <Text accessibilityRole="header" style={styles.sectionHeading}>
              Recorded hikes
            </Text>

            {savedActivities.length === 0 ? (
              <FieldNotice
                state="empty"

                detail="No recorded hikes yet. Start a recording from Track to create a private activity."
              />
            ) : (
              savedActivities.map((activity) => (
                <ProductCard key={activity.id} title="Private recorded activity">
                  <OriginBadge origin="user" />

                  <Text style={styles.copy}>
                    {activity.id} · {activity.finalSequence} durable observations
                  </Text>

                  <AccessibleButton
                    label="View hike on map"

                    hint="Open this saved private hike and its recorded elevation profile"

                    disabled={active || recorderState === 'recoverable' || captureBusy}

                    onPress={() => showSavedCapture(activity.id)}
                  />
                </ProductCard>
              ))
            )}
            {savedPlaces.length === 0 && savedActivities.length === 0 ? (
              <AccessibleButton
                label="Explore places"
                hint="Open the offline map to find a place"
                primary
                onPress={() => setSection('explore')}
              />
            ) : null}
          </>
        ) : null}

        <AccessibleButton
          label="Appearance settings"
          hint="Show light, dark and high contrast appearance options"
          expanded={appearanceOpen}
          onPress={() => setAppearanceOpen(!appearanceOpen)}
        />

        {appearanceOpen ? (
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
        ) : null}

        <StatusBar style={appearance === 'light' ? 'dark' : 'light'} />
      </ScrollView>

      <ProductNavigation section={section} onChange={setSection} />
    </SafeAreaView>
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

    container: {
      backgroundColor: p.background,
      flexGrow: 1,
      paddingHorizontal: t.space.xl,
      paddingTop: 16,
      paddingBottom: 32,
    },

    brand: { color: p.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.6 },

    intro: { color: p.muted, fontSize: 16, lineHeight: 24, marginBottom: 24 },

    controls: { gap: t.space.md },

    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },

    copy: {
      color: p.text,

      fontSize: t.type.body,

      lineHeight: t.type.lineHeight,

      marginBottom: t.space.lg,
    },

    eyebrow: {
      color: p.accent,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      marginBottom: 8,
    },

    heading: {
      color: p.text,

      fontSize: 30,
      fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',

      letterSpacing: -0.5,

      lineHeight: 36,

      fontWeight: '500',

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

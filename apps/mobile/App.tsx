import {
  AccessibilityContext,
  ProductText as Text,
  useDeviceAccessibility,
  useAnnouncement,
} from './accessibility';

import { StatusBar } from 'expo-status-bar';

import {
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
  OriginBadge,
  ProductMetric,
  ProductHeader,
  ProductRow,
  ProductDisclosure,
  ProductNavigation,
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

import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { OutdoorMap } from './OutdoorMap';
import { MapSettings, MapNotices } from './MapSettings';
import { ProductSheet } from './ProductSheet';
import {
  RecordingScreen,
  RecordedPathPreview,
  recordingModes,
  recordingTime,
} from './RecordingScreen';
import { useStatePackages } from './useStatePackages';

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
    <SafeAreaProvider>
      <AccessibilityContext.Provider value={accessibility}>
        <AppearanceContext.Provider value={appearance}>
          <AppContent
            appearance={appearance}
            appearanceOverride={override}
            onAppearance={setOverride}
          />
        </AppearanceContext.Provider>
      </AccessibilityContext.Provider>
    </SafeAreaProvider>
  );
}

function AppContent({
  appearance,
  appearanceOverride,
  onAppearance,
}: {
  appearance: Appearance;
  appearanceOverride: Appearance | null;

  onAppearance: (value: Appearance | null) => void;
}) {
  const palette = usePalette();

  const styles = useMemo(() => createStyles(palette), [palette]);

  const map = useMemo(createOutdoorMapAdapter, []);

  const importedDatasets = useImportedMapDatasets();

  const lastRenderedCheckpoint = useRef('');

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<
    'index' | 'maps' | 'appearance' | 'recording' | 'about' | 'advanced'
  >('index');
  const [libraryPage, setLibraryPage] = useState<'hikes' | 'places'>('hikes');
  const [finishReview, setFinishReview] = useState(false);
  const [query, setQuery] = useState('');
  const statePackages = useStatePackages(query);
  const [coverage, setCoverage] = useState<[number, number, number, number] | null>(null);
  const scroll = useRef<ScrollView>(null);

  function showCoverage(bounds: [number, number, number, number]) {
    setCoverage([...bounds]);
    setSettingsOpen(false);
    setSection('explore');
  }

  const [mode, setMode] = useState<NativeTrackingMode>('balanced');

  const [section, setSection] = useState<AppSection>('explore');
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [settingsOpen, section]);

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

      setRecorderState('recording');

      setStatus('Recording ' + modeLabels[mode] + '.');

      return true;
    } catch (error) {
      setStatus('Start failed: ' + errorMessage(error));
      if (application?.recorder.stateMachine.state.kind === 'paused') setRecorderState('paused');

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

      setRecorderState('paused');

      setStatus('Paused. Sensors stopped.');

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

      setRecorderState('recording');

      setStatus('Resumed in a new segment.');

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
      setFinishReview(false);
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
      if (application?.recorder.stateMachine.state.kind === 'paused') setRecorderState('paused');

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

  const capture = {
    state: recorderState,
    available: application !== null,
    busy: captureBusy,
    view: captureView,
    status,
    onStart: start,
    onPause: pause,
    onResume: resume,
    onFinish: async () => {
      setFinishReview(true);
      return null;
    },
    onRecover: () => recover(),
    onDiscard: confirmDiscard,
    onRequestPermission: requestPermission,
  };
  const openSettings = () => {
    setSettingsPage('index');
    setSettingsOpen(true);
  };
  const settingsTitles = {
    index: 'Settings',
    maps: 'Maps',
    appearance: 'Appearance',
    recording: 'Recording',
    about: 'About and sources',
    advanced: 'Advanced',
  };
  const library = useMemo(() => {
    const ids = new Set(savedActivities.map((saved) => saved.id));
    return (
      application?.library
        .list()
        .filter((activity) => ids.has(activity.id) && activity.lifecycle === 'finished') ?? []
    );
  }, [application, savedActivities]);
  const savedPreview = useMemo(() => {
    if (section !== 'saved' || settingsOpen || libraryPage !== 'hikes') return null;
    const activity = library[0];
    if (!activity || !application) return null;
    const revision = application.repository
      .exportSnapshot()
      .revisions.filter((entry) => entry.activityId === activity.id)
      .sort((a, b) => b.revision - a.revision)[0];
    return recordedHikeDisplay(storedHikeObservations(activity), revision);
  }, [application, library, section, settingsOpen, libraryPage]);
  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <SafeAreaView
        edges={['top', 'left', 'right']}
        style={{ flex: 1, backgroundColor: palette.background }}
      >
        {active && (settingsOpen || section !== 'track') ? (
          <View style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
            <ProductRow
              title={recorderState === 'paused' ? 'Paused hike' : 'Recording'}
              subtitle="Return to Track"
              icon="track"
              onPress={() => {
                setSettingsOpen(false);
                setSection('track');
              }}
            />
          </View>
        ) : null}
        {/* Retaining this component retains query, selection, filters and map camera. */}
        <View
          style={{
            flex: 1,
            display:
              !settingsOpen && (section === 'explore' || section === 'search') ? 'flex' : 'none',
          }}
        >
          {section === 'search' && !settingsOpen ? (
            <View style={{ paddingHorizontal: 22 }}>
              <ProductHeader title="Search" onSettings={openSettings} />
            </View>
          ) : null}
          <OutdoorMap
            adapter={map}
            section={section === 'search' ? 'search' : 'explore'}
            query={query}
            onQueryChange={setQuery}
            statePackages={statePackages}
            coverage={coverage}
            onCoverageShown={() => setCoverage(null)}
            placeJournal={application?.placeJournal ?? null}
            imports={importedDatasets}
            capture={capture}
            onOpenSettings={openSettings}
            onOpenMaps={() => {
              setSettingsPage('maps');
              setSettingsOpen(true);
            }}
            onOpenSearch={() => setSection('search')}
            onOpenExplore={() => setSection('explore')}
            visible={!settingsOpen && (section === 'explore' || section === 'search')}
          />
        </View>
        {settingsOpen || section === 'track' || section === 'saved' ? (
          <ScrollView
            ref={scroll}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            contentContainerStyle={styles.container}
          >
            {settingsOpen && settingsPage === 'maps' ? (
              <MapSettings
                imports={importedDatasets}
                statePackages={statePackages}
                onShowCoverage={showCoverage}
                onBack={() => setSettingsPage('index')}
              />
            ) : (
              <ProductHeader
                title={
                  settingsOpen
                    ? settingsTitles[settingsPage]
                    : section === 'track'
                      ? 'Track'
                      : 'Saved'
                }
                {...(settingsOpen
                  ? {
                      onBack: () =>
                        settingsPage === 'index'
                          ? setSettingsOpen(false)
                          : setSettingsPage('index'),
                    }
                  : { onSettings: openSettings })}
              />
            )}
            {!settingsOpen && section === 'track' ? (
              <RecordingScreen capture={capture} mode={mode} onMode={setMode} />
            ) : null}
            {!settingsOpen && section === 'saved' ? (
              <View style={{ gap: 16 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <AccessibleButton
                    label="Hikes"
                    hint="Show saved recordings"
                    selected={libraryPage === 'hikes'}
                    onPress={() => setLibraryPage('hikes')}
                  />
                  <AccessibleButton
                    label="Places"
                    hint="Show private notes and check-ins"
                    selected={libraryPage === 'places'}
                    onPress={() => setLibraryPage('places')}
                  />
                </View>
                {libraryPage === 'hikes' && savedPreview ? (
                  <View style={{ gap: 12 }}>
                    <RecordedPathPreview display={savedPreview} />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                      <ProductMetric
                        label="Distance"
                        value={
                          savedPreview.route
                            ? `${(savedPreview.route.distanceM / 1000).toFixed(1)} km`
                            : null
                        }
                      />
                      <ProductMetric
                        label="Time"
                        value={recordingTime(savedPreview.recordedSeconds)}
                      />
                    </View>
                  </View>
                ) : null}
                {libraryPage === 'hikes'
                  ? library.map((activity) => (
                      <ProductRow
                        key={activity.id}
                        title={activity.name}
                        subtitle={new Date(activity.startedAt).toLocaleDateString()}
                        icon="explore"
                        disabled={active || recorderState === 'recoverable' || captureBusy}
                        onPress={() => showSavedCapture(activity.id)}
                      />
                    ))
                  : savedPlaces.map((place) => (
                      <ProductRow
                        key={place.featureId}
                        title={place.featureName}
                        subtitle={`${place.note ? '1 note · ' : ''}${place.checkIns.length} check-ins`}
                        icon="saved"
                        onPress={() => {
                          map.setSelectedFeature(place.featureId);
                          setSection('explore');
                        }}
                      />
                    ))}
                {(libraryPage === 'hikes' ? library.length === 0 : savedPlaces.length === 0) ? (
                  <View style={{ paddingVertical: 40, gap: 20 }}>
                    <Text style={styles.heading}>
                      {libraryPage === 'hikes' ? 'No hikes yet' : 'No places yet'}
                    </Text>
                    <AccessibleButton
                      label={libraryPage === 'hikes' ? 'Record a hike' : 'Explore places'}
                      hint="Create a private hike or place note"
                      primary
                      onPress={() => setSection(libraryPage === 'hikes' ? 'track' : 'explore')}
                    />
                  </View>
                ) : null}
                <Text style={{ color: palette.muted, fontSize: 14 }}>Saved on this device</Text>
              </View>
            ) : null}
            {settingsOpen && settingsPage === 'index' ? (
              <View style={{ gap: 16 }}>
                <ProductRow
                  title="Maps"
                  subtitle="Public packages and private data"
                  onPress={() => setSettingsPage('maps')}
                />
                <ProductRow
                  title="Appearance"
                  subtitle="Device · Light · Dark · High contrast"
                  icon="settings"
                  onPress={() => setSettingsPage('appearance')}
                />
                <ProductRow
                  title="Recording"
                  subtitle={modeLabels[mode]}
                  icon="track"
                  onPress={() => setSettingsPage('recording')}
                />
                <ProductRow
                  title="About and sources"
                  subtitle="Attribution and licenses"
                  onPress={() => setSettingsPage('about')}
                />
                <ProductRow
                  title="Advanced"
                  subtitle="Diagnostics"
                  icon="settings"
                  onPress={() => setSettingsPage('advanced')}
                />
                <Text style={{ color: palette.muted, fontSize: 14, marginTop: 20 }}>
                  Notes and hikes stay on this device.
                </Text>
              </View>
            ) : null}
            {settingsOpen && settingsPage === 'appearance' ? (
              <View style={{ gap: 12 }}>
                {([null, 'light', 'dark', 'high-contrast'] as const).map((value) => (
                  <ProductRow
                    key={value ?? 'device'}
                    title={
                      value === null
                        ? 'Device appearance'
                        : value === 'high-contrast'
                          ? 'High contrast'
                          : value === 'light'
                            ? 'Light'
                            : 'Dark'
                    }
                    subtitle={appearanceOverride === value ? 'Selected' : undefined}
                    icon={appearanceOverride === value ? 'check' : 'settings'}
                    onPress={() => onAppearance(value)}
                  />
                ))}
                <Text style={{ marginTop: 16 }}>Text size follows your device.</Text>
              </View>
            ) : null}
            {settingsOpen && settingsPage === 'recording' ? (
              <View style={{ gap: 12 }}>
                {(Object.keys(recordingModes) as NativeTrackingMode[]).map((value) => (
                  <AccessibleButton
                    key={value}
                    label={recordingModes[value]}
                    hint={`Choose ${recordingModes[value]} recording`}
                    selected={mode === value}
                    disabled={active || recorderState === 'recoverable'}
                    onPress={() => setMode(value)}
                  />
                ))}
                <ProductDisclosure title="Location access">
                  <Text>Always access supports screen-lock recording.</Text>
                  <AccessibleButton
                    label="Allow location"
                    hint="Open the device location permission request"
                    disabled={!nativeSpikes.available || captureBusy}
                    onPress={requestPermission}
                  />
                </ProductDisclosure>
              </View>
            ) : null}
            {settingsOpen && settingsPage === 'about' ? <MapNotices /> : null}
            {settingsOpen &&
            settingsPage === 'advanced' &&
            !nativeSpikes.phase0DiagnosticsEnabled ? (
              <Text>Diagnostics are unavailable in this build.</Text>
            ) : null}
            {settingsOpen &&
            settingsPage === 'advanced' &&
            nativeSpikes.phase0DiagnosticsEnabled ? (
              <>
                <Text accessibilityRole="header" style={styles.sectionHeading}>
                  Diagnostics
                </Text>

                <Text style={styles.copy}>Timings and storage only. No coordinates.</Text>

                <View style={styles.controls}>
                  <AccessibleButton
                    label="Start and stop timing"

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
                    label="Tracking protection"

                    hint="Checks protection and system backup exclusion without reading coordinates"

                    disabled={recorderState !== 'recording' || benchmarking}

                    onPress={() => void inspectProtection()}
                  />

                  <AccessibleButton
                    label="Start memory sample"

                    hint="Begins screen-lock memory sampling for the active recorder"

                    disabled={recorderState !== 'recording' || benchmarking || memoryProfileActive}

                    onPress={() => void beginMemoryProfile()}
                  />

                  <AccessibleButton
                    label="Finish memory sample"

                    hint="Stops memory sampling and computes the binding p95 result"

                    disabled={!memoryProfileActive}

                    onPress={() => void finishMemoryProfile()}
                  />

                  <AccessibleButton
                    label="Share diagnostics"

                    hint="Shares the redacted physical acceptance report"

                    disabled={!physicalReportAvailable || benchmarking || memoryProfileActive}

                    onPress={() => void sharePhysicalReport()}
                  />
                </View>
              </>
            ) : null}
          </ScrollView>
        ) : null}
        <StatusBar style={appearance === 'light' ? 'dark' : 'light'} />
      </SafeAreaView>
      <SafeAreaView
        edges={['bottom', 'left', 'right']}
        style={{ backgroundColor: palette.surface }}
      >
        <ProductNavigation
          section={settingsOpen ? null : section}
          onChange={(next) => {
            setSettingsOpen(false);
            setSection(next);
          }}
        />
      </SafeAreaView>
      <ProductSheet
        title="Save hike"
        visible={finishReview && active}
        onClose={() => setFinishReview(false)}
      >
        <OriginBadge origin="user" />
        <RecordedPathPreview display={captureView?.display ?? null} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <ProductMetric
            label="Distance"
            value={
              captureView?.display.route
                ? `${(captureView.display.route.distanceM / 1000).toFixed(1)} km`
                : null
            }
          />
          <ProductMetric
            label="Time"
            value={recordingTime(captureView?.display.recordedSeconds ?? 0)}
          />
        </View>
        <Text>Save this hike on your device.</Text>
        <AccessibleButton
          label="Save hike"
          hint="Stop sensors and save this private activity"
          primary
          disabled={captureBusy}
          onPress={finish}
        />
        <AccessibleButton
          label={recorderState === 'paused' ? 'Keep paused' : 'Keep recording'}
          hint="Return without stopping or saving"
          disabled={captureBusy}
          onPress={() => setFinishReview(false)}
        />
        <Text accessibilityLiveRegion="polite">{status.includes('failed') ? status : ''}</Text>
      </ProductSheet>
    </View>
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
      paddingTop: 4,
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

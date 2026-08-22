import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  nativeSpikes,
  type NativeTrackingInspection,
  type NativeTrackingMode,
  type Phase0DiagnosticReport,
} from './nativeSpikes';

const modeLabels: Readonly<Record<NativeTrackingMode, string>> = {
  balanced: 'Balanced',
  endurance: 'Endurance',
  'high-accuracy': 'High Accuracy',
};

const activationCheckpoints = [
  'before-copy',
  'after-copy',
  'after-checksum',
  'after-compatibility',
  'after-remap-validation',
  'before-pointer-switch',
  'after-pointer-switch',
  'after-first-launch',
] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function trackingSummary(inspection: NativeTrackingInspection): string {
  const torn = inspection.tornFinalLineIgnored ? ' Torn final line ignored.' : '';
  return (
    (inspection.recording ? 'Recording ' : 'Recoverable ') +
    modeLabels[inspection.mode] +
    ' session ' +
    inspection.sessionId +
    '; ' +
    inspection.validObservationCount +
    ' valid observations through sequence ' +
    inspection.highestSequence +
    '.' +
    torn
  );
}

function diagnosticSummary(report: Phase0DiagnosticReport): string {
  const records = Object.values(report.recordCounts).reduce((sum, count) => sum + count, 0);
  const interruption =
    report.interruptedAt === null
      ? ''
      : ' Interrupted at ' +
        report.interruptedAt +
        (report.rolledBack ? ' and rolled back' : '') +
        '.';
  return (
    'Synthetic fixture ' +
    report.fixtureStage +
    '; active ' +
    report.activeCatalogId +
    '; ' +
    records +
    ' records and ' +
    report.artifacts.length +
    ' artifact checks.' +
    interruption
  );
}

export default function App() {
  const [mode, setMode] = useState<NativeTrackingMode>('balanced');
  const [recording, setRecording] = useState(false);
  const [recoverable, setRecoverable] = useState<NativeTrackingInspection | null>(null);
  const [checkpoint, setCheckpoint] =
    useState<(typeof activationCheckpoints)[number]>('after-first-launch');
  const [diagnostic, setDiagnostic] = useState<Phase0DiagnosticReport | null>(null);
  const [status, setStatus] = useState('Native tracker ready for Phase 0 workoff.');

  useEffect(() => {
    void inspectTracking(false);
  }, []);

  async function inspectTracking(announce = true): Promise<void> {
    try {
      const inspection = await nativeSpikes.inspectTrackingSession();
      setRecoverable(inspection?.recording ? null : inspection);
      if (inspection !== null && announce) setStatus(trackingSummary(inspection));
      if (inspection === null && announce) setStatus('No active or recoverable tracking session.');
    } catch (error) {
      setStatus('Tracking inspection failed: ' + errorMessage(error));
    }
  }

  async function requestPermission(): Promise<void> {
    try {
      await nativeSpikes.requestAlwaysAuthorization();
      setStatus('Location permission requested. Choose Always in iOS settings.');
    } catch (error) {
      setStatus('Permission request failed: ' + errorMessage(error));
    }
  }

  async function startTracking(): Promise<void> {
    try {
      const sessionId = await nativeSpikes.startTracking(mode);
      setRecording(true);
      setRecoverable(null);
      setStatus('Recording ' + modeLabels[mode] + ' session ' + sessionId + '.');
    } catch (error) {
      setStatus('Start failed: ' + errorMessage(error));
    }
  }

  async function stopTracking(): Promise<void> {
    try {
      const finalSequence = await nativeSpikes.stopTracking();
      setRecording(false);
      setRecoverable(null);
      setStatus('Stopped after durable sequence ' + finalSequence + '.');
    } catch (error) {
      setStatus('Stop failed: ' + errorMessage(error));
    }
  }

  async function recoverTracking(): Promise<void> {
    try {
      const inspection = await nativeSpikes.recoverTrackingSession();
      setMode(inspection.mode);
      setRecording(true);
      setRecoverable(null);
      setStatus(trackingSummary({ ...inspection, recording: true }));
    } catch (error) {
      setStatus('Recovery failed: ' + errorMessage(error));
    }
  }

  async function discardRecovery(): Promise<void> {
    try {
      const inspection = await nativeSpikes.discardRecoverableTrackingSession();
      setRecoverable(null);
      setStatus(
        'Discarded recovery marker for ' +
          inspection.sessionId +
          '; its ' +
          inspection.validObservationCount +
          ' synchronized observations remain available for evidence.',
      );
    } catch (error) {
      setStatus('Discard failed: ' + errorMessage(error));
    }
  }

  async function seedFixtureA(): Promise<void> {
    try {
      const report = await nativeSpikes.seedPhase0FixtureA();
      setDiagnostic(report);
      setStatus(diagnosticSummary(report));
    } catch (error) {
      setStatus('Fixture A failed: ' + errorMessage(error));
    }
  }

  async function applyFixtureB(): Promise<void> {
    try {
      const report = await nativeSpikes.applyPhase0FixtureB(checkpoint);
      setDiagnostic(report);
      setStatus(diagnosticSummary(report));
    } catch (error) {
      setStatus('Fixture B failed: ' + errorMessage(error));
    }
  }

  async function inspectFixture(): Promise<void> {
    try {
      const report = await nativeSpikes.inspectPhase0Fixture();
      setDiagnostic(report);
      setStatus(diagnosticSummary(report));
    } catch (error) {
      setStatus('Fixture inspection failed: ' + errorMessage(error));
    }
  }

  async function shareReport(): Promise<void> {
    try {
      const path = await nativeSpikes.sharePhase0DiagnosticReport();
      setStatus('Diagnostic report prepared and shared from ' + path + '.');
    } catch (error) {
      setStatus('Report sharing failed: ' + errorMessage(error));
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text accessibilityRole="header" style={styles.heading}>
        Open Outdoor native feasibility
      </Text>
      <Text style={styles.copy}>
        Phase 0 spike only. All diagnostic records are synthetic, local, and excluded from backup.
      </Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {status}
      </Text>

      <Text accessibilityRole="header" style={styles.sectionHeading}>
        Tracker recovery
      </Text>
      <View style={styles.controls}>
        <Button title="Request Always Location" onPress={() => void requestPermission()} />
        {(Object.keys(modeLabels) as NativeTrackingMode[]).map((candidate) => (
          <Button
            key={candidate}
            title={(candidate === mode ? 'Selected: ' : '') + modeLabels[candidate]}
            disabled={recording || recoverable !== null}
            onPress={() => setMode(candidate)}
          />
        ))}
        <Button
          title="Start native tracking"
          disabled={recording || recoverable !== null}
          onPress={() => void startTracking()}
        />
        <Button
          title="Stop native tracking"
          disabled={!recording}
          onPress={() => void stopTracking()}
        />
        <Button title="Inspect tracking spool" onPress={() => void inspectTracking()} />
        <Button
          title="Recover interrupted session"
          disabled={recording || recoverable === null}
          onPress={() => void recoverTracking()}
        />
        <Button
          title="Discard recovery marker"
          disabled={recording || recoverable === null}
          onPress={() => void discardRecovery()}
        />
      </View>

      {nativeSpikes.phase0DiagnosticsEnabled ? (
        <>
          <Text accessibilityRole="header" style={styles.sectionHeading}>
            Synthetic storage diagnostics
          </Text>
          <View style={styles.controls}>
            <Button title="Seed fixture version A" onPress={() => void seedFixtureA()} />
            <Button title="Inspect current fixture" onPress={() => void inspectFixture()} />
            {activationCheckpoints.map((candidate) => (
              <Button
                key={candidate}
                title={(candidate === checkpoint ? 'Selected: ' : '') + candidate}
                onPress={() => setCheckpoint(candidate)}
              />
            ))}
            <Button
              title={'Apply version B at ' + checkpoint}
              onPress={() => void applyFixtureB()}
            />
            <Button
              title="Share diagnostic JSON"
              disabled={diagnostic === null}
              onPress={() => void shareReport()}
            />
          </View>
        </>
      ) : null}
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f6f4ec',
    flexGrow: 1,
    padding: 24,
  },
  controls: {
    gap: 10,
  },
  copy: {
    color: '#30352f',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
  },
  heading: {
    color: '#183d2b',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
  },
  sectionHeading: {
    color: '#183d2b',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 18,
  },
  status: {
    backgroundColor: '#e3eadf',
    borderRadius: 8,
    color: '#17251c',
    marginBottom: 8,
    padding: 12,
  },
});

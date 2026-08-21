import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { nativeSpikes, type NativeTrackingMode } from './nativeSpikes';

const modeLabels: Readonly<Record<NativeTrackingMode, string>> = {
  balanced: 'Balanced',
  endurance: 'Endurance',
  'high-accuracy': 'High Accuracy',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const [mode, setMode] = useState<NativeTrackingMode>('balanced');
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('Native tracker ready for Phase 0 workoff.');

  async function requestPermission(): Promise<void> {
    try {
      await nativeSpikes.requestAlwaysAuthorization();
      setStatus('Location permission requested. Choose Always in iOS settings.');
    } catch (error) {
      setStatus(`Permission request failed: ${errorMessage(error)}`);
    }
  }

  async function startTracking(): Promise<void> {
    try {
      const sessionId = await nativeSpikes.startTracking(mode);
      setRecording(true);
      setStatus(`Recording ${modeLabels[mode]} session ${sessionId}.`);
    } catch (error) {
      setStatus(`Start failed: ${errorMessage(error)}`);
    }
  }

  async function stopTracking(): Promise<void> {
    try {
      const finalSequence = await nativeSpikes.stopTracking();
      setRecording(false);
      setStatus(`Stopped after durable sequence ${finalSequence}.`);
    } catch (error) {
      setStatus(`Stop failed: ${errorMessage(error)}`);
    }
  }

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.heading}>
        Open Outdoor native feasibility
      </Text>
      <Text style={styles.copy}>
        Phase 0 spike only. It writes protected sequenced observations; it is not the production
        recorder.
      </Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {status}
      </Text>
      <View style={styles.controls}>
        <Button title="Request Always Location" onPress={() => void requestPermission()} />
        {(Object.keys(modeLabels) as NativeTrackingMode[]).map((candidate) => (
          <Button
            key={candidate}
            title={`${candidate === mode ? 'Selected: ' : ''}${modeLabels[candidate]}`}
            disabled={recording}
            onPress={() => setMode(candidate)}
          />
        ))}
        <Button
          title="Start native tracking"
          disabled={recording}
          onPress={() => void startTracking()}
        />
        <Button
          title="Stop native tracking"
          disabled={!recording}
          onPress={() => void stopTracking()}
        />
      </View>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f6f4ec',
    flex: 1,
    justifyContent: 'center',
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
  status: {
    backgroundColor: '#e3eadf',
    borderRadius: 8,
    color: '#17251c',
    marginBottom: 18,
    padding: 12,
  },
});

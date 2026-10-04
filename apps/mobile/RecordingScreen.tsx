import { useState } from 'react';
import { View } from 'react-native';
import { type NativeTrackingMode } from './nativeSpikes';
import { ProductText as Text } from './accessibility';
import {
  ProductButton,
  ProductDisclosure,
  ProductIcon,
  ProductMetric,
  ProductRow,
  usePalette,
} from './ProductComponents';
import type { HikeCaptureActions } from './HikeCaptureControls';
import type { RecordedHikeDisplay } from '@open-outdoor/recorder';

export const recordingModes: Readonly<Record<NativeTrackingMode, string>> = {
  balanced: 'Balanced',
  endurance: 'Endurance',
  'high-accuracy': 'High Accuracy',
};
export function recordingTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

/** A route preview uses durable coordinates, with no basemap or invented geometry. */
export function RecordedPathPreview({ display }: { display: RecordedHikeDisplay | null }) {
  const p = usePalette();
  const [width, setWidth] = useState(300);
  const points = display?.coordinates ?? [];
  const bounds = display?.bounds;
  const height = 180;
  const segments: { x: number; y: number; length: number; angle: number }[] = [];
  if (bounds && points.length > 1) {
    const longitudeScale = Math.cos((((bounds[1] + bounds[3]) / 2) * Math.PI) / 180);
    const dx = Math.max(0.00001, (bounds[2] - bounds[0]) * longitudeScale);
    const dy = Math.max(0.00001, bounds[3] - bounds[1]);
    const scale = Math.min(Math.max(1, width - 48) / dx, (height - 48) / dy);
    const xy = (point: readonly number[]) => [
      (width - dx * scale) / 2 + (point[0]! - bounds[0]) * longitudeScale * scale,
      (height - dy * scale) / 2 + (bounds[3] - point[1]!) * scale,
    ];
    const step = Math.max(1, Math.ceil(points.length / 120));
    for (let i = step; i < points.length + step; i += step) {
      const end = Math.min(i, points.length - 1);
      const start = i - step;
      if (start >= end || display?.breaks.some((gap) => gap > start && gap <= end)) continue;
      const a = xy(points[start]!);
      const b = xy(points[end]!);
      const x = b[0]! - a[0]!;
      const y = b[1]! - a[1]!;
      segments.push({
        x: (a[0]! + b[0]!) / 2,
        y: (a[1]! + b[1]!) / 2,
        length: Math.hypot(x, y),
        angle: Math.atan2(y, x),
      });
    }
  }
  return (
    <View
      accessible
      accessibilityLabel={
        points.length ? 'Recorded path preview. Pause gaps are preserved.' : 'No recorded path yet'
      }
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{
        height,
        backgroundColor: p.selected,
        borderRadius: 22,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {segments.map((segment, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: segment.x - segment.length / 2,
            top: segment.y - 2,
            width: segment.length,
            height: 4,
            borderRadius: 2,
            backgroundColor: p.accent,
            transform: [{ rotate: `${segment.angle}rad` }],
          }}
        />
      ))}
      {points.length < 2 ? (
        <View style={{ alignItems: 'center', gap: 12 }}>
          <ProductIcon name="explore" color={p.accent} size={40} />
          <Text style={{ color: p.muted }}>Your path appears here</Text>
        </View>
      ) : null}
    </View>
  );
}

export function RecordingScreen({
  capture,
  mode,
  onMode,
}: {
  capture: HikeCaptureActions;
  mode: NativeTrackingMode;
  onMode: (mode: NativeTrackingMode) => void;
}) {
  const p = usePalette();
  const display = capture.view?.state === 'saved' ? null : (capture.view?.display ?? null);
  const active = capture.state === 'recording' || capture.state === 'paused';
  const [modeOpen, setModeOpen] = useState(false);
  const stateLabel = {
    idle: 'Ready',
    recording: 'Recording',
    paused: 'Paused',
    recoverable: 'Interrupted',
  }[capture.state];
  return (
    <View style={{ gap: 20 }}>
      <Text
        accessibilityLiveRegion="polite"
        style={{
          color: capture.state === 'recoverable' ? p.caution : p.accent,
          backgroundColor: p.selected,
          alignSelf: 'flex-start',
          borderRadius: 24,
          paddingHorizontal: 14,
          paddingVertical: 6,
        }}
      >
        {stateLabel}
      </Text>
      {active ? (
        <Text
          accessibilityLabel={`Recorded time ${recordingTime(display?.recordedSeconds ?? 0)}`}
          style={{ color: p.text, fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'] }}
        >
          {recordingTime(display?.recordedSeconds ?? 0)}
        </Text>
      ) : null}
      <RecordedPathPreview display={display} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <ProductMetric
          label="Distance"
          value={display?.route ? `${(display.route.distanceM / 1000).toFixed(1)} km` : null}
        />
        <ProductMetric
          label="Ascent"
          value={
            display?.route?.ascentM === undefined ? null : `${Math.round(display.route.ascentM)} m`
          }
        />
        <ProductMetric
          label="GPS"
          value={display?.gpsQuality ?? null}
          degraded={display?.gpsQuality === 'Degraded' || display?.gpsQuality === 'Poor'}
        />
      </View>
      {capture.state === 'idle' ? (
        <>
          <ProductRow
            title="Recording mode"
            subtitle={recordingModes[mode]}
            icon="track"
            onPress={() => setModeOpen(!modeOpen)}
          />
          {modeOpen ? (
            <View style={{ gap: 8 }}>
              {(Object.keys(recordingModes) as NativeTrackingMode[]).map((value) => (
                <ProductButton
                  key={value}
                  label={recordingModes[value]}
                  hint={`Choose ${recordingModes[value]} recording`}
                  selected={mode === value}
                  onPress={() => {
                    onMode(value);
                    setModeOpen(false);
                  }}
                />
              ))}
            </View>
          ) : null}
          <ProductButton
            label="Start recording"
            hint="Start private location and elevation recording"
            primary
            disabled={!capture.available || capture.busy}
            onPress={() => capture.onStart()}
          />
          <ProductDisclosure title="Location access" icon="location">
            <Text>Always access supports recording with the screen locked.</Text>
            <ProductButton
              label="Allow location"
              hint="Open the device location permission request"
              disabled={!capture.available || capture.busy}
              onPress={capture.onRequestPermission}
            />
          </ProductDisclosure>
        </>
      ) : capture.state === 'recoverable' ? (
        <>
          <Text style={{ color: p.text }}>Resume from the last saved checkpoint.</Text>
          <ProductButton
            label="Resume hike"
            hint="Recover the interrupted recording from durable samples"
            primary
            disabled={!capture.available || capture.busy}
            onPress={capture.onRecover}
          />
          <ProductButton
            label="Discard hike…"
            hint="Confirm before permanently discarding the interrupted hike"
            destructive
            disabled={capture.busy}
            onPress={capture.onDiscard}
          />
        </>
      ) : (
        <>
          <ProductButton
            label={capture.state === 'paused' ? 'Resume' : 'Pause'}
            hint={
              capture.state === 'paused'
                ? 'Continue recording in a new segment'
                : 'Stop sensors and preserve a pause gap'
            }
            primary
            disabled={capture.busy}
            onPress={capture.state === 'paused' ? capture.onResume : capture.onPause}
          />
          <ProductButton
            label="Finish hike"
            hint="Review this hike before saving"
            disabled={capture.busy}
            onPress={capture.onFinish}
          />
        </>
      )}
      {capture.status.startsWith('Ready') ||
      /^Recording |^Paused |^Resumed /.test(capture.status) ? null : (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: p.text, fontSize: 14, lineHeight: 20 }}
        >
          {capture.status}
        </Text>
      )}
    </View>
  );
}

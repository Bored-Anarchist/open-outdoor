import { View } from 'react-native';
import type { RecordedHikeDisplay } from '@open-outdoor/recorder';
import { ProductText as Text } from './accessibility';
import { ProductButton } from './ProductComponents';
export type HikeCaptureState = 'idle' | 'recording' | 'paused' | 'recoverable';
export interface HikeCaptureView {
  readonly id: string;
  readonly name: string;
  readonly state: 'recording' | 'paused' | 'recoverable' | 'saved';
  readonly plannedFeatureId?: string;
  readonly display: RecordedHikeDisplay;
}
export interface HikeCaptureActions {
  readonly state: HikeCaptureState;
  readonly available: boolean;
  readonly busy: boolean;
  readonly view: HikeCaptureView | null;
  readonly status: string;
  readonly onStart: (name?: string, plannedFeatureId?: string) => Promise<boolean>;
  readonly onPause: () => Promise<boolean>;
  readonly onResume: () => Promise<boolean>;
  readonly onFinish: () => Promise<number | null>;
  readonly onRecover: () => Promise<void>;
  readonly onDiscard: () => void;
  readonly onRequestPermission: () => Promise<void>;
}
export function HikeCaptureControls({
  capture,
  plan,
}: {
  readonly capture: HikeCaptureActions;
  readonly plan?: { readonly id: string; readonly name: string };
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityLiveRegion="polite">
        {capture.state === 'recording'
          ? 'Capturing your hike offline.'
          : capture.state === 'paused'
            ? 'Hike capture paused. Recording sensors are stopped.'
            : capture.state === 'recoverable'
              ? 'An interrupted hike is ready to recover.'
              : capture.view?.state === 'saved'
                ? 'Saved hike shown on the map.'
                : 'Ready to capture a hike.'}
      </Text>
      {capture.state === 'idle' ? (
        <ProductButton
          label="Allow location for hike capture"
          hint="Open the system location permission request"
          disabled={!capture.available || capture.busy}
          onPress={capture.onRequestPermission}
        />
      ) : null}
      {capture.state === 'idle' ? (
        <ProductButton
          label={plan ? 'Capture this hike' : 'Start hike capture'}
          hint="Record location and elevation privately while keeping this map open"
          disabled={!capture.available || capture.busy}
          onPress={() => capture.onStart(plan?.name, plan?.id)}
        />
      ) : null}
      {capture.state === 'recording' ? (
        <ProductButton
          label="Pause hike capture"
          hint="Stop sensors without saving or discarding the hike"
          disabled={capture.busy}
          onPress={capture.onPause}
        />
      ) : null}
      {capture.state === 'paused' ? (
        <ProductButton
          label="Resume hike capture"
          hint="Continue recording in a new segment, preserving the pause gap"
          disabled={capture.busy}
          onPress={capture.onResume}
        />
      ) : null}
      {capture.state === 'recording' || capture.state === 'paused' ? (
        <ProductButton
          label="Finish and save hike"
          hint="Stop sensors and save this private hike and its profile"
          disabled={capture.busy}
          onPress={capture.onFinish}
        />
      ) : null}
      {capture.state === 'recoverable' ? (
        <>
          <ProductButton
            label="Recover interrupted hike"
            hint="Continue from durable samples and restore the capture on this map"
            disabled={!capture.available || capture.busy}
            onPress={capture.onRecover}
          />
          <ProductButton
            label="Discard interrupted hike"
            hint="Ask for confirmation before discarding the interrupted recording"
            disabled={capture.busy}
            destructive
            onPress={capture.onDiscard}
          />
        </>
      ) : null}
      <Text accessibilityLiveRegion="polite">{capture.status}</Text>
    </View>
  );
}

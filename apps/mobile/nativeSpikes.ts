import { requireNativeModule } from 'expo';

export type NativeTrackingMode = 'balanced' | 'endurance' | 'high-accuracy';

interface OpenOutdoorNativeSpikesModule {
  readonly policyVersion: number;
  readonly requestAlwaysAuthorization: () => Promise<void>;
  readonly startTracking: (mode: NativeTrackingMode) => Promise<string>;
  readonly stopTracking: () => Promise<number>;
  readonly isTracking: () => Promise<boolean>;
  readonly currentSessionId: () => Promise<string | null>;
  readonly lastTrackingError: () => Promise<string | null>;
}

export const nativeSpikes =
  requireNativeModule<OpenOutdoorNativeSpikesModule>('OpenOutdoorNativeSpikes');

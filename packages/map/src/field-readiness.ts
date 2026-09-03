export type FieldReadinessState = 'ready' | 'degraded' | 'blocked';

export interface FieldConditions {
  readonly networkAvailable: boolean;
  readonly offlineCatalogReady: boolean;
  readonly locationAuthorization: 'always' | 'when-in-use' | 'denied' | 'restricted';
  readonly horizontalAccuracyM: number | null;
  readonly freeStorageBytes: number;
  readonly batteryPercent: number;
  readonly thermalState: 'nominal' | 'fair' | 'serious' | 'critical';
  readonly provisioningValid: boolean;
}

export interface FieldReadiness {
  readonly state: FieldReadinessState;
  readonly code:
    | 'READY_OFFLINE'
    | 'READY_ONLINE'
    | 'DEGRADED_GPS'
    | 'DEGRADED_POWER'
    | 'BLOCKED_CATALOG'
    | 'BLOCKED_LOCATION'
    | 'BLOCKED_PROVISIONING'
    | 'BLOCKED_STORAGE';
  readonly headline: string;
  readonly guidance: string;
  readonly icon: 'check' | 'warning' | 'stop';
  readonly capabilities: {
    readonly browse: boolean;
    readonly search: boolean;
    readonly record: boolean;
  };
  readonly accessibilityLabel: string;
}

const GIB = 1024 ** 3;

export function evaluateFieldReadiness(conditions: FieldConditions): FieldReadiness {
  const result = (() => {
    if (!conditions.provisioningValid) {
      return {
        state: 'blocked',
        code: 'BLOCKED_PROVISIONING',
        headline: 'Build access expired',
        guidance: 'Install a currently provisioned build before leaving connectivity.',
        capabilities: { browse: false, search: false, record: false },
      } as const;
    }
    if (!conditions.offlineCatalogReady) {
      return {
        state: 'blocked',
        code: 'BLOCKED_CATALOG',
        headline: 'Offline catalog unavailable',
        guidance: 'Download and verify the selected region before the field session.',
        capabilities: { browse: false, search: false, record: false },
      } as const;
    }
    if (conditions.freeStorageBytes < GIB) {
      return {
        state: 'blocked',
        code: 'BLOCKED_STORAGE',
        headline: 'Storage reserve is too low',
        guidance: 'Free at least 1 GiB before recording.',
        capabilities: { browse: true, search: true, record: false },
      } as const;
    }
    if (
      conditions.locationAuthorization === 'denied' ||
      conditions.locationAuthorization === 'restricted'
    ) {
      return {
        state: 'blocked',
        code: 'BLOCKED_LOCATION',
        headline: 'Location is unavailable',
        guidance: 'Browsing remains available; enable Always Location to record.',
        capabilities: { browse: true, search: true, record: false },
      } as const;
    }
    if (conditions.horizontalAccuracyM === null || conditions.horizontalAccuracyM > 50) {
      return {
        state: 'degraded',
        code: 'DEGRADED_GPS',
        headline: 'GPS accuracy is degraded',
        guidance: 'Recording can continue with an accuracy warning and quality flag.',
        capabilities: { browse: true, search: true, record: true },
      } as const;
    }
    if (
      conditions.batteryPercent <= 15 ||
      conditions.thermalState === 'serious' ||
      conditions.thermalState === 'critical'
    ) {
      return {
        state: 'degraded',
        code: 'DEGRADED_POWER',
        headline: 'Power or temperature is constrained',
        guidance: 'Use endurance mode; reduce map detail and screen activity.',
        capabilities: { browse: true, search: true, record: true },
      } as const;
    }
    return {
      state: 'ready',
      code: conditions.networkAvailable ? 'READY_ONLINE' : 'READY_OFFLINE',
      headline: conditions.networkAvailable ? 'Ready' : 'Ready offline',
      guidance: conditions.networkAvailable
        ? 'Downloaded data is available if connectivity is lost.'
        : 'Browse, search, and record without a network connection.',
      capabilities: { browse: true, search: true, record: true },
    } as const;
  })();
  const icon =
    result.state === 'ready' ? 'check' : result.state === 'degraded' ? 'warning' : 'stop';
  return {
    ...result,
    icon,
    accessibilityLabel: `${result.state}: ${result.headline}. ${result.guidance}`,
  };
}

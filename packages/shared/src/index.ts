export type Coordinate = readonly [longitude: number, latitude: number];

export interface TrackPoint {
  readonly coordinate: Coordinate;
  readonly recordedAt: string;
}

export type AppSection = 'explore' | 'search' | 'track' | 'saved';

export type NativeCapability<T> =
  | { readonly available: true; readonly adapter: T }
  | { readonly available: false; readonly reason: string };

export interface SelectedRoute {
  readonly id: string;
  readonly name: string;
  readonly geometry: readonly Coordinate[];
  readonly origin: 'fixture' | 'public-catalog' | 'private-catalog' | 'user';
}

export interface ApplicationShellState {
  readonly section: AppSection;
  readonly selectedRoute: SelectedRoute | null;
  readonly offline: boolean;
}

export class ApplicationShell {
  private current: ApplicationShellState;

  constructor(initial: Partial<ApplicationShellState> = {}) {
    this.current = {
      section: initial.section ?? 'explore',
      selectedRoute: initial.selectedRoute ?? null,
      offline: initial.offline ?? true,
    };
  }

  get state(): ApplicationShellState {
    return this.current;
  }

  navigate(section: AppSection): ApplicationShellState {
    this.current = { ...this.current, section };
    return this.current;
  }

  selectRoute(route: SelectedRoute | null): ApplicationShellState {
    route?.geometry.forEach(assertCoordinate);
    this.current = { ...this.current, selectedRoute: route };
    return this.current;
  }
}

export interface SensorSnapshot {
  readonly relativeAltitudeM: number | null;
  readonly pressureKPa: number | null;
  readonly batteryLevel: number | null;
  readonly lowPowerMode: boolean;
  readonly motion: 'stationary' | 'walking' | 'running' | 'automotive' | 'unknown';
  readonly locationPermission: 'not-determined' | 'denied' | 'when-in-use' | 'always';
  readonly motionPermission: 'not-determined' | 'denied' | 'authorized' | 'unavailable';
  readonly recordedAt: string;
}

export interface SensorAdapter {
  readonly capability: 'native-sensors' | 'fixture-sensors';
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly read: () => Promise<SensorSnapshot>;
}

export class FixtureSensorAdapter implements SensorAdapter {
  readonly capability = 'fixture-sensors';
  private active = false;

  constructor(
    private snapshot: SensorSnapshot = {
      relativeAltitudeM: 0,
      pressureKPa: 101.325,
      batteryLevel: 1,
      lowPowerMode: false,
      motion: 'stationary',
      locationPermission: 'always',
      motionPermission: 'authorized',
      recordedAt: '2026-08-23T12:00:00.000Z',
    },
  ) {}

  async start(): Promise<void> {
    this.active = true;
  }

  async stop(): Promise<void> {
    this.active = false;
  }

  async read(): Promise<SensorSnapshot> {
    if (!this.active) throw new Error('fixture sensors are not active');
    return structuredClone(this.snapshot);
  }

  update(snapshot: SensorSnapshot): void {
    this.snapshot = structuredClone(snapshot);
  }
}

export interface KeyValueStoragePort {
  readonly get: (key: string) => Promise<string | null>;
  readonly set: (key: string, value: string) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
}

export class MemoryKeyValueStorage implements KeyValueStoragePort {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

export function assertCoordinate(value: Coordinate): Coordinate {
  const [longitude, latitude] = value;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new RangeError('coordinate is outside EPSG:4326 bounds');
  }
  return value;
}

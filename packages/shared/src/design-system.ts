/** Original Open Outdoor design primitives. Apache-2.0; no external assets. */
export const appearances = ['light', 'dark', 'high-contrast'] as const;
export type Appearance = (typeof appearances)[number];
export const designTokens = {
  brand: { name: 'Open Outdoor', principle: 'Clear information for time outside.' },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  type: { caption: 14, body: 17, title: 23, display: 34, lineHeight: 26 },
  radius: { control: 10, card: 16, badge: 6 },
  border: { normal: 2, selected: 3 },
  target: { minimum: 52 },
  elevation: { flat: 0, card: 1, sheet: 4 },
  motion: { feedbackMs: 120, reducedMs: 0 },
  haptic: { selection: 'selection', completion: 'success', error: 'warning' },
} as const;
export const palettes = {
  light: {
    background: '#f6f3eb',
    surface: '#ffffff',
    text: '#182e36',
    muted: '#485b64',
    accent: '#195b70',
    onAccent: '#ffffff',
    selected: '#d8eaf0',
    border: '#526973',
    danger: '#9d292c',
    caution: '#79520b',
    success: '#256044',
    focus: '#8645a0',
    land: '#dce5cc',
    water: '#b7d7e5',
    route: '#943562',
    location: '#164fbc',
  },
  dark: {
    background: '#111e25',
    surface: '#1c303a',
    text: '#f4f3e9',
    muted: '#bccbd0',
    accent: '#91d3e5',
    onAccent: '#112832',
    selected: '#304b59',
    border: '#a3b7c1',
    danger: '#ffb3ac',
    caution: '#f2d08d',
    success: '#9bdbb0',
    focus: '#e4b0fb',
    land: '#304335',
    water: '#244958',
    route: '#ffafd6',
    location: '#b2d1ff',
  },
  'high-contrast': {
    background: '#000000',
    surface: '#000000',
    text: '#ffffff',
    muted: '#eeeeee',
    accent: '#a5eaff',
    onAccent: '#000000',
    selected: '#163e4b',
    border: '#ffffff',
    danger: '#ffbdbd',
    caution: '#fff19d',
    success: '#b4ffd0',
    focus: '#ffffff',
    land: '#192b1b',
    water: '#103244',
    route: '#ffc2ea',
    location: '#c9e0ff',
  },
} as const;
export type Palette = { readonly [K in keyof typeof palettes.light]: string };
export type IconName =
  | 'explore'
  | 'search'
  | 'track'
  | 'saved'
  | 'info'
  | 'warning'
  | 'stop'
  | 'check'
  | 'private'
  | 'offline'
  | 'clock';
/** Original 24-unit line geometry; render without a downloaded icon font. */
export const iconPaths: Readonly<
  Record<IconName, readonly (readonly (readonly [number, number])[])[]>
> = {
  explore: [
    [
      [3, 19],
      [9, 5],
      [13, 12],
      [16, 8],
      [22, 19],
      [3, 19],
    ],
  ],
  search: [
    [
      [15, 15],
      [21, 21],
    ],
    [
      [16, 9],
      [14, 4],
      [8, 3],
      [3, 7],
      [3, 12],
      [7, 16],
      [12, 16],
      [16, 12],
      [16, 9],
    ],
  ],
  track: [
    [
      [5, 4],
      [19, 12],
      [5, 20],
      [5, 4],
    ],
  ],
  saved: [
    [
      [6, 3],
      [18, 3],
      [18, 21],
      [12, 16],
      [6, 21],
      [6, 3],
    ],
  ],
  info: [
    [
      [12, 10],
      [12, 18],
    ],
    [
      [12, 5],
      [12, 6],
    ],
  ],
  warning: [
    [
      [12, 3],
      [22, 21],
      [2, 21],
      [12, 3],
    ],
    [
      [12, 9],
      [12, 14],
    ],
    [
      [12, 17],
      [12, 18],
    ],
  ],
  stop: [
    [
      [7, 2],
      [17, 2],
      [22, 7],
      [22, 17],
      [17, 22],
      [7, 22],
      [2, 17],
      [2, 7],
      [7, 2],
    ],
    [
      [7, 12],
      [17, 12],
    ],
  ],
  check: [
    [
      [4, 12],
      [9, 18],
      [21, 5],
    ],
  ],
  private: [
    [
      [5, 10],
      [19, 10],
      [19, 21],
      [5, 21],
      [5, 10],
    ],
    [
      [8, 10],
      [8, 5],
      [12, 2],
      [16, 5],
      [16, 10],
    ],
  ],
  offline: [
    [
      [3, 3],
      [21, 21],
    ],
    [
      [3, 10],
      [8, 6],
      [16, 6],
      [21, 10],
    ],
    [
      [8, 15],
      [12, 12],
      [16, 15],
    ],
    [
      [12, 19],
      [12, 20],
    ],
  ],
  clock: [
    [
      [12, 3],
      [19, 6],
      [22, 12],
      [19, 19],
      [12, 22],
      [5, 19],
      [2, 12],
      [5, 6],
      [12, 3],
    ],
    [
      [12, 7],
      [12, 12],
      [16, 14],
    ],
  ],
};
export type Tone = 'info' | 'caution' | 'danger' | 'success';
export interface StateDescription {
  readonly title: string;
  readonly message: string;
  readonly icon: IconName;
  readonly tone: Tone;
}
export const fieldStates = {
  empty: {
    title: 'Nothing here yet',
    message: 'Try another area or clear your filters.',
    icon: 'search',
    tone: 'info',
  },
  loading: {
    title: 'Loading local data',
    message: 'Your recording controls remain available.',
    icon: 'clock',
    tone: 'info',
  },
  error: {
    title: 'Could not complete the action',
    message: 'Your saved data is retained. Try again when ready.',
    icon: 'warning',
    tone: 'danger',
  },
  stale: {
    title: 'Source may be out of date',
    message: 'Review the source date. Conditions may have changed.',
    icon: 'clock',
    tone: 'caution',
  },
  'gps-degraded': {
    title: 'GPS quality reduced',
    message: 'Position and distance may be less accurate.',
    icon: 'warning',
    tone: 'caution',
  },
  offline: {
    title: 'Offline',
    message: 'Installed information is available. Live conditions cannot be verified.',
    icon: 'offline',
    tone: 'info',
  },
  'permission-denied': {
    title: 'Location permission denied',
    message: 'Allow location in Settings before starting a recording.',
    icon: 'stop',
    tone: 'danger',
  },
  'provisioning-expired': {
    title: 'App provisioning expired',
    message: 'Renew the installation before field use. Keep your private data.',
    icon: 'stop',
    tone: 'danger',
  },
  activating: {
    title: 'Activating catalog',
    message: 'The current catalog stays available until validation succeeds.',
    icon: 'clock',
    tone: 'info',
  },
  rollback: {
    title: 'Previous catalog restored',
    message: 'The update failed. The last valid catalog remains available.',
    icon: 'warning',
    tone: 'caution',
  },
  'partial-import': {
    title: 'Import partially completed',
    message: 'Review accepted and rejected items before retrying.',
    icon: 'warning',
    tone: 'caution',
  },
  'insufficient-space': {
    title: 'More storage needed',
    message: 'Free space before retrying. Private activities are never removed automatically.',
    icon: 'stop',
    tone: 'danger',
  },
  conflict: {
    title: 'Sources disagree',
    message: 'Review each source and its date. Access is not confirmed.',
    icon: 'warning',
    tone: 'caution',
  },
  'private-unavailable': {
    title: 'Private extension unavailable',
    message: 'Private source details cannot be shown. Public information remains separate.',
    icon: 'private',
    tone: 'caution',
  },
  'rights-excluded': {
    title: 'Content excluded by source rights',
    message: 'This content is not available in this catalog.',
    icon: 'stop',
    tone: 'info',
  },
  'private-origin': {
    title: 'Private information',
    message: 'Stored for your use. This label does not grant sharing rights.',
    icon: 'private',
    tone: 'info',
  },
  closure: {
    title: 'Closure reported',
    message: 'Do not assume access. Review the restriction and effective dates.',
    icon: 'stop',
    tone: 'danger',
  },
  unknown: {
    title: 'Access unknown',
    message: 'Missing information is not permission. Check the managing authority.',
    icon: 'info',
    tone: 'caution',
  },
  recording: {
    title: 'Recording',
    message: 'Location samples are being recorded on this device.',
    icon: 'track',
    tone: 'success',
  },
  paused: {
    title: 'Recording paused',
    message: 'Resume when ready. Paused movement is excluded.',
    icon: 'stop',
    tone: 'info',
  },
  recoverable: {
    title: 'Recording interrupted',
    message: 'Recover from the last durable checkpoint or deliberately discard.',
    icon: 'warning',
    tone: 'caution',
  },
  'low-battery': {
    title: 'Battery low',
    message: 'Review remaining battery and your recording mode.',
    icon: 'warning',
    tone: 'caution',
  },
  'checkpoint-error': {
    title: 'Checkpoint failed',
    message: 'New samples may not be durable. Keep the app open and review storage.',
    icon: 'stop',
    tone: 'danger',
  },
  complete: {
    title: 'Saved on this device',
    message: 'The operation completed. Review the saved result.',
    icon: 'check',
    tone: 'success',
  },
} as const satisfies Record<string, StateDescription>;
export type FieldState = keyof typeof fieldStates;
export const componentCatalog = {
  button: ['default', 'pressed', 'focused', 'selected', 'disabled', 'busy', 'destructive'],
  navigation: ['default', 'selected', 'focused'],
  fieldNotice: Object.keys(fieldStates) as FieldState[],
  badge: ['public-catalog', 'private-catalog', 'user', 'unknown'],
  card: ['default', 'selected', 'empty'],
  search: ['default', 'focused', 'populated', 'empty', 'disabled'],
  metric: ['available', 'unknown', 'degraded'],
  detail: ['fresh', 'stale', 'unknown', 'conflict', 'closure', 'private-origin'],
  legend: ['collapsed', 'expanded'],
} as const;
export function toneColor(palette: Palette, tone: Tone): string {
  return tone === 'info' ? palette.accent : palette[tone];
}
export function feedback(
  event: 'recording' | 'favorite' | 'catalog' | 'import' | 'filter' | 'error',
  reduceMotion: boolean,
  hapticsEnabled: boolean,
) {
  return {
    durationMs: reduceMotion ? designTokens.motion.reducedMs : designTokens.motion.feedbackMs,
    haptic: !hapticsEnabled
      ? null
      : event === 'error'
        ? designTokens.haptic.error
        : event === 'catalog' || event === 'import'
          ? designTokens.haptic.completion
          : designTokens.haptic.selection,
  };
}
export function originLabel(origin: string): string {
  return (
    (
      {
        'public-catalog': 'Public catalog',
        fixture: 'Synthetic fixture',
        'private-catalog': 'Private catalog',
        user: 'Private activity',
      } as Record<string, string>
    )[origin] ?? 'Origin unknown'
  );
}

export interface DetailPresentation {
  readonly name: string;
  readonly origin: string;
  readonly source: string;
  readonly coverage: string;
  readonly freshness: string;
  readonly restrictions: string;
  readonly uncertainty: string;
  readonly provenance: string;
}

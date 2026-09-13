import type { Appearance } from './design-system';
export interface AccessibilityPreferences {
  readonly boldText: boolean;
  readonly reduceMotion: boolean;
  readonly increasedContrast: boolean;
  readonly screenReader: boolean;
}
export const defaultAccessibilityPreferences: AccessibilityPreferences = {
  boldText: false,
  reduceMotion: false,
  increasedContrast: false,
  screenReader: false,
};
export function accessibleAppearance(
  system: 'light' | 'dark' | 'unspecified' | null | undefined,
  override: Appearance | null,
  increasedContrast: boolean,
): Appearance {
  if (increasedContrast) return 'high-contrast';
  return override ?? (system === 'dark' ? 'dark' : 'light');
}
/** Deduplicates state announcements; statistics must not continuously interrupt VoiceOver. */
export class AnnouncementGate {
  private previous: string | null = null;
  next(text: string, enabled: boolean): string | null {
    if (!enabled) {
      this.previous = null;
      return null;
    }
    const message = text.trim();
    if (!message || message === this.previous) return null;
    this.previous = message;
    return message;
  }
}

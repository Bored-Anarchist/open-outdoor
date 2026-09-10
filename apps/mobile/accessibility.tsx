import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Text as NativeText, type TextProps } from 'react-native';
import {
  AnnouncementGate,
  defaultAccessibilityPreferences,
  type AccessibilityPreferences,
} from '@open-outdoor/shared';

export const AccessibilityContext = createContext(defaultAccessibilityPreferences);
export function useDeviceAccessibility(): AccessibilityPreferences {
  const [settings, setSettings] = useState(defaultAccessibilityPreferences);
  useEffect(() => {
    let alive = true;
    const subscribe = (
      key: keyof AccessibilityPreferences,
      event:
        | 'boldTextChanged'
        | 'reduceMotionChanged'
        | 'darkerSystemColorsChanged'
        | 'screenReaderChanged',
      read: () => Promise<boolean>,
    ) => {
      let changed = false;
      const subscription = AccessibilityInfo.addEventListener(event, (value) => {
        changed = true;
        if (alive) setSettings((previous) => ({ ...previous, [key]: value }));
      });
      void read()
        .then((value) => {
          if (alive && !changed) setSettings((previous) => ({ ...previous, [key]: value }));
        })
        .catch(() => {
          /* Keep readable defaults; never disable recording for an unavailable preference API. */
        });
      return subscription;
    };
    const subscriptions = [
      subscribe('reduceMotion', 'reduceMotionChanged', AccessibilityInfo.isReduceMotionEnabled),
      subscribe('screenReader', 'screenReaderChanged', AccessibilityInfo.isScreenReaderEnabled),
      ...(Platform.OS === 'ios'
        ? [
            subscribe('boldText', 'boldTextChanged', AccessibilityInfo.isBoldTextEnabled),
            subscribe(
              'increasedContrast',
              'darkerSystemColorsChanged',
              AccessibilityInfo.isDarkerSystemColorsEnabled,
            ),
          ]
        : []),
    ];
    return () => {
      alive = false;
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);
  return settings;
}
export function useAnnouncement(message: string): void {
  const { screenReader } = useContext(AccessibilityContext);
  const gate = useRef(new AnnouncementGate());
  useEffect(() => {
    const text = gate.current.next(message, screenReader);
    if (text && Platform.OS === 'ios')
      AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
  }, [message, screenReader]);
}
/** Preserves Dynamic Type and Bold Text without clipping at a fixed number of lines. */
export function ProductText({ style, ...props }: TextProps) {
  const { boldText } = useContext(AccessibilityContext);
  return (
    <NativeText {...props} allowFontScaling style={[style, boldText && { fontWeight: '700' }]} />
  );
}

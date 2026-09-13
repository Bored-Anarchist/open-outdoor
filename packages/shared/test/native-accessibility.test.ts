import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({
  listeners: new Map<string, (value: boolean) => void>(),
  removed: vi.fn(),
  announce: vi.fn(),
  bold: vi.fn(() => Promise.resolve(false)),
}));
vi.mock('../../../apps/mobile/node_modules/react-native', () => ({
  Pressable: 'button',
  Text: 'text',
  View: 'view',
  Platform: { OS: 'ios' },
  AccessibilityInfo: {
    addEventListener: (event: string, listener: (value: boolean) => void) => {
      native.listeners.set(event, listener);
      return {
        remove: () => {
          native.listeners.delete(event);
          native.removed();
        },
      };
    },
    isBoldTextEnabled: native.bold,
    isReduceMotionEnabled: async () => false,
    isScreenReaderEnabled: async () => true,
    isDarkerSystemColorsEnabled: async () => false,
    announceForAccessibilityWithOptions: native.announce,
  },
}));
import {
  AccessibilityContext,
  ProductText,
  useDeviceAccessibility,
  useAnnouncement,
} from '../../../apps/mobile/accessibility';
import { ProductButton } from '../../../apps/mobile/ProductComponents';
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let tree: ReturnType<typeof create> | undefined;
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.clearAllMocks();
});
describe('WP-502 native component behavior (mock host)', () => {
  it('does not let a stale initial preference overwrite a later native event', async () => {
    let resolveInitial!: (value: boolean) => void;
    native.bold.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveInitial = resolve;
        }),
    );
    function Probe() {
      const preferences = useDeviceAccessibility();
      return React.createElement('text', null, String(preferences.boldText));
    }
    await act(async () => {
      tree = create(React.createElement(Probe));
    });
    await act(async () => {
      native.listeners.get('boldTextChanged')!(true);
      resolveInitial(false);
    });
    expect(tree!.root.findByType('text').children).toEqual(['true']);
  });
  it('updates Bold Text and contrast from native events and removes all subscriptions', async () => {
    function Probe() {
      const preferences = useDeviceAccessibility();
      return React.createElement(
        AccessibilityContext.Provider,
        { value: preferences },
        React.createElement(
          ProductText,
          { testID: String(preferences.increasedContrast) },
          'Readable',
        ),
      );
    }
    await act(async () => {
      tree = create(React.createElement(Probe));
    });
    await act(async () => {
      native.listeners.get('boldTextChanged')!(true);
      native.listeners.get('darkerSystemColorsChanged')!(true);
    });
    const text = tree!.root.findByType('text');
    expect(text.props.allowFontScaling).toBe(true);
    expect(text.props.style).toContainEqual({ fontWeight: '700' });
    expect(text.props.testID).toBe('true');
    await act(async () => tree!.unmount());
    tree = undefined;
    expect(native.listeners.size).toBe(0);
    expect(native.removed).toHaveBeenCalledTimes(4);
  });
  it('announces status transitions once through the iOS queue', async () => {
    function Probe({ message }: { message: string }) {
      useAnnouncement(message);
      return null;
    }
    const render = (message: string) =>
      React.createElement(
        AccessibilityContext.Provider,
        {
          value: {
            boldText: false,
            reduceMotion: false,
            increasedContrast: false,
            screenReader: true,
          },
        },
        React.createElement(Probe, { message }),
      );
    await act(async () => {
      tree = create(render('Paused'));
    });
    await act(async () => tree!.update(render('Paused')));
    await act(async () => tree!.update(render('Resumed')));
    expect(native.announce).toHaveBeenCalledTimes(2);
    expect(native.announce).toHaveBeenLastCalledWith('Resumed', { queue: true });
  });
  it('blocks duplicate async presses and exposes busy/expanded/focus states', async () => {
    let complete!: () => void;
    const onPress = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    await act(async () => {
      tree = create(
        React.createElement(ProductButton, {
          label: 'Save',
          hint: 'Save privately',
          expanded: true,
          onPress,
        }),
      );
    });
    let button = tree!.root.findByType('button');
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
    });
    button = tree!.root.findByType('button');
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
      expanded: true,
    });
    await act(async () => complete());
    expect(tree!.root.findByType('button').props.accessibilityState.busy).toBe(false);
    await act(async () => tree!.root.findByType('button').props.onFocus());
    expect(tree!.root.findByType('button').props.style({ pressed: false }).borderWidth).toBe(3);
  });
});

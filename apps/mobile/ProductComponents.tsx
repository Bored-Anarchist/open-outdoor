import { ProductText as Text, useAnnouncement } from './accessibility';
import { createContext, useContext, useState, useRef, type ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import {
  designTokens as t,
  palettes,
  fieldStates,
  iconPaths,
  originLabel,
  toneColor,
  type Appearance,
  type FieldState,
  type IconName,
} from '@open-outdoor/shared';

export const AppearanceContext = createContext<Appearance>('light');
export function usePalette() {
  return palettes[useContext(AppearanceContext)];
}

/** Shared line geometry rendered natively without an icon font or network dependency. */
export function ProductIcon({
  name,
  color,
  size = 24,
}: {
  name: IconName;
  color: string;
  size?: number;
}) {
  const scale = size / 24;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      {iconPaths[name].flatMap((path, pathIndex) =>
        path.slice(1).map((point, index) => {
          const previous = path[index]!;
          const dx = (point[0] - previous[0]) * scale;
          const dy = (point[1] - previous[1]) * scale;
          const length = Math.hypot(dx, dy);
          return (
            <View
              key={`${pathIndex}-${index}`}
              style={{
                position: 'absolute',
                backgroundColor: color,
                height: 2,
                borderRadius: 1,
                width: length,
                left: ((previous[0] + point[0]) * scale) / 2 - length / 2,
                top: ((previous[1] + point[1]) * scale) / 2 - 1,
                transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
              }}
            />
          );
        }),
      )}
    </View>
  );
}
export interface ProductButtonProps {
  readonly label: string;
  readonly hint: string;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly destructive?: boolean;
  readonly busy?: boolean;
  readonly icon?: IconName;
  readonly onPress: () => void | Promise<unknown>;
  readonly expanded?: boolean;
}
export function ProductButton({
  label,
  hint,
  disabled = false,
  selected = false,
  destructive = false,
  busy = false,
  icon,
  expanded,
  onPress,
}: ProductButtonProps) {
  const p = usePalette();
  const [focused, setFocused] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useAnnouncement(error);
  const inFlight = useRef(false);
  const unavailable = disabled || busy || pending;
  const color = destructive ? p.danger : p.text;
  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable, selected, busy: busy || pending, expanded }}
      disabled={unavailable}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={() => {
        if (inFlight.current || unavailable) return;
        inFlight.current = true;
        setPending(true);
        setError('');
        void Promise.resolve()
          .then(onPress)
          .catch(() => setError('Action could not complete. Please try again.'))
          .finally(() => {
            inFlight.current = false;
            setPending(false);
          });
      }}
      style={({ pressed }) => ({
        minHeight: t.target.minimum,
        minWidth: t.target.minimum,
        borderRadius: t.radius.control,
        borderWidth: selected || focused ? t.border.selected : t.border.normal,
        borderColor: focused ? p.focus : destructive ? p.danger : p.border,
        backgroundColor: pressed || selected ? p.selected : p.surface,
        paddingHorizontal: t.space.lg,
        paddingVertical: t.space.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.space.sm,
        opacity: unavailable ? 0.6 : 1,
      })}
    >
      {icon ? <ProductIcon name={icon} color={color} /> : null}
      <Text
        style={{
          color,
          flexShrink: 1,
          fontSize: t.type.body,
          fontWeight: '700',
          textAlign: 'center',
        }}
      >
        {error
          ? `${label}. ${error}`
          : busy || pending
            ? `${label}…`
            : selected
              ? `${label} · Selected`
              : label}
      </Text>
    </Pressable>
  );
}
export function ProductCard({
  title,
  children,
  selected = false,
}: {
  title: string;
  children: ReactNode;
  selected?: boolean;
}) {
  const p = usePalette();
  return (
    <View
      style={{
        backgroundColor: selected ? p.selected : p.surface,
        borderColor: p.border,
        borderWidth: selected ? 3 : 1,
        borderRadius: t.radius.card,
        padding: t.space.lg,
        gap: t.space.md,
        marginBottom: t.space.lg,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: p.text, fontSize: t.type.title, fontWeight: '700' }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}
export function FieldNotice({ state, detail }: { state: FieldState; detail?: string }) {
  const p = usePalette();
  const notice = fieldStates[state];
  const color = toneColor(p, notice.tone);
  return (
    <View
      accessible
      accessibilityLabel={`${notice.title}. ${detail ?? notice.message}`}
      accessibilityRole={notice.tone === 'danger' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={{
        borderColor: color,
        borderWidth: 2,
        borderLeftWidth: 6,
        borderRadius: t.radius.card,
        padding: t.space.lg,
        marginBottom: t.space.lg,
        backgroundColor: p.surface,
        gap: t.space.sm,
      }}
    >
      <View style={{ flexDirection: 'row', gap: t.space.sm, alignItems: 'center' }}>
        <ProductIcon name={notice.icon} color={color} />
        <Text style={{ color, flexShrink: 1, fontSize: t.type.body, fontWeight: '700' }}>
          {notice.title}
        </Text>
      </View>
      <Text style={{ color: p.text, fontSize: t.type.body, lineHeight: t.type.lineHeight }}>
        {detail ?? notice.message}
      </Text>
    </View>
  );
}
export function OriginBadge({ origin }: { origin: string }) {
  const p = usePalette();
  return (
    <Text
      style={{
        color: p.text,
        borderColor: p.border,
        borderWidth: 1,
        borderRadius: t.radius.badge,
        padding: t.space.sm,
        fontSize: t.type.caption,
        alignSelf: 'flex-start',
      }}
    >
      {originLabel(origin)}
    </Text>
  );
}
export function ProductMetric({
  label,
  value,
  degraded = false,
}: {
  label: string;
  value: string | null;
  degraded?: boolean;
}) {
  const p = usePalette();
  return (
    <Text
      style={{
        color: degraded ? p.caution : p.text,
        fontSize: t.type.body,
        lineHeight: t.type.lineHeight,
      }}
    >
      {label}: {value ?? 'Unknown'}
      {degraded ? ' · Reduced confidence' : ''}
    </Text>
  );
}
export const controlGroup: ViewStyle = { gap: t.space.md, marginBottom: t.space.lg };

export function ProductDetail({
  detail,
}: {
  detail: import('@open-outdoor/shared').DetailPresentation;
}) {
  const p = usePalette();
  return (
    <ProductCard title={detail.name}>
      <OriginBadge origin={detail.origin} />
      {(
        ['source', 'coverage', 'freshness', 'restrictions', 'uncertainty', 'provenance'] as const
      ).map((key) => (
        <Text
          key={key}
          style={{ color: p.text, fontSize: t.type.body, lineHeight: t.type.lineHeight }}
        >
          <Text style={{ fontWeight: '700' }}>{key[0]!.toUpperCase() + key.slice(1)}: </Text>
          {detail[key]}
        </Text>
      ))}
    </ProductCard>
  );
}

import { ProductText as Text, useAnnouncement } from './accessibility';

import { useState, useRef, type ReactNode } from 'react';

import { Platform, Pressable, View, type ViewStyle } from 'react-native';

import {
  designTokens as t,
  fieldStates,
  iconPaths,
  originLabel,
  toneColor,
  type FieldState,
  type IconName,
  type AppSection,
} from '@open-outdoor/shared';

import { usePalette } from './theme';
export { AppearanceContext, usePalette } from './theme';

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
  readonly primary?: boolean;

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

  primary = false,

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

  const color = destructive ? p.danger : primary ? p.onAccent : p.text;

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

        borderWidth: focused ? t.border.selected : 1,

        borderColor: focused
          ? p.focus
          : destructive
            ? p.danger
            : selected || primary
              ? p.accent
              : p.border,

        backgroundColor: primary ? p.accent : selected || pressed ? p.selected : p.surface,

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
        {error ? `${label}. ${error}` : busy || pending ? `${label}…` : label}
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

        borderWidth: selected ? 2 : p.background === '#000000' ? 1 : 0,

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

        borderWidth: p.background === '#000000' ? 1 : 0,

        borderRadius: t.radius.card,

        padding: t.space.lg,

        marginBottom: t.space.lg,

        backgroundColor: p.background,

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

        backgroundColor: p.selected,

        borderRadius: t.radius.badge,

        paddingHorizontal: t.space.md,
        paddingVertical: t.space.xs,

        fontSize: t.type.caption,

        alignSelf: 'flex-start',
      }}
    >
      {originLabel(origin).replace(' catalog', '').replace(' activity', '')}
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
    <View
      accessible
      accessibilityLabel={`${label}: ${value ?? 'Unknown'}${degraded ? '. Reduced confidence' : ''}`}
      style={{
        paddingVertical: 8,
        gap: 6,
        flexBasis: 80,
        flexGrow: 1,
      }}
    >
      <Text style={{ color: p.muted, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      <Text
        style={{
          color: degraded ? p.caution : p.text,
          fontSize: 24,
          lineHeight: 32,
          fontWeight: '800',
        }}
      >
        {value ?? '—'}
      </Text>
      {degraded ? <Text style={{ color: p.caution, fontSize: 13 }}>Reduced confidence</Text> : null}
    </View>
  );
}

export const controlGroup: ViewStyle = { gap: t.space.md, marginBottom: t.space.lg };

/** A single readable row, including a text and shape companion for switches. */
export function ProductRow({
  title,
  subtitle,
  icon = 'folder',
  onPress,
  checked,
  disabled = false,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  onPress: () => void | Promise<unknown>;
  checked?: boolean;
  disabled?: boolean;
}) {
  const p = usePalette();
  const [pending, setPending] = useState(false);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  useAnnouncement(error);
  return (
    <Pressable
      accessibilityRole={checked === undefined ? 'button' : 'switch'}
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{
        disabled: disabled || pending,
        busy: pending,
        ...(checked === undefined ? {} : { checked }),
      }}
      disabled={disabled || pending}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={() => {
        if (inFlight.current) return;
        inFlight.current = true;
        setPending(true);
        setError('');
        void Promise.resolve()
          .then(onPress)
          .catch(() => setError('Could not finish. Try again.'))
          .finally(() => {
            inFlight.current = false;
            setPending(false);
          });
      }}
      style={({ pressed }) => ({
        minHeight: 78,
        padding: 16,
        borderRadius: 14,
        backgroundColor: pressed ? p.selected : p.surface,
        borderWidth: focused ? 3 : p.background === '#000000' ? 1 : 0,
        borderColor: focused ? p.focus : p.border,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        opacity: disabled || pending ? 0.6 : 1,
      })}
    >
      <ProductIcon name={icon} color={p.accent} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: p.text, fontSize: 17, fontWeight: '700' }}>{title}</Text>
        {subtitle || error ? (
          <Text style={{ color: error ? p.danger : p.muted, fontSize: 14, lineHeight: 20 }}>
            {error || subtitle}
          </Text>
        ) : null}
      </View>
      {checked === undefined ? (
        <Text style={{ color: p.muted, fontSize: 23 }}>›</Text>
      ) : (
        <View
          accessibilityElementsHidden
          style={{
            width: 44,
            height: 26,
            borderRadius: 13,
            backgroundColor: checked ? p.accent : p.border,
            padding: 2,
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: checked ? p.onAccent : p.surface,
              alignSelf: checked ? 'flex-end' : 'flex-start',
            }}
          />
        </View>
      )}
    </Pressable>
  );
}

export function ProductDisclosure({
  title,
  children,
  icon = 'info',
}: {
  title: string;
  children: ReactNode;
  icon?: IconName;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 12 }}>
      <ProductButton
        label={title}
        hint={open ? 'Hide details' : 'Read details'}
        icon={icon}
        expanded={open}
        onPress={() => setOpen(!open)}
      />
      {open ? children : null}
    </View>
  );
}

export function ProductHeader({
  title,
  onBack,
  onSettings,
}: {
  title: string;
  onBack?: () => void;
  onSettings?: () => void;
}) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      {onBack ? (
        <ProductButton label="Back" hint="Return to the previous page" onPress={onBack} />
      ) : null}
      <Text
        accessibilityRole="header"
        style={{
          flex: 1,
          color: p.text,
          fontSize: 25,
          fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        }}
      >
        {title}
      </Text>
      {onSettings ? (
        <ProductIconButton label="Settings" icon="settings" onPress={onSettings} />
      ) : null}
    </View>
  );
}

export function ProductIconButton({
  label,
  icon,
  onPress,
  selected = false,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  selected?: boolean;
}) {
  const p = usePalette();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => ({
        minWidth: 52,
        minHeight: 52,
        borderRadius: 26,
        borderWidth: focused ? 3 : 1,
        borderColor: focused ? p.focus : p.border,
        backgroundColor: selected || pressed ? p.selected : p.surface,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <ProductIcon name={icon} color={p.accent} />
    </Pressable>
  );
}

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

/** Persistent section switcher, with labels that remain visible at larger text sizes. */

export function ProductNavigation({
  section,
  onChange,
}: {
  section: AppSection | null;
  onChange: (section: AppSection) => void;
}) {
  const p = usePalette();

  return (
    <View
      accessibilityLabel="Primary navigation"
      style={{
        flexDirection: 'row',
        backgroundColor: p.surface,
        borderTopWidth: 1,
        borderTopColor: p.border,
        paddingHorizontal: 8,
        paddingTop: 8,
        paddingBottom: 8,
        gap: 4,
      }}
    >
      {(['explore', 'search', 'track', 'saved'] as const).map((item) => (
        <Pressable
          key={item}
          accessibilityRole="tab"
          accessibilityState={{ selected: section === item }}
          accessibilityLabel={item[0].toUpperCase() + item.slice(1)}
          onPress={() => onChange(item)}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 58,
            borderRadius: 16,
            paddingVertical: 8,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            backgroundColor: section === item || pressed ? p.selected : p.surface,
          })}
        >
          <ProductIcon name={item} color={section === item ? p.accent : p.muted} size={22} />

          <Text
            style={{
              color: section === item ? p.text : p.muted,
              fontWeight: '700',
              fontSize: 12,
              textAlign: 'center',
            }}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

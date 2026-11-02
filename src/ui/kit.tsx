import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DisplayStatus } from '../engine/types';
import { color, font, MAX_WIDTH, radius, space, type } from './theme';

// ---------------------------------------------------------------- text

type TextProps = { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number; accessibilityRole?: 'header' };

export const Display = (p: TextProps) => <Text accessibilityRole="header" {...p} style={[type.display, p.style]} />;
export const Title = (p: TextProps) => <Text accessibilityRole="header" {...p} style={[type.title, p.style]} />;
export const Heading = (p: TextProps) => <Text accessibilityRole="header" {...p} style={[type.heading, p.style]} />;
export const Label = (p: TextProps) => <Text {...p} style={[type.label, p.style]} />;
export const Body = (p: TextProps) => <Text {...p} style={[type.body, p.style]} />;
export const Small = (p: TextProps) => <Text {...p} style={[type.small, p.style]} />;
export const Micro = (p: TextProps) => <Text {...p} style={[type.micro, p.style]} />;

// ---------------------------------------------------------------- layout

export function Screen({
  children,
  scroll = true,
  footer,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const inner = <View style={[styles.column, style]}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        <View style={[styles.scroll, { flex: 1 }]}>{inner}</View>
      )}
      {footer ? (
        <View style={styles.footerWrap}>
          <View style={styles.footer}>{footer}</View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export const Gap = ({ h = space.lg }: { h?: number }) => <View style={{ height: h }} />;

export const Rule = ({ style }: { style?: StyleProp<ViewStyle> }) => <View style={[styles.rule, style]} />;

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.md }, style]}>{children}</View>;
}

export function BackLink({ label = 'Back' }: { label?: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))}
      style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
      hitSlop={12}
    >
      <Text style={[type.label, { color: color.cobalt }]}>‹ {label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- buttons

type ButtonKind = 'primary' | 'secondary' | 'quiet' | 'danger';

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  style,
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const k = buttonKinds[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        k.box,
        pressed && !disabled && k.pressed,
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={k.text.color as string} /> : <Text style={[styles.buttonText, k.text]}>{title}</Text>}
    </Pressable>
  );
}

const buttonKinds: Record<ButtonKind, { box: ViewStyle; pressed: ViewStyle; text: TextStyle }> = {
  primary: {
    box: { backgroundColor: color.cobalt, borderBottomWidth: 4, borderBottomColor: color.cobaltDeep },
    pressed: { borderBottomWidth: 1, marginTop: 3 },
    text: { color: color.white },
  },
  secondary: {
    box: { backgroundColor: color.surface, borderWidth: 1.5, borderColor: color.ink, borderBottomWidth: 4 },
    pressed: { borderBottomWidth: 1.5, marginTop: 2.5 },
    text: { color: color.ink },
  },
  quiet: {
    box: { backgroundColor: 'transparent', minHeight: 44 },
    pressed: { opacity: 0.6 },
    text: { color: color.cobalt },
  },
  danger: {
    box: { backgroundColor: color.surface, borderWidth: 1.5, borderColor: color.brick },
    pressed: { opacity: 0.7 },
    text: { color: color.brick },
  },
};

// ---------------------------------------------------------------- chips and choices

export function Chip({
  label,
  selected,
  onPress,
  disabled,
  note,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, disabled && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}
    >
      <Text style={[type.label, { color: selected ? color.white : color.ink }]}>{label}</Text>
      {note ? <Text style={[type.micro, { color: selected ? color.cobaltWash : color.inkFaint }]}>{note}</Text> : null}
    </Pressable>
  );
}

/** A full-width selectable row, for onboarding answers. */
export function OptionRow({
  label,
  detail,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  detail?: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: !!selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.option, selected && styles.optionOn, disabled && { opacity: 0.45 }, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.radio, selected && styles.radioOn]} />
      <View style={{ flex: 1 }}>
        <Text style={type.label}>{label}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- status stamp

const STAMP: Record<DisplayStatus, { label: string; fg: string; bg: string; border: string }> = {
  new: { label: 'New', fg: color.inkFaint, bg: 'transparent', border: color.rule },
  learning: { label: 'Learning', fg: color.inkSoft, bg: color.paperDeep, border: color.paperDeep },
  practicing: { label: 'Practicing', fg: color.cobaltDeep, bg: color.cobaltWash, border: color.cobaltWash },
  review: { label: 'Review due', fg: color.brass, bg: color.brassWash, border: color.brassBright },
  secure: { label: 'Secure', fg: color.white, bg: color.brass, border: color.brass },
};

export function Stamp({ status }: { status: DisplayStatus }) {
  const s = STAMP[status];
  return (
    <View style={[styles.stamp, { backgroundColor: s.bg, borderColor: s.border }]} accessibilityLabel={`Status: ${s.label}`}>
      <Text style={[styles.stampText, { color: s.fg }]}>{status === 'secure' ? `✓ ${s.label}` : s.label}</Text>
    </View>
  );
}

export const statusLabel = (s: DisplayStatus) => STAMP[s].label;

// ---------------------------------------------------------------- list row

export function LinkRow({
  title,
  detail,
  right,
  onPress,
}: {
  title: string;
  detail?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: color.paperDeep }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.label}>{title}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
      </View>
      {right}
      {onPress ? <Text style={[type.heading, { color: color.inkFaint }]}>›</Text> : null}
    </Pressable>
  );
}

/** A plate: the one raised surface, used sparingly for the primary block on a screen. */
export function Plate({ children, style, tone = 'surface' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'surface' | 'brass' | 'cobalt' }) {
  const toneStyle =
    tone === 'brass'
      ? { backgroundColor: color.brassWash, borderColor: color.brassBright }
      : tone === 'cobalt'
        ? { backgroundColor: color.cobaltWash, borderColor: color.cobaltWash }
        : null;
  return <View style={[styles.plate, toneStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  scroll: { flexGrow: 1, paddingHorizontal: space.lg + 4, paddingTop: space.lg, paddingBottom: space.xxl },
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  footerWrap: { borderTopWidth: 1, borderTopColor: color.rule, backgroundColor: color.paper },
  footer: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg + 4, paddingTop: space.md, paddingBottom: space.lg, gap: space.sm },
  rule: { height: 1, backgroundColor: color.rule },
  back: { alignSelf: 'flex-start', paddingVertical: space.sm, marginBottom: space.sm },
  button: { minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  buttonText: { fontFamily: font.heading, fontSize: 17, letterSpacing: -0.1 },
  buttonDisabled: { opacity: 0.4 },
  chip: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.ruleStrong,
    backgroundColor: color.surface,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: color.cobalt, borderColor: color.cobalt },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.rule,
    backgroundColor: color.surface,
  },
  optionOn: { borderColor: color.cobalt, backgroundColor: color.cobaltWash },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: color.ruleStrong },
  radioOn: { borderColor: color.cobalt, borderWidth: 6 },
  stamp: { borderWidth: 1.5, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  stampText: { fontFamily: font.label, fontSize: 12.5, letterSpacing: 0.1 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md + 2,
    paddingHorizontal: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.rule,
    minHeight: 56,
  },
  plate: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.rule,
    padding: space.lg + 2,
    gap: space.sm,
  },
});

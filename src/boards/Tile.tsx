import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { color, font, radius } from '../ui/theme';

export type TileState = 'idle' | 'selected' | 'placed' | 'right' | 'wrong' | 'fixed' | 'empty';
export type TileSize = 'lg' | 'md' | 'sm';

const SIZES: Record<TileSize, { h: number; px: number; fs: number; depth: number }> = {
  lg: { h: 72, px: 20, fs: 30, depth: 6 },
  md: { h: 54, px: 14, fs: 22, depth: 5 },
  sm: { h: 40, px: 10, fs: 17, depth: 3 },
};

const PALETTE: Record<TileState, { bg: string; border: string; base: string; text: string; dashed?: boolean }> = {
  idle: { bg: color.surface, border: color.ruleStrong, base: '#9AA597', text: color.ink },
  selected: { bg: color.cobalt, border: color.cobalt, base: color.cobaltDeep, text: color.white },
  placed: { bg: color.surface, border: color.ruleStrong, base: '#9AA597', text: color.ink },
  right: { bg: color.verdigrisWash, border: color.verdigris, base: color.verdigris, text: color.ink },
  wrong: { bg: color.brickWash, border: color.brick, base: color.brick, text: color.ink },
  fixed: { bg: color.paperDeep, border: color.paperDeep, base: color.paperDeep, text: color.inkSoft },
  empty: { bg: 'transparent', border: color.ruleStrong, base: 'transparent', text: color.inkFaint, dashed: true },
};

/**
 * The number tile: a keycap. It sinks when pressed, which is the one piece of
 * motion every puzzle shares.
 */
export function Tile({
  label,
  state = 'idle',
  size = 'md',
  onPress,
  accessibilityLabel,
  style,
  minWidth,
  fill,
}: {
  label: string;
  state?: TileState;
  size?: TileSize;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  minWidth?: number;
  /** Stretch to fill the parent row (keypads). */
  fill?: boolean;
}) {
  const s = SIZES[size];
  const p = PALETTE[state];
  const body = (pressed: boolean) => (
    <View
      style={[
        styles.tile,
        {
          minHeight: s.h,
          minWidth: minWidth ?? s.h * 0.78,
          paddingHorizontal: s.px,
          backgroundColor: p.bg,
          borderColor: p.border,
          borderBottomColor: p.base,
          borderBottomWidth: pressed ? 1.5 : s.depth,
          marginTop: pressed ? s.depth - 1.5 : 0,
          borderStyle: p.dashed ? 'dashed' : 'solid',
        },
        style,
      ]}
    >
      <Text style={[styles.text, { fontSize: s.fs, color: p.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
      {state === 'right' || state === 'wrong' ? (
        <Text style={[styles.mark, { color: state === 'right' ? color.verdigris : color.brick }]}>{state === 'right' ? '✓' : '✗'}</Text>
      ) : null}
    </View>
  );
  const wrap = fill ? { flex: 1 } : undefined;
  if (!onPress) return <View style={wrap} accessibilityLabel={accessibilityLabel ?? label}>{body(false)}</View>;
  return (
    <Pressable
      style={wrap}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: state === 'selected' }}
      onPress={onPress}
      hitSlop={4}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  text: { fontFamily: font.bodyBold, fontVariant: ['tabular-nums'], letterSpacing: 0.3 },
  mark: { fontFamily: font.heading, fontSize: 15 },
});

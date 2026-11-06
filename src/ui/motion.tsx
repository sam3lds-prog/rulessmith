/**
 * The motion kit: a few short, purposeful movements, every one of them off
 * when the learner or the device asks for reduced motion (then each shows its
 * end state at once). Nothing here moves on its own except in answer to
 * something the learner did.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { TrackId } from '../content';
import { useMotion } from '../feel/director';
import { color, font, type } from './theme';

const native = Platform.OS !== 'web';

/**
 * A card that rises into place. `cue` adds one small movement after it lands:
 * a slight swell for a right answer, a single sideways nudge for a wrong one.
 */
export function Rise({ children, cue = 'none', style }: { children: ReactNode; cue?: 'none' | 'right' | 'wrong'; style?: StyleProp<ViewStyle> }) {
  const motion = useMotion();
  const [enter] = useState(() => new Animated.Value(motion ? 0 : 1));
  const [shift] = useState(() => new Animated.Value(0));
  const [swell] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!motion) return;
    const steps: Animated.CompositeAnimation[] = [Animated.timing(enter, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: native })];
    if (cue === 'wrong') steps.push(Animated.sequence([-6, 5, -2, 0].map((v) => Animated.timing(shift, { toValue: v, duration: 55, useNativeDriver: native }))));
    if (cue === 'right')
      steps.push(
        Animated.sequence([
          Animated.timing(swell, { toValue: 1.015, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: native }),
          Animated.timing(swell, { toValue: 1, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: native }),
        ]),
      );
    const run = Animated.sequence(steps);
    run.start();
    return () => run.stop();
  }, []);
  const rise = enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return <Animated.View style={[style, { opacity: enter, transform: [{ translateY: rise }, { translateX: shift }, { scale: swell }] }]}>{children}</Animated.View>;
}

/** One segment of a progress bar. When it becomes filled, the colour sweeps in from the left. */
export function Segment({ filled, fill, base }: { filled: boolean; fill: string; base: string }) {
  const motion = useMotion();
  const [v] = useState(() => new Animated.Value(filled ? 1 : 0));
  useEffect(() => {
    if (!filled) {
      v.setValue(0);
      return;
    }
    if (!motion) {
      v.setValue(1);
      return;
    }
    const run = Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [filled]);
  const width = v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={[styles.seg, { backgroundColor: base }]}>
      <Animated.View style={[styles.segFill, { width, backgroundColor: fill }]} />
    </View>
  );
}

/** A thin bar that empties over `ms`, beside a "moving on" line. Nothing at all with reduced motion. */
export function Countdown({ ms }: { ms: number }) {
  const motion = useMotion();
  const [v] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!motion) return;
    const run = Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.linear, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, []);
  if (!motion) return null;
  const width = v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.countdown} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.countdownFill, { width }]} />
    </View>
  );
}

const HELPED = '#6F84D8';

/**
 * The recap's accuracy ring: answers right on your own, right with help, and
 * missed, drawn in one turn. The legend beside it says the same in words, so
 * nothing depends on colour.
 */
export function AccuracyRing({ own, helped, total, size = 112 }: { own: number; helped: number; total: number; size?: number }) {
  const motion = useMotion();
  const [t, setT] = useState(motion ? 0 : 1);
  useEffect(() => {
    if (!motion) return;
    let raf = 0;
    const startAt = Date.now();
    const tick = () => {
      const k = Math.min(1, (Date.now() - startAt) / 700);
      setT(1 - (1 - k) ** 3);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const stroke = 12;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const a = total ? own / total : 0;
  const b = total ? helped / total : 0;
  const missed = Math.max(0, total - own - helped);
  return (
    <View style={styles.ringRow}>
      <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={`${own} of ${total} right on your own, ${helped} right with help, ${missed} missed`}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={color.paperDeep} strokeWidth={stroke} fill="none" />
          {a > 0 ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={color.action}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${C * a * t} ${C}`}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ) : null}
          {b > 0 ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={HELPED}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${C * b * t} ${C}`}
              strokeDashoffset={-C * a * t}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ) : null}
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.ringCenter]} pointerEvents="none">
          <Text style={styles.ringNum}>{own}</Text>
          <Text style={[type.micro, { textAlign: 'center' }]}>of {total} on{'\n'}your own</Text>
        </View>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Key swatch={color.action} label={`On your own: ${own}`} />
        <Key swatch={HELPED} label={`With help or the rule shown: ${helped}`} />
        <Key swatch={color.paperDeep} label={`Missed: ${missed}`} outline />
      </View>
    </View>
  );
}

function Key({ swatch, label, outline }: { swatch: string; label: string; outline?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={[styles.swatch, { backgroundColor: swatch }, outline && { borderWidth: 1, borderColor: color.ruleStrong }]} />
      <Text style={[type.small, { color: color.ink, flex: 1 }]}>{label}</Text>
    </View>
  );
}

/**
 * Each track's mark, drawn from its idea: twelve dots in three equal groups
 * (divisibility), a factor tree (primes and factors), a loop that goes one
 * step past where it started (remainders). Decorative: hidden from screen readers.
 */
export function TrackGlyph({ track, size = 32, tone = 'wash' }: { track: TrackId; size?: number; tone?: 'wash' | 'solid' }) {
  const ink = tone === 'solid' ? color.white : color.action;
  const bg = tone === 'solid' ? color.action : color.actionWash;
  return (
    <View style={[styles.glyph, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: bg }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 28 28">
        {track === 'div'
          ? [5.2, 14, 22.8].flatMap((cx) => [-1.7, 1.7].flatMap((dx) => [-1.7, 1.7].map((dy) => <Circle key={`${cx}${dx}${dy}`} cx={cx + dx} cy={14 + dy} r={1.3} fill={ink} />)))
          : null}
        {track === 'pf' ? (
          <>
            <Line x1={14} y1={7} x2={8.5} y2={15} stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
            <Line x1={14} y1={7} x2={19.5} y2={15} stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
            <Line x1={19.5} y1={15} x2={16} y2={22} stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
            <Line x1={19.5} y1={15} x2={23} y2={22} stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
            <Circle cx={14} cy={7} r={2.6} fill={ink} />
            <Circle cx={8.5} cy={15} r={2.2} fill={ink} />
            <Circle cx={19.5} cy={15} r={2.2} fill={ink} />
            <Circle cx={16} cy={22} r={2} fill={ink} />
            <Circle cx={23} cy={22} r={2} fill={ink} />
          </>
        ) : null}
        {track === 'rem' ? (
          <>
            <Path d="M14 6 A8 8 0 1 1 7.1 10" stroke={ink} strokeWidth={1.8} fill="none" strokeLinecap="round" />
            <Path d="M5.2 7.6 L7.1 10 L9.9 9.2" stroke={ink} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={14} cy={6} r={2.2} fill={ink} />
            <Circle cx={18.6} cy={7.4} r={1.5} fill={ink} />
          </>
        ) : null}
        {track === 'frac' ? (
          <>
            <Line x1={7} y1={14} x2={21} y2={14} stroke={ink} strokeWidth={1.8} strokeLinecap="round" />
            <Circle cx={14} cy={8.5} r={2.2} fill={ink} />
            <Circle cx={14} cy={19.5} r={2.2} fill={ink} />
          </>
        ) : null}
        {track === 'ratio' ? (
          <>
            <Path d="M7 20 V12 M12 20 V8 M17 20 V14 M22 20 V10" stroke={ink} strokeWidth={2.2} strokeLinecap="round" />
          </>
        ) : null}
        {track === 'pct' ? (
          <>
            <Line x1={20} y1={7} x2={8} y2={21} stroke={ink} strokeWidth={1.8} strokeLinecap="round" />
            <Circle cx={9} cy={9} r={2.4} fill={ink} />
            <Circle cx={19} cy={19} r={2.4} fill={ink} />
          </>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  segFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  countdown: { height: 3, borderRadius: 2, backgroundColor: color.paperDeep, overflow: 'hidden', flex: 1 },
  countdownFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: color.inkFaint, borderRadius: 2 },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  ringNum: { fontFamily: font.num, fontSize: 30, lineHeight: 34, color: color.ink, fontVariant: ['tabular-nums'] },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  glyph: { alignItems: 'center', justifyContent: 'center' },
});

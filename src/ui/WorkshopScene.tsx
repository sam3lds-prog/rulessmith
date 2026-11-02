import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useAmbientMotion } from '../feel/director';
import { ITEM_BY_ID } from '../world/catalog';

/**
 * The workshop: one original scene (window, bench, shelf, lamp) that fills in
 * as objects are earned. Drawn as layered vectors in a 600 × 400 box and scaled
 * to its container. Ambient motion (the turning gear) stops with reduced
 * motion or Focus.
 */
export function WorkshopScene({ owned, style, compact = false }: { owned: Set<string>; style?: StyleProp<ViewStyle>; compact?: boolean }) {
  const has = (id: string) => owned.has(id);
  const lit = has('bench-lamp');
  const names = [...owned].map((id) => ITEM_BY_ID[id]?.name).filter(Boolean);
  const label = names.length ? `Your workshop, with: ${names.join(', ')}.` : 'Your workshop. The bench lamp is not lit yet.';

  return (
    <View style={[styles.frame, compact && styles.compact, style]} accessibilityRole="image" accessibilityLabel={label}>
      <Svg width="100%" height="100%" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#F4CB62" stopOpacity="0.55" />
            <Stop offset="0.55" stopColor="#F4CB62" stopOpacity="0.18" />
            <Stop offset="1" stopColor="#F4CB62" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Wall and floor */}
        <Rect width="600" height="400" fill="#E6EDE2" />
        <Rect y="300" width="600" height="100" fill="#E2D9C5" />

        {lit ? <Circle cx="360" cy="200" r="170" fill="url(#glow)" /> : null}

        {/* Pennant string */}
        {has('pennant') ? (
          <G>
            <Path d="M212 18 Q300 44 388 18" stroke="#8C7B63" strokeWidth="2" fill="none" />
            {[232, 262, 292, 322, 352].map((x, i) => (
              <Path key={x} d={`M${x - 11} ${24 + (i === 2 ? 6 : i % 2 ? 4 : 1)} l11 22 l11 -22 z`} fill={['#D9CBE9', '#F1CF9F', '#C9DCC4', '#CBE3EA', '#F1CF9F'][i]} />
            ))}
          </G>
        ) : null}

        {/* Window */}
        <Path d="M58 192 V108 A67 67 0 0 1 192 108 V192 Z" fill="#FBF7EC" />
        <Path d="M71 182 V110 A54 54 0 0 1 179 110 V182 Z" fill="#CBE2E8" />
        <Rect x="122" y="56" width="6" height="128" fill="#FBF7EC" />
        <Rect x="71" y="120" width="108" height="6" fill="#FBF7EC" />
        {has('curtains') ? (
          <G>
            <Path d="M46 40 q18 76 2 162 h30 q-12 -84 2 -162 z" fill="#D9CBE9" />
            <Path d="M204 40 q-18 76 -2 162 h-30 q12 -84 -2 -162 z" fill="#D9CBE9" />
          </G>
        ) : null}

        {/* Wall clock and ribbon */}
        {has('harbor-clock') ? (
          <G>
            <Circle cx="250" cy="80" r="25" fill="#FBF7EC" stroke="#B88A55" strokeWidth="4" />
            <Line x1="250" y1="80" x2="250" y2="64" stroke="#23302E" strokeWidth="3" strokeLinecap="round" />
            <Line x1="250" y1="80" x2="262" y2="86" stroke="#23302E" strokeWidth="3" strokeLinecap="round" />
          </G>
        ) : null}
        {has('weekly-ribbon') ? (
          <G>
            <Path d="M374 82 l-8 26 l10 -6 l6 10 z M390 82 l8 26 l-10 -6 l-6 10 z" fill="#C98E3A" />
            <Circle cx="382" cy="74" r="13" fill="#E9C46A" stroke="#C98E3A" strokeWidth="3" />
          </G>
        ) : null}

        {/* Shelf with its objects */}
        <Rect x="404" y="118" width="164" height="10" rx="3" fill="#C79B6B" />
        <Path d="M424 128 v14 l10 -14 z M548 128 v14 l-10 -14 z" fill="#B0845A" />
        <Rect x="530" y="78" width="22" height="40" rx="7" fill="#CDBFE6" />
        {has('discovery-card') ? (
          <G>
            <Rect x="412" y="84" width="27" height="34" rx="3" fill="#FFFDF7" stroke="#C8B98F" strokeWidth="1.5" />
            <SvgText x="425.5" y="105" fontSize="9" fontWeight="bold" fill="#23302E" textAnchor="middle">
              3≠9
            </SvgText>
          </G>
        ) : null}
        {has('gate-token') ? <Circle cx="452" cy="107" r="10" fill="#E3B54F" stroke="#B8862B" strokeWidth="2" /> : null}
        {has('prime-jar') ? (
          <G>
            <Rect x="466" y="86" width="22" height="32" rx="6" fill="#D7ECEF" />
            <Rect x="470" y="104" width="6" height="6" rx="1" fill="#E6A65D" />
            <Rect x="478" y="100" width="6" height="6" rx="1" fill="#8FB7C4" />
            <Rect x="472" y="94" width="6" height="6" rx="1" fill="#B9A3DD" />
          </G>
        ) : null}
        {has('foundry-token') ? <Circle cx="500" cy="108" r="9" fill="#F1CF9F" stroke="#C98E3A" strokeWidth="2" /> : null}
        {has('harbor-token') ? <Circle cx="518" cy="110" r="8" fill="#BFDDE6" stroke="#6E9FAE" strokeWidth="2" /> : null}

        {/* Bookshelf: a second shelf filled with books */}
        {has('bookshelf') ? (
          <G>
            <Rect x="404" y="190" width="164" height="10" rx="3" fill="#C79B6B" />
            {[
              [412, 40, '#B9A3DD'],
              [424, 46, '#7FB0A5'],
              [436, 38, '#E6A65D'],
              [448, 44, '#8FB7C4'],
              [460, 36, '#D47C6B'],
              [476, 42, '#C9DCC4'],
            ].map(([x, h, c]) => (
              <Rect key={String(x)} x={x as number} y={190 - (h as number)} width="11" height={h as number} rx="2" fill={c as string} />
            ))}
          </G>
        ) : null}

        {/* Rug and fern on the floor */}
        {has('rug') ? (
          <G>
            <Ellipse cx="310" cy="372" rx="175" ry="20" fill="#E9C9A1" />
            <Ellipse cx="310" cy="372" rx="150" ry="13" fill="none" stroke="#D3A877" strokeWidth="3" />
          </G>
        ) : null}

        {/* Bench */}
        <Rect x="55" y="282" width="510" height="20" rx="8" fill="#C2966A" />
        <Rect x="62" y="296" width="496" height="7" rx="3" fill="#A97F57" />
        <Rect x="88" y="300" width="18" height="80" rx="4" fill="#A97F57" />
        <Rect x="514" y="300" width="18" height="80" rx="4" fill="#A97F57" />

        {has('fern') ? (
          <G>
            <Path d="M30 300 q-22 -30 -12 -54 q8 26 14 48 q2 -34 18 -52 q-4 30 -6 52 q16 -22 34 -26 q-14 18 -26 34 z" fill="#7FA77A" />
            <Path d="M14 336 h44 l-6 46 h-32 z" fill="#C98E5E" />
          </G>
        ) : null}

        {/* Objects on the bench */}
        {has('globe') ? (
          <G>
            <Rect x="117" y="272" width="16" height="10" rx="3" fill="#8F9A84" />
            <Path d="M100 246 a25 25 0 1 0 50 0" stroke="#8F9A84" strokeWidth="3" fill="none" />
            <Circle cx="125" cy="246" r="22" fill="#BFDDE6" />
            <Path d="M112 236 q8 -6 14 2 q6 8 -4 14 q-10 2 -10 -16 z M132 252 q8 -2 8 8 q-6 4 -10 -2 z" fill="#9CC79A" />
          </G>
        ) : null}
        {has('pencil-mug') ? (
          <G>
            <Line x1="186" y1="252" x2="182" y2="232" stroke="#E6A65D" strokeWidth="4" strokeLinecap="round" />
            <Line x1="194" y1="252" x2="198" y2="230" stroke="#8FB7C4" strokeWidth="4" strokeLinecap="round" />
            <Rect x="176" y="250" width="28" height="32" rx="6" fill="#F5E6CC" stroke="#D9BF8F" strokeWidth="2" />
          </G>
        ) : null}
        {has('recall-bell') ? (
          <G>
            <Path d="M232 276 q0 -30 18 -32 q18 2 18 32 z" fill="#E3B54F" stroke="#B8862B" strokeWidth="2" />
            <Rect x="226" y="274" width="48" height="8" rx="3" fill="#B8862B" />
            <Circle cx="250" cy="240" r="4" fill="#B8862B" />
          </G>
        ) : null}
        {has('telescope') ? (
          <G>
            <Line x1="500" y1="281" x2="488" y2="246" stroke="#8F9A84" strokeWidth="4" strokeLinecap="round" />
            <Line x1="500" y1="281" x2="512" y2="246" stroke="#8F9A84" strokeWidth="4" strokeLinecap="round" />
            <Rect x="470" y="222" width="58" height="16" rx="7" fill="#B88A55" transform="rotate(-24 499 230)" />
            <Rect x="462" y="236" width="18" height="12" rx="4" fill="#9E7346" transform="rotate(-24 471 242)" />
          </G>
        ) : null}

        {/* The lamp: unlit until the first mission */}
        <Rect x="334" y="273" width="52" height="9" rx="4" fill="#8F9A84" />
        <Rect x="356" y="204" width="8" height="72" fill="#8F9A84" />
        <Path d="M328 208 L392 208 L376 160 L344 160 Z" fill={lit ? '#E2B451' : '#A9BFA6'} />
      </Svg>
      {has('brass-gear') ? <Gear compact={compact} /> : null}
    </View>
  );
}

/** The turning gear, drawn separately so it can rotate. */
function Gear({ compact }: { compact: boolean }) {
  const ambient = useAmbientMotion();
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!ambient) {
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [ambient]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const teeth = Array.from({ length: 10 }, (_, i) => i * 36);
  return (
    <Animated.View pointerEvents="none" style={[styles.gear, compact && styles.gearCompact, { transform: [{ rotate }] }]}>
      <Svg width="100%" height="100%" viewBox="0 0 80 80">
        {teeth.map((deg) => (
          <Rect key={deg} x="35" y="2" width="10" height="16" rx="2" fill="#C99A3B" transform={`rotate(${deg} 40 40)`} />
        ))}
        <Circle cx="40" cy="40" r="27" fill="#C99A3B" />
        <Circle cx="40" cy="40" r="10" fill="#E6EDE2" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 1.5, borderRadius: 24, overflow: 'hidden', backgroundColor: '#E6EDE2' },
  compact: { aspectRatio: 2.1 },
  // Gear box: centre (300, 120), 80 units wide, in the 600 × 400 scene.
  gear: { position: 'absolute', left: '43.3%', top: '20%', width: '13.3%', aspectRatio: 1 },
  // In the compact (2.1 : 1) frame the scene is cropped top and bottom, so the gear sits higher.
  gearCompact: { top: '8%' },
});

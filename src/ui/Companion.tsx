import { useEffect, useRef } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useAmbientMotion } from '../feel/director';
import { color } from './theme';

/**
 * The workshop companion: a small, warm keycap with a face. It reacts with
 * curiosity and delight. It never looks hurt or disappointed, after a mistake
 * or a hint. Animation is small and facial; it stops with reduced motion or Focus.
 */
export type Mood = 'curious' | 'thinking' | 'pleased' | 'celebrating' | 'calm';

const LABEL: Record<Mood, string> = {
  curious: 'The workshop companion looks curious',
  thinking: 'The workshop companion is thinking',
  pleased: 'The workshop companion looks pleased',
  celebrating: 'The workshop companion is celebrating',
  calm: 'The workshop companion smiles encouragingly',
};

export function Companion({ mood = 'curious', size = 56, style }: { mood?: Mood; size?: number; style?: StyleProp<ViewStyle> }) {
  const ambient = useAmbientMotion();
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!ambient || (mood !== 'pleased' && mood !== 'celebrating')) {
      bob.setValue(0);
      return;
    }
    const a = Animated.sequence([
      Animated.timing(bob, { toValue: -4, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    a.start();
    return () => a.stop();
  }, [mood, ambient]);

  return (
    <Animated.View style={[{ width: size, height: size, transform: [{ translateY: bob }] }, style]} accessibilityLabel={LABEL[mood]} accessibilityRole="image">
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {/* Body: a soft keycap with a warm lower edge. */}
        <Rect x="4" y="8" width="56" height="52" rx="16" fill="#E7C98F" />
        <Rect x="4" y="4" width="56" height="50" rx="16" fill={color.warmth} />
        {mood === 'celebrating' ? (
          <>
            <Path d="M8 6 l2 -4 l2 4 l4 2 l-4 2 l-2 4 l-2 -4 l-4 -2 z" fill={color.goldBright} />
            <Path d="M52 4 l1.5 -3 l1.5 3 l3 1.5 l-3 1.5 l-1.5 3 l-1.5 -3 l-3 -1.5 z" fill={color.goldBright} />
          </>
        ) : null}
        <Face mood={mood} />
      </Svg>
    </Animated.View>
  );
}

function Face({ mood }: { mood: Mood }) {
  const ink = color.ink;
  switch (mood) {
    case 'pleased':
    case 'celebrating':
      return (
        <>
          <Path d="M20 28 q4 -5 8 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
          <Path d="M36 28 q4 -5 8 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
          <Path d="M22 36 q10 10 20 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      );
    case 'thinking':
      return (
        <>
          <Circle cx="26" cy="25" r="3" fill={ink} />
          <Circle cx="42" cy="25" r="3" fill={ink} />
          <Path d="M26 39 h12" stroke={ink} strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case 'calm':
      return (
        <>
          <Circle cx="24" cy="27" r="3" fill={ink} />
          <Circle cx="40" cy="27" r="3" fill={ink} />
          <Path d="M26 37 q6 5 12 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      );
    case 'curious':
    default:
      return (
        <>
          <Circle cx="24" cy="27" r="3.4" fill={ink} />
          <Circle cx="40" cy="27" r="3.4" fill={ink} />
          <Path d="M25 37 q7 6 14 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      );
  }
}

/** A tiny inline companion for list rows. */
export const CompanionDot = ({ mood = 'curious' }: { mood?: Mood }) => (
  <View style={{ width: 28, height: 28 }}>
    <Companion mood={mood} size={28} />
  </View>
);

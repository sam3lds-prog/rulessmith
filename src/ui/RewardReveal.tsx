import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { feel, useReduceMotion } from '../feel/director';
import { useApp } from '../state/store';
import { ITEM_BY_ID } from '../world/catalog';
import { color, type } from './theme';
import { WorkshopScene } from './WorkshopScene';

/**
 * The workshop before and after a mission: the new object fades in over about
 * two seconds. It can be skipped at once, and with reduced motion the finished
 * scene shows straight away (Focus too). The result is already saved either way.
 */
export function RewardReveal({ owned, newItems }: { owned: Set<string>; newItems: string[] }) {
  // Reduced motion and Focus both show the finished scene at once.
  const reduceMotion = useReduceMotion();
  const focus = useApp((st) => st.settings.focus);
  const reduce = reduceMotion || focus;
  const before = new Set([...owned].filter((id) => !newItems.includes(id)));
  const fade = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const [done, setDone] = useState(reduce);
  useEffect(() => {
    feel('projectReveal');
    if (reduce) return;
    const a = Animated.timing(fade, { toValue: 1, duration: 2000, delay: 300, useNativeDriver: true });
    a.start(() => setDone(true));
    return () => a.stop();
  }, []);
  const names = newItems.map((id) => ITEM_BY_ID[id]?.name).filter(Boolean);
  return (
    <View accessibilityLabel={`New in your workshop: ${names.join(', ')}.`}>
      <View>
        <WorkshopScene owned={before} />
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents="none">
          <WorkshopScene owned={owned} />
        </Animated.View>
      </View>
      {!done ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            fade.stopAnimation();
            fade.setValue(1);
            setDone(true);
          }}
          style={styles.skip}
          hitSlop={8}
        >
          <Text style={[type.label, { color: color.action }]}>Skip</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  skip: { position: 'absolute', right: 12, top: 12, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
});

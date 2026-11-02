import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { APP_NAME } from '../config';
import { useApp } from '../state/store';
import { CoinBadge } from './kit';
import { color, font, space } from './theme';

/** The top of each main screen: the wordmark, Workshop Coins, and settings and account. */
export function AppHeader() {
  const coins = useApp((s) => s.tokens);
  return (
    <View style={styles.row}>
      <Text style={styles.wordmark} accessibilityRole="header">
        {APP_NAME}.
      </Text>
      <View style={styles.right}>
        <CoinBadge count={Math.max(0, coins)} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings and account"
          onPress={() => router.push('/you')}
          hitSlop={8}
          style={({ pressed }) => [styles.icon, pressed && { opacity: 0.6 }]}
        >
          <Feather name="settings" size={20} color={color.ink} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
  wordmark: { fontFamily: font.display, fontSize: 26, lineHeight: 32, color: color.ink },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface, borderWidth: 1, borderColor: color.rule },
});

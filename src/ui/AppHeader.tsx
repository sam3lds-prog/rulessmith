import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { APP_NAME } from '../config';
import { color, font, space } from './theme';

/** The top of each main screen: the wordmark, and settings and account. */
export function AppHeader() {
  return (
    <View style={styles.row}>
      <Text style={styles.wordmark} accessibilityRole="header">
        {APP_NAME}
      </Text>
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
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
  wordmark: { fontFamily: font.display, fontSize: 20, lineHeight: 26, letterSpacing: -0.4, color: color.ink },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface, borderWidth: 1, borderColor: color.rule },
});

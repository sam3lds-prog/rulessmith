import { StyleSheet, View } from 'react-native';
import { Tile } from './Tile';

/**
 * On-screen number pad, so answers never depend on the system keyboard.
 * `digits` lays the keys out as two rows of five (the Number Forge keys).
 */
export function Keypad({
  onDigit,
  onBack,
  disabled,
  layout = 'phone',
}: {
  onDigit: (d: number) => void;
  onBack: () => void;
  disabled?: boolean;
  layout?: 'phone' | 'digits';
}) {
  const press = (fn: () => void) => (disabled ? undefined : fn);
  if (layout === 'digits') {
    return (
      <View style={[styles.pad, { maxWidth: 420 }]} accessibilityLabel="Digit keys">
        {[
          [0, 1, 2, 3, 4],
          [5, 6, 7, 8, 9],
        ].map((row) => (
          <View key={row.join()} style={styles.row}>
            {row.map((d) => (
              <Tile key={d} label={String(d)} size="md" fill onPress={press(() => onDigit(d))} />
            ))}
          </View>
        ))}
        <View style={styles.row}>
          <View style={{ flex: 3 }} />
          <Tile label="⌫" size="sm" fill onPress={press(onBack)} accessibilityLabel="Delete" />
        </View>
      </View>
    );
  }
  const rows = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ];
  return (
    <View style={styles.pad} accessibilityLabel="Number pad">
      {rows.map((row) => (
        <View key={row.join()} style={styles.row}>
          {row.map((d) => (
            <Tile key={d} label={String(d)} size="md" fill onPress={press(() => onDigit(d))} />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        <View style={styles.key} />
        <Tile label="0" size="md" fill onPress={press(() => onDigit(0))} />
        <Tile label="⌫" size="md" fill onPress={press(onBack)} accessibilityLabel="Delete" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { gap: 8, width: '100%', maxWidth: 360, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: 8 },
  key: { flex: 1 },
});

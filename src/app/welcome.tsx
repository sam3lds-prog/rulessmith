import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { track } from '../analytics/track';
import { ItemScreen } from '../boards/ItemScreen';
import { Tile } from '../boards/Tile';
import { APP_NAME, APP_TAGLINE } from '../config';
import { generateItem } from '../content';
import { useApp } from '../state/store';
import { Body, Button, Gap, Heading, Screen, Small } from '../ui/kit';
import { color, font, space } from '../ui/theme';

type Stage = 'intro' | 'puzzle' | 'after';

export default function Welcome() {
  const [stage, setStage] = useState<Stage>('intro');
  const [last, setLast] = useState<{ correct: boolean; ms: number } | null>(null);
  const setTried = useApp((s) => s.setTriedPuzzle);
  const item = useMemo(() => generateItem('div.digit-sum/sort', 2, Math.floor(Math.random() * 2 ** 30) + 1), []);

  if (stage === 'puzzle') {
    return (
      <ItemScreen
        key={item.id}
        item={item}
        header={<Small style={{ marginBottom: space.xs }}>Your first puzzle. No sign-up.</Small>}
        onAnswered={(a) => {
          const r = { correct: a.correct, ms: a.ms };
          setLast(r);
          setTried(r);
          track('try_puzzle_answered', { correct: a.correct, ms: a.ms });
        }}
        onContinue={() => setStage('after')}
        continueLabel="Continue"
      />
    );
  }

  if (stage === 'after') {
    const secs = last ? Math.round(last.ms / 1000) : 0;
    return (
      <Screen footer={<Button title="Build my plan" onPress={() => router.push('/onboarding/about')} />}>
        <Gap h={space.xxl} />
        <Text style={styles.big}>{last?.correct ? `Sorted in ${secs} seconds.` : 'Now you know the rule.'}</Text>
        <Gap />
        <Body>
          That was one rule turned into a move. {APP_NAME} works the same way for every number-property topic on the GMAT and
          GRE: learn the rule, then prove it on puzzles that keep getting harder.
        </Body>
        <Gap />
        <Body>
          Answer a few questions and take a short placement check, and you'll get a week-by-week plan that adjusts to your
          results.
        </Body>
        <Gap />
        <Small>About 60 seconds of questions. You can skip the placement check.</Small>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button title="Try a puzzle" onPress={() => setStage('puzzle')} accessibilityHint="Opens a 60-second puzzle" />}>
      <Gap h={space.xxl} />
      <Text style={styles.wordmark} accessibilityRole="header">
        {APP_NAME}
      </Text>
      <Heading style={{ color: color.inkSoft, fontFamily: font.label }}>{APP_TAGLINE}</Heading>
      <Gap h={space.xxl} />
      <View style={styles.demo} accessibilityLabel="Example: 4,872. Its digits add to 21, so it is divisible by 3 but not by 9.">
        <View style={styles.tiles}>
          {['4', '8', '7', '2'].map((d) => (
            <Tile key={d} label={d} size="lg" />
          ))}
        </View>
        <Text style={styles.sum}>4 + 8 + 7 + 2 = 21</Text>
        <Small style={{ textAlign: 'center' }}>21 is a multiple of 3, so 4,872 is divisible by 3. It isn't a multiple of 9, so 4,872 isn't divisible by 9.</Small>
      </View>
      <Gap h={space.xxl} />
      <Body>Number-property puzzles for GMAT and GRE quant. Try one now, no sign-up. It takes about a minute.</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wordmark: { fontFamily: font.display, fontSize: 56, lineHeight: 58, letterSpacing: -2, color: color.ink },
  big: { fontFamily: font.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.6, color: color.ink },
  demo: { alignItems: 'center', gap: space.md },
  tiles: { flexDirection: 'row', gap: space.sm },
  sum: { fontFamily: font.bodyBold, fontSize: 22, color: color.cobaltDeep, fontVariant: ['tabular-nums'] },
});

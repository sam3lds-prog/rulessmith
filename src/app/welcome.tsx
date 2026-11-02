import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { track } from '../analytics/track';
import { ItemScreen } from '../boards/ItemScreen';
import { APP_NAME, APP_TAGLINE } from '../config';
import { serveItem, TEMPLATES, templatesForSkill, templateVersionOf } from '../content';
import { gameForItem } from '../games/registry';
import { useApp } from '../state/store';
import { Companion } from '../ui/Companion';
import { Body, Button, Eyebrow, Gap, Heading, Screen, Small } from '../ui/kit';
import { WorkshopScene } from '../ui/WorkshopScene';
import { color, font, space } from '../ui/theme';

type Stage = 'intro' | 'puzzle' | 'after';

export default function Welcome() {
  const [stage, setStage] = useState<Stage>('intro');
  const [last, setLast] = useState<{ correct: boolean; ms: number } | null>(null);
  const setTried = useApp((s) => s.setTriedPuzzle);
  const flagsVersion = useApp((s) => s.flagsVersion);
  // The digit-sum sort, unless it is switched off; then the nearest servable easy puzzle.
  const item = useMemo(() => {
    const seed = Math.floor(Math.random() * 2 ** 30) + 1;
    const ids = ['div.digit-sum/sort', ...templatesForSkill('div.digit-sum', 2).map((t) => t.id), ...TEMPLATES.filter((t) => (t.minLevel ?? 1) <= 2).map((t) => t.id)];
    for (const templateId of ids) {
      const it = serveItem({ templateId, level: 2, seed, version: templateVersionOf(templateId) });
      if (it) return it;
    }
    return null;
  }, [flagsVersion]);

  if (stage === 'puzzle' && item) {
    return (
      <ItemScreen
        key={item.id}
        item={item}
        support="guided"
        game={gameForItem(item)}
        eyebrow="Your first puzzle"
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
    <Screen footer={<Button title="Try a puzzle" onPress={() => (item ? setStage('puzzle') : router.push('/onboarding/about'))} accessibilityHint="Opens a 60-second puzzle" />}>
      <Gap h={space.xl} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.wordmark} accessibilityRole="header">
            {APP_NAME}.
          </Text>
          <Heading style={{ color: color.inkSoft, fontFamily: font.label }}>{APP_TAGLINE}</Heading>
        </View>
        <Companion mood="curious" size={64} />
      </View>
      <Gap h={space.xl} />
      <WorkshopScene owned={new Set()} />
      <Gap h={space.lg} />
      <Eyebrow>A workshop of ideas</Eyebrow>
      <Body style={{ marginTop: space.xs }}>
        Every rule you figure out adds something to your workshop. The first one lights the lamp.
      </Body>
      <Gap h={space.sm} />
      <Body>Number-property puzzles for GMAT and GRE quant. Try one now, no sign-up. It takes about a minute.</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wordmark: { fontFamily: font.display, fontSize: 48, lineHeight: 52, letterSpacing: -1, color: color.ink },
  big: { fontFamily: font.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.6, color: color.ink },
});

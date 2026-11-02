import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Share, StyleSheet, Text } from 'react-native';
import { ItemScreen } from '../boards/ItemScreen';
import { APP_NAME } from '../config';
import { generateItem } from '../content';
import { dailyShareText } from '../engine/daily';
import { dayKey } from '../engine/time';
import { dailySlot, useApp } from '../state/store';
import { BackLink, Body, Button, Gap, Plate, Screen, Small, Title } from '../ui/kit';
import { color, font, space } from '../ui/theme';

/** The free daily puzzle. Works without an account, on the web too (it is the shareable growth loop). */
export default function Daily() {
  const day = dayKey(Date.now());
  const done = useApp((s) => s.daily[day]);
  const profile = useApp((s) => s.profile);
  const recordDaily = useApp((s) => s.recordDaily);
  const report = useApp((s) => s.report);
  const [playing, setPlaying] = useState(!done);
  const [copied, setCopied] = useState(false);
  const item = useMemo(() => {
    const slot = dailySlot(day);
    return generateItem(slot.templateId, slot.level, slot.seed);
  }, [day]);

  // Stay on the puzzle after answering so the verdict and explanation show; "See result" moves on.
  if (playing) {
    return (
      <ItemScreen
        key={item.id}
        item={item}
        header={<BackLink label="Today" />}
        onAnswered={(a) => recordDaily(day, item, { correct: a.correct, hints: a.hintsUsed, ms: a.ms })}
        onReport={(r) => report(item, r)}
        onContinue={() => setPlaying(false)}
        continueLabel="See result"
      />
    );
  }

  const text = done ? dailyShareText(APP_NAME, day, done.correct, done.ms, done.hints) : '';
  const share = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !(navigator as Navigator & { share?: unknown }).share) {
        await navigator.clipboard?.writeText(text);
        setCopied(true);
        return;
      }
      await Share.share({ message: text });
    } catch {
      setCopied(false);
    }
  };

  return (
    <Screen footer={<Button title={profile ? 'Back to today' : 'Build my plan'} onPress={() => router.replace(profile ? '/today' : '/welcome')} />}>
      <BackLink label="Today" />
      <Small>Daily puzzle</Small>
      <Title>{done?.correct ? 'Solved.' : 'Done for today.'}</Title>
      <Gap />
      {done ? (
        <Plate>
          <Text style={styles.share}>{text}</Text>
          <Button title={copied ? 'Copied' : 'Share result'} kind="secondary" onPress={share} />
          <Small>The share never gives the answer away.</Small>
        </Plate>
      ) : null}
      <Gap />
      <Body>A new puzzle arrives tomorrow. Everyone gets the same one.</Body>
      {done ? <Small style={{ marginTop: space.sm, color: color.brass }}>+3 tokens</Small> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  share: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 25, color: color.ink },
});

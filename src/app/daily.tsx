import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Share, StyleSheet, Text } from 'react-native';
import { ItemScreen } from '../boards/ItemScreen';
import { APP_NAME } from '../config';
import { serveItem } from '../content';
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
  const flagsVersion = useApp((s) => s.flagsVersion);
  const recordDaily = useApp((s) => s.recordDaily);
  const saveDailyProgress = useApp((s) => s.saveDailyProgress);
  const report = useApp((s) => s.report);
  const [playing, setPlaying] = useState(!done);
  const [copied, setCopied] = useState(false);
  // The day's slot skips switched-off templates, so it is recomputed when the remote list changes.
  const item = useMemo(() => {
    const slot = dailySlot(day);
    return slot ? serveItem(slot) : null;
  }, [day, flagsVersion]);
  // Read once on mount: saved work for today's puzzle, if any.
  const [saved] = useState(() => {
    const p = useApp.getState().dailyProgress;
    return p && p.day === day ? p : undefined;
  });

  if (playing && !item) {
    return (
      <Screen footer={<Button title="Back to Play" onPress={() => router.replace(profile ? '/play' : '/welcome')} />}>
        <BackLink />
        <Title>No daily puzzle today</Title>
        <Gap />
        <Body>Today's puzzle has been taken down while we fix it. A new one arrives tomorrow.</Body>
      </Screen>
    );
  }

  // Stay on the puzzle after answering so the verdict and explanation show; "See result" moves on.
  if (playing && item) {
    return (
      <ItemScreen
        key={item.id}
        item={item}
        support="independent"
        header={<BackLink />}
        initialProgress={saved}
        onProgress={(p) => saveDailyProgress(day, p)}
        onAnswered={({ result: _result, ...a }) => recordDaily(day, item, a)}
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
    <Screen footer={<Button title={profile ? 'Back to Play' : 'Build my plan'} onPress={() => router.replace(profile ? '/play' : '/welcome')} />}>
      <BackLink />
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
      {done ? <Small style={{ marginTop: space.sm, color: color.gold }}>+3 Workshop Coins</Small> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  share: { fontFamily: font.bodyBold, fontSize: 17, lineHeight: 25, color: color.ink },
});

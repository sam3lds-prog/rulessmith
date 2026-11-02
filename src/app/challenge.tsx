import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SKILLS, TRACKS } from '../content';
import { maxLevelFor, ownsChallenge } from '../monetization/entitlements';
import { useApp } from '../state/store';
import { BackLink, Body, Button, Chip, Gap, Heading, OptionRow, Plate, Screen, Small, Title } from '../ui/kit';
import { color, space } from '../ui/theme';

const RANGES: { label: string; detail: string; levels: [number, number] }[] = [
  { label: 'Warm-up', detail: 'Levels 1 to 3', levels: [1, 3] },
  { label: 'Core', detail: 'Levels 4 to 7', levels: [4, 7] },
  { label: 'Hardest', detail: 'Levels 8 to 10, the hardest variants', levels: [8, 10] },
];

/** Challenge builder: the learner picks topics and difficulty; the app generates the run. */
export default function Challenge() {
  const s = useApp();
  const [picked, setPicked] = useState<string[]>([]);
  const [range, setRange] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();
  const challenge = ownsChallenge(s.entitlements, now);

  const allowed = (i: number) => {
    const [, hi] = RANGES[i].levels;
    if (hi > 7) return challenge;
    return picked.length === 0 || picked.every((id) => maxLevelFor(id, s.entitlements, now) >= hi);
  };

  const start = () => {
    const r = s.startSession('challenge', { skills: picked, levels: RANGES[range].levels });
    if (r.ok) router.push('/session');
    else setError(r.reason === 'locked' ? 'That difficulty is part of Premium or the Hardest Levels Challenge pack.' : 'Pick at least one skill.');
  };

  return (
    <Screen footer={<Button title="Start a 10-puzzle run" onPress={start} disabled={picked.length === 0 || !allowed(range)} />}>
      <BackLink />
      <Title>Challenge builder</Title>
      <Gap h={space.sm} />
      <Body>Pick the skills and the difficulty. Every puzzle is generated fresh, so you can run this as often as you like.</Body>
      {TRACKS.filter((t) => t.available).map((t) => (
        <View key={t.id} style={{ marginTop: space.lg, gap: space.sm }}>
          <Heading style={{ fontSize: 17 }}>{t.name}</Heading>
          <View style={styles.wrap}>
            {SKILLS.filter((k) => k.track === t.id).map((k) => (
              <Chip key={k.id} label={k.name} selected={picked.includes(k.id)} onPress={() => setPicked(picked.includes(k.id) ? picked.filter((x) => x !== k.id) : [...picked, k.id])} />
            ))}
          </View>
        </View>
      ))}
      <Gap h={space.xl} />
      <Heading style={{ fontSize: 17 }}>Difficulty</Heading>
      <Gap h={space.sm} />
      <View style={{ gap: space.sm }}>
        {RANGES.map((r, i) => (
          <OptionRow
            key={r.label}
            label={r.label}
            detail={allowed(i) ? r.detail : `${r.detail}. Included with Premium or the Hardest Levels Challenge pack.`}
            selected={range === i}
            onPress={() => setRange(i)}
          />
        ))}
      </View>
      {!allowed(range) ? (
        <Plate tone="warm" style={{ marginTop: space.md }}>
          <Small style={{ color: color.ink }}>This difficulty is locked for the skills you picked.</Small>
          <Button title="See Premium and packs" kind="secondary" onPress={() => router.push('/premium')} />
        </Plate>
      ) : null}
      {error ? <Small style={{ marginTop: space.sm, color: color.wrong }}>{error}</Small> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm } });

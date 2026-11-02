import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { track } from '../../analytics/track';
import { ItemScreen } from '../../boards/ItemScreen';
import { generateItem, templatesForSkill } from '../../content';
import { createRng } from '../../content/rng';
import {
  nextPlacementItem,
  placementRatings,
  PLACEMENT_MAX,
  recordPlacement,
  relevantSkills,
  startPlacement,
} from '../../engine/placement';
import { ratingFromSelf } from '../../engine/rating';
import { useApp } from '../../state/store';
import { Body, Button, Gap, Micro, Row, Screen, Small, Title } from '../../ui/kit';
import { color, radius, space } from '../../ui/theme';

export default function Placement() {
  const profile = useApp((s) => s.profile);
  const applyRatings = useApp((s) => s.applyPlacementRatings);
  const createPlan = useApp((s) => s.createPlan);
  const recordStandalone = useApp((s) => s.recordStandalone);
  const [state, setState] = useState(() => (profile ? startPlacement(profile) : null));
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<boolean | null>(null);
  const rng = useMemo(() => createRng(Date.now() & 0x7fffffff), []);

  const next = state ? nextPlacementItem(state) : null;
  const item = useMemo(() => {
    if (!next) return null;
    const ts = templatesForSkill(next.skillId, next.level).filter((t) => !t.transfer);
    const t = rng.pick(ts.length ? ts : templatesForSkill(next.skillId, next.level));
    return generateItem(t.id, next.level, rng.int(1, 2 ** 31 - 1));
  }, [next?.skillId, state?.answers.length]);

  if (!profile) return <Redirect href="/welcome" />;

  const finish = (skipped: boolean) => {
    if (skipped || !state) {
      const base = profile.currentLevel.kind === 'self' ? ratingFromSelf(profile.currentLevel.rating) : 1000;
      applyRatings(Object.fromEntries(relevantSkills(profile.exams).map((id) => [id, base])));
      track('placement_skipped', {});
    } else {
      applyRatings(placementRatings(state, profile.exams));
      track('placement_completed', { items: state.answers.length });
    }
    createPlan();
    router.replace('/onboarding/plan');
  };

  if (!running || !state) {
    return (
      <Screen
        footer={
          <Row>
            <Button title="Skip" kind="secondary" onPress={() => finish(true)} style={{ flex: 1 }} />
            <Button title="Start the check" onPress={() => setRunning(true)} style={{ flex: 1.6 }} />
          </Row>
        }
      >
        <Gap h={space.xl} />
        <Title>A short placement check</Title>
        <Gap />
        <Body>8 to 15 quick puzzles across divisibility, primes and remainders, about 5 to 8 minutes. They get harder when you're right and easier when you're not.</Body>
        <Gap />
        <View style={{ backgroundColor: color.surface, borderRadius: radius.md, padding: space.lg, borderWidth: 1.5, borderColor: color.rule }}>
          <Small style={{ color: color.ink }}>
            This sets where your plan starts. It is not a prediction of your exam score, and it never counts against you.
          </Small>
        </View>
        <Gap />
        <Small>Skip it and your plan starts from the beginning of each topic, paced by your self-rating.</Small>
      </Screen>
    );
  }

  if (!item) {
    // Nothing left to ask (a very small exam selection): go straight to the plan.
    return (
      <Screen footer={<Button title="See my plan" onPress={() => finish(false)} />}>
        <Gap h={space.xl} />
        <Title>Placement check done</Title>
      </Screen>
    );
  }

  return (
    <ItemScreen
      key={item.id}
      item={item}
      compact
      header={
        <Row style={{ justifyContent: 'space-between', marginBottom: space.xs }}>
          <Micro>
            Placement check, puzzle {state.answers.length + 1} of up to {Math.min(PLACEMENT_MAX, state.queue.length)}
          </Micro>
          <Button title="Finish now" kind="quiet" onPress={() => finish(state.answers.length === 0)} style={{ minHeight: 32, paddingHorizontal: 0 }} />
        </Row>
      }
      onAnswered={(a) => {
        // Placement answers count as ordinary attempts too, so the evidence isn't wasted.
        recordStandalone(item, { correct: a.correct, hint: a.hint, ms: a.ms }, 'try');
        setPending(a.correct);
      }}
      onContinue={() => {
        const updated = recordPlacement(state, { skillId: item.skillId, level: item.level, correct: !!pending });
        setPending(null);
        if (updated.done) {
          applyRatings(placementRatings(updated, profile.exams));
          track('placement_completed', { items: updated.answers.length });
          createPlan();
          router.replace('/onboarding/plan');
        } else setState(updated);
      }}
      continueLabel="Next"
    />
  );
}

import { Redirect, router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { ItemScreen } from '../../boards/ItemScreen';
import { PLACEMENT_MAX } from '../../engine/placement';
import { useApp } from '../../state/store';
import { Body, Button, Gap, Micro, Row, Screen, Small, Title } from '../../ui/kit';
import { color, radius, space } from '../../ui/theme';

/**
 * The placement check. Its progress lives in the store (the current puzzle,
 * the board, hints and time), so a check interrupted halfway resumes where
 * it stopped instead of starting over.
 */
export default function Placement() {
  const profile = useApp((s) => s.profile);
  const placement = useApp((s) => s.placement);
  const flagsVersion = useApp((s) => s.flagsVersion);
  const start = useApp((s) => s.startPlacementCheck);
  const replaceSlot = useApp((s) => s.replacePlacementSlot);
  const placementItem = useApp((s) => s.placementItem);
  const saveProgress = useApp((s) => s.savePlacementProgress);
  const answer = useApp((s) => s.answerPlacement);
  const next = useApp((s) => s.continuePlacement);
  const finishNow = useApp((s) => s.finishPlacement);
  const slot = placement?.slot;
  const slotKey = slot ? `${slot.templateId}@${slot.level}#${slot.seed}/v${slot.version}` : '';
  const item = useMemo(() => placementItem(), [slotKey, flagsVersion]);

  // Resumed after answering but before tapping Next: the answer is already recorded, so move on
  // rather than show the puzzle again as if it were unanswered.
  useEffect(() => {
    if (useApp.getState().placement?.answered && next().done) router.replace('/onboarding/plan');
  }, []);

  // A puzzle that was switched off (or changed by an app update) while the check was paused is replaced.
  useEffect(() => {
    if (placement && slot && !item && !placement.answered) replaceSlot();
  }, [slotKey, flagsVersion]);

  if (!profile) return <Redirect href="/welcome" />;

  const finish = (skipped: boolean) => {
    finishNow(skipped);
    router.replace('/onboarding/plan');
  };

  if (!placement) {
    return (
      <Screen
        footer={
          <Row>
            <Button title="Skip" kind="secondary" onPress={() => finish(true)} style={{ flex: 1 }} />
            <Button title="Start the check" onPress={start} style={{ flex: 1.6 }} />
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

  if (!slot || !item) {
    // Nothing left to ask (a very small exam selection, or everything switched off): go straight to the plan.
    return (
      <Screen footer={<Button title="See my plan" onPress={() => finish(false)} />}>
        <Gap h={space.xl} />
        <Title>Placement check done</Title>
      </Screen>
    );
  }

  const answeredCount = placement.state.answers.length;

  return (
    <ItemScreen
      key={item.id}
      item={item}
      support="independent"
      compact
      initialProgress={placement.progress}
      onProgress={saveProgress}
      header={
        <Row style={{ justifyContent: 'space-between', marginBottom: space.xs }}>
          <Micro>
            Placement check, puzzle {answeredCount + 1} of up to {Math.min(PLACEMENT_MAX, placement.state.queue.length)}
          </Micro>
          <Button
            title="Finish now"
            kind="quiet"
            onPress={() => finish(answeredCount === 0 && !placement.answered)}
            style={{ minHeight: 32, paddingHorizontal: 0 }}
          />
        </Row>
      }
      onAnswered={({ result: _result, ...a }) => answer(item, a)}
      onContinue={() => {
        if (next().done) router.replace('/onboarding/plan');
      }}
      continueLabel="Next"
    />
  );
}

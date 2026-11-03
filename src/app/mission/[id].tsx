import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SKILL_BY_ID } from '../../content';
import { formatShortDate } from '../../engine/time';
import { GAMES } from '../../games/registry';
import { CHAPTER_BY_ID, MISSION_BY_ID, MISSIONS, missionState } from '../../quests/chapters';
import { useApp } from '../../state/store';
import { BackLink, Body, Button, Eyebrow, Gap, Label, Plate, Screen, Small, Title } from '../../ui/kit';
import { color, space } from '../../ui/theme';
import { useStart } from '../../ui/useStart';
import { useNow } from '../../ui/useNow';

/** One static page per mission in the web export, so a shared link opens the right card. */
export function generateStaticParams(): { id: string }[] {
  return MISSIONS.map((m) => ({ id: m.id }));
}

/** A path step: the mathematical goal, how it is played, and what the learner can do afterwards. */
export default function MissionCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useApp();
  const [error, setError] = useState<string | null>(null);
  const { start: startWith, sheet } = useStart();
  const now = useNow();
  const m = MISSION_BY_ID[id ?? ''];
  if (!m) return <Redirect href="/today" />;
  const chapter = CHAPTER_BY_ID[m.chapterId];
  const st = missionState(m, s.quests, now);
  const step = chapter.missions.findIndex((x) => x.id === m.id) + 1;
  const game = m.game ? GAMES[m.game] : undefined;
  const what =
    m.kind === 'check'
      ? `A concept check: ${m.length} fresh questions with the rule hidden. Your answers are saved and the explanations come at the end.`
      : m.kind === 'recall'
        ? `A recall check: ${m.length} fresh questions, a day after you checked the idea.`
        : m.kind === 'transfer'
          ? 'Unfamiliar problems that use the same idea, on your own.'
          : `${game?.name}: ${game?.tagline} The rule stays on screen.`;

  const start = () => {
    if (!s.profile) return router.push('/welcome');
    startWith(
      () => s.startMission(m.id),
      (r) => {
        if (!r.ok) setError(r.reason === 'locked' ? 'This step opens later.' : "This step's puzzles are switched off right now. Try another step.");
      },
    );
  };

  return (
    <Screen
      footer={
        st.status === 'waiting' ? (
          <Button
            title="Back to Today"
            kind="secondary"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))}
          />
        ) : (
          <Button title={st.status === 'done' ? 'Play it again' : m.kind === 'check' ? 'Start the check' : 'Play'} onPress={start} />
        )
      }
    >
      <BackLink />
      <Eyebrow>
        {chapter.title} · step {step} of {chapter.missions.length}
      </Eyebrow>
      <Title style={{ marginTop: space.xs }}>{m.title}</Title>
      <Body style={{ marginTop: space.xs }}>{m.goal}</Body>
      <Gap h={space.md} />
      <Small>
        {what} About {m.minutes} minute{m.minutes === 1 ? '' : 's'}.
      </Small>
      <Small style={{ marginTop: space.xs }}>Skills: {m.skills.map((id) => SKILL_BY_ID[id]?.name).join(', ')}.</Small>

      <Gap h={space.lg} />
      <Plate tone="panel">
        <Label>Afterwards</Label>
        <Small style={{ color: color.ink }}>{m.outcome}</Small>
      </Plate>

      {st.status === 'waiting' ? (
        <Plate tone="warm" style={{ marginTop: space.md }}>
          <Label>
            {st.readyAt === Infinity
              ? "Opens a day after you take this path's check."
              : `Opens ${formatShortDate(st.readyAt)} at ${new Date(st.readyAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`}
          </Label>
          <Small>Recall only counts after a gap. That's what makes it remembering, not repeating.</Small>
        </Plate>
      ) : null}
      {st.status === 'done' ? <Small style={{ marginTop: space.md }}>Done. Playing again is good practice and still counts as evidence.</Small> : null}
      {error ? <Small style={{ marginTop: space.md }}>{error}</Small> : null}
      <View style={{ height: space.lg }} />
      {sheet}
    </Screen>
  );
}

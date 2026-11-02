import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SKILL_BY_ID } from '../../content';
import { formatShortDate } from '../../engine/time';
import { GAMES } from '../../games/registry';
import { CHAPTER_BY_ID, MISSION_BY_ID, MISSIONS, missionState } from '../../quests/chapters';
import { owned } from '../../rewards/ledger';
import { useApp } from '../../state/store';
import { BackLink, Body, Button, Eyebrow, Gap, Label, Plate, Screen, Small, Title } from '../../ui/kit';
import { space } from '../../ui/theme';
import { WorkshopScene } from '../../ui/WorkshopScene';
import { DISTRICT_BY_ID, itemForMission } from '../../world/catalog';

/** One static page per mission in the web export, so a shared link opens the right card. */
export function generateStaticParams(): { id: string }[] {
  return MISSIONS.map((m) => ({ id: m.id }));
}

/** A mission card: the mathematical goal, the game, and what it changes in the workshop. */
export default function MissionCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useApp();
  const [error, setError] = useState<string | null>(null);
  const m = MISSION_BY_ID[id ?? ''];
  if (!m) return <Redirect href="/play" />;
  const chapter = CHAPTER_BY_ID[m.chapterId];
  const district = DISTRICT_BY_ID[chapter.districtId];
  const st = missionState(m, s.quests, Date.now());
  const item = itemForMission(m.id);
  const have = owned(s.grants);
  const after = new Set(have);
  if (item) after.add(item.id);
  const game = m.game ? GAMES[m.game] : undefined;
  const what =
    m.kind === 'check'
      ? `A concept check: ${m.length} fresh questions with the rule hidden. Your answers are saved and the explanations come at the end.`
      : m.kind === 'recall'
        ? `A recall check: ${m.length} fresh questions, a day after you checked the idea.`
        : m.kind === 'transfer'
          ? 'Unfamiliar problems that use the same idea, on your own.'
          : `${game?.name}: ${game?.tagline} Guided play: the rule stays on screen.`;

  const start = () => {
    const r = s.startMission(m.id);
    if (r.ok) router.push('/session');
    else setError(r.reason === 'locked' ? 'This one opens later.' : 'Every puzzle for this mission is switched off right now. Try another mission.');
  };

  return (
    <Screen
      footer={
        st.status === 'waiting' ? (
          <Button
            title="Back to Play"
            kind="secondary"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/play'))}
          />
        ) : (
          <Button title={st.status === 'done' ? 'Play it again' : m.kind === 'check' ? 'Start the check' : 'Play'} onPress={start} />
        )
      }
    >
      <BackLink />
      <Eyebrow>
        {district?.name ?? chapter.title} · {chapter.title}
      </Eyebrow>
      <Title style={{ marginTop: space.xs }}>{m.title}</Title>
      <Body style={{ marginTop: space.xs }}>{m.goal}</Body>
      <Gap h={space.md} />
      <Small>
        {what} About {m.minutes} minute{m.minutes === 1 ? '' : 's'}.
      </Small>
      <Small style={{ marginTop: space.xs }}>Skills: {m.skills.map((id) => SKILL_BY_ID[id]?.name).join(', ')}.</Small>

      <Gap h={space.lg} />
      <Plate>
        <Label>{st.status === 'done' ? 'You made this' : 'What changes in your workshop'}</Label>
        <WorkshopScene owned={st.status === 'done' ? have : after} compact />
        <Small>{m.payoff}</Small>
        {item && st.status !== 'done' && have.has(item.id) ? <Small>You already have this object; playing again still counts as practice.</Small> : null}
      </Plate>

      {st.status === 'waiting' ? (
        <Plate tone="warm" style={{ marginTop: space.md }}>
          <Label>
            {st.readyAt === Infinity
              ? 'Opens a day after you take the chapter check.'
              : `Opens ${formatShortDate(st.readyAt)} at ${new Date(st.readyAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`}
          </Label>
          <Small>Recall only counts after a gap. That's what makes it remembering, not repeating.</Small>
        </Plate>
      ) : null}
      {st.status === 'done' ? <Small style={{ marginTop: space.md }}>Done. Playing again is good practice; the object is yours already.</Small> : null}
      {error ? <Small style={{ marginTop: space.md }}>{error}</Small> : null}
      <View style={{ height: space.lg }} />
    </Screen>
  );
}

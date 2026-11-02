import Feather from '@expo/vector-icons/Feather';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { generateItem, SKILLS, SKILL_BY_ID, TRACKS, templatesForSkill } from '../../content';
import { displayStatus, secureGaps } from '../../engine/mastery';
import { stateOf } from '../../engine/mixer';
import { levelForBand } from '../../engine/rating';
import { gameForBoard, GAMES } from '../../games/registry';
import { maxLevelFor } from '../../monetization/entitlements';
import { MISSIONS } from '../../quests/chapters';
import { useApp, type StartResult } from '../../state/store';
import { BackLink, Body, Button, Eyebrow, Gap, Heading, Label, LinkRow, Plate, Screen, Small, Stamp, Title } from '../../ui/kit';
import { color, font, space, type } from '../../ui/theme';
import { districtForTrack } from '../../world/catalog';

/** One static page per skill in the web export. */
export function generateStaticParams(): { id: string }[] {
  return SKILLS.map((k) => ({ id: k.id }));
}

/** A topic card: why it matters, what to know first, how to play it, an example and your evidence so far. */
export default function SkillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useApp();
  const [blocked, setBlocked] = useState(false);
  const skill = SKILL_BY_ID[id ?? ''];
  const example = useMemo(() => {
    if (!skill) return undefined;
    const t = templatesForSkill(skill.id, 1)[0];
    return t ? generateItem(t.id, 1, 1) : undefined;
  }, [skill?.id]);
  if (!skill) return <Redirect href="/practice" />;

  const now = Date.now();
  const st = stateOf(s.skills, skill.id);
  const status = displayStatus(st, now);
  const gaps = secureGaps(st);
  const cap = maxLevelFor(skill.id, s.entitlements, now);
  const level = Math.min(levelForBand(st.rating, 'practice'), cap);
  const templates = templatesForSkill(skill.id);
  const games = [...new Set(templates.map((t) => gameForBoard(t.board)).filter((g): g is NonNullable<typeof g> => !!g))];
  const quick = templates.some((t) => !gameForBoard(t.board));
  const missions = MISSIONS.filter((m) => m.skills.includes(skill.id));
  const track = TRACKS.find((t) => t.id === skill.track);
  const district = districtForTrack(skill.track);
  const mine = s.attempts.filter((a) => a.skillId === skill.id);
  const ownWay = mine.filter((a) => a.support === 'independent' && !a.hintBeforeAnswer);
  const ownRight = ownWay.filter((a) => a.correct).length;

  const go = (r: StartResult) => {
    if (r.ok) router.push('/session');
    else if (r.reason === 'no-runs') setBlocked(true);
  };
  const start = (mode: 'skill' | 'ladder') => {
    if (!s.profile) return router.push('/welcome');
    go(s.startSession(mode, { skillId: skill.id }));
  };

  return (
    <Screen
      footer={
        <>
          <Button title="Practise this skill" onPress={() => start('skill')} />
          <Button title="Take a concept check" kind="secondary" onPress={() => (s.profile ? go(s.startQuiz('check', { skills: [skill.id] })) : router.push('/welcome'))} />
        </>
      }
    >
      <BackLink />
      <Eyebrow>{[district?.name, track?.name].filter(Boolean).join(' · ')}</Eyebrow>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs }}>
        <Title style={{ flex: 1 }}>{skill.name}</Title>
        <Stamp status={status} />
      </View>
      <Small style={{ marginTop: space.xs }}>{skill.summary}.</Small>

      <Plate tone="growth" style={{ marginTop: space.lg, gap: space.xs }}>
        <Label>Why it matters</Label>
        <Body style={{ fontSize: 16 }}>{skill.why}</Body>
      </Plate>

      {example?.ruleLens ? (
        <Plate style={{ marginTop: space.md, borderLeftWidth: 4, borderLeftColor: color.action, gap: space.xs }}>
          <Label>The idea</Label>
          <Body style={{ fontSize: 16 }}>{example.ruleLens}</Body>
        </Plate>
      ) : null}

      {skill.prereqs.length ? (
        <>
          <Gap h={space.lg} />
          <Heading>Best after</Heading>
          <Small>Recommended, not required. You can play this now.</Small>
          {skill.prereqs.map((p) => (
            <LinkRow key={p} title={SKILL_BY_ID[p]?.name ?? p} right={<Stamp status={displayStatus(s.skills[p], now)} />} onPress={() => router.push(`/skill/${p}`)} />
          ))}
        </>
      ) : null}

      <Gap h={space.lg} />
      <Heading>Ways to play</Heading>
      <View style={{ gap: space.sm, marginTop: space.sm }}>
        {games.map((g) => (
          <View key={g} style={styles.game}>
            <Feather name="play-circle" size={18} color={color.action} />
            <View style={{ flex: 1 }}>
              <Text style={type.label}>{GAMES[g].name}</Text>
              <Small>{GAMES[g].tagline}</Small>
            </View>
          </View>
        ))}
        {quick ? (
          <View style={styles.game}>
            <Feather name="list" size={18} color={color.action} />
            <View style={{ flex: 1 }}>
              <Text style={type.label}>Quick questions</Text>
              <Small>Multiple choice and typed answers, in exam style.</Small>
            </View>
          </View>
        ) : null}
      </View>
      {missions.map((m) => (
        <LinkRow key={m.id} title={`Mission: ${m.title}`} detail={s.quests[m.id]?.completedAt ? 'Done. Play it again any time.' : m.goal} onPress={() => router.push(`/mission/${m.id}`)} />
      ))}

      {example ? (
        <>
          <Gap h={space.lg} />
          <Heading>An example</Heading>
          <Plate style={{ marginTop: space.sm, gap: space.xs }}>
            <Text style={[type.body, { fontFamily: font.bodyBold, fontSize: 16 }]}>{example.prompt}</Text>
            {example.payload.kind === 'refute' ? <Small>Claim: {example.payload.claimText}</Small> : null}
            <Small>Level 1 of 10. Every puzzle is generated fresh, so you won't see this exact one in play.</Small>
          </Plate>
        </>
      ) : null}

      <Gap h={space.lg} />
      <Heading>Your evidence</Heading>
      <Gap h={space.xs} />
      <Small>
        {mine.length === 0
          ? 'Not started yet.'
          : `${mine.length} answered. ${ownWay.length ? `${ownRight} of ${ownWay.length} right on your own (rule hidden, no hints).` : 'All so far with the rule on screen; checks show what you can do on your own.'} Puzzles are coming in at level ${level} of 10${cap < 10 ? ` (your current limit is level ${cap})` : ''}.`}
      </Small>
      {status !== 'secure' && status !== 'review' ? <Small style={{ marginTop: space.xs }}>To secure it: {gaps.length ? gaps.join('; ') : 'keep going'}.</Small> : null}
      {status === 'review' ? <Small style={{ marginTop: space.xs }}>Due for recall. One correct answer on your own keeps it secure for longer.</Small> : null}
      <Small style={{ marginTop: space.xs }}>{templates.length} puzzle types, levels 1 to 10.</Small>
      <Button
        title={`Climb the ladder${s.ladderBest[skill.id] ? ` (best: level ${s.ladderBest[skill.id]})` : ''}`}
        kind="quiet"
        onPress={() => start('ladder')}
        style={{ alignSelf: 'flex-start', paddingHorizontal: 0, marginTop: space.sm }}
      />

      {blocked ? (
        <Plate tone="warm" style={{ marginTop: space.lg }}>
          <Small style={{ color: color.ink }}>You've used today's free runs. Concept checks and chapter missions are still open, and Play has ways to keep going.</Small>
          <Button title="See Premium" kind="secondary" onPress={() => router.push('/premium')} />
        </Plate>
      ) : null}
      <View style={{ height: space.lg }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  game: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
});

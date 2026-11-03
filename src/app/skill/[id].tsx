import Feather from '@expo/vector-icons/Feather';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { answerDisplay } from '../../boards/ItemScreen';
import { generateItem, SKILLS, SKILL_BY_ID, TRACKS, templatesForSkill } from '../../content';
import { displayStatus, secureGaps } from '../../engine/mastery';
import { stateOf } from '../../engine/mixer';
import { gamesForSkill, GAMES } from '../../games/registry';
import { maxLevelFor } from '../../monetization/entitlements';
import { MISSIONS } from '../../quests/chapters';
import { mistakes } from '../../review/mistakes';
import { useApp, type StartResult } from '../../state/store';
import { BackLink, Body, Button, Eyebrow, Gap, Heading, Label, LinkRow, Plate, Screen, Small, Stamp, Title } from '../../ui/kit';
import { color, font, radius, space, type } from '../../ui/theme';
import { useStart } from '../../ui/useStart';
import { useNow } from '../../ui/useNow';
import { useRecord } from '../../ui/useRecord';

/** One static page per skill in the web export. */
export function generateStaticParams(): { id: string }[] {
  return SKILLS.map((k) => ({ id: k.id }));
}

/**
 * A topic page: the outcome, why it matters, the rule with a worked example,
 * then ways to learn it (games, guided practice, a concept check, its mistakes)
 * and the evidence so far. Prerequisites are recommendations; nothing is locked.
 */
export default function Topic() {
  const now = useNow();
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useApp();
  // Answers in an unfinished check stay out of these views until it ends.
  const rec = useRecord();
  const [blocked, setBlocked] = useState(false);
  const [empty, setEmpty] = useState(false);
  const { start: startWith, sheet } = useStart();
  const skill = SKILL_BY_ID[id ?? ''];
  const example = useMemo(() => {
    if (!skill) return undefined;
    const t = templatesForSkill(skill.id, 1)[0];
    try {
      return t ? generateItem(t.id, 1, 1) : undefined;
    } catch {
      return undefined;
    }
  }, [skill?.id, s.flagsVersion]);
  if (!skill) return <Redirect href="/practice" />;

  const st = stateOf(rec.skills, skill.id);
  const status = displayStatus(st, now);
  const gaps = secureGaps(st);
  const cap = maxLevelFor(skill.id, s.entitlements, now);
  const games = gamesForSkill(skill.id, cap);
  // Every family of this skill can be switched off remotely; then there is nothing to start.
  const available = templatesForSkill(skill.id, cap).length > 0;
  const track = TRACKS.find((t) => t.id === skill.track);
  const mine = rec.attempts.filter((a) => a.skillId === skill.id);
  const own = mine.filter((a) => a.support === 'independent' && !a.hintBeforeAnswer);
  const ownRight = own.filter((a) => a.correct).length;
  const misses = mistakes(rec.attempts, { skillId: skill.id }).length;
  const paths = MISSIONS.filter((m) => m.skills.includes(skill.id) && m.kind === 'play');

  const go = (run: () => StartResult) => {
    if (!s.profile) return router.push('/welcome');
    startWith(run, (r) => {
      setBlocked(!r.ok && r.reason === 'no-runs');
      setEmpty(!r.ok && r.reason === 'empty');
    });
  };

  return (
    <Screen
      footer={
        available ? (
          <>
            <Button title="Start guided practice" onPress={() => go(() => s.startQuiz('practice', { skillId: skill.id }))} />
            <Button title="Take a concept check" kind="secondary" onPress={() => go(() => s.startQuiz('check', { skills: [skill.id], returnTo: skill.id }))} />
          </>
        ) : undefined
      }
    >
      <BackLink />
      <Eyebrow>{track?.name}</Eyebrow>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginTop: space.xs }}>
        <Title style={{ flex: 1 }}>{skill.name}</Title>
        <Stamp status={status} />
      </View>
      <Body style={{ marginTop: space.xs }}>{skill.outcome}</Body>
      <Small style={{ marginTop: space.xs }}>{skill.why}</Small>

      {example ? (
        <Plate style={{ marginTop: space.lg }}>
          {example.ruleLens ? (
            <>
              <Label>The rule</Label>
              <Body style={{ fontSize: 16 }}>{example.ruleLens}</Body>
            </>
          ) : null}
          <Label style={{ marginTop: example.ruleLens ? space.sm : 0 }}>Worked example</Label>
          <Text style={[type.body, { fontFamily: font.bodyBold, fontSize: 16 }]}>{example.prompt}</Text>
          {example.payload.kind === 'refute' ? <Small>Claim: {example.payload.claimText}</Small> : null}
          <Small style={{ color: color.ink }}>Answer: {answerDisplay(example)}</Small>
          <Small>{example.explanation}</Small>
        </Plate>
      ) : null}

      <Gap h={space.xl} />
      <Heading>Play it</Heading>
      {games.length ? (
        <View style={{ gap: space.sm, marginTop: space.sm }}>
          {games.map((g) => (
            <Pressable
              key={g}
              accessibilityRole="button"
              accessibilityLabel={`Play ${GAMES[g].name}. ${GAMES[g].tagline}`}
              onPress={() => go(() => s.startGame(skill.id, g))}
              style={({ pressed }) => [styles.game, pressed && { backgroundColor: color.paperDeep }]}
            >
              <View style={styles.gameIcon}>
                <Feather name="play" size={16} color={color.white} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.label}>{GAMES[g].name}</Text>
                <Small>{GAMES[g].tagline}</Small>
              </View>
              <Feather name="chevron-right" size={18} color={color.inkFaint} />
            </Pressable>
          ))}
          <Small>Five rounds; the level rises as you go, within your current level limit. New topics start with the rule on screen; once you're Practicing, it's hidden.</Small>
        </View>
      ) : (
        <Small style={{ marginTop: space.xs }}>This topic is practised as questions: multiple choice and typed answers. Guided practice and the concept check below cover it.</Small>
      )}
      {paths.map((m) => (
        <LinkRow key={m.id} title={`Path step: ${m.title}`} detail={s.quests[m.id]?.completedAt ? 'Done. Replay any time.' : m.goal} onPress={() => router.push(`/mission/${m.id}`)} />
      ))}

      {!available || empty ? (
        <Plate tone="warm" style={{ marginTop: space.lg }}>
          <Small style={{ color: color.ink }}>This topic's puzzles are paused for a fix right now. Your progress is safe; try another topic and check back soon.</Small>
        </Plate>
      ) : null}
      {blocked ? (
        <Plate tone="warm" style={{ marginTop: space.lg }}>
          <Small style={{ color: color.ink }}>You've used today's free sessions. The concept check, reviewing mistakes and the paths are still open.</Small>
          <Button title="See Premium" kind="secondary" onPress={() => router.push('/premium')} />
        </Plate>
      ) : null}

      <Gap h={space.xl} />
      <Heading>Your progress</Heading>
      <Small style={{ marginTop: space.xs, color: color.ink }}>
        {mine.length === 0
          ? 'Not started yet.'
          : `${mine.length} answered. ${own.length ? `${ownRight} of ${own.length} right on your own (rule hidden, no hints).` : 'All so far with the rule on screen or a hint; a concept check shows what you can do on your own.'}`}
      </Small>
      {status !== 'secure' && status !== 'review' && mine.length ? <Small style={{ marginTop: space.xs }}>To secure it: {gaps.length ? gaps.join('; ') : 'keep going'}.</Small> : null}
      {status === 'review' ? <Small style={{ marginTop: space.xs }}>Due for review. One right answer on your own keeps it secure for longer.</Small> : null}
      <LinkRow title="Review my mistakes" detail={misses ? `${misses} on this topic, with explanations` : 'None on this topic yet'} onPress={() => router.push(`/mistakes?skill=${skill.id}`)} />
      <LinkRow
        title={`Climb the ladder${s.ladderBest[skill.id] ? ` (best: level ${s.ladderBest[skill.id]})` : ''}`}
        detail="One level up after each right answer, until three misses"
        onPress={() => go(() => s.startSession('ladder', { skillId: skill.id }))}
      />

      {skill.prereqs.length ? (
        <>
          <Gap h={space.xl} />
          <Heading>Helpful first</Heading>
          <Small>Recommended, not required. You can start this topic now.</Small>
          {skill.prereqs.map((p) => (
            <LinkRow key={p} title={SKILL_BY_ID[p]?.name ?? p} right={<Stamp status={displayStatus(rec.skills[p], now)} />} onPress={() => router.push(`/skill/${p}`)} />
          ))}
        </>
      ) : null}
      <View style={{ height: space.lg }} />
      {sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  game: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: color.rule, backgroundColor: color.surface },
  gameIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: color.action, alignItems: 'center', justifyContent: 'center' },
});

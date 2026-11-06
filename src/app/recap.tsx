import Feather from '@expo/vector-icons/Feather';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SessionBreakAdCard } from '../ads/AdSlots';
import { track } from '../analytics/track';
import { coach, describeResponse } from '../coach/explain';
import { correctAnswerText, SKILL_BY_ID, skillName } from '../content';
import { feel } from '../feel/director';
import { isPremium } from '../monetization/entitlements';
import { shouldShowSessionBreakAd } from '../policy/ads';
import { MISSION_BY_ID, nextMission } from '../quests/chapters';
import { reviewEntry, STATUS_NOTE } from '../review/mistakes';
import { adsLive, useApp, type StartResult } from '../state/store';
import { Body, Button, Eyebrow, Gap, Heading, Label, Micro, Plate, Screen, Small, Stamp, Title } from '../ui/kit';
import { AccuracyRing } from '../ui/motion';
import { color, font, space, type } from '../ui/theme';
import { useStart } from '../ui/useStart';
import { useNow } from '../ui/useNow';

const KIND_TITLE: Record<string, string> = { check: 'Concept check', drill: 'Mixed drill', recall: 'Review', repair: 'Repair', practice: 'Guided practice' };

/**
 * The end of a session: the result (on your own vs with help), what improved,
 * every answer with its explanation, and one next step. No reward screens.
 */
export default function RecapScreen() {
  const now = useNow();
  const s = useApp();
  const r = s.lastRecap;
  const [reviewOpen, setReviewOpen] = useState(Boolean(r?.check));
  const { start, sheet } = useStart();
  // Decided once per visit: at most one card per session, and never again on a revisit or reload.
  const [showAd] = useState(
    () =>
      !!r &&
      !r.check &&
      shouldShowSessionBreakAd({
        adsEnabled: adsLive(s),
        ageBand: s.profile?.ageBand,
        premium: isPremium(s.entitlements, Date.now()),
        completedSessions: s.sessionsCompleted,
        endedOnMiss: r.endedOnMiss,
        timedChallenge: r.timed,
        alreadyShown: r.adShown,
      }),
  );
  if (!r) return <Redirect href="/today" />;

  const mission = r.missionId ? MISSION_BY_ID[r.missionId] : undefined;
  const missionDone = mission && s.quests[mission.id]?.completedAt;
  const topic = r.returnTo ? SKILL_BY_ID[r.returnTo] : undefined;
  const attempts = r.attemptIds.map((id) => s.attempts.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a);
  const helped = attempts.filter((a) => a.correct && (a.hintBeforeAnswer || a.support === 'guided')).length;

  const go = (run: () => StartResult) => start(run);
  // One clear next step.
  const next = (() => {
    if (r.check?.next.kind === 'repair') {
      const skillId = r.check.next.skillId;
      return { title: `Repair ${skillName(skillId)}`, detail: 'Three short guided puzzles, then a fresh check.', run: () => go(() => s.startQuiz('repair', { skillId, returnTo: r.returnTo })) };
    }
    if (r.quiz === 'repair' || r.quiz === 'practice' || r.mode === 'game') {
      const skills = [...new Set(attempts.map((a) => a.skillId))];
      if (skills.length)
        return {
          title: 'Take a concept check',
          detail: 'Fresh questions on the same idea, with the rule hidden and results at the end.',
          run: () => go(() => s.startQuiz('check', { skills, returnTo: r.returnTo })),
        };
    }
    if (topic) return undefined;
    const m = nextMission(s.quests, now, mission?.chapterId);
    if (m && mission) return { title: `Next step: ${m.title}`, detail: m.goal, run: () => router.push(`/mission/${m.id}`) };
    return undefined;
  })();

  const eyebrow = r.check ? (KIND_TITLE[r.quiz ?? 'check'] ?? 'Check') : mission ? mission.title : r.quiz ? (KIND_TITLE[r.quiz] ?? r.title) : r.title;

  return (
    <Screen
      footer={
        <>
          {next ? <Button title={next.title} onPress={next.run} /> : null}
          {topic ? (
            <Button title={`Back to ${topic.name}`} kind={next ? 'secondary' : 'primary'} onPress={() => router.replace(`/skill/${topic.id}`)} />
          ) : (
            <Button title="Back to Today" kind={next ? 'secondary' : 'primary'} onPress={() => router.replace('/today')} />
          )}
        </>
      }
    >
      <Gap h={space.sm} />
      <Eyebrow>{eyebrow}</Eyebrow>
      {r.check ? (
        <>
          <Title style={{ marginTop: space.xs }}>
            {r.check.unaided ?? r.check.correct} of {r.check.total} on your own
          </Title>
          <Small style={{ marginTop: space.xs }}>
            {r.check.helped ? `${r.check.helped} more right with a hint or the rule shown. ` : ''}A check is evidence, not a verdict: Secure needs answers on your own across days and puzzle types.
          </Small>
        </>
      ) : (
        <>
          <Title style={{ marginTop: space.xs }}>
            {r.correct} of {r.total} right
          </Title>
          <Small style={{ marginTop: space.xs }}>
            {helped ? `${helped} of those with the rule on screen or a hint. ` : ''}
            {r.ladder ? `You climbed to level ${r.ladder.peak}${r.ladder.newBest ? ', a new personal best.' : `. Your best is level ${r.ladder.best}.`} ` : ''}
            {missionDone ? `Path step done: ${mission!.outcome}` : ''}
          </Small>
        </>
      )}

      {(r.check ? r.check.total : r.total) > 0 ? (
        <Plate style={{ marginTop: space.lg }}>
          {r.check ? (
            <AccuracyRing own={r.check.unaided ?? r.check.correct} helped={r.check.helped ?? 0} total={r.check.total} />
          ) : (
            <AccuracyRing own={Math.max(0, r.correct - helped)} helped={helped} total={r.total} />
          )}
        </Plate>
      ) : null}

      <Gap h={space.md} />
      <Plate>
        {r.check ? (
          <>
            <Heading style={{ fontSize: 17 }}>What you can do</Heading>
            {r.check.canDo.length ? (
              r.check.canDo.map((id) => (
                <Body key={id} style={{ fontSize: 15 }}>
                  ✓ {skillName(id)}: right every time, on your own.
                </Body>
              ))
            ) : (
              <Small>Nothing right every time yet. The repair below is the quickest way forward.</Small>
            )}
            <Gap h={space.sm} />
            <Heading style={{ fontSize: 17 }}>What needs one more look</Heading>
            {r.check.oneMoreLook.length ? (
              r.check.oneMoreLook.map((x) => (
                <View key={x.skillId} style={{ gap: 2 }}>
                  <Body style={{ fontSize: 15 }}>
                    {skillName(x.skillId)}: {x.missed ? `${x.missed} of ${x.of} missed` : `right, but with help on ${x.helped ?? 0} of ${x.of}`}.
                  </Body>
                  {x.notes.map((n) => (
                    <Small key={n}>{n}</Small>
                  ))}
                </View>
              ))
            ) : (
              <Small>Nothing. Every answer was right on your own.</Small>
            )}
          </>
        ) : (
          <>
            <Heading style={{ fontSize: 17 }}>What improved</Heading>
            {r.proved.length ? (
              r.proved.map((p) => (
                <View key={p.skillId} style={styles.line}>
                  <Text style={[type.body, { flex: 1, fontSize: 15 }]}>{skillName(p.skillId)} moved up</Text>
                  <Stamp status={p.to} />
                </View>
              ))
            ) : r.practiced.length ? (
              <Small>{r.practiced.map(skillName).join(', ')}: all right this time. More answers on your own move a skill up.</Small>
            ) : (
              <Small>No change in status this time. Each answer still counts toward the next step.</Small>
            )}
            {r.needsWork.length ? (
              <>
                <Gap h={space.sm} />
                <Heading style={{ fontSize: 17 }}>Needs another look</Heading>
                <Small>{r.needsWork.map(skillName).join(', ')}. The explanations below show where each answer went wrong.</Small>
              </>
            ) : null}
          </>
        )}
      </Plate>
      {r.tokens ? <Micro style={{ marginTop: space.sm }}>+{r.tokens} tokens</Micro> : null}

      {attempts.length ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: reviewOpen }}
            onPress={() => {
              if (!reviewOpen) track('quiz_review_opened', { quiz: r.quiz ?? r.mode });
              setReviewOpen(!reviewOpen);
              feel('select');
            }}
            style={styles.reviewToggle}
          >
            <Text style={[type.label, { color: color.action }]}>{reviewOpen ? 'Hide the answers' : 'Review every answer, with explanations'}</Text>
            <Feather name={reviewOpen ? 'chevron-up' : 'chevron-down'} size={18} color={color.action} />
          </Pressable>
          {reviewOpen ? attempts.map((a, i) => answerCard(a, i)) : null}
        </>
      ) : null}

      {showAd ? (
        <>
          <Gap h={space.lg} />
          <SessionBreakAdCard onRendered={s.markAdShown} />
        </>
      ) : null}
      {sheet}
    </Screen>
  );

  // A plain function (not a nested component), so store updates don't remount the cards.
  function answerCard(a: (typeof attempts)[number], i: number) {
    const e = reviewEntry(a);
    const item = e.item;
    const c = !a.correct && e.status === 'ok' && item && a.response && e.result ? coach(item, a.response, e.result) : undefined;
    return (
      <Plate key={a.id} style={{ marginTop: space.sm }}>
        <View style={styles.line}>
          <Feather name={a.correct ? 'check' : 'x'} size={16} color={a.correct ? color.right : color.wrong} />
          <Label style={{ flex: 1, color: a.correct ? color.right : color.wrong }}>
            {i + 1}. {a.correct ? 'Right' : 'Not quite'}
            {a.hintBeforeAnswer ? ', with help' : a.support === 'guided' ? ', rule on screen' : ''}
          </Label>
        </View>
        {item ? (
          <>
            <Body style={{ fontSize: 15, fontFamily: font.bodyBold }}>{item.prompt}</Body>
            {item.payload.kind === 'refute' ? <Small>Claim: {item.payload.claimText}</Small> : null}
            {a.response ? <Small style={{ color: color.ink }}>{describeResponse(item, a.response)}</Small> : null}
            {c ? (
              c.lines.map((l, k) => (
                <Small key={k} style={{ color: color.ink }}>
                  {l}
                </Small>
              ))
            ) : (
              <>
                {!a.correct ? <Small style={{ color: color.ink }}>Answer: {correctAnswerText(item)}</Small> : null}
                <Small>{item.explanation}</Small>
              </>
            )}
          </>
        ) : null}
        {e.status !== 'ok' ? <Small style={{ fontStyle: 'italic' }}>{STATUS_NOTE[e.status]}</Small> : null}
      </Plate>
    );
  }
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 28 },
  reviewToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md, minHeight: 48, marginTop: space.md },
});

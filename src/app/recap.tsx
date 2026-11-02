import Feather from '@expo/vector-icons/Feather';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SessionBreakAdCard } from '../ads/AdSlots';
import { track } from '../analytics/track';
import { answerDisplay, responseDisplay } from '../boards/ItemScreen';
import { generateItem, parseItemId, skillName } from '../content';
import { feel } from '../feel/director';
import { isPremium } from '../monetization/entitlements';
import { shouldShowSessionBreakAd } from '../policy/ads';
import { MISSION_BY_ID, nextMission } from '../quests/chapters';
import { owned } from '../rewards/ledger';
import { adsLive, useApp } from '../state/store';
import { Companion } from '../ui/Companion';
import { Body, Button, Eyebrow, Gap, Heading, Label, Plate, Screen, Small, Stamp, Title } from '../ui/kit';
import { RewardReveal } from '../ui/RewardReveal';
import { color, font, space, type } from '../ui/theme';
import { ITEM_BY_ID } from '../world/catalog';

/** Titles for the first objects; others are named for the object. */
const REVEAL_TITLES: Record<string, string> = {
  'bench-lamp': 'Your first light.',
  'brass-gear': 'The machine is turning.',
  'discovery-card': 'A discovery for the shelf.',
  'gate-token': 'Checked on your own.',
  telescope: 'A wider view.',
  'recall-bell': 'Remembered, a day later.',
};

export default function RecapScreen() {
  const s = useApp();
  const r = s.lastRecap;
  const [reviewOpen, setReviewOpen] = useState(false);
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
  if (!r) return <Redirect href="/play" />;

  const now = Date.now();
  const mission = r.missionId ? MISSION_BY_ID[r.missionId] : undefined;
  const newItems = r.rewards.items;
  const first = newItems[0] ? ITEM_BY_ID[newItems[0]] : undefined;

  // The one clear next action.
  const go = (start: () => { ok: boolean }) => {
    if (start().ok) router.replace('/session');
  };
  const next = (() => {
    if (r.check?.next.kind === 'repair') {
      const skillId = r.check.next.skillId;
      return { title: `Repair: ${skillName(skillId)}`, detail: 'Three short guided puzzles, then a fresh check.', run: () => go(() => s.startQuiz('repair', { skillId })) };
    }
    if (r.quiz === 'repair') {
      const skills = [...new Set(s.attempts.filter((a) => r.attemptIds.includes(a.id)).map((a) => a.skillId))];
      return { title: 'Take a fresh concept check', detail: 'New questions on the same idea, with the rule hidden.', run: () => go(() => s.startQuiz('check', { skills })) };
    }
    // Otherwise the next step on the trail, in chapter order (games, then the check, transfer and recall).
    const m = nextMission(s.quests, now, mission?.chapterId);
    if (m) return { title: `Play the next discovery: ${m.title}`, detail: m.goal, run: () => go(() => s.startMission(m.id)) };
    return undefined;
  })();

  const review = r.attemptIds
    .map((id) => s.attempts.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((a) => {
      const parsed = parseItemId(a.itemId);
      try {
        const item = parsed ? generateItem(parsed.templateId, parsed.level, parsed.seed, { allowDisabled: true, version: a.templateVersion || undefined }) : undefined;
        return { a, item };
      } catch {
        return { a, item: undefined };
      }
    });

  return (
    <Screen
      footer={
        <>
          {next ? <Button title={next.title} onPress={next.run} /> : null}
          <Button title="Back to Play" kind={next ? 'secondary' : 'primary'} onPress={() => router.replace('/play')} />
        </>
      }
    >
      <Gap h={space.sm} />
      {newItems.length ? (
        <>
          <Eyebrow>Your workshop of ideas</Eyebrow>
          <Title style={{ marginTop: space.xs }}>{(first && REVEAL_TITLES[first.id]) ?? `${first?.name}, earned.`}</Title>
          <Small style={{ marginTop: space.xs }}>A discovery made. A little more of this place is yours.</Small>
          <Gap h={space.md} />
          <RewardReveal owned={owned(s.grants)} newItems={newItems} />
          <Gap h={space.md} />
          {newItems.map((id) => (
            <Plate key={id} style={{ marginBottom: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={styles.badge}>
                <Feather name="star" size={18} color={color.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Label>{ITEM_BY_ID[id]?.name} · earned</Label>
                <Small>
                  {mission ? `${mission.title} completed.` : ITEM_BY_ID[id]?.blurb}
                  {r.rewards.coins ? ` +${r.rewards.coins} Workshop Coins.` : ''}
                </Small>
              </View>
            </Plate>
          ))}
          <Small>Cosmetic progress and concept mastery are separate.</Small>
          <Gap h={space.lg} />
        </>
      ) : null}

      {r.check ? (
        checkResults()
      ) : (
        <>
          <Small>{r.title}</Small>
          <Title>
            {r.correct} of {r.total} right
          </Title>
          {r.ladder ? (
            <Small style={{ marginTop: space.xs }}>
              You climbed to level {r.ladder.peak}
              {r.ladder.newBest ? ', a new personal best.' : `. Your best is level ${r.ladder.best}.`}
            </Small>
          ) : null}
          <Gap h={space.lg} />
          <Plate>
            <Heading style={{ fontSize: 18 }}>You proved</Heading>
            {r.proved.length || r.practiced.length ? (
              <>
                {r.proved.map((p) => (
                  <View key={p.skillId} style={styles.line}>
                    <Text style={[type.body, { flex: 1, fontSize: 16 }]}>{skillName(p.skillId)}</Text>
                    <Stamp status={p.to} />
                  </View>
                ))}
                {r.practiced.map((id) => (
                  <View key={id} style={styles.line}>
                    <Text style={[type.body, { flex: 1, fontSize: 16 }]}>{skillName(id)}</Text>
                    <Small>All right</Small>
                  </View>
                ))}
              </>
            ) : (
              <Small>Nothing new this time. Every miss is in the explanations; the next session picks up from there.</Small>
            )}
            {r.needsWork.length ? (
              <>
                <Gap h={space.sm} />
                <Heading style={{ fontSize: 18 }}>Needs work</Heading>
                {r.needsWork.map((id) => (
                  <Text key={id} style={[type.body, { fontSize: 16 }]}>
                    {skillName(id)}
                  </Text>
                ))}
              </>
            ) : null}
            {!newItems.length && r.rewards.coins ? <Small style={{ color: color.gold }}>+{r.rewards.coins} Workshop Coins</Small> : null}
          </Plate>
        </>
      )}

      {showAd ? (
        <>
          <Gap h={space.lg} />
          <SessionBreakAdCard onRendered={s.markAdShown} />
        </>
      ) : null}
    </Screen>
  );

  // Called as a function, not rendered as a component, so a store update doesn't remount it
  // (which would drop screen-reader focus on the review toggle).
  function checkResults() {
    const c = r!.check!;
    const unaided = c.unaided ?? c.correct;
    const helped = c.helped ?? 0;
    return (
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Eyebrow>{r!.quiz === 'drill' ? 'Mixed exam drill' : r!.quiz === 'recall' ? 'Recall check' : 'Concept check'}</Eyebrow>
            <Title style={{ marginTop: space.xs }}>
              {unaided} of {c.total} on your own
            </Title>
          </View>
          <Companion mood={unaided === c.total ? 'celebrating' : 'calm'} size={56} />
        </View>
        <Small style={{ marginTop: space.xs }}>
          {helped ? `${helped} more right with a hint or the rule shown. ` : ''}Each first answer counts once. A check is evidence, not a final verdict: Secure needs answers across days and puzzle types.
        </Small>
        <Gap h={space.lg} />
        <Plate>
          <Heading style={{ fontSize: 18 }}>What can I do?</Heading>
          {c.canDo.length ? c.canDo.map((id) => <Body key={id} style={{ fontSize: 16 }}>✓ {skillName(id)}: right every time.</Body>) : <Small>Nothing all-right yet this time. That's what the repair is for.</Small>}
          <Gap h={space.sm} />
          <Heading style={{ fontSize: 18 }}>What needs one more look?</Heading>
          {c.oneMoreLook.length ? (
            c.oneMoreLook.map((x) => (
              <View key={x.skillId} style={{ gap: 2 }}>
                <Body style={{ fontSize: 16 }}>
                  {skillName(x.skillId)}: {x.missed ? `${x.missed} of ${x.of} missed` : `right, but with help on ${x.helped ?? 0} of ${x.of}`}.
                </Body>
                {x.notes.map((n) => (
                  <Small key={n}>{n}</Small>
                ))}
              </View>
            ))
          ) : (
            <Small>Nothing. Every answer was right.</Small>
          )}
          <Gap h={space.sm} />
          <Heading style={{ fontSize: 18 }}>What should I play next?</Heading>
          <Small>{next ? `${next.title}. ${next.detail}` : 'Back to your trail on Play.'}</Small>
        </Plate>
        <Gap h={space.md} />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (!reviewOpen) track('quiz_review_opened', { quiz: r!.quiz });
            setReviewOpen(!reviewOpen);
            feel('select');
          }}
          style={styles.reviewToggle}
        >
          <Text style={[type.label, { color: color.action }]}>{reviewOpen ? 'Hide the answers' : 'Review every answer, with explanations'}</Text>
          <Feather name={reviewOpen ? 'chevron-up' : 'chevron-down'} size={18} color={color.action} />
        </Pressable>
        {reviewOpen
          ? review.map(({ a, item }, i) => (
              <Plate key={a.id} style={{ marginTop: space.sm }}>
                <Label>
                  {i + 1}. {a.correct ? 'Right' : 'Not quite'}
                  {a.hintBeforeAnswer ? ' (with help)' : ''}
                </Label>
                {item ? (
                  <>
                    <Body style={{ fontSize: 16, fontFamily: font.bodyBold }}>{item.prompt}</Body>
                    {item.payload.kind === 'refute' ? <Small>Claim: {item.payload.claimText}</Small> : null}
                    <Small style={{ color: color.ink }}>You answered: {responseDisplay(item, a.response)}</Small>
                    {!a.correct ? <Small style={{ color: color.ink }}>Answer: {answerDisplay(item)}</Small> : null}
                    <Small>{item.explanation}</Small>
                  </>
                ) : (
                  <Small>This puzzle has changed since you answered it, so it can't be shown exactly.</Small>
                )}
              </Plate>
            ))
          : null}
      </>
    );
  }
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 },
  badge: { width: 40, height: 40, borderRadius: 12, backgroundColor: color.goldWash, alignItems: 'center', justifyContent: 'center' },
  reviewToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md, minHeight: 48 },
});

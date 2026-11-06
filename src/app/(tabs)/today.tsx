import Feather from '@expo/vector-icons/Feather';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EXAMS, SKILL_BY_ID, SKILLS } from '../../content';
import { displayStatus } from '../../engine/mastery';
import { dueReviews, frontier } from '../../engine/mixer';
import { currentWeek, todaysTargets } from '../../engine/planner';
import { dayKey } from '../../engine/time';
import { isPremium } from '../../monetization/entitlements';
import { TOKEN_COSTS } from '../../monetization/tokens';
import { canOfferRewarded } from '../../policy/ads';
import { weeklyProgress } from '../../rewards/ledger';
import { adsLive, useApp } from '../../state/store';
import { AppHeader } from '../../ui/AppHeader';
import { ExamMarks } from '../../ui/ExamMarks';
import { TrackGlyph } from '../../ui/motion';
import { Button, Eyebrow, Gap, Label, LinkRow, Micro, Plate, Screen, Small, statusLabel, Title } from '../../ui/kit';
import { color, space, type } from '../../ui/theme';
import { useStart } from '../../ui/useStart';
import { useNow } from '../../ui/useNow';
import { useRecord } from '../../ui/useRecord';

/**
 * Today: the open session first, then one recommended topic with a reason and
 * one obvious next action. Reviews, the plan and this week's activity follow,
 * compactly. A missed day never takes anything away.
 */
export default function Today() {
  const now = useNow();
  const s = useApp();
  // Answers in an unfinished check stay out of these views until it ends.
  const rec = useRecord();
  const [blocked, setBlocked] = useState<null | 'no-runs' | 'empty'>(null);
  const { start, sheet } = useStart();
  if (!s.profile) return <Redirect href="/welcome" />;
  if (!s.plan) return <Redirect href="/onboarding/placement" />;

  const exams = s.profile.exams;
  const examName = exams.length ? exams.map((e) => EXAMS.find((x) => x.id === e)?.name).join(' and ') : 'your goals';
  const targets = todaysTargets(s.plan, rec.skills, now);
  const recommended = SKILL_BY_ID[targets[0] ?? frontier(rec.skills)[0] ?? SKILLS[0].id];
  const status = displayStatus(rec.skills[recommended.id], now);
  const reasonText =
    targets[0] === recommended.id
      ? `Next in your ${examName} plan. You're at ${statusLabel(status)}.`
      : `A good next step: its prerequisites are in place. You're at ${statusLabel(status)}.`;
  const due = dueReviews(rec.skills, now);
  const week = weeklyProgress(new Set(rec.attempts.map((a) => dayKey(a.at))), now);
  const planWeek = currentWeek(s.plan, now);
  const premium = isPremium(s.entitlements, now);
  const runsLeft = s.runsLeft();
  const rewardedOk = canOfferRewarded({ adsEnabled: adsLive(s), ageBand: s.profile.ageBand, premium });
  const dailyDone = s.daily[dayKey(now)];
  const a = s.active;
  const total = a ? (a.challenge ? a.challenge.length : a.slots.length) : 0;

  const startToday = () =>
    start(
      () => s.startSession('journey'),
      (r) => {
        if (!r.ok && (r.reason === 'no-runs' || r.reason === 'empty')) setBlocked(r.reason);
      },
    );

  return (
    <Screen>
      <AppHeader />
      {a ? (
        <Plate tone="action" style={{ marginBottom: space.lg }}>
          <Eyebrow>In progress</Eyebrow>
          <Label>{a.title}</Label>
          <Small style={{ color: color.ink }}>{a.ladder ? `${a.results.length} answered so far.` : `${a.results.length} of ${total} answered. Your work so far is saved.`}</Small>
          <Button title="Resume" onPress={() => router.push('/session')} />
        </Plate>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <TrackGlyph track={recommended.track} size={44} tone="solid" />
        <View style={{ flex: 1 }}>
          <Eyebrow>Recommended for you</Eyebrow>
          <Title style={{ marginTop: 2 }}>{recommended.name}</Title>
        </View>
      </View>
      <Small style={{ marginTop: 2 }}>{recommended.summary}.</Small>
      <Small style={{ marginTop: space.xs, color: color.ink }}>{reasonText}</Small>
      <Gap h={space.md} />
      <Button title="Start today's session" onPress={startToday} accessibilityHint={`About ${s.profile.minutesPerDay} minutes: mostly ${recommended.name}, with reviews mixed in`} />
      <Button title="Open this topic" kind="quiet" onPress={() => router.push(`/skill/${recommended.id}`)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      <Micro>
        About {s.profile.minutesPerDay} minutes: mostly {recommended.name}, with reviews mixed in.
        {premium || runsLeft === Infinity ? '' : ` ${runsLeft} of 3 free sessions left today.`}
      </Micro>

      {blocked === 'no-runs' ? (
        <Plate tone="warm" style={{ marginTop: space.md }}>
          <Label>You've used today's free sessions.</Label>
          <Small style={{ color: color.ink }}>Concept checks, reviews, paths and the daily puzzle are still open. Explanations and hints are always free.</Small>
          {s.tokens >= TOKEN_COSTS.bonusRun ? (
            <Button
              title={`Use ${TOKEN_COSTS.bonusRun} tokens for one more session`}
              kind="secondary"
              onPress={() => {
                s.buyBonusRunWithTokens();
                setBlocked(null);
              }}
            />
          ) : (
            <Small>You have {Math.max(0, s.tokens)} tokens. One more session costs {TOKEN_COSTS.bonusRun}.</Small>
          )}
          {rewardedOk ? (
            <Button
              title="Watch a short ad for one more session"
              kind="secondary"
              onPress={() => {
                // Placeholder for an AdMob RewardedAd; grant only on the earned-reward callback.
                s.grantRewardedRun();
                setBlocked(null);
              }}
            />
          ) : null}
          <Button title="See Premium" kind="secondary" onPress={() => router.push('/premium')} />
        </Plate>
      ) : null}
      {blocked === 'empty' ? <Small style={{ marginTop: space.sm }}>Nothing to practise right now.</Small> : null}

      <Gap h={space.xl} />
      {due.length ? (
        <LinkRow
          title="Quick review"
          detail={`${due.slice(0, 3).map((id) => SKILL_BY_ID[id]?.name).join(', ')}${due.length > 3 ? ` and ${due.length - 3} more` : ''}. Three questions, rule hidden.`}
          onPress={() => start(() => s.startQuiz('recall'))}
        />
      ) : null}
      <LinkRow
        title="My plan"
        detail={planWeek ? `Week ${planWeek.index + 1}: ${planWeek.skills.map((id) => SKILL_BY_ID[id]?.name).filter(Boolean).slice(0, 3).join(', ')}` : 'Your weekly plan'}
        onPress={() => router.push('/plan')}
      />
      <LinkRow title="Daily puzzle" detail={dailyDone ? 'Done for today. A new one tomorrow.' : 'One puzzle, the same for everyone today'} onPress={() => router.push('/daily')} />

      <Gap h={space.lg} />
      <View style={styles.week} accessibilityLabel={`${week.days} of ${week.target} learning days this week`}>
        <Feather name="activity" size={16} color={color.inkSoft} />
        <Text style={[type.small, { flex: 1 }]}>
          This week: {week.days} of {week.target} learning days{week.met ? '. Goal reached.' : '.'} A missed day never undoes progress.
        </Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {Array.from({ length: week.target }, (_, i) => (
            <View key={i} style={[styles.dot, i < week.days && styles.dotOn]} />
          ))}
        </View>
      </View>
      {exams.length ? <ExamMarks style={{ marginTop: space.lg }} /> : null}
      {sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.paperDeep, borderWidth: 1, borderColor: color.ruleStrong },
  dotOn: { backgroundColor: color.action, borderColor: color.action },
});

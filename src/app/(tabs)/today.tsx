import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { skillName } from '../../content';
import { displayStatus } from '../../engine/mastery';
import { dueReviews, stateOf } from '../../engine/mixer';
import { currentWeek, lastWeekNumber, todaysTargets } from '../../engine/planner';
import { dayKey } from '../../engine/time';
import { isPremium } from '../../monetization/entitlements';
import { TOKEN_COSTS } from '../../monetization/tokens';
import { canOfferRewarded } from '../../policy/ads';
import { adsLive, useApp } from '../../state/store';
import { Button, Gap, Heading, Label, LinkRow, Plate, Row, Screen, Small, Stamp, Title } from '../../ui/kit';
import { color, font, space, type } from '../../ui/theme';

export default function Today() {
  const s = useApp();
  const [blocked, setBlocked] = useState<null | 'no-runs' | 'empty'>(null);
  if (!s.profile) return <Redirect href="/welcome" />;
  if (!s.plan) return <Redirect href="/onboarding/placement" />;

  const now = Date.now();
  const targets = todaysTargets(s.plan, s.skills, now);
  const due = dueReviews(s.skills, now);
  const week = currentWeek(s.plan, now);
  const premium = isPremium(s.entitlements, now);
  const runsLeft = s.runsLeft();
  const dailyDone = s.daily[dayKey(now)];
  const items = !s.profile.minutesPerDay ? 8 : s.profile.minutesPerDay <= 10 ? 6 : s.profile.minutesPerDay <= 20 ? 8 : 10;
  const hasCheckpointPool =
    Object.values(s.skills).some((x) => x.status === 'practicing' || x.status === 'secure') &&
    !s.checkpoints.some((c) => now - c.at < 6 * 86400000);
  const rewardedOk = canOfferRewarded({ adsEnabled: adsLive(s), ageBand: s.profile.ageBand, premium });

  const start = (mode: 'journey' | 'review' | 'checkpoint') => {
    const r = s.startSession(mode);
    if (r.ok) {
      setBlocked(null);
      router.push('/session');
    } else if (r.reason === 'no-runs' || r.reason === 'empty') setBlocked(r.reason);
  };

  const dateLabel = new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Small>{dateLabel}</Small>
        {s.streak.count > 0 ? <Small style={{ color: color.brass, fontFamily: font.bodyBold }}>{s.streak.count}-day streak</Small> : null}
      </Row>
      <Title style={{ marginTop: space.xs }}>Today</Title>
      {s.storageError ? (
        <Plate tone="brass" style={{ marginTop: space.md }}>
          <Small style={{ color: color.ink }}>{s.storageError}</Small>
        </Plate>
      ) : null}
      {week ? (
        <Small style={{ marginTop: space.xs }}>
          Week {week.index + 1} of {lastWeekNumber(s.plan)}
          {week.secureTargets.length ? `: aim to secure ${week.secureTargets.map(skillName).join(' and ')}.` : '.'}
        </Small>
      ) : null}
      <Gap h={space.xl} />

      <Plate>
        <Heading>Next session</Heading>
        {targets.map((id) => (
          <View key={id} style={styles.target}>
            <Text style={[type.body, { flex: 1 }]}>{skillName(id)}</Text>
            <Stamp status={displayStatus(stateOf(s.skills, id), now)} />
          </View>
        ))}
        <Small>
          {items} puzzles, about {Math.max(5, Math.round((items * 1.75) / 5) * 5)} minutes{due.length ? `, with ${Math.min(due.length, 3)} review${due.length === 1 ? '' : 's'} mixed in` : ''}.
        </Small>
        <Gap h={space.xs} />
        {s.active ? (
          <Button title="Resume session" onPress={() => router.push("/session")} />
        ) : (
          <Button title="Start session" onPress={() => start('journey')} />
        )}
        {!premium ? (
          <Small style={{ textAlign: 'center' }}>
            {runsLeft === Infinity ? '' : `${runsLeft} of 3 free runs left today.`}
          </Small>
        ) : null}
      </Plate>

      {blocked === 'no-runs' ? (
        <Plate tone="brass" style={{ marginTop: space.md }}>
          <Label>You've used today's free runs.</Label>
          <Small style={{ color: color.ink }}>Your daily puzzle and reviews of secured skills are still open. To keep going now:</Small>
          {s.tokens >= TOKEN_COSTS.bonusRun ? (
            <Button
              title={`Use ${TOKEN_COSTS.bonusRun} tokens for a bonus run`}
              kind="secondary"
              onPress={() => {
                s.buyBonusRunWithTokens();
                setBlocked(null);
              }}
            />
          ) : (
            <Small>You have {s.tokens} tokens. A bonus run costs {TOKEN_COSTS.bonusRun}; finish sessions and daily puzzles to earn more.</Small>
          )}
          {rewardedOk ? (
            <Button
              title="Watch a short ad for a bonus run"
              kind="secondary"
              onPress={() => {
                // Placeholder for an AdMob RewardedAd; grant only on the earned-reward callback.
                s.grantRewardedRun();
                setBlocked(null);
              }}
            />
          ) : null}
          <Button title="See Premium" onPress={() => router.push('/premium')} />
        </Plate>
      ) : null}
      {blocked === 'empty' ? <Small style={{ marginTop: space.sm }}>Nothing is due right now.</Small> : null}

      <Gap h={space.lg} />
      <LinkRow
        title="Daily puzzle"
        detail={dailyDone ? (dailyDone.correct ? 'Solved today. Share your result.' : 'Done for today. A new one tomorrow.') : 'One puzzle, the same for everyone today'}
        onPress={() => router.push('/daily')}
      />
      <LinkRow
        title="Reviews due"
        detail={due.length ? `${due.length} secured skill${due.length === 1 ? '' : 's'} to keep fresh: ${due.slice(0, 3).map(skillName).join(', ')}` : 'Nothing due. Secured skills come back at 1, 3, 7 and 21 days.'}
        onPress={due.length ? () => start('review') : undefined}
      />
      {week?.checkpoint && hasCheckpointPool ? (
        <LinkRow title="Checkpoint" detail="Ten mixed, unfamiliar problems to test transfer" onPress={() => start('checkpoint')} />
      ) : null}
      <LinkRow title="Your plan" detail={s.plan.summary} onPress={() => router.push('/plan')} />
      <Gap h={space.lg} />
      <Small>Tokens: {s.tokens}. Earn them by finishing sessions and daily puzzles; spend them on bonus runs.</Small>
    </Screen>
  );
}

const styles = StyleSheet.create({
  target: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 34 },
});

import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SessionBreakAdCard } from '../ads/AdSlots';
import { skillName } from '../content';
import { isPremium } from '../monetization/entitlements';
import { shouldShowSessionBreakAd } from '../policy/ads';
import { adsLive, useApp } from '../state/store';
import { Button, Gap, Heading, Screen, Small, Stamp, Title } from '../ui/kit';
import { color, font, space, type } from '../ui/theme';

export default function RecapScreen() {
  const s = useApp();
  const r = s.lastRecap;
  // Decided once per visit: at most one card per session, and never again on a revisit or reload.
  const [showAd] = useState(
    () =>
      !!r &&
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

  // Order matters on this screen: what you proved first, then what's next, then (maybe) one ad card,
  // then your own Continue button, which sits outside the ad.

  return (
    <Screen footer={<Button title="Continue" onPress={() => router.replace('/today')} />}>
      <Gap h={space.md} />
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

      <View style={styles.panel}>
        <Heading style={{ fontSize: 17 }}>You proved</Heading>
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
            <Heading style={{ fontSize: 17 }}>Needs work</Heading>
            {r.needsWork.map((id) => (
              <Text key={id} style={[type.body, { fontSize: 16 }]}>
                {skillName(id)}
              </Text>
            ))}
          </>
        ) : null}
        {r.nextLabel ? (
          <>
            <Gap h={space.sm} />
            <Small>
              Next: <Text style={{ fontFamily: font.bodyBold, color: color.ink }}>{r.nextLabel}</Text>
            </Small>
          </>
        ) : null}
        {r.tokens ? <Small style={{ color: color.brass }}>+{r.tokens} tokens</Small> : null}
      </View>

      {showAd ? (
        <>
          <Gap h={space.lg} />
          <SessionBreakAdCard onRendered={s.markAdShown} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1.5, borderColor: color.rule, backgroundColor: color.surface, borderRadius: 16, padding: space.lg, gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 },
});

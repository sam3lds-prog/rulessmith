import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { BannerSlot } from '../../ads/AdSlots';
import { SKILLS, skillName } from '../../content';
import { displayStatus } from '../../engine/mastery';
import type { DisplayStatus } from '../../engine/types';
import { isPremium } from '../../monetization/entitlements';
import { shouldShowBanner } from '../../policy/ads';
import { adsLive, useApp } from '../../state/store';
import { Gap, Heading, LinkRow, Screen, Small, Stamp, statusLabel, Title } from '../../ui/kit';
import { color, font, space, type } from '../../ui/theme';

const ORDER: DisplayStatus[] = ['secure', 'review', 'practicing', 'learning', 'new'];

export default function Progress() {
  const s = useApp();
  const now = Date.now();
  const banner = shouldShowBanner('progress', { adsEnabled: adsLive(s), ageBand: s.profile?.ageBand, premium: isPremium(s.entitlements, now) });
  const counts = Object.fromEntries(ORDER.map((st) => [st, SKILLS.filter((k) => displayStatus(s.skills[k.id], now) === st).length])) as Record<DisplayStatus, number>;
  const recent = s.attempts.slice(-50);
  // Only answers given on their own (rule hidden, no hints) say what the learner can do unaided.
  const unaided = recent.filter((a) => a.support === 'independent' && !a.hintBeforeAnswer);
  const accuracy = unaided.length ? Math.round((100 * unaided.filter((a) => a.correct).length) / unaided.length) : null;
  const total = SKILLS.length;

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Title>Progress</Title>
        <Gap />
        {/* The proof bar: each segment is one skill, coloured by what it has proven. */}
        <View style={styles.bar} accessibilityLabel={`${counts.secure} of ${total} skills secure`}>
          {ORDER.flatMap((st) => Array.from({ length: counts[st] }, (_, i) => <View key={`${st}${i}`} style={[styles.seg, segColor(st)]} />))}
        </View>
        <Gap h={space.sm} />
        <Text style={styles.big}>
          {counts.secure} of {total} skills secure
        </Text>
        <View style={styles.legend}>
          {ORDER.filter((st) => counts[st] > 0).map((st) => (
            <Small key={st}>
              {statusLabel(st)}: {counts[st]}
            </Small>
          ))}
        </View>

        <Gap h={space.xl} />
        <Heading>Recent work</Heading>
        <Gap h={space.sm} />
        <Small>
          {accuracy === null
            ? recent.length
              ? 'So far you have practised with the rule on screen. Your accuracy shows here once you answer puzzles on your own.'
              : 'Finish a session to see your accuracy here.'
            : `${accuracy}% right on your last ${unaided.length} answers on your own. ${s.sessionsCompleted} session${s.sessionsCompleted === 1 ? '' : 's'} finished, ${s.streak.count}-day streak.`}
        </Small>
        {s.checkpoints.length ? (
          <Small style={{ marginTop: space.xs }}>
            Checkpoints:{' '}
            {s.checkpoints
              .slice(-4)
              .map((c) => `${c.correct}/${c.total}`)
              .join(', ')}
          </Small>
        ) : null}

        <Gap h={space.xl} />
        <Heading>Skills</Heading>
        {SKILLS.map((k) => {
          const st = s.skills[k.id];
          const fluency = st?.fluencyMs ? `about ${Math.round(st.fluencyMs / 1000)}s per correct answer` : undefined;
          return (
            <LinkRow
              key={k.id}
              title={k.name}
              detail={fluency}
              right={<Stamp status={displayStatus(st, now)} />}
              onPress={() => router.push(`/skill/${k.id}`)}
            />
          );
        })}
        <Gap />
        <Small>Secure means 8 of your last 10 answers on your own (rule hidden, no hints) were right, across 3 puzzle types, on 2 different days, including one unfamiliar problem. Practice with the rule on screen moves a skill to Practicing, not Secure. Speed is tracked separately.</Small>
        {Object.keys(s.ladderBest).length ? (
          <>
            <Gap h={space.xl} />
            <Heading>Ladder bests</Heading>
            {Object.entries(s.ladderBest).map(([id, best]) => (
              <Small key={id}>
                {skillName(id)}: level {best}
              </Small>
            ))}
          </>
        ) : null}
      </Screen>
      {banner ? <BannerSlot /> : null}
    </View>
  );
}

function segColor(st: DisplayStatus) {
  switch (st) {
    case 'secure':
      return { backgroundColor: color.brass };
    case 'review':
      return { backgroundColor: color.brassBright, opacity: 0.6 };
    case 'practicing':
      return { backgroundColor: color.cobalt };
    case 'learning':
      return { backgroundColor: color.ruleStrong };
    default:
      return { backgroundColor: color.paperDeep };
  }
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: 3, height: 22 },
  seg: { flex: 1, borderRadius: 3 },
  big: { ...type.heading, fontFamily: font.display, fontSize: 22 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xs },
});

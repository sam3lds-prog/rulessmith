import { Redirect, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SKILL_BY_ID, SKILLS, skillName, TRACKS } from '../../content';
import { displayStatus } from '../../engine/mastery';
import { dueReviews } from '../../engine/mixer';
import { formatShortDate } from '../../engine/time';
import type { Attempt } from '../../engine/types';
import { mistakeCounts } from '../../review/mistakes';
import { useApp } from '../../state/store';
import { AppHeader } from '../../ui/AppHeader';
import { Eyebrow, Gap, Heading, Label, LinkRow, Meter, Micro, Plate, Screen, Small, Stamp, Title } from '../../ui/kit';
import { color, font, space, type } from '../../ui/theme';
import { useStart } from '../../ui/useStart';

const KIND_NAME = { check: 'Concept check', drill: 'Mixed drill', recall: 'Review', repair: 'Repair', practice: 'Guided practice' } as const;

function evidence(attempts: Attempt[]) {
  const own = attempts.filter((a) => a.support === 'independent' && !a.hintBeforeAnswer);
  const helped = attempts.length - own.length;
  return { total: attempts.length, own: own.length, ownRight: own.filter((a) => a.correct).length, helped };
}

/** Progress: what each topic shows so far, split into practice with help and answers on your own, plus reviews, checks and mistakes. */
export default function Progress() {
  const s = useApp();
  const { start, sheet } = useStart();
  if (!s.profile) return <Redirect href="/welcome" />;

  const now = Date.now();
  const statuses = SKILLS.map((k) => displayStatus(s.skills[k.id], now));
  const secure = statuses.filter((x) => x === 'secure' || x === 'review').length;
  const practising = statuses.filter((x) => x === 'practicing').length;
  const due = dueReviews(s.skills, now);
  const misses30 = mistakeCounts(s.attempts, now - 30 * 86400000);
  const missTotal = Object.values(misses30).reduce((a, b) => a + b, 0);
  const worst = Object.entries(misses30).sort((a, b) => b[1] - a[1])[0];
  const checks = [...s.checks].sort((a, b) => b.at - a.at).slice(0, 5);
  const bySkill = new Map<string, Attempt[]>();
  for (const a of s.attempts) bySkill.set(a.skillId, [...(bySkill.get(a.skillId) ?? []), a]);

  return (
    <Screen>
      <AppHeader />
      <Eyebrow>Progress</Eyebrow>
      <Title style={{ marginTop: space.xs }}>
        {secure} of {SKILLS.length} skills secure
      </Title>
      <Gap h={space.sm} />
      <Meter value={secure} of={SKILLS.length} tone="gold" label={`${secure} of ${SKILLS.length} skills secure`} />
      <Small style={{ marginTop: space.sm }}>
        {practising} practising. Secure means 8 of your last 10 answers on your own were right, across 3 puzzle types and 2 days, including one unfamiliar problem. It's the app's own measure, not an exam score.
      </Small>

      {due.length ? (
        <Plate tone="action" style={{ marginTop: space.lg }}>
          <Label>Review due</Label>
          <Small style={{ color: color.ink }}>{due.map((id) => SKILL_BY_ID[id]?.name).join(', ')}. One right answer on your own keeps a skill secure for longer.</Small>
          <LinkRow title="Start a quick review" detail="Three questions, rule hidden" onPress={() => start(() => s.startQuiz('recall'))} />
        </Plate>
      ) : null}

      <Gap h={space.xl} />
      <Heading>Mistakes</Heading>
      <LinkRow
        title="Review my mistakes"
        detail={missTotal ? `${missTotal} in the last 30 days${worst ? `, most in ${skillName(worst[0])}` : ''}. Each one with its explanation.` : 'None in the last 30 days.'}
        onPress={() => router.push('/mistakes')}
      />

      {checks.length ? (
        <>
          <Gap h={space.xl} />
          <Heading>Recent checks</Heading>
          {checks.map((c) => (
            <View key={c.id} style={styles.check}>
              <View style={{ flex: 1 }}>
                <Text style={type.label}>{KIND_NAME[c.kind as keyof typeof KIND_NAME] ?? 'Check'}</Text>
                <Small numberOfLines={1}>{c.skills.map(skillName).join(', ')}</Small>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.score}>
                  {c.correct} of {c.total}
                </Text>
                <Micro>{formatShortDate(c.at)}</Micro>
              </View>
            </View>
          ))}
        </>
      ) : null}

      <Gap h={space.xl} />
      <Heading>By topic</Heading>
      <Small>"On your own" counts answers with the rule hidden and no hints. Practice with the rule on screen moves a skill to Practicing, never to Secure.</Small>
      {TRACKS.filter((t) => t.available).map((t) => (
        <View key={t.id} style={{ marginTop: space.lg }}>
          <Label style={{ color: color.inkSoft }}>{t.name}</Label>
          {SKILLS.filter((k) => k.track === t.id).map((k) => {
            const e = evidence(bySkill.get(k.id) ?? []);
            const detail = e.total
              ? `${e.own ? `${e.ownRight} of ${e.own} right on your own` : 'Nothing on your own yet'} · ${e.helped} with the rule or a hint`
              : 'Not started';
            return <LinkRow key={k.id} title={k.name} detail={detail} right={<Stamp status={displayStatus(s.skills[k.id], now)} />} onPress={() => router.push(`/skill/${k.id}`)} />;
          })}
        </View>
      ))}
      <Gap h={space.lg} />
      <Micro>Fractions, ratios, percentages, algebra and geometry are planned and not yet in the app.</Micro>
      {sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  check: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: color.rule },
  score: { fontFamily: font.num, fontSize: 18, color: color.ink },
});

import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SKILL_BY_ID, skillName } from '../content';
import { displayStatus } from '../engine/mastery';
import { currentWeek } from '../engine/planner';
import { formatShortDate, parseDay } from '../engine/time';
import type { JourneyPlan, PlanAlternative } from '../engine/types';
import type { States } from '../engine/mixer';
import { Body, Button, Gap, Heading, Label, Plate, Small, Stamp } from './kit';
import { color, font, space, type } from './theme';

export function altLabel(a: PlanAlternative): string {
  switch (a.kind) {
    case 'more-time':
      return `Practise ${a.minutesPerDay} minutes a day`;
    case 'narrower':
      return `Keep the ${a.keep} highest-priority skills`;
    case 'later-date':
      return `Move my test to about ${formatShortDate(parseDay(a.date))}`;
  }
}

export function PlanView({
  plan,
  skills,
  now,
  onAlternative,
  onSkill,
}: {
  plan: JourneyPlan;
  skills: States;
  now: number;
  onAlternative?: (a: PlanAlternative) => void;
  /** Opens a skill's topic page. Rows are plain text without it. */
  onSkill?: (skillId: string) => void;
}) {
  const thisWeek = currentWeek(plan, now)?.index ?? 0;
  return (
    <View style={{ gap: space.lg }}>
      <Body style={{ fontFamily: font.bodyBold, fontSize: 17, lineHeight: 25 }}>{plan.summary}</Body>

      {!plan.fits ? (
        <Plate tone="warm">
          <Label>This plan doesn't fit before your test date.</Label>
          <Small style={{ color: color.ink }}>
            It covers the {plan.order.length - plan.dropped.length} most important skills and leaves out {plan.dropped.length}:{' '}
            {plan.dropped.map(skillName).join(', ')}. You can change that:
          </Small>
          {onAlternative
            ? plan.alternatives
                .filter((a) => a.kind !== 'narrower')
                .map((a) => <Button key={a.kind} title={altLabel(a)} kind="secondary" onPress={() => onAlternative(a)} />)
            : null}
        </Plate>
      ) : null}

      <View>
        {plan.weeks.map((w) => (
          <View key={w.index} style={[styles.week, w.index === thisWeek && styles.weekNow]}>
            <View style={styles.weekHead}>
              <Heading style={{ fontSize: 17 }}>{plan.rolling && w.index % 4 === 0 && w.index > 0 ? `Month ${w.index / 4 + 1}, week 1` : `Week ${w.index + 1}`}</Heading>
              <Small>{w.index === thisWeek ? 'This week' : `From ${formatShortDate(parseDay(w.startsOn))}`}</Small>
            </View>
            {w.skills.map((id) =>
              onSkill && SKILL_BY_ID[id] ? (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={`${skillName(id)}. Open the topic`}
                  onPress={() => onSkill(id)}
                  style={({ pressed }) => [styles.skillLine, styles.skillButton, pressed && { backgroundColor: color.paperDeep }]}
                >
                  <Text style={[type.body, { flex: 1, fontSize: 16 }]}>{skillName(id)}</Text>
                  <Stamp status={displayStatus(skills[id], now)} />
                  <Feather name="chevron-right" size={18} color={color.inkFaint} />
                </Pressable>
              ) : (
                <View key={id} style={styles.skillLine}>
                  <Text style={[type.body, { flex: 1, fontSize: 16 }]}>{skillName(id)}</Text>
                  <Stamp status={displayStatus(skills[id], now)} />
                </View>
              ),
            )}
            {w.secureTargets.length ? (
              <Small>Milestone: secure {w.secureTargets.map(skillName).join(', ')}.</Small>
            ) : (
              <Small>Keep going on the skills above.</Small>
            )}
            {w.checkpoint ? <Small style={{ color: color.gold, fontFamily: font.bodyBold }}>Checkpoint at the end of this week: mixed, unfamiliar problems.</Small> : null}
          </View>
        ))}
      </View>
      <Gap h={space.xs} />
      <Small>Each week also keeps about a quarter of your time for reviews, so secured skills stay secure. The plan rebuilds itself every week from your results.</Small>
    </View>
  );
}

const styles = StyleSheet.create({
  week: { paddingVertical: space.md, borderTopWidth: 1, borderTopColor: color.rule, gap: 6 },
  weekNow: { borderTopWidth: 3, borderTopColor: color.action },
  weekHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  skillLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 30 },
  skillButton: { minHeight: 44, borderRadius: 8, paddingHorizontal: 4, marginHorizontal: -4 },
});


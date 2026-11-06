import Feather from '@expo/vector-icons/Feather';
import { Redirect, router } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { BannerSlot } from '../../ads/AdSlots';
import { EXAMS, SKILLS, TRACKS } from '../../content';
import { displayStatus } from '../../engine/mastery';
import { dueReviews } from '../../engine/mixer';
import { formatShortDate, parseDay } from '../../engine/time';
import { BLUEPRINTS, coverage, type ExamDomain } from '../../exams/blueprints';
import { isPremium } from '../../monetization/entitlements';
import { shouldShowBanner } from '../../policy/ads';
import { adsLive, useApp } from '../../state/store';
import { AppHeader } from '../../ui/AppHeader';
import { Eyebrow, Gap, Heading, Label, LinkRow, Meter, Micro, Plate, Screen, Small, Stamp, Title } from '../../ui/kit';
import { PlanView } from '../../ui/PlanView';
import { color, font, space, type } from '../../ui/theme';
import { useStart } from '../../ui/useStart';
import { useNow } from '../../ui/useNow';
import { useRecord } from '../../ui/useRecord';
import { ExamMarks } from '../../ui/ExamMarks';

const DOMAIN_STATUS: Record<ExamDomain['status'], { label: string; fg: string; bg: string }> = {
  foundations: { label: 'Foundations here', fg: color.actionDeep, bg: color.actionWash },
  planned: { label: 'Planned', fg: color.inkSoft, bg: color.paperDeep },
  outside: { label: 'Not covered', fg: color.inkFaint, bg: 'transparent' },
};

/** My plan: the exam, the pace, this week (every skill opens its topic), honest coverage and what is planned. */
export default function Plan() {
  const now = useNow();
  const s = useApp();
  // Answers in an unfinished check stay out of these views until it ends.
  const rec = useRecord();
  const { start, sheet } = useStart();
  if (!s.profile) return <Redirect href="/welcome" />;
  if (!s.plan) return <Redirect href="/onboarding/placement" />;

  const p = s.profile;
  const exams = p.exams;
  const examName = exams.length ? exams.map((e) => EXAMS.find((x) => x.id === e)?.name).join(' and ') : 'General math';
  const blueprints = exams.map((e) => BLUEPRINTS[e]);
  const cov = coverage(exams, rec.skills, now);
  const due = dueReviews(rec.skills, now);
  const banner = shouldShowBanner('plan', { adsEnabled: adsLive(s), ageBand: p.ageBand, premium: isPremium(s.entitlements, now) });
  const dateText = p.testDate ? `Test around ${formatShortDate(parseDay(p.testDate))}` : 'No test date';
  const released = TRACKS.filter((t) => t.available);
  const planned = TRACKS.filter((t) => !t.available);

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <AppHeader />
        <Eyebrow>My plan</Eyebrow>
        <Title style={{ marginTop: space.xs }}>{examName}</Title>
        <View style={styles.metaRow}>
          <Small style={{ flex: 1 }}>
            {dateText}. {p.minutesPerDay} minutes a day, {p.daysPerWeek} days a week.
          </Small>
          <Pressable accessibilityRole="button" accessibilityLabel="Change exam, date or pace" onPress={() => router.push('/onboarding/about')} hitSlop={8} style={styles.change}>
            <Text style={[type.label, { color: color.action }]}>Change</Text>
          </Pressable>
        </View>

        <Plate tone="panel" style={{ marginTop: space.md }}>
          <Text style={styles.coverage}>{cov.label}</Text>
          <Meter value={cov.secure} of={cov.released} tone="gold" label={cov.label} />
          <Small style={{ color: color.ink }}>
            {cov.practicing} practising, {cov.started} started, of the {cov.released} released skills that apply to your goal. Planned topics aren't counted.
          </Small>
          {blueprints.map((b) => (
            <Small key={b.id}>{b.scope}</Small>
          ))}
          <Micro>Secure is this app's own evidence rule (right on your own, across days and puzzle types). It is not an exam score.</Micro>
        </Plate>

        <Gap h={space.xl} />
        <Heading>This week</Heading>
        <Small style={{ marginBottom: space.md }}>Tap a skill to open it. The plan rebuilds itself each week from your results.</Small>
        <PlanView
          plan={s.plan}
          skills={rec.skills}
          now={now}
          onSkill={(id) => router.push(`/skill/${id}`)}
          onAlternative={(a) => {
            if (a.kind === 'more-time') s.updateProfileAndReplan({ minutesPerDay: a.minutesPerDay });
            if (a.kind === 'later-date') s.updateProfileAndReplan({ testDate: a.date });
          }}
        />
        {due.length ? (
          <LinkRow title="Review due" detail={`${due.length} secure skill${due.length === 1 ? '' : 's'} to keep fresh. Three questions, rule hidden.`} onPress={() => start(() => s.startQuiz('recall'))} />
        ) : null}

        <Gap h={space.xl} />
        <Heading>Topics available now</Heading>
        {released.map((t) => {
          const skills = SKILLS.filter((k) => k.track === t.id);
          const secure = skills.filter((k) => ['secure', 'review'].includes(displayStatus(rec.skills[k.id], now))).length;
          return (
            <View key={t.id} style={{ marginTop: space.md }}>
              <View style={styles.trackHead}>
                <Label style={{ flex: 1 }}>{t.name}</Label>
                <Micro>
                  {secure} of {skills.length} secure
                </Micro>
              </View>
              {skills.map((k) => (
                <LinkRow key={k.id} title={k.name} detail={k.summary} right={<Stamp status={displayStatus(rec.skills[k.id], now)} />} onPress={() => router.push(`/skill/${k.id}`)} />
              ))}
            </View>
          );
        })}

        <Gap h={space.xl} />
        <Heading>Planned, not built yet</Heading>
        <Small>These aren't in the app yet, so they don't count toward your coverage.</Small>
        <View style={styles.planned}>
          {[...planned.map((t) => t.name), 'Algebra', 'Geometry and data'].map((name) => (
            <View key={name} style={styles.plannedPill}>
              <Feather name="clock" size={12} color={color.inkFaint} />
              <Text style={[type.small, { color: color.inkSoft }]}>{name}</Text>
            </View>
          ))}
        </View>

        {blueprints.length ? (
          <>
            <Gap h={space.xl} />
            <Heading>The official exam outline</Heading>
            {blueprints.map((b) => (
              <View key={b.id} style={{ gap: space.sm, marginTop: space.sm }}>
                <Small>
                  {b.name}: {b.section}.
                </Small>
                {b.domains.map((d) => {
                  const st = DOMAIN_STATUS[d.status];
                  return (
                    <View key={d.name} style={styles.domain}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                        <Label style={{ flex: 1 }}>
                          {d.name}
                          {d.share ? <Text style={type.small}>{`  ${d.share}`}</Text> : null}
                        </Label>
                        <View style={[styles.pill, { backgroundColor: st.bg, borderColor: st.bg === 'transparent' ? color.rule : st.bg }]}>
                          <Text style={[styles.pillText, { color: st.fg }]}>{st.label}</Text>
                        </View>
                      </View>
                      <Small>{d.summary}</Small>
                    </View>
                  );
                })}
                <Pressable accessibilityRole="link" onPress={() => Linking.openURL(b.source.url)} style={styles.source}>
                  <Feather name="external-link" size={14} color={color.action} />
                  <Text style={[type.small, { color: color.action, flex: 1 }]}>
                    {b.source.title}, checked {formatShortDate(parseDay(b.source.checkedOn))}
                  </Text>
                </Pressable>
              </View>
            ))}
            <Micro style={{ marginTop: space.sm }}>Which skills sit under which part of the outline, and how much each matters, is our own estimate, not an official weighting.</Micro>
          </>
        ) : null}
        <ExamMarks style={{ marginTop: space.lg }} />
        {sheet}
      </Screen>
      {banner ? <BannerSlot /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginTop: space.xs },
  change: { minHeight: 44, justifyContent: 'center', marginTop: -12 },
  coverage: { fontFamily: font.display, fontSize: 20, lineHeight: 26, color: color.ink },
  trackHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xs },
  planned: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  plannedPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: color.ruleStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  domain: { gap: 4, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: color.rule },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontFamily: font.label, fontSize: 12 },
  source: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44 },
});

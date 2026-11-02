import Feather from '@expo/vector-icons/Feather';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { BannerSlot } from '../../ads/AdSlots';
import { EXAMS, SKILLS, SKILL_BY_ID, TRACKS } from '../../content';
import { displayStatus } from '../../engine/mastery';
import { dueReviews } from '../../engine/mixer';
import { formatShortDate, parseDay } from '../../engine/time';
import { BLUEPRINTS, coverage, type ExamDomain } from '../../exams/blueprints';
import { isPremium } from '../../monetization/entitlements';
import { shouldShowBanner } from '../../policy/ads';
import { CHAPTERS, chapterProgress } from '../../quests/chapters';
import { adsLive, useApp } from '../../state/store';
import { AppHeader } from '../../ui/AppHeader';
import { Chip, Eyebrow, Gap, Heading, Label, LinkRow, Micro, Plate, Screen, Small, Stamp, Title } from '../../ui/kit';
import { PlanView } from '../../ui/PlanView';
import { useStart } from '../../ui/useStart';
import { color, font, radius, space, type } from '../../ui/theme';
import { DISTRICTS, type District } from '../../world/catalog';

const ACCENT: Record<District['accent'], string> = { sage: color.sage, apricot: color.apricot, sky: color.sky, lilac: color.lilac };

const DOMAIN_STATUS: Record<ExamDomain['status'], { label: string; fg: string; bg: string }> = {
  foundations: { label: 'Foundations here', fg: color.actionDeep, bg: color.actionWash },
  planned: { label: 'Planned', fg: color.inkSoft, bg: color.paperDeep },
  outside: { label: 'Not covered', fg: color.inkFaint, bg: 'transparent' },
};

export default function Plan() {
  const s = useApp();
  const [view, setView] = useState<'map' | 'outline'>('map');
  const { start, sheet } = useStart();
  if (!s.profile) return <Redirect href="/welcome" />;
  if (!s.plan) return <Redirect href="/onboarding/placement" />;

  const now = Date.now();
  const p = s.profile;
  const exams = p.exams;
  const examName = exams.length ? exams.map((e) => EXAMS.find((x) => x.id === e)?.name).join(' and ') : 'General math';
  const blueprints = exams.map((e) => BLUEPRINTS[e]);
  const cov = coverage(exams, s.skills, now);
  const due = new Set(dueReviews(s.skills, now));
  const banner = shouldShowBanner('plan', { adsEnabled: adsLive(s), ageBand: p.ageBand, premium: isPremium(s.entitlements, now) });
  const dateText = p.testDate ? `Test around ${formatShortDate(parseDay(p.testDate))}` : 'No test date';

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <AppHeader />
        <Eyebrow>Your exam map</Eyebrow>
        <Title style={{ marginTop: space.xs }}>{examName}</Title>
        <View style={styles.metaRow}>
          <Small style={{ flex: 1 }}>
            {blueprints.length ? `${blueprints.map((b) => b.section).join('; ')}. ` : ''}
            {dateText}, {p.minutesPerDay} minutes a day.
          </Small>
          <Pressable accessibilityRole="button" onPress={() => router.push('/onboarding/about')} hitSlop={8} style={styles.change}>
            <Text style={[type.label, { color: color.action }]}>Change</Text>
          </Pressable>
        </View>

        <Plate tone="growth" style={{ marginTop: space.md, gap: space.sm }}>
          <Text style={styles.coverage}>{cov.label}</Text>
          <View style={styles.bar} accessibilityLabel={`${cov.secure} secure and ${cov.practicing} practising, of ${cov.released} released skills`}>
            {Array.from({ length: cov.released }, (_, i) => (
              <View key={i} style={[styles.seg, i < cov.secure ? styles.segSecure : i < cov.secure + cov.practicing ? styles.segPractice : null]} />
            ))}
          </View>
          <Small style={{ color: color.inkSoft }}>
            {cov.practicing} practising, {cov.started} started. Secure needs answers on your own across days and puzzle types.
          </Small>
          {blueprints.map((b) => (
            <Small key={b.id} style={{ color: color.ink }}>
              {b.scope}
            </Small>
          ))}
          {!blueprints.length ? <Small style={{ color: color.ink }}>Number-property foundations: divisibility, primes and factors, and remainders.</Small> : null}
        </Plate>

        <Gap h={space.lg} />
        <View style={styles.toggle} accessibilityRole="tablist">
          <Chip label="Workshop map" selected={view === 'map'} onPress={() => setView('map')} />
          {blueprints.length ? <Chip label="Exam outline" selected={view === 'outline'} onPress={() => setView('outline')} /> : null}
        </View>

        {view === 'map' || !blueprints.length ? (
          <View style={{ marginTop: space.md, gap: space.md }}>
            {DISTRICTS.map((d) => {
              const track = d.track ? TRACKS.find((t) => t.id === d.track) : undefined;
              const released = d.status === 'released' && track?.available;
              const chapter = CHAPTERS.find((c) => c.districtId === d.id);
              const cp = chapter ? chapterProgress(chapter, s.quests) : undefined;
              return (
                <View key={d.id} style={[styles.district, !released && styles.districtLater]}>
                  <View style={styles.districtHead}>
                    <View style={[styles.districtDot, { backgroundColor: ACCENT[d.accent] }]}>
                      <Feather name={released ? 'map-pin' : 'lock'} size={14} color={released ? color.ink : color.inkFaint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Label style={!released ? { color: color.inkSoft } : undefined}>{d.name}</Label>
                      <Small>{released ? `${track?.name}. ${d.creation}.` : `${d.creation}. Planned.`}</Small>
                    </View>
                    {cp ? <Micro>{`${cp.done} of ${cp.of} missions`}</Micro> : null}
                  </View>
                  {released
                    ? SKILLS.filter((k) => k.track === d.track).map((k) => (
                        <LinkRow
                          key={k.id}
                          title={k.name}
                          detail={due.has(k.id) ? `${k.summary}. Recall due.` : k.summary}
                          right={<Stamp status={displayStatus(s.skills[k.id], now)} />}
                          onPress={() => router.push(`/skill/${k.id}`)}
                        />
                      ))
                    : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={{ marginTop: space.md, gap: space.lg }}>
            {blueprints.map((b) => (
              <View key={b.id} style={{ gap: space.sm }}>
                {blueprints.length > 1 ? <Heading>{b.name}</Heading> : null}
                {b.domains.map((d) => {
                  const st = DOMAIN_STATUS[d.status];
                  const skills = SKILLS.filter((k) => d.tracks.includes(k.track));
                  const secure = skills.filter((k) => ['secure', 'review'].includes(displayStatus(s.skills[k.id], now))).length;
                  return (
                    <Plate key={d.name} style={{ gap: 4 }}>
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
                      {skills.length ? <Small style={{ color: color.ink }}>{`${secure} of ${skills.length} skills here secure.`}</Small> : null}
                    </Plate>
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
            <Small>Which skills sit in which domain is our own mapping, not an official weighting. Nothing here predicts a score.</Small>
          </View>
        )}

        <Gap h={space.xl} />
        <Heading>This week's plan</Heading>
        <Small style={{ marginBottom: space.md }}>The Play tab starts these for you. Change the pace here if the dates don't work.</Small>
        <PlanView
          plan={s.plan}
          skills={s.skills}
          now={now}
          onAlternative={(a) => {
            if (a.kind === 'more-time') s.updateProfileAndReplan({ minutesPerDay: a.minutesPerDay });
            if (a.kind === 'later-date') s.updateProfileAndReplan({ testDate: a.date });
          }}
        />
        {due.size ? (
          <>
            <Gap h={space.lg} />
            <LinkRow
              title="Recall due"
              detail={`${[...due].map((id) => SKILL_BY_ID[id]?.name).join(', ')}. A short check with the rule hidden.`}
              onPress={() => start(() => s.startQuiz('recall'))}
            />
          </>
        ) : null}
        {sheet}
      </Screen>
      {banner ? <BannerSlot /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginTop: space.xs },
  change: { minHeight: 32, justifyContent: 'center' },
  coverage: { fontFamily: font.display, fontSize: 22, color: color.ink },
  bar: { flexDirection: 'row', gap: 3, height: 14 },
  seg: { flex: 1, borderRadius: 4, backgroundColor: color.surface, borderWidth: 1, borderColor: '#D2E1D3' },
  segSecure: { backgroundColor: color.gold, borderColor: color.gold },
  segPractice: { backgroundColor: color.action, borderColor: color.action },
  toggle: { flexDirection: 'row', gap: space.sm },
  district: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.rule, padding: space.md, gap: 2 },
  districtLater: { backgroundColor: 'transparent', borderStyle: 'dashed' },
  districtHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  districtDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontFamily: font.label, fontSize: 12 },
  source: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 40 },
});

import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BannerSlot } from '../../ads/AdSlots';
import { EXAMS, SKILLS, SKILL_BY_ID, TRACKS, type TrackId } from '../../content';
import { displayStatus } from '../../engine/mastery';
import { dueReviews } from '../../engine/mixer';
import { todaysTargets } from '../../engine/planner';
import { dayKey } from '../../engine/time';
import { isPremium } from '../../monetization/entitlements';
import { TOKEN_COSTS } from '../../monetization/tokens';
import { shouldShowBanner } from '../../policy/ads';
import { CHAPTERS, chapterProgress, missionState } from '../../quests/chapters';
import { MISCONCEPTION_NOTES } from '../../quizzes/policies';
import { adsLive, useApp, type StartResult } from '../../state/store';
import { AppHeader } from '../../ui/AppHeader';
import { useStart } from '../../ui/useStart';
import { Button, Chip, Eyebrow, Gap, Heading, Label, LinkRow, Plate, Screen, Small, Stamp, Title } from '../../ui/kit';
import { color, space } from '../../ui/theme';

const RELEASED = TRACKS.filter((t) => t.available);

export default function Practice() {
  const s = useApp();
  const now = Date.now();
  const targets = s.plan ? todaysTargets(s.plan, s.skills, now) : [];
  const [track, setTrack] = useState<TrackId>(() => (targets[0] ? SKILL_BY_ID[targets[0]].track : RELEASED[0].id));
  const [blocked, setBlocked] = useState(false);
  const { start, sheet } = useStart();
  if (!s.profile) return <Redirect href="/welcome" />;

  const premium = isPremium(s.entitlements, now);
  const banner = shouldShowBanner('practice', { adsEnabled: adsLive(s), ageBand: s.profile.ageBand, premium });
  const due = dueReviews(s.skills, now);
  const examName = s.profile.exams.length ? s.profile.exams.map((e) => EXAMS.find((x) => x.id === e)?.name).join(' and ') : 'your topics';
  const dailyDone = s.daily[dayKey(now)];

  // "One more look": skills whose most recent check had a miss.
  const latest = new Map<string, { missed: number; notes: string[] }>();
  for (const c of [...s.checks].sort((a, b) => b.at - a.at)) {
    for (const id of c.skills) {
      if (latest.has(id)) continue;
      const misses = c.missed.filter((m) => m.skillId === id);
      latest.set(id, {
        missed: misses.length,
        notes: [...new Set(misses.map((m) => (m.misconception ? MISCONCEPTION_NOTES[m.misconception] : undefined)).filter((n): n is string => !!n))],
      });
    }
  }
  const repairs = [...latest.entries()].filter(([, v]) => v.missed > 0).slice(0, 3);

  const go = (run: () => StartResult) => start(run, (r) => setBlocked(!r.ok && r.reason === 'no-runs'));

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <AppHeader />
        <Eyebrow>Practice and checks</Eyebrow>
        <Title style={{ marginTop: space.xs }}>Check what you know</Title>
        <Small style={{ marginTop: space.xs }}>Checks hide the rule and show your answers at the end. Hints and explanations are always free.</Small>

        <Plate tone="action" style={{ marginTop: space.lg, gap: space.sm }}>
          <Heading style={{ fontSize: 18 }}>Concept check</Heading>
          <Small style={{ color: color.ink }}>Five fresh questions on one topic, in mixed puzzle forms, including one unfamiliar problem. Doesn't use a free run.</Small>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {RELEASED.map((t) => (
              <Chip key={t.id} label={t.name} selected={track === t.id} onPress={() => setTrack(t.id)} />
            ))}
          </View>
          <Button
            title="Start the concept check"
            onPress={() => go(() => s.startQuiz('check', { skills: SKILLS.filter((k) => k.track === track).map((k) => k.id) }))}
          />
        </Plate>

        {repairs.length ? (
          <>
            <Gap h={space.lg} />
            <Heading>One more look</Heading>
            <Small>From your recent checks. Three guided puzzles with the rule on screen, then a fresh check when you're ready.</Small>
            {repairs.map(([id, v]) => (
              <LinkRow
                key={id}
                title={`Repair: ${SKILL_BY_ID[id]?.name}`}
                detail={v.notes[0] ?? `${v.missed} missed last time.`}
                onPress={() => go(() => s.startQuiz('repair', { skillId: id }))}
              />
            ))}
          </>
        ) : null}

        <Gap h={space.lg} />
        <Heading>Mixed practice</Heading>
        <LinkRow
          title="Mixed exam drill"
          detail={`12 questions across ${examName}, weighted to what the exam asks most. Uses one free run.`}
          onPress={() => go(() => s.startQuiz('drill'))}
        />
        <LinkRow
          title="Recall due"
          detail={due.length ? `${due.map((id) => SKILL_BY_ID[id]?.name).join(', ')}. Three quick questions.` : 'Nothing due. Secured skills come back at 1, 3, 7 and 21 days.'}
          onPress={due.length ? () => go(() => s.startQuiz('recall')) : undefined}
        />
        {blocked ? (
          <Plate tone="warm" style={{ marginTop: space.sm }}>
            <Label>You've used today's free runs.</Label>
            <Small style={{ color: color.ink }}>
              Concept checks, repairs, chapter missions and the daily puzzle are still open.
              {s.tokens >= TOKEN_COSTS.bonusRun ? '' : ` A bonus run costs ${TOKEN_COSTS.bonusRun} Workshop Coins; you have ${Math.max(0, s.tokens)}.`}
            </Small>
            {s.tokens >= TOKEN_COSTS.bonusRun ? (
              <Button
                title={`Use ${TOKEN_COSTS.bonusRun} Workshop Coins for a bonus run`}
                kind="secondary"
                onPress={() => {
                  s.buyBonusRunWithTokens();
                  setBlocked(false);
                }}
              />
            ) : null}
            <Button title="See Premium" kind="secondary" onPress={() => router.push('/premium')} />
          </Plate>
        ) : null}

        <Gap h={space.lg} />
        <Heading>Chapters</Heading>
        {CHAPTERS.map((c) => {
          const cp = chapterProgress(c, s.quests);
          const open = c.missions.find((m) => !s.quests[m.id]?.completedAt && missionState(m, s.quests, now).status === 'available') ?? c.missions[0];
          return (
            <LinkRow
              key={c.id}
              title={c.title}
              detail={cp.done === cp.of ? 'All missions done. Replay any of them.' : `${cp.done} of ${cp.of} missions. Next: ${open.title}`}
              onPress={() => router.push(`/mission/${open.id}`)}
            />
          );
        })}

        <Gap h={space.lg} />
        <Heading>Free play</Heading>
        <LinkRow title="Challenge builder" detail="Pick topics and difficulty for an unlimited run" onPress={() => router.push('/challenge')} />
        <LinkRow
          title="Daily puzzle"
          detail={dailyDone ? 'Done for today. A new one tomorrow.' : 'One puzzle, the same for everyone today'}
          onPress={() => router.push('/daily')}
        />
        {RELEASED.map((t) => (
          <View key={t.id} style={{ marginTop: space.md }}>
            <Label style={{ color: color.inkSoft }}>{t.name}</Label>
            {SKILLS.filter((k) => k.track === t.id).map((k) => (
              <LinkRow key={k.id} title={k.name} detail={k.summary} right={<Stamp status={displayStatus(s.skills[k.id], now)} />} onPress={() => router.push(`/skill/${k.id}`)} />
            ))}
          </View>
        ))}
        {sheet}
      </Screen>
      {banner ? <BannerSlot /> : null}
    </View>
  );
}

import Feather from '@expo/vector-icons/Feather';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EXAMS, SKILL_BY_ID } from '../../content';
import { BLUEPRINTS } from '../../exams/blueprints';
import { dueReviews } from '../../engine/mixer';
import { todaysTargets } from '../../engine/planner';
import { dayKey, formatShortDate } from '../../engine/time';
import { GAMES } from '../../games/registry';
import { isPremium } from '../../monetization/entitlements';
import { TOKEN_COSTS } from '../../monetization/tokens';
import { canOfferRewarded } from '../../policy/ads';
import { CHAPTERS, chapterForTrack, CHAPTER_BY_ID, missionState, nextMission, type Mission } from '../../quests/chapters';
import { projectProgress, weeklyProgress } from '../../rewards/ledger';
import { adsLive, useApp } from '../../state/store';
import { AppHeader } from '../../ui/AppHeader';
import { Companion } from '../../ui/Companion';
import { Button, Eyebrow, Gap, Heading, Label, LinkRow, Micro, Plate, Screen, Small } from '../../ui/kit';
import { color, font, radius, space, type } from '../../ui/theme';
import { ITEM_BY_ID } from '../../world/catalog';

export default function Play() {
  const s = useApp();
  const [blocked, setBlocked] = useState<null | 'no-runs' | 'empty'>(null);
  if (!s.profile) return <Redirect href="/welcome" />;
  if (!s.plan) return <Redirect href="/onboarding/placement" />;

  const now = Date.now();
  const exams = s.profile.exams;
  const examName = exams.length ? exams.map((e) => EXAMS.find((x) => x.id === e)?.name).join(' and ') : 'General math';
  const blueprint = exams.length ? BLUEPRINTS[exams[0]] : undefined;
  const destination = blueprint
    ? `${blueprint.domains
        .filter((d) => d.status !== 'outside')
        .slice(0, 2)
        .map((d) => d.name.toLowerCase())
        .join(' and ')
        .replace(/^./, (c) => c.toUpperCase())} are the destination. Start with number properties.`
    : 'Start with number properties: the rules every later topic leans on.';

  const targets = todaysTargets(s.plan, s.skills, now);
  const preferChapter = targets.length ? chapterForTrack(SKILL_BY_ID[targets[0]].track)?.id : undefined;
  const next = nextMission(s.quests, now, preferChapter);
  const chapter = next ? CHAPTER_BY_ID[next.chapterId] : CHAPTERS[0];
  const due = dueReviews(s.skills, now);
  const week = weeklyProgress(new Set(s.attempts.map((a) => dayKey(a.at))), now);
  const project = s.project ? ITEM_BY_ID[s.project.itemId] : undefined;
  const missionsDone = Object.values(s.quests).filter((q) => q.completedAt).length;
  const progress = project
    ? projectProgress(project, {
        grants: s.grants,
        coins: s.tokens,
        missionsDone,
        missionDone: (id) => Boolean(s.quests[id]?.completedAt),
        weeklyGoalsMet: s.tokenLedger.filter((e) => e.reason === 'weekly').length,
      })
    : undefined;
  const dailyDone = s.daily[dayKey(now)];
  const premium = isPremium(s.entitlements, now);
  const runsLeft = s.runsLeft();
  const rewardedOk = canOfferRewarded({ adsEnabled: adsLive(s), ageBand: s.profile.ageBand, premium });

  const playMission = (m: Mission) => {
    const r = s.startMission(m.id);
    if (r.ok) router.push('/session');
    else router.push(`/mission/${m.id}`);
  };
  const playNext = () => {
    if (next) return playMission(next);
    const r = s.startQuiz('check', {});
    if (r.ok) router.push('/session');
  };
  const startPlanSession = () => {
    const r = s.startSession('journey');
    if (r.ok) {
      setBlocked(null);
      router.push('/session');
    } else if (r.reason === 'no-runs' || r.reason === 'empty') setBlocked(r.reason);
  };

  return (
    <Screen>
      <AppHeader />
      <Eyebrow>Your learning trail</Eyebrow>
      <Pressable accessibilityRole="button" onPress={() => router.push('/plan')} style={({ pressed }) => [styles.examRow, pressed && { opacity: 0.7 }]}>
        <View style={{ flex: 1 }}>
          <Small>Preparing for</Small>
          <Text style={[type.label, { fontSize: 17 }]}>{examName} · math foundations</Text>
        </View>
        <Feather name="chevron-right" size={20} color={color.inkSoft} />
      </Pressable>

      <Plate tone="growth" style={styles.hero}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
          <View style={{ flex: 1, gap: space.xs }}>
            <Text style={styles.heroTitle}>Small moves.{'\n'}Big discoveries.</Text>
            <Small style={{ color: color.inkSoft }}>{destination}</Small>
          </View>
          <Companion mood="curious" size={60} />
        </View>
        <Micro style={{ color: color.actionDeep }}>3 topic tracks available</Micro>
      </Plate>

      {s.active ? (
        <Plate tone="action" style={{ marginTop: space.md }}>
          <Label>You have a session in progress: {s.active.title}.</Label>
          <Button title="Resume" onPress={() => router.push('/session')} />
        </Plate>
      ) : null}

      <Gap h={space.lg} />
      <Heading>{chapter.title}</Heading>
      <Small>{chapter.blurb}</Small>
      <View style={{ marginTop: space.sm }}>
        {chapter.missions.map((m, i) => (
          <TrailRow key={m.id} mission={m} current={next?.id === m.id} last={i === chapter.missions.length - 1} />
        ))}
        {CHAPTERS.filter((c) => c.id !== chapter.id).map((c) => (
          <Pressable key={c.id} accessibilityRole="button" onPress={() => router.push(`/mission/${c.missions[0].id}`)} style={styles.trailRow}>
            <View style={[styles.node, styles.nodeLater]}>
              <Feather name="compass" size={16} color={color.inkSoft} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>{c.title}</Text>
              <Small>{c.missions.filter((m) => s.quests[m.id]?.completedAt).length ? `${c.missions.filter((m) => s.quests[m.id]?.completedAt).length} of ${c.missions.length} done` : 'Explore any time'}</Small>
            </View>
          </Pressable>
        ))}
        <View style={styles.trailRow}>
          <View style={[styles.node, styles.nodeLater]}>
            <Feather name="book-open" size={16} color={color.inkFaint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: color.inkSoft }]}>Fractions, ratios and algebra</Text>
            <Small>More curriculum planned</Small>
          </View>
        </View>
      </View>

      <Gap h={space.md} />
      <Button title={next ? 'Play the next discovery  →' : 'Take a fresh concept check  →'} onPress={playNext} />
      <Micro style={{ textAlign: 'center', marginTop: space.sm }}>A foundations path. Full exam coverage comes later.</Micro>

      <Gap h={space.xl} />
      <Plate>
        <Label>This week</Label>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }} accessibilityLabel={`${week.days} of ${week.target} learning days this week`}>
          {Array.from({ length: week.target }, (_, i) => (
            <View key={i} style={[styles.dayDot, i < week.days && styles.dayDotOn]} />
          ))}
          <Small style={{ marginLeft: space.sm }}>
            {week.met ? 'Weekly goal reached. Nice rhythm.' : `${week.days} of ${week.target} learning days. A missed day keeps everything you've earned.`}
          </Small>
        </View>
      </Plate>

      <Gap h={space.md} />
      <LinkRow
        title={project ? `Next project: ${project.name}` : 'Choose a workshop project'}
        detail={project && progress ? (progress.earned ? 'Earned. Pick your next one in the Workshop.' : progress.text) : 'Something to build toward, in the Workshop'}
        onPress={() => router.push('/workshop')}
      />
      <LinkRow
        title="Daily puzzle"
        detail={dailyDone ? (dailyDone.correct ? 'Solved today. Share your result.' : 'Done for today. A new one tomorrow.') : 'One puzzle, the same for everyone today'}
        onPress={() => router.push('/daily')}
      />
      <LinkRow
        title="Recall due"
        detail={due.length ? `${due.length} secured skill${due.length === 1 ? '' : 's'} to keep fresh: ${due.slice(0, 2).map((id) => SKILL_BY_ID[id]?.name).join(', ')}` : 'Nothing due. Secured skills come back at 1, 3, 7 and 21 days.'}
        onPress={
          due.length
            ? () => {
                if (s.startQuiz('recall').ok) router.push('/session');
              }
            : undefined
        }
      />
      <LinkRow
        title="Your plan session"
        detail={`${targets.map((id) => SKILL_BY_ID[id]?.name).join(' and ') || 'Your next skills'}, with reviews mixed in${premium || runsLeft === Infinity ? '' : `. ${runsLeft} of 3 free runs left today`}`}
        onPress={startPlanSession}
      />

      {blocked === 'no-runs' ? (
        <Plate tone="warm" style={{ marginTop: space.md }}>
          <Label>You've used today's free runs.</Label>
          <Small style={{ color: color.ink }}>Chapter missions, checks, the daily puzzle and reviews are still open. To keep going with plan sessions now:</Small>
          {s.tokens >= TOKEN_COSTS.bonusRun ? (
            <Button
              title={`Use ${TOKEN_COSTS.bonusRun} Workshop Coins for a bonus run`}
              kind="secondary"
              onPress={() => {
                s.buyBonusRunWithTokens();
                setBlocked(null);
              }}
            />
          ) : (
            <Small>You have {s.tokens} Workshop Coins. A bonus run costs {TOKEN_COSTS.bonusRun}.</Small>
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
      {blocked === 'empty' ? <Small style={{ marginTop: space.sm }}>Nothing to practise right now.</Small> : null}
    </Screen>
  );

  function TrailRow({ mission, current, last }: { mission: Mission; current: boolean; last: boolean }) {
    const st = missionState(mission, s.quests, now);
    const detail =
      st.status === 'done'
        ? 'Done'
        : st.status === 'waiting'
          ? st.readyAt === Infinity
            ? 'Opens a day after the check'
            : `Ready ${formatShortDate(st.readyAt)} at ${new Date(st.readyAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
          : current
            ? mission.game
              ? `Play ${GAMES[mission.game].name}`
              : mission.kind === 'check'
                ? 'Take the check'
                : mission.kind === 'transfer'
                  ? 'Try an unfamiliar problem'
                  : 'Take the recall check'
            : 'Open any time';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${mission.title}. ${detail}`}
        onPress={() => router.push(`/mission/${mission.id}`)}
        style={({ pressed }) => [styles.trailRow, pressed && { opacity: 0.75 }]}
      >
        <View style={{ alignItems: 'center' }}>
          <View style={[styles.node, st.status === 'done' ? styles.nodeDone : current ? styles.nodeNow : styles.nodeLater]}>
            <Feather
              name={st.status === 'done' ? 'check' : st.status === 'waiting' ? 'clock' : current ? 'tool' : 'circle'}
              size={16}
              color={current ? color.white : st.status === 'done' ? color.actionDeep : color.inkSoft}
            />
          </View>
          {!last ? <View style={styles.trailLine} /> : null}
        </View>
        <View style={{ flex: 1, paddingBottom: space.sm }}>
          <Text style={[type.label, current && { color: color.actionDeep }]}>{mission.title}</Text>
          <Small>{detail}</Small>
        </View>
        {current ? <Feather name="chevron-right" size={20} color={color.action} /> : null}
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  examRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: color.rule, marginTop: space.xs, marginBottom: space.md },
  hero: { gap: space.md },
  heroTitle: { fontFamily: font.display, fontSize: 28, lineHeight: 33, color: color.ink },
  trailRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', minHeight: 54, paddingTop: space.xs },
  node: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  nodeDone: { backgroundColor: color.surface, borderColor: color.actionWash },
  nodeNow: { backgroundColor: color.action, borderColor: color.action },
  nodeLater: { backgroundColor: color.surface, borderColor: color.rule },
  trailLine: { width: 2, flex: 1, minHeight: 14, backgroundColor: color.rule, marginTop: 2 },
  dayDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: color.paperDeep, borderWidth: 1, borderColor: color.rule },
  dayDotOn: { backgroundColor: color.action, borderColor: color.action },
  wrapRadius: { borderRadius: radius.md },
});

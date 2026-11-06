import Feather from '@expo/vector-icons/Feather';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BannerSlot } from '../../ads/AdSlots';
import { SKILL_BY_ID, SKILLS, templatesForSkill, TRACKS, type TrackId } from '../../content';
import { displayStatus } from '../../engine/mastery';
import { todaysTargets } from '../../engine/planner';
import { dayKey } from '../../engine/time';
import { gamesForSkill, GAMES } from '../../games/registry';
import { isPremium, maxLevelFor } from '../../monetization/entitlements';
import { TOKEN_COSTS } from '../../monetization/tokens';
import { shouldShowBanner } from '../../policy/ads';
import { CHAPTERS, chapterProgress, missionState } from '../../quests/chapters';
import { mistakeCounts } from '../../review/mistakes';
import { adsLive, useApp, type StartResult } from '../../state/store';
import { AppHeader } from '../../ui/AppHeader';
import { Button, Chip, Eyebrow, Gap, Heading, Label, LinkRow, Micro, Plate, Screen, Small, Stamp, Title } from '../../ui/kit';
import { color, radius, space, type } from '../../ui/theme';
import { TrackGlyph } from '../../ui/motion';
import { useStart } from '../../ui/useStart';
import { useNow } from '../../ui/useNow';
import { useRecord } from '../../ui/useRecord';

const RELEASED = TRACKS.filter((t) => t.available);

/**
 * Practice: choose a topic, then play one of its games, practise with the rule on
 * screen, take a concept check with the rule hidden, or review your mistakes.
 */
export default function Practice() {
  const now = useNow();
  const s = useApp();
  // Answers in an unfinished check stay out of these views until it ends.
  const rec = useRecord();
  const targets = s.plan ? todaysTargets(s.plan, rec.skills, now) : [];
  const [track, setTrack] = useState<TrackId>(() => (targets[0] ? SKILL_BY_ID[targets[0]].track : RELEASED[0].id));
  const [skillId, setSkillId] = useState<string>(() => targets[0] ?? SKILLS.find((k) => k.track === RELEASED[0].id)!.id);
  const [blocked, setBlocked] = useState(false);
  const [empty, setEmpty] = useState(false);
  const { start, sheet } = useStart();
  if (!s.profile) return <Redirect href="/welcome" />;

  const premium = isPremium(s.entitlements, now);
  const banner = shouldShowBanner('practice', { adsEnabled: adsLive(s), ageBand: s.profile.ageBand, premium });
  const skill = SKILL_BY_ID[skillId];
  const cap = maxLevelFor(skillId, s.entitlements, now);
  const games = gamesForSkill(skillId, cap);
  // Every family of a skill can be switched off remotely; then there is nothing to start.
  const available = templatesForSkill(skillId, cap).length > 0;
  const missesBySkill = mistakeCounts(rec.attempts);
  const totalMisses = Object.values(missesBySkill).reduce((a, b) => a + b, 0);
  const dailyDone = s.daily[dayKey(now)];

  const go = (run: () => StartResult) =>
    start(run, (r) => {
      setBlocked(!r.ok && r.reason === 'no-runs');
      setEmpty(!r.ok && r.reason === 'empty');
    });
  const pickTrack = (t: TrackId) => {
    setTrack(t);
    setSkillId(SKILLS.find((k) => k.track === t)!.id);
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <AppHeader />
        <Eyebrow>Practice</Eyebrow>
        <Title style={{ marginTop: space.xs }}>Choose a topic</Title>

        <View style={styles.chips} accessibilityRole="tablist">
          {RELEASED.map((t) => (
            <Chip key={t.id} label={t.name} selected={track === t.id} onPress={() => pickTrack(t.id)} />
          ))}
        </View>
        <View style={styles.skillList} accessibilityRole="radiogroup" accessibilityLabel="Skills">
          {SKILLS.filter((k) => k.track === track).map((k) => {
            const on = k.id === skillId;
            return (
              <Pressable
                key={k.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setSkillId(k.id)}
                style={({ pressed }) => [styles.skillRow, on && styles.skillRowOn, pressed && { opacity: 0.85 }]}
              >
                <Text style={[type.label, { flex: 1, color: on ? color.actionDeep : color.ink }]}>{k.name}</Text>
                <Stamp status={displayStatus(rec.skills[k.id], now)} />
              </Pressable>
            );
          })}
        </View>

        <Plate style={{ marginTop: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
            <TrackGlyph track={skill.track} size={36} />
            <View style={{ flex: 1 }}>
              <Heading>{skill.name}</Heading>
              <Small>{skill.summary}.</Small>
            </View>
            <Pressable accessibilityRole="link" accessibilityLabel={`Open the ${skill.name} topic`} onPress={() => router.push(`/skill/${skill.id}`)} hitSlop={8} style={styles.topicLink}>
              <Text style={[type.label, { color: color.action }]}>Topic</Text>
              <Feather name="chevron-right" size={16} color={color.action} />
            </Pressable>
          </View>

          {games.length ? <Label style={{ marginTop: space.sm }}>Games</Label> : null}
          {games.map((g) => (
            <ActionRow key={g} icon="play" title={GAMES[g].name} detail={GAMES[g].tagline} onPress={() => go(() => s.startGame(skill.id, g))} />
          ))}
          {available ? (
            <>
              <Label style={{ marginTop: space.sm }}>Practise and check</Label>
              <ActionRow icon="book-open" title="Guided practice" detail="Six questions with the rule on screen and an explanation after each." onPress={() => go(() => s.startQuiz('practice', { skillId: skill.id }))} />
              <ActionRow
                icon="check-square"
                title="Concept check"
                detail="Five fresh questions with the rule hidden. Results and explanations at the end."
                onPress={() => go(() => s.startQuiz('check', { skills: [skill.id], returnTo: skill.id }))}
              />
            </>
          ) : null}
          {!available || empty ? <Small style={{ color: color.ink }}>This topic's puzzles are paused for a fix right now. Your progress is safe; try another topic.</Small> : null}
          <ActionRow
            icon="rotate-ccw"
            title="Review my mistakes"
            detail={missesBySkill[skill.id] ? `${missesBySkill[skill.id]} to look at again, with explanations.` : 'No mistakes recorded on this topic yet.'}
            onPress={() => router.push(`/mistakes?skill=${skill.id}`)}
          />
        </Plate>

        {blocked ? (
          <Plate tone="warm" style={{ marginTop: space.md }}>
            <Label>You've used today's free sessions.</Label>
            <Small style={{ color: color.ink }}>
              Concept checks, reviews, paths, the daily puzzle and reviewing mistakes are still open.
              {s.tokens >= TOKEN_COSTS.bonusRun ? '' : ` One more session costs ${TOKEN_COSTS.bonusRun} tokens; you have ${Math.max(0, s.tokens)}.`}
            </Small>
            {s.tokens >= TOKEN_COSTS.bonusRun ? (
              <Button
                title={`Use ${TOKEN_COSTS.bonusRun} tokens for one more session`}
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

        <Gap h={space.xl} />
        <Heading>Across topics</Heading>
        <LinkRow
          title="Review my mistakes"
          detail={totalMisses ? `${totalMisses} across all topics, newest first. Filter by topic.` : 'Nothing yet. Missed answers from any practice or check appear here.'}
          onPress={() => router.push('/mistakes')}
        />
        <LinkRow
          title="Mixed drill"
          detail="Twelve questions across the released topics for your goal, rule hidden, results at the end. Uses one free session."
          onPress={() => go(() => s.startQuiz('drill'))}
        />
        <LinkRow title="Challenge builder" detail="Pick topics and difficulty for a run of your own" onPress={() => router.push('/challenge')} />
        <LinkRow title="Daily puzzle" detail={dailyDone ? 'Done for today. A new one tomorrow.' : 'One puzzle, the same for everyone today'} onPress={() => router.push('/daily')} />

        <Gap h={space.xl} />
        <Heading>Step-by-step paths</Heading>
        <Small>Short sequences that build one idea: play, check it with the rule hidden, use it somewhere new, recall it later.</Small>
        {CHAPTERS.map((c) => {
          const cp = chapterProgress(c, s.quests);
          const open = c.missions.find((m) => !s.quests[m.id]?.completedAt && missionState(m, s.quests, now).status === 'available') ?? c.missions[0];
          return (
            <LinkRow
              key={c.id}
              title={c.title}
              detail={cp.done === cp.of ? `All ${cp.of} steps done. Replay any of them.` : `${cp.done} of ${cp.of} steps done. Next: ${open.title}`}
              onPress={() => router.push(`/mission/${open.id}`)}
            />
          );
        })}
        <Micro style={{ marginTop: space.md }}>Paths, concept checks, reviews and practising a mistake never use a free session.</Micro>
        {sheet}
      </Screen>
      {banner ? <BannerSlot /> : null}
    </View>
  );
}

function ActionRow({ icon, title, detail, onPress }: { icon: React.ComponentProps<typeof Feather>['name']; title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} onPress={onPress} style={({ pressed }) => [styles.action, pressed && { backgroundColor: color.paperDeep }]}>
      <View style={styles.actionIcon}>
        <Feather name={icon} size={16} color={color.action} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.label}>{title}</Text>
        <Text style={type.small}>{detail}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={color.inkFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  skillList: { marginTop: space.md, gap: 6 },
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: color.rule, backgroundColor: color.surface },
  skillRowOn: { borderColor: color.action, borderWidth: 2, backgroundColor: color.actionWash },
  topicLink: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: space.sm, borderRadius: radius.md },
  actionIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: color.actionWash, alignItems: 'center', justifyContent: 'center' },
});

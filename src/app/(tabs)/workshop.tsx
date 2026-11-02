import Feather from '@expo/vector-icons/Feather';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SKILLS } from '../../content';
import { displayStatus } from '../../engine/mastery';
import { feel } from '../../feel/director';
import { MISSION_BY_ID, missionsDone, nextMission } from '../../quests/chapters';
import { owned as ownedSet, projectProgress, WEEKLY_REWARD } from '../../rewards/ledger';
import { TOKEN_REWARDS } from '../../monetization/tokens';
import { useApp } from '../../state/store';
import { AppHeader } from '../../ui/AppHeader';
import { Button, CoinBadge, Eyebrow, Gap, Heading, Label, Micro, Plate, Screen, Small, Title } from '../../ui/kit';
import { color, font, radius, space, type } from '../../ui/theme';
import { WorkshopScene } from '../../ui/WorkshopScene';
import { earnText, ITEMS, type WorkshopItem } from '../../world/catalog';

const GROUPS: { title: string; note: string; match: (i: WorkshopItem) => boolean }[] = [
  { title: 'From missions', note: 'Each chapter mission adds one object.', match: (i) => i.earn.kind === 'mission' },
  { title: 'Milestones', note: 'For keeping a rhythm, not for speed.', match: (i) => i.earn.kind === 'missions' || i.earn.kind === 'weekly' },
  { title: 'With Workshop Coins', note: 'Coins are earned by playing. They are never sold.', match: (i) => i.earn.kind === 'coins' },
];

export default function Workshop() {
  const s = useApp();
  const [justBought, setJustBought] = useState<string | null>(null);
  if (!s.profile) return <Redirect href="/welcome" />;

  const now = Date.now();
  const owned = ownedSet(s.grants);
  const coins = Math.max(0, s.tokens);
  const done = missionsDone(s.quests);
  const weeklyGoalsMet = s.tokenLedger.filter((e) => e.reason === 'weekly').length;
  const ctx = { grants: s.grants, coins, missionsDone: done, missionDone: (id: string) => Boolean(s.quests[id]?.completedAt), weeklyGoalsMet };
  const project = s.project ? ITEMS.find((i) => i.id === s.project?.itemId) : undefined;
  const pp = project ? projectProgress(project, ctx) : undefined;
  const next = nextMission(s.quests, now);
  const secure = SKILLS.filter((k) => ['secure', 'review'].includes(displayStatus(s.skills[k.id], now)));

  const title = !owned.size
    ? 'A quiet workshop, waiting for its first light.'
    : owned.size === 1 && owned.has('bench-lamp')
      ? 'Your first light.'
      : `${owned.size} of ${ITEMS.length} pieces in place.`;

  const missionFor = (i: WorkshopItem) => (i.earn.kind === 'mission' ? MISSION_BY_ID[i.earn.missionId] : undefined);

  return (
    <Screen>
      <AppHeader />
      <Eyebrow>Your workshop of ideas</Eyebrow>
      <Title style={{ marginTop: space.xs }}>{title}</Title>
      <Gap h={space.md} />
      <WorkshopScene owned={owned} />
      <Small style={{ marginTop: space.sm }}>Cosmetic progress and concept mastery are separate. Objects show what you've played; seals below show what you've proven.</Small>

      <Gap h={space.lg} />
      <Plate tone="warm" style={{ gap: space.sm }}>
        <Label>{project ? `Current project: ${project.name}` : 'Choose a project'}</Label>
        {project && pp ? (
          <>
            <View style={styles.track} accessibilityLabel={pp.text}>
              <View style={[styles.fill, { width: `${Math.round((100 * pp.done) / Math.max(1, pp.of))}%` }]} />
            </View>
            <Small style={{ color: color.ink }}>{pp.earned ? `${project.name} is in your workshop. Pick the next one below.` : `${pp.text}. ${earnText(project)}`}</Small>
          </>
        ) : (
          <Small style={{ color: color.ink }}>Pick something below to build toward. It shows on Play so you can see how close it is.</Small>
        )}
      </Plate>

      {next ? (
        <>
          <Gap h={space.md} />
          <Button
            title={`Play the next discovery: ${next.title}`}
            onPress={() => {
              if (s.startMission(next.id).ok) router.push('/session');
              else router.push(`/mission/${next.id}`);
            }}
          />
        </>
      ) : null}

      <View style={styles.coinRow}>
        <CoinBadge count={coins} />
        <Small style={{ flex: 1 }}>
          Earn {TOKEN_REWARDS.sessionComplete} for each finished session, {TOKEN_REWARDS.dailyPuzzle} for the daily puzzle and {WEEKLY_REWARD} for a weekly goal.
        </Small>
      </View>

      {GROUPS.map((g) => (
        <View key={g.title} style={{ marginTop: space.lg }}>
          <Heading>{g.title}</Heading>
          <Small>{g.note}</Small>
          {ITEMS.filter(g.match).map((i) => {
            const have = owned.has(i.id);
            const isProject = s.project?.itemId === i.id;
            const m = missionFor(i);
            const cost = i.earn.kind === 'coins' ? i.earn.cost : 0;
            return (
              <View key={i.id} style={[styles.item, have && styles.itemOwned]}>
                <View style={[styles.itemIcon, have ? styles.iconOwned : null]}>
                  <Feather name={have ? 'check' : i.earn.kind === 'coins' ? 'shopping-bag' : 'star'} size={16} color={have ? color.actionDeep : color.inkSoft} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.label}>{i.name}</Text>
                  <Small>{have ? i.blurb : m ? `Finish “${m.title}”.` : earnText(i)}</Small>
                  {justBought === i.id ? <Micro style={{ color: color.right }}>Added to your workshop.</Micro> : null}
                  {!have ? (
                    <View style={styles.itemActions}>
                      {i.earn.kind === 'coins' ? (
                        <Button
                          title={coins >= cost ? `Buy for ${cost} coins` : `${cost} coins`}
                          kind="secondary"
                          disabled={coins < cost}
                          onPress={() => {
                            if (s.buyItem(i.id)) {
                              feel('projectReveal');
                              setJustBought(i.id);
                            }
                          }}
                          style={styles.smallButton}
                        />
                      ) : null}
                      {isProject ? (
                        <Button title="Stop tracking" kind="quiet" onPress={() => s.chooseProject(undefined)} style={styles.quietButton} />
                      ) : (
                        <Button title="Make this my project" kind="quiet" onPress={() => s.chooseProject(i.id)} style={styles.quietButton} />
                      )}
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ))}

      <Gap h={space.xl} />
      <Heading>Knowledge seals</Heading>
      <Small>A seal appears when a skill is Secure: right on your own, across days and puzzle types, including an unfamiliar problem. Seals can't be bought.</Small>
      <View style={styles.seals}>
        {secure.length ? (
          secure.map((k) => (
            <View key={k.id} style={styles.seal} accessibilityLabel={`Seal: ${k.name}`}>
              <Feather name="award" size={18} color={color.gold} />
              <Text style={[type.small, { color: color.ink, fontFamily: font.bodyBold, textAlign: 'center' }]}>{k.name}</Text>
            </View>
          ))
        ) : (
          <Small style={{ color: color.inkSoft }}>No seals yet. Your first comes from a concept check and a recall a day or more later.</Small>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  track: { height: 10, borderRadius: 5, backgroundColor: color.surface, overflow: 'hidden' },
  fill: { height: 10, backgroundColor: color.goldBright },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg },
  item: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: color.rule, alignItems: 'flex-start' },
  itemOwned: {},
  itemIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: color.paperDeep, alignItems: 'center', justifyContent: 'center' },
  iconOwned: { backgroundColor: color.actionWash },
  itemActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  smallButton: { minHeight: 40, paddingHorizontal: space.md },
  quietButton: { minHeight: 40, paddingHorizontal: 0 },
  seals: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  seal: { width: 104, minHeight: 84, borderRadius: radius.md, backgroundColor: color.goldWash, alignItems: 'center', justifyContent: 'center', padding: space.sm, gap: 4 },
});

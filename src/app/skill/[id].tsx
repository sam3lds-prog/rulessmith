import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { generateItem, SKILL_BY_ID, skillName, templatesForSkill } from '../../content';
import { displayStatus, secureGaps } from '../../engine/mastery';
import { isReady, stateOf } from '../../engine/mixer';
import { levelForBand } from '../../engine/rating';
import { maxLevelFor } from '../../monetization/entitlements';
import { useApp } from '../../state/store';
import { BackLink, Body, Button, Gap, Heading, Plate, Small, Stamp, Screen, Title } from '../../ui/kit';
import { color, space } from '../../ui/theme';

export default function SkillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useApp();
  const [blocked, setBlocked] = useState(false);
  const skill = SKILL_BY_ID[id ?? ''];
  const lens = useMemo(() => {
    if (!skill) return undefined;
    const t = templatesForSkill(skill.id, 1)[0];
    return t ? generateItem(t.id, 1, 1).ruleLens : undefined;
  }, [skill?.id]);
  if (!skill) return <Redirect href="/topics" />;

  const now = Date.now();
  const st = stateOf(s.skills, skill.id);
  const status = displayStatus(st, now);
  const gaps = secureGaps(st);
  const level = Math.min(levelForBand(st.rating, 'practice'), maxLevelFor(skill.id, s.entitlements, now));
  const cap = maxLevelFor(skill.id, s.entitlements, now);
  const families = templatesForSkill(skill.id).length;

  const start = (mode: 'skill' | 'ladder') => {
    if (!s.profile) return router.push('/welcome');
    const r = s.startSession(mode, { skillId: skill.id });
    if (r.ok) router.push('/session');
    else if (r.reason === 'no-runs') setBlocked(true);
  };

  return (
    <Screen
      footer={
        <>
          <Button title="Practise this skill" onPress={() => start('skill')} />
          <Button title={`Climb the ladder${s.ladderBest[skill.id] ? ` (best: level ${s.ladderBest[skill.id]})` : ''}`} kind="secondary" onPress={() => start('ladder')} />
        </>
      }
    >
      <BackLink label="Topics" />
      <Stamp status={status} />
      <Title style={{ marginTop: space.sm }}>{skill.name}</Title>
      <Small style={{ marginTop: space.xs }}>{skill.summary}.</Small>
      {lens ? (
        <Plate style={{ marginTop: space.lg, borderLeftWidth: 4, borderLeftColor: color.cobalt }}>
          <Body style={{ fontSize: 16 }}>{lens}</Body>
        </Plate>
      ) : null}

      <Gap h={space.xl} />
      <Heading>Where you are</Heading>
      <Gap h={space.sm} />
      <Small>
        {st.attempts === 0
          ? 'Not started yet.'
          : `Puzzles are coming in at level ${level} of 10${cap < 10 ? ` (your current limit is level ${cap})` : ''}. ${st.attempts} answered so far.`}
      </Small>
      {status !== 'secure' && status !== 'review' ? (
        <Small style={{ marginTop: space.xs }}>To secure it: {gaps.length ? gaps.join('; ') : 'keep going'}.</Small>
      ) : null}
      {status === 'review' ? <Small style={{ marginTop: space.xs }}>Due for review. One correct answer keeps it secure for longer.</Small> : null}
      {!isReady(s.skills, skill.id) && skill.prereqs.length ? (
        <Small style={{ marginTop: space.xs }}>Works best after {skill.prereqs.map(skillName).join(' and ')}. You can still practise it now.</Small>
      ) : null}
      <Small style={{ marginTop: space.xs }}>{families} puzzle types, levels 1 to 10, generated fresh each time.</Small>

      {blocked ? (
        <Plate tone="brass" style={{ marginTop: space.lg }}>
          <Small style={{ color: color.ink }}>You've used today's free runs. The Today screen has ways to keep going, or see Premium.</Small>
          <Button title="See Premium" kind="secondary" onPress={() => router.push('/premium')} />
        </Plate>
      ) : null}
      <View style={{ height: space.lg }} />
    </Screen>
  );
}

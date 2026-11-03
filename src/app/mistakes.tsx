import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { track } from '../analytics/track';
import { isTemplateDisabled, SKILL_BY_ID, skillName, TEMPLATE_BY_ID } from '../content';
import { coach, describeResponse } from '../coach/explain';
import { formatShortDate } from '../engine/time';
import type { SessionMode } from '../engine/types';
import { mistakeCounts, mistakes, reviewEntry, STATUS_NOTE, type ReviewEntry } from '../review/mistakes';
import { useApp } from '../state/store';
import { BackLink, Button, Chip, Eyebrow, Gap, Label, Micro, Plate, Screen, Small, Title } from '../ui/kit';
import { color, font, space, type } from '../ui/theme';
import { useStart } from '../ui/useStart';

const PAGE = 10;

const MODE_NAME: Partial<Record<SessionMode, string>> = {
  check: 'concept check',
  drill: 'mixed drill',
  review: 'review',
  daily: 'daily puzzle',
  try: 'placement',
  quest: 'path',
  game: 'game',
  practice: 'guided practice',
  repair: 'repair',
  journey: "today's session",
  skill: 'practice',
  ladder: 'ladder',
  challenge: 'challenge',
  checkpoint: 'checkpoint',
};

/**
 * Review my mistakes: every wrong first answer from the attempt log, newest
 * first, with the learner's answer and an explanation. A puzzle is shown only
 * if it can be rebuilt exactly; the first answer is never changed or regraded.
 */
export default function Mistakes() {
  const params = useLocalSearchParams<{ skill?: string }>();
  const s = useApp();
  const [skill, setSkill] = useState<string | undefined>(params.skill && SKILL_BY_ID[params.skill] ? params.skill : undefined);
  const [shown, setShown] = useState(PAGE);
  const { start, sheet } = useStart();
  const counts = useMemo(() => mistakeCounts(s.attempts), [s.attempts]);
  const list = useMemo(() => mistakes(s.attempts, { skillId: skill }), [s.attempts, skill]);
  const entries = useMemo(() => list.slice(0, shown).map(reviewEntry), [list, shown, s.flagsVersion]);
  const skillsWithMisses = Object.keys(counts).filter((id) => SKILL_BY_ID[id]);

  return (
    <Screen>
      <BackLink />
      <Eyebrow>Review</Eyebrow>
      <Title style={{ marginTop: space.xs }}>My mistakes</Title>
      <Small style={{ marginTop: space.xs }}>
        Wrong answers from practice, games, checks and reviews, newest first. Looking at them again doesn't change your record; practising one like it gives you a fresh puzzle with the rule on screen.
      </Small>

      {skillsWithMisses.length > 1 ? (
        <View style={styles.chips}>
          <Chip label={`All (${Object.values(counts).reduce((a, b) => a + b, 0)})`} selected={!skill} onPress={() => (setSkill(undefined), setShown(PAGE))} />
          {skillsWithMisses.map((id) => (
            <Chip key={id} label={`${skillName(id)} (${counts[id]})`} selected={skill === id} onPress={() => (setSkill(id), setShown(PAGE))} />
          ))}
        </View>
      ) : null}

      <Gap h={space.md} />
      {list.length === 0 ? (
        <Plate tone="panel">
          <Label>{skill ? `No mistakes on ${skillName(skill)} yet.` : 'No mistakes yet.'}</Label>
          <Small style={{ color: color.ink }}>Wrong answers from any practice, game or check will appear here with an explanation.</Small>
        </Plate>
      ) : null}

      {entries.map((e) => (
        <MistakeCard
          key={e.attempt.id}
          entry={e}
          onPractise={() => {
            track('review_returned', { template: e.attempt.templateId });
            start(() => s.startQuiz('practice', { skillId: e.attempt.skillId, templateId: e.attempt.templateId, returnTo: e.attempt.skillId }));
          }}
        />
      ))}
      {list.length > shown ? <Button title={`Show ${Math.min(PAGE, list.length - shown)} more`} kind="secondary" onPress={() => setShown(shown + PAGE)} style={{ marginTop: space.md }} /> : null}
      {sheet}
    </Screen>
  );
}

function MistakeCard({ entry, onPractise }: { entry: ReviewEntry; onPractise: () => void }) {
  const { attempt: a, item, status } = entry;
  const canPractise = Boolean(TEMPLATE_BY_ID[a.templateId]) && !isTemplateDisabled(a.templateId);
  // Specific coaching only when today's checker agrees with the recorded verdict; otherwise the item's own explanation.
  const c = status === 'ok' && item && a.response && entry.result ? coach(item, a.response, entry.result) : undefined;
  return (
    <Plate style={{ marginBottom: space.md }}>
      <View style={styles.cardHead}>
        <Label style={{ flex: 1 }}>{skillName(a.skillId)}</Label>
        <Micro>
          {formatShortDate(a.at)}
          {MODE_NAME[a.mode] ? ` · ${MODE_NAME[a.mode]}` : ''}
          {a.hintBeforeAnswer ? ' · with help' : ''}
        </Micro>
      </View>
      {item ? (
        <>
          <Text style={[type.body, { fontFamily: font.bodyBold, fontSize: 16 }]}>{item.prompt}</Text>
          {item.payload.kind === 'refute' ? <Small>Claim: {item.payload.claimText}</Small> : null}
        </>
      ) : null}
      {a.response && item ? <Small style={{ color: color.ink }}>{describeResponse(item, a.response)}</Small> : null}
      {status !== 'ok' ? <Small style={{ color: color.inkSoft, fontStyle: 'italic' }}>{STATUS_NOTE[status]}</Small> : null}
      {c ? (
        <View style={{ gap: 4 }}>
          {c.lines.map((l, i) => (
            <Small key={i} style={{ color: color.ink }}>
              {l}
            </Small>
          ))}
          {c.slip ? <Small>{c.slip}</Small> : null}
          {c.rule ? <Small>Rule: {c.rule}</Small> : null}
        </View>
      ) : (status === 'no-response' || status === 'corrected') && item ? (
        <Small style={{ color: color.ink }}>{item.explanation}</Small>
      ) : null}
      {canPractise ? <Button title="Practise one like it" kind="secondary" onPress={onPractise} style={{ marginTop: space.xs }} /> : null}
    </Plate>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});

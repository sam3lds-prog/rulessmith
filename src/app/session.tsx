import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ItemScreen } from '../boards/ItemScreen';
import { LADDER_MISSES } from '../engine/mixer';
import { skillName } from '../content';
import { gameForItem } from '../games/registry';
import { CHAPTER_BY_ID, MISSION_BY_ID } from '../quests/chapters';
import { useApp } from '../state/store';
import { Micro } from '../ui/kit';
import { Segment } from '../ui/motion';
import { color, space, type } from '../ui/theme';

export default function Session() {
  const active = useApp((s) => s.active);
  const flagsVersion = useApp((s) => s.flagsVersion);
  const currentItem = useApp((s) => s.currentItem);
  const ensureServable = useApp((s) => s.ensureServable);
  const saveProgress = useApp((s) => s.saveProgress);
  const recordAnswer = useApp((s) => s.recordAnswer);
  const advance = useApp((s) => s.advance);
  const finish = useApp((s) => s.finishSession);
  const abandon = useApp((s) => s.abandonSession);
  const report = useApp((s) => s.report);
  const addRelatedSlot = useApp((s) => s.addRelatedSlot);
  const explain = useApp((s) => s.settings.explain);
  const answered = useRef(false);
  const slot = active?.slots[active.index];
  const slotKey = slot ? `${slot.templateId}@${slot.level}#${slot.seed}/v${slot.version}` : '';

  const item = useMemo(() => currentItem(), [active?.id, active?.index, slotKey, flagsVersion]);

  // Resumed after the app was closed on an answered puzzle: move past it rather than grading it twice.
  useEffect(() => {
    if (active && active.results.length > active.index) {
      const { done } = advance();
      if (done) {
        finish();
        router.replace('/recap');
      }
    }
  }, [active?.id]);

  // The kill switch and template versions are checked on resume, on every new puzzle, and whenever the remote list changes.
  useEffect(() => {
    if (!active || active.results.length > active.index) return;
    if (ensureServable() === 'ended') {
      if (useApp.getState().active?.results.length) {
        finish();
        router.replace('/recap');
      } else {
        abandon();
        router.replace('/today');
      }
    }
  }, [active?.id, active?.index, slotKey, flagsVersion]);

  if (!active) return <Redirect href="/today" />;
  // Being replaced (switched off or changed since it was made): the effect above swaps it in a moment.
  if (!item || !slot) return null;

  const ladder = active.ladder;
  const total = ladder ? undefined : active.challenge ? active.challenge.length : active.slots.length;
  const position = active.index + 1;
  const isLast = !ladder && total !== undefined && position >= total;

  const end = () => {
    if (active.results.length > 0) {
      // A normal finish: a ladder ended at its third miss, or every puzzle answered (End tapped
      // instead of "See my results"). Anything else stopped early.
      const allAnswered = total !== undefined && active.results.length >= total;
      const early = !(ladder && ladder.misses >= LADDER_MISSES) && !allAnswered;
      finish({ early });
      router.replace('/recap');
    } else {
      abandon();
      router.replace('/today');
    }
  };

  const header = (
    <View style={{ gap: space.sm, marginBottom: space.xs }}>
      <View style={styles.headRow}>
        <Pressable accessibilityRole="button" onPress={end} hitSlop={12} style={styles.end}>
          <Text style={[type.label, { color: color.action }]}>End</Text>
        </Pressable>
        <Micro>
          {active.title}
          {ladder ? `, level ${ladder.level}` : ''}
        </Micro>
        <Micro>{ladder ? `${LADDER_MISSES - ladder.misses} misses left` : `${position} of ${total}`}</Micro>
      </View>
      {total ? (
        <View style={styles.track} accessibilityLabel={`Puzzle ${position} of ${total}`}>
          {Array.from({ length: total }, (_, i) => {
            const r = active.results[i];
            // In a check the bar shows progress only: answered, current, to come. Never right or wrong.
            const fill = r ? (active.feedback === 'after-set' ? color.actionDeep : r.correct ? color.right : color.wrong) : color.action;
            return <Segment key={i} filled={!!r} fill={fill} base={i === active.index ? color.action : color.paperDeep} />;
          })}
        </View>
      ) : null}
    </View>
  );

  const mission = active.missionId ? MISSION_BY_ID[active.missionId] : undefined;
  const chapter = mission ? CHAPTER_BY_ID[mission.chapterId] : undefined;
  const isCheck = active.feedback === 'after-set' || active.quiz === 'recall';
  const game = isCheck ? null : gameForItem(item);
  const eyebrow = isCheck
    ? `${active.quiz === 'drill' ? 'Mixed drill' : active.quiz === 'recall' ? 'Review' : 'Concept check'} · results at the end`
    : slot.reason === 'related'
      ? `Related problem · ${skillName(item.skillId)}`
      : chapter
        ? `${chapter.title} · ${mission!.title}`
        : skillName(item.skillId);

  return (
    <ItemScreen
      key={`${active.id}:${active.index}:${item.id}`}
      item={item}
      support={slot.support}
      game={game}
      eyebrow={eyebrow}
      feedback={active.feedback}
      explain={isCheck ? 'all' : explain}
      onRelated={active.feedback === 'immediate' && !active.ladder && !active.challenge ? addRelatedSlot : undefined}
      topicId={item.skillId}
      header={header}
      timed={active.timed}
      initialProgress={active.progress}
      onProgress={saveProgress}
      onAnswered={({ result: _result, ...a }) => {
        if (answered.current) return;
        answered.current = true;
        recordAnswer(item, a);
      }}
      onReport={(reason) => report(item, reason)}
      continueLabel={isLast ? (active.feedback === 'after-set' ? 'See my results' : 'See recap') : 'Next'}
      onContinue={() => {
        answered.current = false;
        const { done } = advance();
        if (done) {
          finish();
          router.replace('/recap');
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  end: { minHeight: 36, justifyContent: 'center' },
  track: { flexDirection: 'row', gap: 4 },
});

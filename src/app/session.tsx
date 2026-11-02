import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ItemScreen } from '../boards/ItemScreen';
import { LADDER_MISSES } from '../engine/mixer';
import { useApp } from '../state/store';
import { Micro } from '../ui/kit';
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
      // Ending a ladder at its third miss is a normal finish; anything else stopped early.
      const early = !(ladder && ladder.misses >= LADDER_MISSES);
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
          <Text style={[type.label, { color: color.cobalt }]}>End</Text>
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
            return (
              <View
                key={i}
                style={[
                  styles.seg,
                  r ? { backgroundColor: r.correct ? color.verdigris : color.brick } : i === active.index ? { backgroundColor: color.cobalt } : null,
                ]}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );

  return (
    <ItemScreen
      key={`${active.id}:${active.index}:${item.id}`}
      item={item}
      support={slot.support}
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
      continueLabel={isLast ? 'See recap' : 'Next'}
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
  seg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: color.paperDeep },
});

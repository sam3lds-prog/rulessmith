import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkItem, correctAnswerText } from '../content/check';
import { fmt } from '../content/format';
import type { BoardDraft, CheckResult, Item, Response } from '../content/types';
import type { Support } from '../engine/types';
import type { AnswerRecord, ItemProgress } from '../state/types';
import { Body, Button, Gap, Heading, Label, Small } from '../ui/kit';
import { color, font, MAX_WIDTH, radius, space, type } from '../ui/theme';
import { ChoiceBoard, ConstructBoard, NumericBoard, RefuteBoard, SortBoard } from './boards';

export interface AnswerInfo extends AnswerRecord {
  result: CheckResult;
}

const REPORT_REASONS = ['The answer is wrong', 'The question is unclear', 'Something looks broken', 'Something else'];

/** How often active time is saved while the puzzle is on screen, in case the app is killed without warning. */
const HEARTBEAT_MS = 10_000;

/**
 * One puzzle, start to finish. Key it by item.id so its state resets per item.
 *
 * `support` decides the rule: guided shows it; independent hides it behind a
 * tap that counts as a hint. Work in progress (the board, hints, a revealed
 * rule, first-seen time, active time) is reported through `onProgress` and
 * restored from `initialProgress`, so an interruption can't turn a helped
 * answer into an unaided one.
 */
export function ItemScreen({
  item,
  support,
  header,
  initialProgress,
  onProgress,
  onAnswered,
  onContinue,
  continueLabel = 'Next',
  compact = false,
  onReport,
  timed = false,
}: {
  item: Item;
  support: Support;
  header?: ReactNode;
  /** Ignored unless it belongs to this item. */
  initialProgress?: ItemProgress;
  onProgress?: (p: ItemProgress) => void;
  onAnswered: (a: AnswerInfo) => void;
  onContinue: () => void;
  continueLabel?: string;
  /** Placement mode: verdict only, no explanation, to keep the check short. */
  compact?: boolean;
  onReport?: (reason: string) => void;
  timed?: boolean;
}) {
  const restored = initialProgress && initialProgress.itemId === item.id ? initialProgress : undefined;
  const guided = support === 'guided';
  const [draft, setDraft] = useState<BoardDraft | null>(restored?.draft ?? null);
  const [response, setResponse] = useState<Response | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [hints, setHints] = useState(restored?.hints ?? 0);
  const [ruleRevealed, setRuleRevealed] = useState(restored?.ruleRevealed ?? false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [elapsed, setElapsed] = useState(restored?.activeMs ?? 0);
  const firstSeenAt = useRef(restored?.firstSeenAt ?? Date.now());
  // Active time: what was banked before, plus the current foreground stretch.
  const banked = useRef(restored?.activeMs ?? 0);
  const since = useRef<number | null>(AppState.currentState === 'background' ? null : Date.now());
  const scroll = useRef<ScrollViewInstance>(null);
  const locked = result !== null;
  const lensOpen = guided || ruleRevealed;

  const activeMs = () => banked.current + (since.current !== null ? Date.now() - since.current : 0);

  const latest = useRef({ draft, hints, ruleRevealed, locked });
  latest.current = { draft, hints, ruleRevealed, locked };
  const report = () => {
    const l = latest.current;
    if (l.locked || !onProgress) return;
    onProgress({ itemId: item.id, draft: l.draft, hints: l.hints, ruleRevealed: l.ruleRevealed, firstSeenAt: firstSeenAt.current, activeMs: activeMs() });
  };

  // Save on every change to the work, including the first view (so first-seen time survives).
  useEffect(report, [draft, hints, ruleRevealed]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        if (since.current === null) since.current = Date.now();
      } else if (since.current !== null) {
        banked.current += Date.now() - since.current;
        since.current = null;
        report();
      }
    });
    const beat = setInterval(report, HEARTBEAT_MS);
    return () => {
      sub.remove();
      clearInterval(beat);
    };
  }, []);

  useEffect(() => {
    if (!timed || locked) return;
    const t = setInterval(() => setElapsed(activeMs()), 1000);
    return () => clearInterval(t);
  }, [timed, locked]);

  const submit = () => {
    if (!response || locked) return;
    const r = checkItem(item, response);
    setResult(r);
    const ms = activeMs();
    banked.current = ms;
    since.current = null;
    onAnswered({
      correct: r.correct,
      hint: hints > 0 || ruleRevealed,
      hintsUsed: hints + (ruleRevealed ? 1 : 0),
      ruleShown: lensOpen,
      support,
      ms,
      firstSeenAt: firstSeenAt.current,
      response,
      misconception: r.misconception,
      result: r,
    });
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
  };

  const p = item.payload;
  const board = (() => {
    const common = { locked, result: result ?? undefined, onChange: setResponse, initialDraft: restored?.draft ?? null, onDraft: setDraft };
    switch (p.kind) {
      case 'sort':
        return <SortBoard payload={p} {...common} />;
      case 'construct':
        return <ConstructBoard payload={p} {...common} />;
      case 'refute':
        return <RefuteBoard payload={p} {...common} />;
      case 'choice':
        return <ChoiceBoard payload={p} {...common} />;
      case 'numeric':
        return <NumericBoard payload={p} {...common} />;
    }
  })();


  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView ref={scroll} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {header}
          <View style={styles.metaRow}>
            {!compact ? (
              <View style={[styles.mode, guided ? styles.modeGuided : styles.modeOwn]}>
                <Text style={[type.micro, { color: guided ? color.cobaltDeep : color.brass, fontFamily: font.label }]}>
                  {guided ? 'Practice with the rule' : 'On your own'}
                </Text>
              </View>
            ) : (
              <View />
            )}
            {timed ? <Small>{Math.floor(elapsed / 1000)}s</Small> : null}
          </View>
          <Text style={styles.prompt} accessibilityRole="header">
            {item.prompt}
          </Text>

          {item.ruleLens ? (
            lensOpen ? (
              <View style={styles.lens} accessibilityLabel={`Rule: ${item.ruleLens}`}>
                <Text style={[type.small, { color: color.ink }]}>{item.ruleLens}</Text>
              </View>
            ) : !locked ? (
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Counts as a hint for this puzzle"
                onPress={() => setRuleRevealed(true)}
                style={styles.inlineLink}
              >
                <Text style={[type.label, { color: color.cobalt }]}>Show the rule (counts as a hint)</Text>
              </Pressable>
            ) : null
          ) : null}

          {item.hints.slice(0, hints).map((h, i) => (
            <View key={i} style={styles.hint}>
              <Text style={[type.small, { color: color.ink }]}>{h}</Text>
            </View>
          ))}

          <Gap h={space.md} />
          {board}

          {locked && result ? (
            <View style={[styles.feedback, result.correct ? styles.feedbackRight : styles.feedbackWrong]} accessibilityLiveRegion="polite">
              <Heading style={{ color: result.correct ? color.verdigris : color.brick }}>
                {result.correct ? 'Right.' : 'Not quite.'}
              </Heading>
              {!result.correct && p.kind !== 'sort' ? (
                <Label>
                  Answer: <Text style={{ fontFamily: font.bodyBold }}>{answerDisplay(item)}</Text>
                </Label>
              ) : null}
              {!compact ? (
                <>
                  <Body style={{ fontSize: 16, lineHeight: 24 }}>{item.explanation}</Body>
                  {onReport ? (
                    <Pressable accessibilityRole="button" onPress={() => setReportOpen(true)} disabled={reported} style={styles.inlineLink}>
                      <Text style={[type.small, { color: reported ? color.inkFaint : color.cobalt }]}>
                        {reported ? 'Thanks. This puzzle has been reported.' : 'Report a problem with this puzzle'}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footerWrap}>
        <View style={styles.footer}>
          {locked ? (
            <Button title={continueLabel} onPress={onContinue} />
          ) : (
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Button
                title={hints >= item.hints.length ? 'No more hints' : hints === 0 ? 'Hint' : 'Another hint'}
                kind="secondary"
                onPress={() => setHints((h) => Math.min(item.hints.length, h + 1))}
                disabled={hints >= item.hints.length}
                style={{ flex: 1 }}
                accessibilityHint="A hint before answering makes this puzzle practice rather than proof"
              />
              <Button title="Check" onPress={submit} disabled={!response} style={{ flex: 1.4 }} />
            </View>
          )}
        </View>
      </View>

      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={() => setReportOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setReportOpen(false)} accessibilityLabel="Close">
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Heading>What's wrong with this puzzle?</Heading>
            <Small>We'll look at this exact puzzle ({item.id}).</Small>
            <Gap h={space.sm} />
            {REPORT_REASONS.map((r) => (
              <Button
                key={r}
                title={r}
                kind="secondary"
                onPress={() => {
                  onReport?.(r);
                  setReported(true);
                  setReportOpen(false);
                }}
              />
            ))}
            <Button title="Cancel" kind="quiet" onPress={() => setReportOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function answerDisplay(item: Item): string {
  const text = correctAnswerText(item);
  if (item.payload.kind === 'numeric') return fmt(text);
  if (item.payload.kind === 'construct' && item.payload.mode === 'one') {
    let j = 0;
    const digits = item.payload.fixed.map((d) => (d === null ? text[j++] : String(d))).join('');
    return `${fmt(digits)}${item.payload.fixed.filter((d) => d === null).length > 1 ? ' (one of several)' : ''}`;
  }
  return text;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  scroll: { flexGrow: 1, paddingHorizontal: space.lg + 4, paddingTop: space.lg, paddingBottom: space.xxl },
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', gap: space.sm },
  prompt: { ...type.body, fontFamily: font.bodyBold, fontSize: 19, lineHeight: 27 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  mode: { borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 3 },
  modeGuided: { backgroundColor: color.cobaltWash },
  modeOwn: { backgroundColor: color.brassWash },
  lens: {
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    borderLeftWidth: 4,
    borderLeftColor: color.cobalt,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  hint: {
    backgroundColor: color.brassWash,
    borderRadius: radius.sm,
    borderLeftWidth: 4,
    borderLeftColor: color.brassBright,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  inlineLink: { alignSelf: 'flex-start', paddingVertical: space.sm, minHeight: 40, justifyContent: 'center' },
  feedback: { marginTop: space.lg, borderRadius: radius.lg, borderWidth: 1.5, padding: space.lg, gap: space.sm },
  feedbackRight: { backgroundColor: color.verdigrisWash, borderColor: color.verdigris },
  feedbackWrong: { backgroundColor: color.brickWash, borderColor: color.brick },
  footerWrap: { borderTopWidth: 1, borderTopColor: color.rule, backgroundColor: color.paper },
  footer: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg + 4, paddingTop: space.md, paddingBottom: space.lg },
  scrim: { flex: 1, backgroundColor: 'rgba(28,36,48,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: color.paper,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.xl,
    gap: space.sm,
    width: '100%',
    maxWidth: MAX_WIDTH,
    alignSelf: 'center',
  },
});

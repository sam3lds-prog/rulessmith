import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkItem, correctAnswerText } from '../content/check';
import { describe, fmt } from '../content/format';
import type { BoardDraft, CheckResult, Item, Response } from '../content/types';
import type { Support } from '../engine/types';
import { feel } from '../feel/director';
import { GAMES, type GameId } from '../games/registry';
import type { AnswerRecord, ItemProgress } from '../state/types';
import { Companion, type Mood } from '../ui/Companion';
import { Body, Button, Eyebrow, Gap, Heading, Label, Small } from '../ui/kit';
import { color, depth, font, MAX_WIDTH, radius, space, type } from '../ui/theme';
import { ChoiceBoard, ConstructBoard, FactorBoard, NumericBoard, RailBoard, RefuteBoard, SortBoard } from './boards';

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
 *
 * `game` dresses the board as one of the games (Number Forge and so on);
 * grading is unchanged. With `feedback="after-set"` (concept checks and
 * drills) nothing on screen, in sound or from the companion hints at
 * correctness: the answer is saved and the verdicts come at the end.
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
  game = null,
  eyebrow,
  feedback = 'immediate',
}: {
  item: Item;
  support: Support;
  header?: ReactNode;
  game?: GameId | null;
  /** A short line above the title, e.g. "Gatehouse · learn through play". */
  eyebrow?: string;
  feedback?: 'immediate' | 'after-set';
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
  const p = item.payload;
  const locked = result !== null;
  const lensOpen = guided || ruleRevealed;
  const showVerdict = feedback === 'immediate';
  const g = game ? GAMES[game] : null;
  const mood: Mood = locked ? (showVerdict ? (result!.correct ? 'pleased' : 'calm') : 'curious') : hints > 0 || ruleRevealed ? 'thinking' : 'curious';

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

  // A tap on the board acknowledges itself at once, the same whatever the answer.
  const firstDraft = useRef(true);
  useEffect(() => {
    if (firstDraft.current) {
      firstDraft.current = false;
      return;
    }
    if (!locked) feel('select');
  }, [draft]);

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
    feel(showVerdict ? (r.correct ? 'correct' : 'incorrect') : 'submit');
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
  };

  // Number Forge in guided play lights up the digit sum as the learner builds (teaching support, never in a check).
  const representation = (() => {
    if (!guided || p.kind !== 'construct' || p.mode !== 'one') return null;
    const usesDigitSum = (q: typeof p.p): boolean =>
      q.op === 'div' ? q.d === 3 || q.d === 9 : q.op === 'and' || q.op === 'or' ? q.ps.some(usesDigitSum) : q.op === 'not' ? usesDigitSum(q.p) : false;
    if (!usesDigitSum(p.p)) return null;
    const fill = draft?.kind === 'construct' ? draft.fill : [];
    let j = 0;
    const digits = p.fixed.map((d) => (d === null ? (fill[j++] ?? null) : d));
    const known = digits.every((d) => d !== null);
    const sum = digits.reduce<number>((a, d) => a + (d ?? 0), 0);
    return `${digits.map((d) => (d === null ? '?' : String(d))).join(' + ')}${known ? ` = ${sum}` : ''}`;
  })();

  const board = (() => {
    const common = { locked, result: showVerdict ? (result ?? undefined) : undefined, onChange: setResponse, initialDraft: restored?.draft ?? null, onDraft: setDraft };
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
      case 'factor':
        return <FactorBoard payload={p} {...common} guided={guided} />;
      case 'rail':
        return <RailBoard payload={p} {...common} guided={guided} />;
    }
  })();


  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView ref={scroll} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {header}
          {g || eyebrow ? (
            <View style={styles.gameHead}>
              <View style={{ flex: 1, gap: 2 }}>
                {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
                {g ? <Text style={styles.gameTitle}>{g.name}</Text> : null}
                {g ? <Small>{g.tagline}</Small> : null}
              </View>
              {!compact ? <Companion mood={mood} size={52} /> : null}
            </View>
          ) : null}
          <View style={styles.metaRow}>
            {!compact ? (
              <View style={[styles.mode, guided ? styles.modeGuided : styles.modeOwn]}>
                <Text style={[type.micro, { color: guided ? color.actionDeep : color.gold, fontFamily: font.label }]}>
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
                <Text style={[type.label, { color: color.action }]}>Show the rule (counts as a hint)</Text>
              </Pressable>
            ) : null
          ) : null}

          {item.hints.slice(0, hints).map((h, i) => (
            <View key={i} style={styles.hint}>
              <Text style={[type.small, { color: color.ink }]}>{h}</Text>
            </View>
          ))}

          <Gap h={space.md} />
          <View style={g ? styles.mold : null}>
            {g && p.kind === 'construct' ? (
              <View style={styles.moldTag}>
                <Text style={styles.moldTagText}>{capitalize(describe(p.p))}</Text>
              </View>
            ) : null}
            {board}
            {representation ? (
              <View style={styles.representation} accessibilityLabel={`Digit sum: ${representation}`}>
                <Text style={styles.representationText}>{representation}</Text>
              </View>
            ) : null}
          </View>
          {g && guided && !locked ? <Small>{g.guidedNote}</Small> : null}

          {locked && result && !showVerdict ? (
            <View style={[styles.feedback, styles.feedbackNeutral]} accessibilityLiveRegion="polite">
              <Heading>Answer saved.</Heading>
              <Small style={{ color: color.ink }}>Explanations come at the end of the set, with every answer you gave.</Small>
            </View>
          ) : null}

          {locked && result && showVerdict ? (
            <View style={[styles.feedback, result.correct ? styles.feedbackRight : styles.feedbackWrong]} accessibilityLiveRegion="polite">
              <Heading style={{ color: result.correct ? color.right : color.wrong }}>
                {result.correct ? 'Right.' : 'Not quite.'}
              </Heading>
              {!result.correct && result.feedback ? <Small style={{ color: color.ink }}>{result.feedback}</Small> : null}
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
                      <Text style={[type.small, { color: reported ? color.inkFaint : color.action }]}>
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
              <Button title={g?.submitLabel ?? (showVerdict ? 'Check' : 'Save answer')} onPress={submit} disabled={!response} style={{ flex: 1.4 }} />
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

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The correct answer, for the feedback card and the end-of-set review. */
export function answerDisplay(item: Item): string {
  const text = correctAnswerText(item);
  if (item.payload.kind === 'numeric') return fmt(text);
  if (item.payload.kind === 'sort') return text ? `${item.payload.yesLabel}: ${text.split(', ').map((n) => fmt(n)).join(', ')}` : `None are ${item.payload.yesLabel.toLowerCase()}`;
  if (item.payload.kind === 'construct' && item.payload.mode === 'one') {
    let j = 0;
    const digits = item.payload.fixed.map((d) => (d === null ? text[j++] : String(d))).join('');
    return `${fmt(digits)}${item.payload.fixed.filter((d) => d === null).length > 1 ? ' (one of several)' : ''}`;
  }
  return text;
}

/** What the learner answered, in words, for the end-of-set review. */
export function responseDisplay(item: Item, r: Response | undefined): string {
  if (!r) return 'Not recorded';
  const p = item.payload;
  switch (r.kind) {
    case 'sort':
      return p.kind === 'sort' ? (r.yes.length ? `${p.yesLabel}: ${r.yes.map((i) => fmt(p.numbers[i])).join(', ')}` : `None marked ${p.yesLabel.toLowerCase()}`) : '';
    case 'construct': {
      if (p.kind !== 'construct') return '';
      let j = 0;
      return fmt(p.fixed.map((d) => (d === null ? String(r.digits[j++]) : String(d))).join(''));
    }
    case 'constructAll':
      return r.digits.join(', ');
    case 'refute':
      return r.verdict === 'true' ? "It's always true" : `Counterexample: ${r.counterexample.join(', ')}`;
    case 'choice':
      return p.kind === 'choice' ? (p.options.find((o) => o.id === r.optionId)?.label ?? '') : '';
    case 'numeric':
      return fmt(r.value);
    case 'factor':
      return r.primes.map((q) => fmt(q)).join(' × ');
    case 'rail':
      return p.kind === 'rail' ? (p.stops[r.stop]?.label ?? '') : '';
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  scroll: { flexGrow: 1, paddingHorizontal: space.lg + 4, paddingTop: space.lg, paddingBottom: space.xxl },
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', gap: space.sm },
  prompt: { ...type.body, fontFamily: font.bodyBold, fontSize: 19, lineHeight: 27 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  mode: { borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 3 },
  modeGuided: { backgroundColor: color.actionWash },
  modeOwn: { backgroundColor: color.goldWash },
  lens: {
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    borderLeftWidth: 4,
    borderLeftColor: color.action,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  hint: {
    backgroundColor: color.goldWash,
    borderRadius: radius.sm,
    borderLeftWidth: 4,
    borderLeftColor: color.goldBright,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  inlineLink: { alignSelf: 'flex-start', paddingVertical: space.sm, minHeight: 40, justifyContent: 'center' },
  feedback: { marginTop: space.lg, borderRadius: radius.lg, borderWidth: 1.5, padding: space.lg, gap: space.sm },
  feedbackRight: { backgroundColor: color.rightWash, borderColor: color.right },
  feedbackWrong: { backgroundColor: color.wrongWash, borderColor: color.wrong },
  feedbackNeutral: { backgroundColor: color.surface, borderColor: color.rule },
  gameHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  gameTitle: { fontFamily: font.display, fontSize: 28, lineHeight: 34, color: color.ink },
  mold: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.rule,
    borderBottomWidth: 5,
    borderBottomColor: depth.card,
    padding: space.lg,
    paddingTop: space.xl,
    gap: space.md,
  },
  moldTag: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    backgroundColor: color.goldWash,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 3,
  },
  moldTagText: { fontFamily: font.label, fontSize: 13, color: color.gold },
  representation: { backgroundColor: color.paper, borderRadius: radius.sm, paddingVertical: space.sm, alignItems: 'center' },
  representationText: { fontFamily: font.num, fontSize: 20, color: color.ink, fontVariant: ['tabular-nums'] },
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

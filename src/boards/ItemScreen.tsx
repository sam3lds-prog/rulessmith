import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { workedExample } from '../coach/example';
import { coach } from '../coach/explain';
import { checkItem, correctAnswerText, mazePathBrute } from '../content/check';
import { describe, fmt } from '../content/format';
import type { BoardDraft, CheckResult, Item, Response } from '../content/types';
import type { Support } from '../engine/types';
import { feel } from '../feel/director';
import { GAMES, type GameId } from '../games/registry';
import type { AnswerRecord, ExplainMode, ItemProgress } from '../state/types';
import { Body, Button, Eyebrow, Gap, Heading, Label, Small } from '../ui/kit';
import { Countdown, Rise } from '../ui/motion';
import { color, depth, font, MAX_WIDTH, radius, space, type } from '../ui/theme';
import { ChoiceBoard, ConstructBoard, FactorBoard, MatchBoard, MazeBoard, MazePreview, NumericBoard, RailBoard, RefuteBoard, SortBoard } from './boards';

export interface AnswerInfo extends AnswerRecord {
  result: CheckResult;
}

const REPORT_REASONS = ['The answer is wrong', 'The question is unclear', 'Something looks broken', 'Something else'];

/** How often active time is saved while the puzzle is on screen, in case the app is killed without warning. */
const HEARTBEAT_MS = 10_000;

/** With "explain my mistakes only" or "skip explanations": how long a right answer stays before moving on. */
export const RIGHT_MS = 1200;
/** With "skip explanations": how long a wrong answer (verdict and correct answer) stays before moving on. */
export const WRONG_MS = 4500;

/**
 * One puzzle, start to finish. Key it by item.id so its state resets per item.
 *
 * `support` decides the rule: guided shows it; independent hides it behind a
 * tap that counts as a hint. Work in progress (the board, hints, a revealed
 * rule, first-seen time, active time) is reported through `onProgress` and
 * restored from `initialProgress`, so an interruption can't turn a helped
 * answer into an unaided one.
 *
 * `game` frames the board as one of the games (Missing Digit and so on);
 * grading is unchanged. After a wrong answer with immediate feedback, the
 * coaching layer explains this particular answer (coach/explain.ts), and
 * `onRelated` offers a fresh guided puzzle of the same kind. With
 * `feedback="after-set"` (concept checks and drills) nothing on screen or in
 * sound hints at correctness: the answer is saved and the verdicts come at the end.
 *
 * Help (one button, three kinds: a hint, the rule, a worked example of the
 * same kind) is always free; any of it makes the answer helped. `explain`
 * is the learner's setting for what follows an answer with immediate
 * feedback: it may move on by itself, but never with a screen reader on (on
 * phones and tablets; the web can't tell),
 * never once the learner taps "Stay on this one" or opens the explanation,
 * and the explanation is always one tap away (and in the recap and mistakes).
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
  onRelated,
  topicId,
  explain = 'all',
}: {
  item: Item;
  support: Support;
  header?: ReactNode;
  game?: GameId | null;
  /** A short line above the title, e.g. "Digit sums · rule on screen". */
  eyebrow?: string;
  feedback?: 'immediate' | 'after-set';
  /** After a wrong answer: add a fresh related puzzle next. Returns false if it couldn't. */
  onRelated?: () => boolean;
  /** The skill, for "See the topic" after a wrong answer. */
  topicId?: string;
  /** What follows an answer when feedback is immediate (the learner's setting). */
  explain?: ExplainMode;
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
  const [example, setExample] = useState(restored?.example ?? false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Moving on by itself stops for good once the learner stays, opens the explanation or reports.
  const [stayed, setStayed] = useState(false);
  const [showFull, setShowFull] = useState(false);
  // Assume a screen reader until the device says otherwise, so nothing moves on too early.
  // The web can't tell (react-native-web always says yes), so there the learner's setting decides.
  const [screenReader, setScreenReader] = useState(Platform.OS !== 'web');
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [relatedAdded, setRelatedAdded] = useState(false);
  const [elapsed, setElapsed] = useState(restored?.activeMs ?? 0);
  // Read the clock once, in state initialisers, so render stays pure.
  const [firstSeenAt] = useState(() => restored?.firstSeenAt ?? Date.now());
  const [openedAt] = useState<number | null>(() => (AppState.currentState === 'background' ? null : Date.now()));
  // Active time: what was banked before, plus the current foreground stretch.
  const banked = useRef(restored?.activeMs ?? 0);
  const since = useRef<number | null>(openedAt);
  const scroll = useRef<ScrollViewInstance>(null);
  const p = item.payload;
  const locked = result !== null;
  const lensOpen = guided || ruleRevealed;
  const showVerdict = feedback === 'immediate';
  const g = game ? GAMES[game] : null;
  const ex = useMemo(() => workedExample(item), [item.id, item.templateVersion]);
  const hintsLeft = hints < item.hints.length;
  const helpLeft = hintsLeft || (!!item.ruleLens && !lensOpen) || (!!ex && !example);

  const activeMs = () => banked.current + (since.current !== null ? Date.now() - since.current : 0);

  const latest = useRef({ draft, hints, ruleRevealed, example, locked, onContinue });
  // Kept current after each render (not during it); the saves below read it.
  useEffect(() => {
    latest.current = { draft, hints, ruleRevealed, example, locked, onContinue };
  });
  const report = () => {
    const l = latest.current;
    if (l.locked || !onProgress) return;
    onProgress({ itemId: item.id, draft: l.draft, hints: l.hints, ruleRevealed: l.ruleRevealed, example: l.example, firstSeenAt: firstSeenAt, activeMs: activeMs() });
  };

  // Save on every change to the work, including the first view (so first-seen time survives).
  useEffect(report, [draft, hints, ruleRevealed, example]);

  // Moving on happens once per puzzle, whether from Next, a related problem or the timer.
  const continued = useRef(false);
  const go = () => {
    if (continued.current) return;
    continued.current = true;
    latest.current.onContinue();
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => live && setScreenReader(on))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (on) => setScreenReader(on));
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  // A tap on the board acknowledges itself at once, the same whatever the answer.
  // Boards report their starting draft once when they mount; that isn't a tap, so it stays silent.
  // So does a draft that hasn't actually changed (a restored puzzle reporting the same work).
  const lastDraft = useRef<string | null>(null);
  useEffect(() => {
    const key = JSON.stringify(draft ?? null);
    const prev = lastDraft.current;
    lastDraft.current = key;
    if (prev === null || prev === 'null' || prev === key) return;
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
      hint: hints > 0 || ruleRevealed || example,
      hintsUsed: hints + (ruleRevealed ? 1 : 0) + (example ? 1 : 0),
      ruleShown: lensOpen,
      support,
      ms,
      firstSeenAt: firstSeenAt,
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
      case 'maze':
        return <MazeBoard payload={p} {...common} />;
      case 'match':
        return <MatchBoard payload={p} {...common} />;
    }
  })();

  // What follows a verdict: the full explanation, or (with the learner's setting) a short
  // card that moves on by itself after `auto` ms unless they stay or open the explanation.
  const quick = showVerdict && !compact && result ? (result.correct ? explain !== 'all' : explain === 'skip') : false;
  const full = !quick || showFull;
  const auto = quick && result ? (result.correct ? RIGHT_MS : WRONG_MS) : null;
  const autoOn = auto !== null && locked && !stayed && !showFull && !screenReader;
  useEffect(() => {
    if (!autoOn || auto === null) return;
    const t = setTimeout(go, auto);
    return () => clearTimeout(t);
  }, [autoOn]);


  // After a wrong answer: the learner's own answer, the rule, a worked explanation of this
  // answer (or the item's verified explanation), another example, and what to do next.
  function coaching() {
    if (!result || !response) return null;
    const c = coach(item, response, result);
    return (
      <View style={{ gap: space.sm }}>
        <Text style={[type.body, { fontFamily: font.bodyBold, fontSize: 16 }]}>{c.submitted}</Text>
        {result.feedback ? <Small style={{ color: color.ink }}>{result.feedback}</Small> : null}
        {!c.specific && p.kind !== 'sort' ? (
          <Label>
            Answer: <Text style={{ fontFamily: font.bodyBold }}>{answerDisplay(item)}</Text>
          </Label>
        ) : null}
        {c.rule && !lensOpen ? <Small style={{ color: color.ink }}>Rule: {c.rule}</Small> : null}
        {c.lines.map((l, i) => (
          <Body key={i} style={{ fontSize: 15, lineHeight: 22 }}>
            {l}
          </Body>
        ))}
        {c.slip ? <Small>{c.slip}</Small> : null}
        {c.example ? (
          <View style={styles.example}>
            <Label>{c.example.title}</Label>
            {c.example.lines.map((l, i) => (
              <Small key={i} style={{ color: color.ink }}>
                {l}
              </Small>
            ))}
          </View>
        ) : null}
        {onRelated && !relatedAdded ? (
          <Button
            title="Try a related problem next"
            kind="secondary"
            onPress={() => {
              if (onRelated()) {
                setRelatedAdded(true);
                go();
              }
            }}
            accessibilityHint="Adds a fresh puzzle of the same kind, with the rule on screen. This answer stays as it is."
          />
        ) : null}
        {topicId ? (
          <Pressable accessibilityRole="link" onPress={() => router.push(`/skill/${topicId}`)} style={styles.inlineLink}>
            <Text style={[type.label, { color: color.action }]}>See the topic</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

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
            </View>
          ) : null}
          <View style={styles.metaRow}>
            {!compact ? (
              <View style={[styles.mode, guided ? styles.modeGuided : styles.modeOwn]}>
                <Text style={[type.micro, { color: guided ? color.actionDeep : color.ink, fontFamily: font.label }]}>
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
            ) : null
          ) : null}

          {item.hints.slice(0, hints).map((h, i) => (
            <View key={i} style={styles.hint}>
              <Text style={[type.small, { color: color.ink }]}>{h}</Text>
            </View>
          ))}

          {example && ex ? <WorkedExample ex={ex} /> : null}

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
            <Rise cue={result.correct ? 'right' : 'wrong'} style={[styles.feedback, result.correct ? styles.feedbackRight : styles.feedbackWrong]}>
              <View accessibilityLiveRegion="polite" style={styles.verdictRow}>
                <View style={[styles.verdictMark, { backgroundColor: result.correct ? color.right : color.wrong }]}>
                  <Feather name={result.correct ? 'check' : 'x'} size={16} color={color.white} />
                </View>
                <Heading style={{ color: result.correct ? color.right : color.wrong, flex: 1 }}>{result.correct ? 'Right.' : 'Not quite.'}</Heading>
              </View>
              {compact ? null : full ? (
                result.correct ? (
                  <Body style={{ fontSize: 16, lineHeight: 24 }}>{item.explanation}</Body>
                ) : (
                  coaching()
                )
              ) : (
                <>
                  {!result.correct ? (
                    <Label>
                      Answer: <Text style={{ fontFamily: font.bodyBold }}>{answerDisplay(item)}</Text>
                    </Label>
                  ) : null}
                  <Pressable accessibilityRole="button" onPress={() => setShowFull(true)} style={styles.inlineLink}>
                    <Text style={[type.label, { color: color.action }]}>Show the explanation</Text>
                  </Pressable>
                  {!result.correct && onRelated && !relatedAdded ? (
                    <Button
                      title="Try a related problem next"
                      kind="secondary"
                      onPress={() => {
                        if (onRelated()) {
                          setRelatedAdded(true);
                          go();
                        }
                      }}
                      accessibilityHint="Adds a fresh puzzle of the same kind, with the rule on screen. This answer stays as it is."
                    />
                  ) : null}
                </>
              )}
              {autoOn && auto !== null ? (
                <View style={styles.autoRow}>
                  <Countdown ms={auto} />
                  <Small>Moving on</Small>
                  <Pressable accessibilityRole="button" onPress={() => setStayed(true)} hitSlop={8} style={styles.stay}>
                    <Text style={[type.label, { color: color.action }]}>Stay on this one</Text>
                  </Pressable>
                </View>
              ) : null}
              {!compact && onReport ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setStayed(true);
                    setReportOpen(true);
                  }}
                  disabled={reported}
                  style={styles.inlineLink}
                >
                  <Text style={[type.small, { color: reported ? color.inkFaint : color.action }]}>
                    {reported ? 'Thanks. This puzzle has been reported.' : 'Report a problem with this puzzle'}
                  </Text>
                </Pressable>
              ) : null}
            </Rise>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footerWrap}>
        <View style={styles.footer}>
          {locked ? (
            <Button title={continueLabel} onPress={go} />
          ) : (
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Button
                title={helpLeft ? 'Help' : 'No more help'}
                kind="secondary"
                onPress={() => setHelpOpen(true)}
                disabled={!helpLeft}
                style={{ flex: 1 }}
                accessibilityHint="A hint, the rule or a worked example. Help makes this answer practice rather than proof."
              />
              <Button title={g?.submitLabel ?? (showVerdict ? 'Check' : 'Save answer')} onPress={submit} disabled={!response} style={{ flex: 1.4 }} />
            </View>
          )}
        </View>
      </View>

      <Modal visible={helpOpen && !locked} transparent animationType="fade" onRequestClose={() => setHelpOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setHelpOpen(false)} accessibilityLabel="Close help">
          <Pressable style={styles.sheet} onPress={() => undefined} accessibilityViewIsModal>
            <Heading>Help with this puzzle</Heading>
            <Small>
              {guided
                ? 'Help is always free.'
                : 'Help is always free. An answer with help counts as practice; answers on your own are what make a skill Secure.'}
            </Small>
            <Gap h={space.xs} />
            <HelpRow
              icon="help-circle"
              title="A hint"
              detail={hintsLeft ? `Hint ${hints + 1} of ${item.hints.length}` : "You've seen every hint"}
              disabled={!hintsLeft}
              onPress={() => {
                setHints((h) => Math.min(item.hints.length, h + 1));
                setHelpOpen(false);
              }}
            />
            {item.ruleLens && !lensOpen ? (
              <HelpRow
                icon="eye"
                title="Show the rule"
                detail="The rule for this kind of puzzle"
                onPress={() => {
                  setRuleRevealed(true);
                  setHelpOpen(false);
                }}
              />
            ) : null}
            {ex && !example ? (
              <HelpRow
                icon="book-open"
                title="A worked example"
                detail="A solved puzzle of the same kind, with different numbers"
                onPress={() => {
                  setExample(true);
                  setHelpOpen(false);
                }}
              />
            ) : null}
            <Button title="Back to the puzzle" kind="quiet" onPress={() => setHelpOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>

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

function HelpRow({ icon, title, detail, onPress, disabled }: { icon: React.ComponentProps<typeof Feather>['name']; title: string; detail: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.helpRow, disabled && { opacity: 0.45 }, pressed && { backgroundColor: color.paperDeep }]}
    >
      <View style={styles.helpIcon}>
        <Feather name={icon} size={18} color={color.action} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.label}>{title}</Text>
        <Text style={type.small}>{detail}</Text>
      </View>
    </Pressable>
  );
}

/** A solved puzzle of the same kind: its prompt, its answer (from the checker) and its audited explanation. */
function WorkedExample({ ex }: { ex: Item }) {
  const p = ex.payload;
  const route = p.kind === 'maze' ? mazePathBrute(p) : null;
  return (
    <View style={styles.exampleBox} accessibilityLabel="Worked example">
      <Label style={{ color: color.actionDeep }}>Worked example</Label>
      <Text style={[type.small, { color: color.ink, fontFamily: font.bodyBold }]}>{ex.prompt}</Text>
      {p.kind === 'refute' ? <Small style={{ color: color.ink }}>Claim: {p.claimText}</Small> : null}
      {p.kind === 'maze' && route ? <MazePreview payload={p} path={route} /> : null}
      {p.kind !== 'sort' && p.kind !== 'maze' ? <Small style={{ color: color.ink }}>Answer: {answerDisplay(ex)}</Small> : null}
      <Small>{ex.explanation}</Small>
    </View>
  );
}

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
    case 'maze':
      return p.kind === 'maze' ? r.path.map((c) => (p.cells[c] !== undefined ? fmt(p.cells[c]) : '?')).join(' → ') : '';
    case 'match':
      return p.kind === 'match' ? r.pairs.map((j, i) => `${p.left[i]?.label} → ${p.right[j]?.label ?? '?'}`).join(', ') : '';
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
  modeOwn: { backgroundColor: color.paperDeep },
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
  feedback: { marginTop: space.lg, borderRadius: radius.lg, borderWidth: 1, borderLeftWidth: 5, padding: space.lg, gap: space.sm, backgroundColor: color.surface },
  feedbackRight: { borderColor: color.rule, borderLeftColor: color.right },
  feedbackWrong: { borderColor: color.rule, borderLeftColor: color.wrong },
  example: { borderLeftWidth: 3, borderLeftColor: color.ruleStrong, paddingLeft: space.md, gap: 4, marginTop: space.xs },
  feedbackNeutral: { backgroundColor: color.surface, borderColor: color.rule },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  verdictMark: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 40 },
  stay: { minHeight: 40, justifyContent: 'center' },
  helpRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingVertical: space.sm, paddingHorizontal: space.xs, borderRadius: radius.md },
  helpIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.actionWash, alignItems: 'center', justifyContent: 'center' },
  exampleBox: {
    backgroundColor: color.actionWash,
    borderRadius: radius.sm,
    borderLeftWidth: 4,
    borderLeftColor: color.action,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    gap: 6,
  },
  gameHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  gameTitle: { fontFamily: font.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, color: color.ink },
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
    backgroundColor: color.actionWash,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 3,
  },
  moldTagText: { fontFamily: font.label, fontSize: 13, color: color.actionDeep },
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

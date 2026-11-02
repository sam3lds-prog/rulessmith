import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkItem, correctAnswerText } from '../content/check';
import { fmt } from '../content/format';
import type { CheckResult, Item, Response } from '../content/types';
import { LENS_OPEN_MAX_LEVEL } from '../content/numbers';
import { Body, Button, Gap, Heading, Label, Small } from '../ui/kit';
import { color, font, MAX_WIDTH, radius, space, type } from '../ui/theme';
import { ChoiceBoard, ConstructBoard, NumericBoard, RefuteBoard, SortBoard } from './boards';

export interface AnswerInfo {
  correct: boolean;
  /** A hint or the rule lens was opened before answering. */
  hint: boolean;
  hintsUsed: number;
  ms: number;
  response: Response;
  result: CheckResult;
}

const REPORT_REASONS = ['The answer is wrong', 'The question is unclear', 'Something looks broken', 'Something else'];

/**
 * One puzzle, start to finish. Key it by item.id so its state resets per item.
 */
export function ItemScreen({
  item,
  header,
  onAnswered,
  onContinue,
  continueLabel = 'Next',
  compact = false,
  onReport,
  timed = false,
}: {
  item: Item;
  header?: ReactNode;
  onAnswered: (a: AnswerInfo) => void;
  onContinue: () => void;
  continueLabel?: string;
  /** Placement mode: verdict only, no explanation, to keep the check short. */
  compact?: boolean;
  onReport?: (reason: string) => void;
  timed?: boolean;
}) {
  const [draft, setDraft] = useState<Response | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [hints, setHints] = useState(0);
  const [lensOpen, setLensOpen] = useState(item.level <= LENS_OPEN_MAX_LEVEL);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(Date.now());
  const scroll = useRef<ScrollViewInstance>(null);
  const lensCountsAsHint = item.level > LENS_OPEN_MAX_LEVEL;
  const [lensUsed, setLensUsed] = useState(false);
  const locked = result !== null;

  useEffect(() => {
    if (!timed || locked) return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 1000);
    return () => clearInterval(t);
  }, [timed, locked]);

  const submit = () => {
    if (!draft) return;
    const r = checkItem(item, draft);
    setResult(r);
    const ms = Date.now() - startedAt.current;
    onAnswered({ correct: r.correct, hint: hints > 0 || lensUsed, hintsUsed: hints + (lensUsed ? 1 : 0), ms, response: draft, result: r });
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
  };

  const p = item.payload;
  const board = (() => {
    const common = { locked, result: result ?? undefined, onChange: setDraft };
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
          {timed ? <Small style={{ alignSelf: 'flex-end' }}>{Math.floor(elapsed / 1000)}s</Small> : null}
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
                accessibilityHint={lensCountsAsHint ? 'Counts as a hint for this puzzle' : undefined}
                onPress={() => {
                  setLensOpen(true);
                  if (lensCountsAsHint) setLensUsed(true);
                }}
                style={styles.inlineLink}
              >
                <Text style={[type.label, { color: color.cobalt }]}>Show the rule</Text>
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
              <Button title="Check" onPress={submit} disabled={!draft} style={{ flex: 1.4 }} />
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

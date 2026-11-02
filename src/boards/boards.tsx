/**
 * The five puzzle boards. Every interaction is a tap; nothing requires dragging.
 * Each board reports a complete Response (or null while the learner is still
 * building one) and shows marks once locked. It also reports its work in
 * progress as a BoardDraft, and can start from a saved one, so a half-built
 * answer survives a refresh or force-close.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  BoardDraft,
  CheckResult,
  ChoicePayload,
  ConstructPayload,
  NumericPayload,
  RefutePayload,
  Response,
  SortPayload,
} from '../content/types';
import { optionIsCorrect } from '../content/check';
import { fmt } from '../content/format';
import { Small } from '../ui/kit';
import { color, font, radius, space, type } from '../ui/theme';
import { Keypad } from './Keypad';
import { Tile } from './Tile';

interface BoardProps<P> {
  payload: P;
  locked: boolean;
  result?: CheckResult;
  onChange: (r: Response | null) => void;
  /** Saved work to start from. Ignored if it does not fit this board. */
  initialDraft?: BoardDraft | null;
  onDraft?: (d: BoardDraft) => void;
}

// ================================================================ sort

export function SortBoard({ payload, locked, result, onChange, initialDraft, onDraft }: BoardProps<SortPayload>) {
  const n = payload.numbers.length;
  // One state object, updated functionally, so fast taps never act on a stale "current" tile.
  const [board, setBoard] = useState<{ bins: (null | 'yes' | 'no')[]; current: number | null }>(() => {
    const saved = initialDraft?.kind === 'sort' && initialDraft.bins.length === n ? initialDraft.bins : null;
    const bins = saved ?? Array(n).fill(null);
    const first = bins.findIndex((b) => b === null);
    return { bins, current: first >= 0 ? first : null };
  });
  const { bins, current } = board;

  useEffect(() => {
    onDraft?.({ kind: 'sort', bins });
    if (bins.every((b) => b !== null)) onChange({ kind: 'sort', yes: bins.map((b, i) => (b === 'yes' ? i : -1)).filter((i) => i >= 0) });
    else onChange(null);
  }, [bins]);

  const place = (bin: 'yes' | 'no') => {
    if (locked) return;
    setBoard((prev) => {
      if (prev.current === null) return prev;
      const next = [...prev.bins];
      next[prev.current] = bin;
      const after = next.findIndex((b, i) => b === null && i > (prev.current as number));
      const any = next.findIndex((b) => b === null);
      return { bins: next, current: after >= 0 ? after : any >= 0 ? any : null };
    });
  };

  const pickUp = (i: number) => {
    if (locked) return;
    setBoard((prev) => ({ ...prev, current: i }));
  };

  const tileState = (i: number) => {
    if (locked && result?.marks) return result.marks[i] ? 'right' : 'wrong';
    return i === current ? 'selected' : 'placed';
  };

  const remaining = bins.filter((b) => b === null).length;
  const renderBin = (which: 'yes' | 'no', label: string) => {
    const members = bins.map((b, i) => (b === which ? i : -1)).filter((i) => i >= 0);
    const ready = !locked && current !== null;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} bin${current !== null ? `. Place ${fmt(payload.numbers[current])} here` : ''}`}
        key={which}
        onPress={() => place(which)}
        disabled={!ready}
        style={({ pressed }) => [styles.bin, ready && styles.binReady, pressed && ready && styles.binPressed]}
      >
        <Text style={[type.label, { color: ready ? color.cobaltDeep : color.ink }]}>{label}</Text>
        <View style={styles.binTiles}>
          {members.map((i) => (
            <Tile key={i} label={fmt(payload.numbers[i])} size="sm" state={tileState(i)} onPress={locked ? undefined : () => pickUp(i)} />
          ))}
          {members.length === 0 ? <Small style={{ color: color.inkFaint }}>{ready ? 'Tap to place here' : 'Empty'}</Small> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ gap: space.md }}>
      {!locked ? (
        <View style={styles.anvil}>
          {current !== null ? (
            <>
              <Tile label={fmt(payload.numbers[current])} size="lg" state="selected" />
              <Small>{remaining > 0 ? `Where does it go? ${remaining} left to sort.` : 'Moving this one. Pick its bin.'}</Small>
            </>
          ) : (
            <Small>All sorted. Check your answer, or tap a number to move it.</Small>
          )}
        </View>
      ) : null}
      <View style={styles.bins}>
        {renderBin('yes', payload.yesLabel)}
        {renderBin('no', payload.noLabel)}
      </View>
    </View>
  );
}

// ================================================================ construct

export function ConstructBoard({ payload, locked, result, onChange, initialDraft, onDraft }: BoardProps<ConstructPayload>) {
  const blanks = useMemo(() => payload.fixed.map((d, i) => (d === null ? i : -1)).filter((i) => i >= 0), [payload]);
  const [entry, setEntry] = useState<{ fill: (number | null)[]; sel: number }>(() => {
    const saved = initialDraft?.kind === 'construct' && initialDraft.fill.length === blanks.length ? initialDraft.fill : null;
    const fill = saved ?? blanks.map(() => null);
    const first = fill.findIndex((d) => d === null);
    return { fill, sel: first >= 0 ? first : 0 };
  });
  const { fill, sel } = entry;
  const setSel = (j: number) => setEntry((prev) => ({ ...prev, sel: j }));
  const [picked, setPicked] = useState<Set<number>>(() => new Set(initialDraft?.kind === 'constructAll' ? initialDraft.picked : []));

  useEffect(() => {
    if (payload.mode === 'all') {
      onDraft?.({ kind: 'constructAll', picked: [...picked].sort() });
      onChange(picked.size ? { kind: 'constructAll', digits: [...picked].sort() } : null);
    } else {
      onDraft?.({ kind: 'construct', fill });
      onChange(fill.every((d) => d !== null) ? { kind: 'construct', digits: fill as number[] } : null);
    }
  }, [fill, picked]);

  const typeDigit = (d: number) => {
    if (locked) return;
    setEntry((prev) => {
      const next = [...prev.fill];
      next[prev.sel] = d;
      const nextEmpty = next.findIndex((x, j) => x === null && j > prev.sel);
      return { fill: next, sel: nextEmpty >= 0 ? nextEmpty : prev.sel };
    });
  };
  const back = () => {
    if (locked) return;
    setEntry((prev) => {
      const next = [...prev.fill];
      if (next[prev.sel] === null && prev.sel > 0) {
        next[prev.sel - 1] = null;
        return { fill: next, sel: prev.sel - 1 };
      }
      next[prev.sel] = null;
      return { fill: next, sel: prev.sel };
    });
  };

  const verdict = locked ? (result?.correct ? 'right' : 'wrong') : null;

  return (
    <View style={{ gap: space.lg }}>
      <View style={styles.numberRow} accessibilityLabel="Number being built">
        {payload.fixed.map((d, i) => {
          if (d !== null) return <Tile key={i} label={String(d)} size="md" state="fixed" minWidth={38} style={styles.digit} />;
          const j = blanks.indexOf(i);
          if (payload.mode === 'all') return <Tile key={i} label="?" size="md" state={verdict ?? 'selected'} minWidth={38} style={styles.digit} />;
          const v = fill[j];
          return (
            <Tile
              key={i}
              label={v === null ? ' ' : String(v)}
              size="md"
              minWidth={38}
              style={styles.digit}
              state={verdict ?? (j === sel ? 'selected' : v === null ? 'empty' : 'idle')}
              onPress={locked ? undefined : () => setSel(j)}
              accessibilityLabel={`Blank ${j + 1}${v === null ? ', empty' : `, ${v}`}`}
            />
          );
        })}
      </View>
      {payload.mode === 'all' ? (
        <View style={{ gap: space.sm }}>
          <Small>Tap every digit that works. Tap again to remove it.</Small>
          <View style={styles.digitGrid}>
            {Array.from({ length: 10 }, (_, d) => (
              <Tile
                key={d}
                label={String(d)}
                size="md"
                style={styles.gridKey}
                state={picked.has(d) ? 'selected' : 'idle'}
                onPress={
                  locked
                    ? undefined
                    : () => {
                        const next = new Set(picked);
                        if (next.has(d)) next.delete(d);
                        else next.add(d);
                        setPicked(next);
                      }
                }
              />
            ))}
          </View>
        </View>
      ) : (
        <Keypad onDigit={typeDigit} onBack={back} disabled={locked} />
      )}
    </View>
  );
}

// ================================================================ refute

const tupleLabel = (t: number[], names: string[]) =>
  t.length === 1 ? `${names[0]} = ${fmt(t[0])}` : t.map((v, i) => `${names[i]} = ${fmt(v)}`).join(', ');

export function RefuteBoard({ payload, locked, result, onChange, initialDraft, onDraft }: BoardProps<RefutePayload>) {
  const [choice, setChoice] = useState<'true' | number | null>(() => {
    if (initialDraft?.kind !== 'refute') return null;
    const c = initialDraft.choice;
    return c === 'true' || (typeof c === 'number' && c >= 0 && c < payload.candidates.length) ? c : null;
  });
  useEffect(() => {
    onDraft?.({ kind: 'refute', choice });
    if (choice === null) onChange(null);
    else if (choice === 'true') onChange({ kind: 'refute', verdict: 'true' });
    else onChange({ kind: 'refute', verdict: 'false', counterexample: payload.candidates[choice] });
  }, [choice]);

  const mark = (on: boolean) => (locked && on ? (result?.correct ? 'right' : 'wrong') : on ? 'selected' : 'idle');

  return (
    <View style={{ gap: space.lg }}>
      <View style={styles.claim}>
        <Text style={[type.micro, { color: color.brass, fontFamily: font.label }]}>Claim</Text>
        <Text style={[type.body, { fontFamily: font.bodyBold }]}>{payload.claimText}</Text>
      </View>
      <View style={{ gap: space.sm }}>
        <Small>Break it with a counterexample:</Small>
        <View style={styles.wrap}>
          {payload.candidates.map((t, i) => (
            <Tile
              key={i}
              label={tupleLabel(t, payload.varNames)}
              size="sm"
              state={mark(choice === i)}
              onPress={locked ? undefined : () => setChoice(choice === i ? null : i)}
            />
          ))}
        </View>
      </View>
      <View style={{ gap: space.sm }}>
        <Small>Or, if no number can break it:</Small>
        <Tile label="It's always true" size="sm" state={mark(choice === 'true')} onPress={locked ? undefined : () => setChoice(choice === 'true' ? null : 'true')} />
      </View>
    </View>
  );
}

// ================================================================ choice

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export function ChoiceBoard({ payload, locked, onChange, initialDraft, onDraft }: BoardProps<ChoicePayload>) {
  const [sel, setSel] = useState<string | null>(() =>
    initialDraft?.kind === 'choice' && payload.options.some((o) => o.id === initialDraft.sel) ? initialDraft.sel : null,
  );
  useEffect(() => {
    onDraft?.({ kind: 'choice', sel });
    onChange(sel ? { kind: 'choice', optionId: sel } : null);
  }, [sel]);
  return (
    <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
      {payload.options.map((o, i) => {
        const chosen = sel === o.id;
        const right = locked && optionIsCorrect(payload, o);
        const wrong = locked && chosen && !right;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen }}
            onPress={locked ? undefined : () => setSel(o.id)}
            style={({ pressed }) => [
              styles.option,
              chosen && !locked && styles.optionOn,
              right && styles.optionRight,
              wrong && styles.optionWrong,
              pressed && !locked && { opacity: 0.85 },
            ]}
          >
            <View style={[styles.letter, chosen && !locked && { backgroundColor: color.cobalt, borderColor: color.cobalt }]}>
              <Text style={[type.label, { color: chosen && !locked ? color.white : color.inkSoft }]}>{LETTERS[i]}</Text>
            </View>
            <Text style={[type.body, { flex: 1, fontFamily: font.bodyBold, fontVariant: ['tabular-nums'] }]}>{o.label}</Text>
            {right ? <Text style={[type.heading, { color: color.verdigris }]}>✓</Text> : null}
            {wrong ? <Text style={[type.heading, { color: color.brick }]}>✗</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ================================================================ numeric

export function NumericBoard({ payload, locked, result, onChange, initialDraft, onDraft }: BoardProps<NumericPayload>) {
  const [text, setText] = useState(() => (initialDraft?.kind === 'numeric' && /^\d{0,9}$/.test(initialDraft.text) ? initialDraft.text : ''));
  useEffect(() => {
    onDraft?.({ kind: 'numeric', text });
    onChange(text ? { kind: 'numeric', value: text } : null);
  }, [text]);
  const tone = locked ? (result?.correct ? styles.answerRight : styles.answerWrong) : null;
  return (
    <View style={{ gap: space.lg }}>
      <View style={[styles.answer, tone]} accessibilityLabel={`Your answer: ${text || 'empty'}`}>
        <Text style={[styles.answerText, !text && { color: color.inkFaint }]}>{text ? fmt(text) : '—'}</Text>
        {payload.unit ? <Text style={[type.small]}>{payload.unit}</Text> : null}
      </View>
      <Keypad
        disabled={locked}
        onDigit={(d) => setText((t) => (t.length >= 9 ? t : t === '0' ? String(d) : t + String(d)))}
        onBack={() => setText((t) => t.slice(0, -1))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  anvil: { alignItems: 'center', gap: space.sm, paddingVertical: space.md, minHeight: 120, justifyContent: 'center' },
  bins: { flexDirection: 'row', gap: space.md },
  bin: {
    flex: 1,
    minHeight: 150,
    borderWidth: 1.5,
    borderColor: color.rule,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
    backgroundColor: color.surface,
  },
  binReady: { borderColor: color.cobalt, borderStyle: 'dashed', backgroundColor: color.cobaltWash },
  binPressed: { backgroundColor: '#C9D4F4' },
  binTiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  numberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  digit: { paddingHorizontal: 6 },
  digitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  gridKey: { width: 58 },
  claim: {
    borderLeftWidth: 4,
    borderLeftColor: color.brassBright,
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: 4,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 58,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.rule,
    borderBottomWidth: 4,
    borderBottomColor: color.ruleStrong,
    backgroundColor: color.surface,
  },
  optionOn: { borderColor: color.cobalt, borderBottomColor: color.cobaltDeep, backgroundColor: color.cobaltWash },
  optionRight: { borderColor: color.verdigris, borderBottomColor: color.verdigris, backgroundColor: color.verdigrisWash },
  optionWrong: { borderColor: color.brick, borderBottomColor: color.brick, backgroundColor: color.brickWash },
  letter: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: color.ruleStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 76,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.ruleStrong,
    backgroundColor: color.surface,
    paddingVertical: space.md,
  },
  answerRight: { borderColor: color.verdigris, backgroundColor: color.verdigrisWash },
  answerWrong: { borderColor: color.brick, backgroundColor: color.brickWash },
  answerText: { fontFamily: font.bodyBold, fontSize: 38, color: color.ink, fontVariant: ['tabular-nums'] },
});

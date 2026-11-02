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
        <Text style={[type.label, { color: ready ? color.actionDeep : color.ink }]}>{label}</Text>
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

  // No result means the verdict is held back (a check): show the answer as placed, not as right or wrong.
  const verdict = locked && result ? (result.correct ? 'right' : 'wrong') : null;

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
        <Keypad layout="digits" onDigit={typeDigit} onBack={back} disabled={locked} />
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

  const mark = (on: boolean) => (locked && on && result ? (result.correct ? 'right' : 'wrong') : on ? 'selected' : 'idle');

  return (
    <View style={{ gap: space.lg }}>
      <View style={styles.claim}>
        <Text style={[type.micro, { color: color.gold, fontFamily: font.label }]}>Claim</Text>
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

export function ChoiceBoard({ payload, locked, result, onChange, initialDraft, onDraft }: BoardProps<ChoicePayload>) {
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
        // Judged only when a result is shown; in a check the choice stays plainly selected until the end.
        const judged = locked && !!result;
        const right = judged && optionIsCorrect(payload, o);
        const wrong = judged && chosen && !right;
        const plainSelected = chosen && !judged;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen }}
            onPress={locked ? undefined : () => setSel(o.id)}
            style={({ pressed }) => [
              styles.option,
              plainSelected && styles.optionOn,
              right && styles.optionRight,
              wrong && styles.optionWrong,
              pressed && !locked && { opacity: 0.85 },
            ]}
          >
            <View style={[styles.letter, plainSelected && { backgroundColor: color.action, borderColor: color.action }]}>
              <Text style={[type.label, { color: plainSelected ? color.white : color.inkSoft }]}>{LETTERS[i]}</Text>
            </View>
            <Text style={[type.body, { flex: 1, fontFamily: font.bodyBold, fontVariant: ['tabular-nums'] }]}>{o.label}</Text>
            {right ? <Text style={[type.heading, { color: color.right }]}>✓</Text> : null}
            {wrong ? <Text style={[type.heading, { color: color.wrong }]}>✗</Text> : null}
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
  const tone = locked && result ? (result.correct ? styles.answerRight : styles.answerWrong) : null;
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
  binReady: { borderColor: color.action, borderStyle: 'dashed', backgroundColor: color.actionWash },
  binPressed: { backgroundColor: '#C9D4F4' },
  binTiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  numberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  digit: { paddingHorizontal: 6 },
  digitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  gridKey: { width: 58 },
  claim: {
    borderLeftWidth: 4,
    borderLeftColor: color.goldBright,
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
  optionOn: { borderColor: color.action, borderBottomColor: color.actionDeep, backgroundColor: color.actionWash },
  optionRight: { borderColor: color.right, borderBottomColor: color.right, backgroundColor: color.rightWash },
  optionWrong: { borderColor: color.wrong, borderBottomColor: color.wrong, backgroundColor: color.wrongWash },
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
  answerRight: { borderColor: color.right, backgroundColor: color.rightWash },
  answerWrong: { borderColor: color.wrong, backgroundColor: color.wrongWash },
  answerText: { fontFamily: font.num, fontSize: 38, color: color.ink, fontVariant: ['tabular-nums'] },
  machine: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderBottomWidth: 4,
    borderBottomColor: '#E9E1CF',
    alignItems: 'center',
  },
  splitRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  ring: { borderWidth: 6, borderColor: color.paperDeep, backgroundColor: color.surface, position: 'relative' },
  ringCenter: { position: 'absolute', left: 60, right: 60, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  stop: { position: 'absolute', alignItems: 'center' },
});

// ================================================================ factor (Factor Factory)

interface FactorNode {
  path: string;
  value: number;
  children?: [FactorNode, FactorNode];
}

function buildTree(n: number, splits: { path: string; d: number }[]): FactorNode {
  const byPath = new Map(splits.map((s) => [s.path, s.d]));
  const grow = (value: number, path: string): FactorNode => {
    const d = byPath.get(path);
    if (!d || value % d !== 0 || d <= 1 || d >= value) return { path, value };
    return { path, value, children: [grow(d, `${path}a`), grow(value / d, `${path}b`)] };
  };
  return grow(n, '');
}

const leavesOf = (node: FactorNode): FactorNode[] => (node.children ? [...leavesOf(node.children[0]), ...leavesOf(node.children[1])] : [node]);
const isPrimeSmallInt = (v: number) => {
  if (v < 2) return false;
  for (let q = 2; q * q <= v; q++) if (v % q === 0) return false;
  return true;
};
const factorPairs = (v: number) => {
  const out: [number, number][] = [];
  for (let q = 2; q * q <= v; q++) if (v % q === 0) out.push([q, v / q]);
  return out;
};

/**
 * Factor Factory: tap a piece, then split it by a divisor you choose. In guided
 * play the factor pairs are offered and prime pieces are marked; in an
 * independent check you type the divisor and nothing marks a piece as prime
 * before you submit. A divisor that doesn't divide the piece is refused with
 * the arithmetic reason, never with a hint about the answer.
 */
export function FactorBoard({
  payload,
  locked,
  result,
  onChange,
  initialDraft,
  onDraft,
  guided,
}: BoardProps<import('../content/types').FactorPayload> & { guided?: boolean }) {
  const [splits, setSplits] = useState<{ path: string; d: number }[]>(() => (initialDraft?.kind === 'factor' ? initialDraft.splits : []));
  const tree = useMemo(() => buildTree(payload.n, splits), [payload.n, splits]);
  const leaves = leavesOf(tree);
  // Guided play moves the selection to the next piece that can split. In a check nothing may say
  // which pieces are prime, so the selection never depends on primality there.
  const [sel, setSel] = useState<string>(() => (guided ? (leaves.find((l) => !isPrimeSmallInt(l.value))?.path ?? '') : (leaves[leaves.length - 1]?.path ?? '')));
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const selected = leaves.find((l) => l.path === sel) ?? leaves[0];

  useEffect(() => {
    onDraft?.({ kind: 'factor', splits });
    onChange(splits.length ? { kind: 'factor', primes: leavesOf(buildTree(payload.n, splits)).map((l) => l.value) } : null);
  }, [splits]);

  const split = (d: number) => {
    if (locked || !selected) return;
    if (!(d > 1 && d < selected.value && selected.value % d === 0)) {
      setNote(d <= 1 || d >= selected.value ? `Pick a divisor between 1 and ${fmt(selected.value)}.` : `${d} doesn't divide ${fmt(selected.value)} evenly.`);
      return;
    }
    setNote(null);
    setTyped('');
    const next = [...splits, { path: selected.path, d }];
    setSplits(next);
    if (guided) {
      const nextLeaves = leavesOf(buildTree(payload.n, next));
      setSel(nextLeaves.find((l) => !isPrimeSmallInt(l.value))?.path ?? nextLeaves[0].path);
    } else setSel(`${selected.path}b`); // the co-factor just made, whatever it is
  };
  const undo = () => {
    if (locked || !splits.length) return;
    setSplits(splits.slice(0, -1));
    setNote(null);
  };

  const marks = locked && result ? (result.correct ? 'right' : 'wrong') : null;
  const history = (() => {
    const rows: string[] = [fmt(payload.n)];
    let frontier: FactorNode[] = [tree];
    while (frontier.some((x) => x.children)) {
      frontier = frontier.flatMap((x) => (x.children ? x.children : [x]));
      rows.push(frontier.map((x) => fmt(x.value)).join(' × '));
    }
    return rows.join('  →  ');
  })();

  return (
    <View style={{ gap: space.lg }}>
      <View style={styles.machine}>
        <Small style={{ textAlign: 'center' }}>{history}</Small>
        <View style={styles.wrap}>
          {leaves.map((l) => {
            const prime = guided && isPrimeSmallInt(l.value);
            return (
              <View key={l.path} style={{ alignItems: 'center', gap: 2 }}>
                <Tile
                  label={fmt(l.value)}
                  size="md"
                  state={marks ?? (l.path === selected?.path ? 'selected' : prime ? 'fixed' : 'idle')}
                  onPress={locked ? undefined : () => setSel(l.path)}
                  accessibilityLabel={`Piece ${fmt(l.value)}${prime ? ', prime' : ''}`}
                />
                {prime && !locked ? <Text style={[type.micro, { color: color.right }]}>prime</Text> : null}
              </View>
            );
          })}
        </View>
      </View>
      {!locked && selected ? (
        <View style={{ gap: space.sm }}>
          <Small>
            Split <Text style={{ fontFamily: font.num, color: color.ink }}>{fmt(selected.value)}</Text> by:
          </Small>
          {guided ? (
            <View style={styles.wrap}>
              {factorPairs(selected.value).map(([a, b]) => (
                <Tile key={a} label={`${a} × ${b}`} size="sm" onPress={() => split(a)} />
              ))}
              {factorPairs(selected.value).length === 0 ? <Small>{fmt(selected.value)} has no factor pairs: it's prime.</Small> : null}
            </View>
          ) : null}
          <View style={styles.splitRow}>
            <View style={[styles.answer, { minHeight: 52, flex: 1 }]}>
              <Text style={[styles.answerText, { fontSize: 26 }, !typed && { color: color.inkFaint }]}>{typed || '—'}</Text>
            </View>
            <Tile label="Split" size="md" onPress={typed ? () => split(Number(typed)) : undefined} accessibilityLabel={`Split ${fmt(selected.value)} by ${typed || 'the number you type'}`} />
            <Tile label="Undo" size="md" onPress={splits.length ? undo : undefined} />
          </View>
          {note ? <Small style={{ color: color.wrong }}>{note}</Small> : null}
          <Keypad layout="digits" onDigit={(d) => setTyped((t) => (t.length >= 5 ? t : t === '0' ? String(d) : t + String(d)))} onBack={() => setTyped((t) => t.slice(0, -1))} />
        </View>
      ) : null}
    </View>
  );
}

// ================================================================ rail (Remainder Rails)

/**
 * Remainder Rails: the stops of a loop sit on a ring; tap the stop where the
 * token lands. In guided play, "Group the loops" shows how many complete loops
 * fit and how many steps are left over.
 */
export function RailBoard({
  payload,
  locked,
  result,
  onChange,
  initialDraft,
  onDraft,
  guided,
}: BoardProps<import('../content/types').RailPayload> & { guided?: boolean }) {
  const [stop, setStop] = useState<number | null>(() =>
    initialDraft?.kind === 'rail' && initialDraft.stop !== null && initialDraft.stop < payload.stops.length ? initialDraft.stop : null,
  );
  const [grouped, setGrouped] = useState(false);
  useEffect(() => {
    onDraft?.({ kind: 'rail', stop });
    onChange(stop === null ? null : { kind: 'rail', stop });
  }, [stop]);

  const n = payload.stops.length;
  // Long loops get narrower stops and a ring wide enough that neighbours never overlap.
  const tileW = n > 8 ? 48 : 60;
  const radius = Math.max(106, (tileW + 8) / (2 * Math.sin(Math.PI / n)));
  const size = Math.round(2 * (radius + tileW / 2 + 4));
  const grouping = (() => {
    const spec = payload.spec;
    if (spec.op === 'remainder') {
      const steps = BigInt(spec.n);
      const loops = steps / BigInt(spec.d);
      return `${fmt(spec.n)} = ${fmt(loops.toString())} complete loop${loops === 1n ? '' : 's'} of ${spec.d} + ${(steps % BigInt(spec.d)).toString()} steps left over`;
    }
    if (spec.op === 'powMod') {
      const loops = Math.floor(spec.exp / n);
      const left = spec.exp % n;
      return `${spec.exp} = ${loops} complete loop${loops === 1 ? '' : 's'} of ${n} + ${left} ${left === 0 ? '(a whole number of loops: the last stop)' : 'more'}`;
    }
    return '';
  })();

  return (
    <View style={{ gap: space.md, alignItems: 'center' }}>
      <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]} accessibilityLabel={`A loop of ${n} stops. Walk: ${payload.walk}.`}>
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={[type.micro, { textAlign: 'center' }]}>Walk</Text>
          <Text style={[styles.answerText, { fontSize: 22, textAlign: 'center' }]}>{payload.walk}</Text>
        </View>
        {payload.stops.map((st, i) => {
          const angle = (2 * Math.PI * i) / n - Math.PI / 2;
          const x = size / 2 + radius * Math.cos(angle);
          const y = size / 2 + radius * Math.sin(angle);
          const on = stop === i;
          const state = locked && on ? (result?.correct ? 'right' : result ? 'wrong' : 'selected') : on ? 'selected' : 'idle';
          return (
            <View key={i} style={[styles.stop, { left: x - tileW / 2, top: y - 24, width: tileW }]}>
              <Tile label={st.label} size="sm" minWidth={tileW} state={state} onPress={locked ? undefined : () => setStop(on ? null : i)} accessibilityLabel={`Stop ${st.label}`} />
            </View>
          );
        })}
      </View>
      {guided && !locked ? (
        grouped ? (
          <Small style={{ textAlign: 'center', color: color.ink }}>{grouping}</Small>
        ) : (
          <Tile label="Group the loops" size="sm" onPress={() => setGrouped(true)} />
        )
      ) : null}
    </View>
  );
}

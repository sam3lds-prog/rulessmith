/**
 * Shared builders for the common board shapes. Template files describe the
 * mathematics (which predicate, which near-misses, how to explain); these turn
 * that into a complete ItemDraft.
 */
import { evalExpr } from './evaluate';
import { fmt, formatTuple } from './format';
import { digitsFor, distinct, ruleEval, sampleWhere } from './numbers';
import type { Rng } from './rng';
import type { ChoiceOption, Claim, ItemDraft, NumPredicate, Response, ValueSpec } from './types';

const OPTION_IDS = ['a', 'b', 'c', 'd', 'e'];

// ---------------------------------------------------------------- sort

export interface SortSpec {
  rng: Rng;
  level: number;
  p: NumPredicate;
  prompt: string;
  yesLabel: string;
  noLabel: string;
  lens: string;
  hints: string[];
  /** Short reason for one number, e.g. "digits add to 18". */
  why: (s: string) => string;
  /** Optional near-miss test: numbers that look right but fail. Used from level 4 up. */
  nearMiss?: (s: string) => boolean;
  /** Override number length per level. */
  len?: (rng: Rng) => number;
  /** Override number source (e.g. a range rather than a digit length). */
  sample?: (rng: Rng, test: (s: string) => boolean) => string;
}

export function makeSort(spec: SortSpec): ItemDraft {
  const { rng, level, p } = spec;
  const count = level <= 3 ? 6 : 8;
  const yesCount = rng.int(Math.floor(count / 2) - 1, Math.ceil(count / 2) + 1);
  const [lo, hi] = digitsFor(level);
  const len = spec.len ?? ((r: Rng) => r.int(lo, hi));
  const draw = (test: (s: string) => boolean) =>
    spec.sample ? spec.sample(rng, test) : sampleWhere(rng, len(rng), test);

  const yes = distinct(rng, yesCount, () => draw((s) => ruleEval(s, p)));
  const nearCount = level >= 4 && spec.nearMiss ? Math.ceil((count - yesCount) / 2) : 0;
  const near = nearCount
    ? distinct(rng, nearCount, () => draw((s) => spec.nearMiss!(s) && !ruleEval(s, p) && !yes.includes(s)))
    : [];
  const rest = distinct(rng, count - yesCount - nearCount, () =>
    draw((s) => !ruleEval(s, p) && !yes.includes(s) && !near.includes(s)),
  );
  const numbers = rng.shuffle([...yes, ...near, ...rest]);
  const key: Response = { kind: 'sort', yes: numbers.map((n, i) => (yes.includes(n) ? i : -1)).filter((i) => i >= 0) };

  const list = (xs: string[]) => xs.map((s) => `${fmt(s)} (${spec.why(s)})`).join(', ');
  const no = numbers.filter((n) => !yes.includes(n));
  return {
    prompt: spec.prompt,
    ruleLens: spec.lens,
    hints: spec.hints,
    explanation: `${spec.yesLabel}: ${list(numbers.filter((n) => yes.includes(n)))}.\n${spec.noLabel}: ${list(no)}.`,
    payload: { kind: 'sort', numbers, p, yesLabel: spec.yesLabel, noLabel: spec.noLabel },
    key,
  };
}

// ---------------------------------------------------------------- construct

export interface ConstructSpec {
  fixed: (number | null)[];
  p: NumPredicate;
  mode: 'one' | 'all';
  prompt: string;
  lens: string;
  hints: string[];
  explain: (solutions: string[]) => string;
}

/** Enumerate fills with the rule-based evaluator (the checker uses its own brute force). */
export function ruleFills(fixed: (number | null)[], p: NumPredicate): string[] {
  const blanks = fixed.map((d, i) => (d === null ? i : -1)).filter((i) => i >= 0);
  const out: string[] = [];
  for (let k = 0; k < 10 ** blanks.length; k++) {
    const fill = String(k).padStart(blanks.length, '0');
    const digits = fixed.map((d) => (d === null ? 0 : d));
    blanks.forEach((pos, j) => (digits[pos] = Number(fill[j])));
    if (digits[0] === 0 && digits.length > 1) continue;
    if (ruleEval(digits.join(''), p)) out.push(fill);
  }
  return out;
}

export function makeConstruct(spec: ConstructSpec): ItemDraft | null {
  const solutions = ruleFills(spec.fixed, spec.p);
  if (solutions.length === 0) return null;
  if (spec.mode === 'all' && spec.fixed.filter((d) => d === null).length !== 1) return null;
  const key: Response =
    spec.mode === 'all'
      ? { kind: 'constructAll', digits: solutions.map(Number) }
      : { kind: 'construct', digits: [...solutions[0]].map(Number) };
  return {
    prompt: spec.prompt,
    ruleLens: spec.lens,
    hints: spec.hints,
    explanation: spec.explain(solutions),
    payload: { kind: 'construct', fixed: spec.fixed, p: spec.p, mode: spec.mode },
    key,
  };
}

/** Retry a nullable generator until it produces a draft. */
export function retry(make: () => ItemDraft | null, tries = 200): ItemDraft {
  for (let i = 0; i < tries; i++) {
    const d = make();
    if (d) return d;
  }
  throw new Error('retry(): generator never produced a valid item');
}

export const toDigits = (s: string) => [...s].map(Number);

/** Replace positions with blanks. */
export function blank(s: string, positions: number[]): (number | null)[] {
  return toDigits(s).map((d, i) => (positions.includes(i) ? null : d));
}

export const showWithBlanks = (fixed: (number | null)[]) => fixed.map((d) => (d === null ? '_' : String(d))).join('');

/** Put a fill (one digit per blank, in order) into the number and format it. */
export function fillIn(fixed: (number | null)[], fill: string): string {
  let j = 0;
  return fmt(fixed.map((d) => (d === null ? fill[j++] : String(d))).join(''));
}

// ---------------------------------------------------------------- choice

export interface Distractor {
  num?: string;
  label?: string;
  factors?: [number, number][];
  claim?: Claim;
  misconception: string;
}

export function makeChoice(args: {
  rng: Rng;
  prompt: string;
  question: import('./types').ChoiceMode;
  correct: Omit<ChoiceOption, 'id'>;
  distractors: Distractor[];
  lens?: string;
  hints: string[];
  explanation: string;
}): ItemDraft {
  const seen = new Set<string>([args.correct.label]);
  const ds = args.distractors.filter((d) => {
    const label = d.label ?? (d.num !== undefined ? fmt(d.num) : '');
    if (!label || seen.has(label)) return false;
    seen.add(label);
    return true;
  });
  const chosen = args.rng.shuffle(ds).slice(0, 3);
  if (chosen.length < 2) throw new Error('makeChoice(): not enough distinct distractors');
  const options: ChoiceOption[] = args.rng
    .shuffle([
      { ...args.correct },
      ...chosen.map((d) => ({
        label: d.label ?? fmt(d.num as string),
        num: d.num,
        factors: d.factors,
        claim: d.claim,
        misconception: d.misconception,
      })),
    ])
    .map((o, i) => ({ ...o, id: OPTION_IDS[i] }));
  const keyIndex = options.findIndex((o) => o.label === args.correct.label);
  return {
    prompt: args.prompt,
    ruleLens: args.lens,
    hints: args.hints,
    explanation: args.explanation,
    payload: { kind: 'choice', question: args.question, options },
    key: { kind: 'choice', optionId: options[keyIndex].id },
  };
}

/** Plausible numeric distractors near the answer, labelled with a misconception. */
export function nearValues(answer: number, named: { value: number; misconception: string }[]): Distractor[] {
  const out: Distractor[] = [];
  const used = new Set([answer]);
  for (const n of named) {
    if (n.value >= 0 && Number.isInteger(n.value) && !used.has(n.value)) {
      used.add(n.value);
      out.push({ num: String(n.value), misconception: n.misconception });
    }
  }
  for (const delta of [1, -1, 2, -2, 3]) {
    const v = answer + delta;
    if (v >= 0 && !used.has(v)) {
      used.add(v);
      out.push({ num: String(v), misconception: 'arithmetic-slip' });
    }
  }
  return out;
}

// ---------------------------------------------------------------- numeric

export function makeNumeric(args: {
  prompt: string;
  spec: ValueSpec;
  answer: number | bigint | string;
  lens?: string;
  hints: string[];
  explanation: string;
  unit?: string;
}): ItemDraft {
  return {
    prompt: args.prompt,
    ruleLens: args.lens,
    hints: args.hints,
    explanation: args.explanation,
    payload: { kind: 'numeric', spec: args.spec, unit: args.unit },
    key: { kind: 'numeric', value: String(args.answer) },
  };
}

// ---------------------------------------------------------------- refute

export interface ClaimBankEntry {
  text: string;
  claim: Claim;
  /** What the content author believes. The audit confirms it by brute force. */
  isTrue: boolean;
  why: string;
}

function ruleCond(c: Claim['given'][number], a: bigint, b: bigint) {
  const v = evalExpr(c.expr, a, b);
  // Negative values only arise from subtraction claims, which only use divisibility,
  // and divisibility ignores sign.
  return ruleEval((v < 0n ? -v : v).toString(), c.pred);
}

function classify(claim: Claim, t: number[]): 'witness' | 'decoy' | 'vacuous' {
  const a = BigInt(t[0]);
  const b = BigInt(t[1] ?? 0);
  if (!claim.given.every((c) => ruleCond(c, a, b))) return 'vacuous';
  return claim.then.every((c) => ruleCond(c, a, b)) ? 'decoy' : 'witness';
}

export function makeRefute(args: {
  rng: Rng;
  entry: ClaimBankEntry;
  varNames: string[];
  lens?: string;
  hints: string[];
}): ItemDraft {
  const { rng, entry } = args;
  const { claim } = entry;
  const [lo, hi] = claim.domain;
  const witnesses: number[][] = [];
  const decoys: number[][] = [];
  const top = claim.vars === 1 ? hi : Math.min(hi, lo + 48);
  for (let a = lo; a <= top; a++) {
    if (claim.vars === 1) {
      const c = classify(claim, [a]);
      if (c === 'witness') witnesses.push([a]);
      else if (c === 'decoy') decoys.push([a]);
    } else {
      for (let b = lo; b <= top; b++) {
        const c = classify(claim, [a, b]);
        if (c === 'witness') witnesses.push([a, b]);
        else if (c === 'decoy') decoys.push([a, b]);
      }
    }
  }
  if (decoys.length < 4) throw new Error(`makeRefute(): not enough decoys for "${entry.text}"`);
  if (!entry.isTrue && witnesses.length === 0) throw new Error(`makeRefute(): no witness for "${entry.text}"`);

  // Prefer small, readable witnesses so the counterexample is graspable.
  const witness = entry.isTrue ? null : rng.pick(witnesses.slice(0, Math.min(4, witnesses.length)));
  const pickedDecoys = rng.shuffle(decoys.slice(0, 60)).slice(0, entry.isTrue ? 4 : 3);
  const candidates = rng.shuffle(witness ? [witness, ...pickedDecoys] : pickedDecoys);
  const key: Response = witness ? { kind: 'refute', verdict: 'false', counterexample: witness } : { kind: 'refute', verdict: 'true' };

  const explanation = witness
    ? `False. ${formatTuple(witness, args.varNames)} meets the "if" part but not the "then" part. ${entry.why}`
    : `Always true. ${entry.why} The other numbers only show examples where it works, and examples alone never prove a rule.`;

  return {
    prompt: 'Is this claim always true? If not, break it with a counterexample.',
    ruleLens: args.lens,
    hints: args.hints,
    explanation,
    payload: { kind: 'refute', claim, claimText: entry.text, candidates, varNames: args.varNames },
    key,
  };
}

// ---------------------------------------------------------------- maze (Number Maze)

export interface MazeSpec {
  rng: Rng;
  level: number;
  p: NumPredicate;
  /** The condition in the learner's words: "multiples of 3". */
  label: string;
  lens: string;
  hints: string[];
  /** A number (as a string) that meets p. */
  pass: (rng: Rng) => string;
  /** A number that fails p. `near` asks for one that looks as if it might pass. */
  fail: (rng: Rng, near: boolean) => string;
  /** Short reason a number on the path passes, e.g. "digits add to 12". */
  why?: (s: string) => string;
  /** A note on a near miss beside the path, e.g. "91 = 7 × 13", or null if it isn't one. */
  trap?: (s: string) => string | null;
}

/** Grid size by level. Never more than five columns, so a 320 px phone fits it. */
export function mazeSize(level: number): { rows: number; cols: number } {
  if (level <= 3) return { rows: 4, cols: 4 };
  if (level <= 6) return { rows: 5, cols: 4 };
  return { rows: 5, cols: 5 };
}

function gridNeighbours(c: number, rows: number, cols: number): number[] {
  const r = Math.floor(c / cols);
  const k = c % cols;
  return [r > 0 ? c - cols : -1, r < rows - 1 ? c + cols : -1, k > 0 ? c - 1 : -1, k < cols - 1 ? c + 1 : -1].filter((x) => x >= 0);
}

/**
 * A random path from the top-left square to the bottom-right one that never
 * touches itself (no square on it is beside an earlier one except the square
 * before), so the path's own squares give exactly one route.
 */
function carvePath(rng: Rng, rows: number, cols: number, minLen: number, maxLen: number): number[] | null {
  const end = rows * cols - 1;
  const dist = (c: number) => rows - 1 - Math.floor(c / cols) + (cols - 1 - (c % cols));
  const path = [0];
  const seen = new Set([0]);
  let budget = 5000;
  const go = (c: number): boolean => {
    if (--budget < 0) return false;
    if (c === end) return path.length >= minLen;
    if (path.length + dist(c) > maxLen) return false;
    for (const n of rng.shuffle(gridNeighbours(c, rows, cols))) {
      if (seen.has(n) || gridNeighbours(n, rows, cols).some((m) => m !== c && seen.has(m))) continue;
      seen.add(n);
      path.push(n);
      if (go(n)) return true;
      path.pop();
      seen.delete(n);
    }
    return false;
  };
  return go(0) ? path : null;
}

/** Squares on the shortest route (rule-based, for the generator; the checker has its own search), or 0 if none. */
function shortestRoute(pass: boolean[], rows: number, cols: number): number {
  const end = rows * cols - 1;
  if (!pass[0] || !pass[end]) return 0;
  const dist = new Map([[0, 1]]);
  const queue = [0];
  while (queue.length) {
    const c = queue.shift() as number;
    if (c === end) return dist.get(c) as number;
    for (const n of gridNeighbours(c, rows, cols)) {
      if (!dist.has(n) && pass[n]) {
        dist.set(n, (dist.get(c) as number) + 1);
        queue.push(n);
      }
    }
  }
  return 0;
}

/**
 * Number Maze. Carves a route, puts passing numbers on it, a dead end or two
 * of passing numbers beside it from level 4, and failing numbers everywhere
 * else (near misses from level 3, mostly on the squares next to the route,
 * where they tempt). Returns null when the numbers run out; wrap it in retry().
 */
export function makeMaze(spec: MazeSpec): ItemDraft | null {
  const { rng, level, p } = spec;
  const { rows, cols } = mazeSize(level);
  const total = rows * cols;
  const shortest = rows + cols - 1;
  // 4 × 4 grids only fit shortest routes; bigger grids need at least one detour.
  const route = carvePath(rng, rows, cols, shortest + (rows * cols > 16 ? 2 : 0), shortest + 6);
  if (!route) return null;
  const onRoute = new Set(route);
  const beside = new Set<number>();
  for (const c of route) for (const n of gridNeighbours(c, rows, cols)) if (!onRoute.has(n)) beside.add(n);

  // Dead ends touch exactly one route square and no other dead end, so they never join two
  // parts of the route into a shortcut: the carved route stays the only way through.
  const deadEnds = new Set<number>();
  const want = level >= 7 ? 2 : level >= 4 ? 1 : 0;
  for (const c of rng.shuffle([...beside])) {
    if (deadEnds.size >= want) break;
    const near = gridNeighbours(c, rows, cols);
    if (near.filter((n) => onRoute.has(n)).length !== 1 || near.some((n) => deadEnds.has(n)) || c === total - 1) continue;
    deadEnds.add(c);
  }

  const used = new Set<string>();
  const draw = (make: () => string): string | null => {
    for (let i = 0; i < 60; i++) {
      let s: string;
      try {
        s = make();
      } catch {
        return null;
      }
      if (!used.has(s)) {
        used.add(s);
        return s;
      }
    }
    return null;
  };
  const cells: string[] = [];
  for (let c = 0; c < total; c++) {
    let s: string | null;
    if (onRoute.has(c) || deadEnds.has(c)) s = draw(() => spec.pass(rng));
    else {
      const near = level >= 3 && rng.chance(beside.has(c) ? 0.7 : 0.3);
      s = (near ? draw(() => spec.fail(rng, true)) : null) ?? draw(() => spec.fail(rng, false));
    }
    if (s === null) return null;
    cells.push(s);
  }

  // Every number is where it should be, and the route really goes through (rule-based).
  const pass = cells.map((s) => ruleEval(s, p));
  if (cells.some((_, c) => pass[c] !== (onRoute.has(c) || deadEnds.has(c)))) return null;
  if (shortestRoute(pass, rows, cols) !== route.length) return null;

  const why = spec.why;
  const shown = route.map((c) => (why ? `${fmt(cells[c])} (${why(cells[c])})` : fmt(cells[c])));
  const traps = spec.trap ? [...beside].map((c) => (deadEnds.has(c) ? null : spec.trap!(cells[c]))).filter((t): t is string => !!t).slice(0, 2) : [];
  return {
    prompt: `Find a path from the top-left square to the bottom-right square, stepping only on ${spec.label}. Move up, down, left or right.`,
    ruleLens: spec.lens,
    hints: spec.hints,
    explanation: `One path: ${shown.join(' → ')}.${traps.length ? ` Near misses beside it: ${traps.join('; ')}.` : ''} Any path that steps only on ${spec.label} counts.`,
    payload: { kind: 'maze', rows, cols, cells, p, start: 0, end: total - 1, label: spec.label },
    key: { kind: 'maze', path: route },
  };
}

// ---------------------------------------------------------------- match (Match Up)

export interface MatchCard {
  label: string;
  spec: ValueSpec;
  /** What the generator believes the value is. The audit and the checker compute it independently. */
  value: number;
}

/**
 * Match Up: left cards, their values on the right, plus one extra card from a
 * named slip. Values must be distinct; returns null if they aren't or no
 * decoy fits.
 */
export function makeMatch(args: {
  rng: Rng;
  prompt: string;
  lens?: string;
  hints: string[];
  left: MatchCard[];
  /** Candidate extra cards, best first; the first value not already on the right is used. */
  decoys: { value: number; misconception: string }[];
  leftTitle: string;
  rightTitle: string;
  explain: (decoy: { value: number; misconception: string }) => string;
  rightLabel?: (v: number) => string;
}): ItemDraft | null {
  const values = args.left.map((l) => l.value);
  if (new Set(values).size !== values.length) return null;
  if (new Set(args.left.map((l) => l.label)).size !== args.left.length) return null;
  const decoy = args.decoys.find((d) => Number.isInteger(d.value) && d.value >= 0 && !values.includes(d.value));
  if (!decoy) return null;
  const label = args.rightLabel ?? ((v: number) => String(v));
  const right = args.rng.shuffle([...values.map((v) => ({ label: label(v), value: v })), { label: label(decoy.value), value: decoy.value, misconception: decoy.misconception }]);
  return {
    prompt: args.prompt,
    ruleLens: args.lens,
    hints: args.hints,
    explanation: args.explain(decoy),
    payload: { kind: 'match', left: args.left.map(({ label: l, spec }) => ({ label: l, spec })), right, leftTitle: args.leftTitle, rightTitle: args.rightTitle },
    key: { kind: 'match', pairs: values.map((v) => right.findIndex((r) => r.value === v)) },
  };
}

// ---------------------------------------------------------------- claim helpers

export const A = { op: 'var', v: 'a' } as const;
export const B = { op: 'var', v: 'b' } as const;
export const add = (l: import('./types').Expr, r: import('./types').Expr) => ({ op: 'add', l, r }) as const;
export const sub = (l: import('./types').Expr, r: import('./types').Expr) => ({ op: 'sub', l, r }) as const;
export const mul = (l: import('./types').Expr, r: import('./types').Expr) => ({ op: 'mul', l, r }) as const;
export const sq = (e: import('./types').Expr) => ({ op: 'sq', e }) as const;
export const k = (c: number) => ({ op: 'const', c }) as const;
export const div = (d: number): NumPredicate => ({ op: 'div', d });
export const notDiv = (d: number): NumPredicate => ({ op: 'not', p: { op: 'div', d } });
export const rem = (d: number, r: number): NumPredicate => ({ op: 'rem', d, r });
export const and = (...ps: NumPredicate[]): NumPredicate => ({ op: 'and', ps });

/** Single-variable claim: for every n in [lo, hi], if given(n) then then(n). */
export function claim1(given: NumPredicate[], then: NumPredicate[], domain: [number, number] = [1, 2000]): Claim {
  return {
    vars: 1,
    given: given.map((pred) => ({ expr: A, pred })),
    then: then.map((pred) => ({ expr: A, pred })),
    domain,
  };
}

/**
 * Shared builders for the common board shapes. Template files describe the
 * mathematics (which predicate, which near-misses, how to explain); these turn
 * that into a complete ItemDraft.
 */
import { evalExpr } from './evaluate';
import { fmt, formatTuple } from './format';
import { digitsFor, distinct, LENS_OPEN_MAX_LEVEL, ruleEval, sampleWhere } from './numbers';
import type { Rng } from './rng';
import type { ChoiceOption, Claim, ItemDraft, NumPredicate, Response, ValueSpec } from './types';

const OPTION_IDS = ['a', 'b', 'c', 'd', 'e'];

export const showLensOpenly = (level: number) => level <= LENS_OPEN_MAX_LEVEL;

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

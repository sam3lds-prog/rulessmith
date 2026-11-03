/**
 * Coaching: what to show after an answer, built from the item's structure and
 * the learner's actual response.
 *
 * Grading stays in checkItem(); this layer never decides right or wrong and
 * never reads `item.key`. Every number it states is computed here by plain
 * arithmetic (BigInt), and every "is / isn't" verdict comes from evalPred, the
 * checker's own brute-force evaluator. Where the structure doesn't support a
 * specific explanation, it falls back to the item's own verified explanation
 * (the content audit checks those against the checker).
 *
 * It never guesses what the learner was thinking: a misconception note is shown
 * only when the checker tagged the answer and a reviewed note exists, and it is
 * phrased as a common slip, not a diagnosis. Pure: unit-tested.
 */
import { optionIsCorrect, primeFactorsBrute } from '../content/check';
import { divisorCountBrute, enumerateFills, evalExpr, evalPred, evalValue, findCounterexample, isCounterexample, isPrimeBrute } from '../content/evaluate';
import { describe, fmt, formatTuple, sup } from '../content/format';
import type { CheckResult, Claim, Cond, ConstructPayload, Expr, Item, NumPredicate, Response } from '../content/types';
import { noteFor } from '../quizzes/policies';

export interface Coaching {
  /** The learner's own answer, in words: "You made 442." */
  submitted: string;
  /** The rule in one sentence, when the item has one. */
  rule?: string;
  /** The explanation: specific to this answer where the structure allows, else the item's own. */
  lines: string[];
  /** A different worked example of the same rule, when one can be built and checked. */
  example?: { title: string; lines: string[] };
  /** A reviewed note about a common slip (only for tagged answers). */
  slip?: string;
  /** True when `lines` explain this particular answer; false for the general fallback. */
  specific: boolean;
}

// ------------------------------------------------------------------ arithmetic

const digitsOf = (n: bigint) => (n < 0n ? -n : n).toString().split('').map(Number);
// Digits are written out for short numbers only; for long ones the sum alone is easier to read.
const sumText = (ds: number[]) => (ds.length > 1 && ds.length <= 6 ? `${ds.join(' + ')} = ${ds.reduce((a, b) => a + b, 0)}` : `${ds.reduce((a, b) => a + b, 0)}`);
const isqrt = (n: bigint) => {
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (x * x > n) x--;
  while ((x + 1n) * (x + 1n) <= n) x++;
  return x;
};
const smallestFactor = (n: bigint) => {
  for (let q = 2n; q * q <= n; q++) if (n % q === 0n) return q;
  return n;
};
const isOrIsnt = (b: boolean) => (b ? 'is' : "isn't");

/** Composite divisors the content teaches as two tests at once, split into parts that share no factor. */
const TWO_TESTS: Record<number, [number, number]> = { 6: [2, 3], 12: [4, 3], 15: [3, 5], 18: [2, 9], 20: [4, 5], 24: [8, 3], 36: [4, 9], 40: [8, 5], 45: [9, 5], 72: [8, 9] };

/** Longest explanation line shown; anything longer falls back to the item's own explanation. */
const MAX_LINE = 420;

/** Why a number does or doesn't meet a condition, in one clause. Arithmetic only; no verdict words. */
export function reason(n: bigint, p: NumPredicate): string {
  switch (p.op) {
    case 'div': {
      const d = BigInt(p.d);
      const last = Number(n % 10n);
      if (p.d === 2) return `it ends in ${last}, ${last % 2 === 0 ? 'an even' : 'an odd'} digit`;
      if (p.d === 5) return `it ends in ${last}, and multiples of 5 end in 0 or 5`;
      if (p.d === 10) return `it ends in ${last}, and multiples of 10 end in 0`;
      if (p.d === 3 || p.d === 9) {
        const ds = digitsOf(n);
        const s = ds.reduce((a, b) => a + b, 0);
        return `its digits add to ${sumText(ds)}, and ${s} ${isOrIsnt(s % p.d === 0)} a multiple of ${p.d}`;
      }
      if (p.d === 4 || p.d === 25) {
        const t = Number(n % 100n);
        return n < 100n ? `${fmt(n)} ÷ ${p.d} = ${n / d}${n % d ? ` remainder ${n % d}` : ''}` : `its last two digits make ${t}, and ${t} ${isOrIsnt(t % p.d === 0)} a multiple of ${p.d}`;
      }
      if (p.d === 8) {
        const t = Number(n % 1000n);
        return n < 1000n ? `${fmt(n)} ÷ 8 = ${n / 8n}${n % 8n ? ` remainder ${n % 8n}` : ''}` : `its last three digits make ${t}, and ${t} ${isOrIsnt(t % 8 === 0)} a multiple of 8`;
      }
      const parts = TWO_TESTS[p.d];
      if (parts) {
        // n is divisible by a·b exactly when it is divisible by a and by b (they share no factor).
        const [a, b] = parts;
        return `it needs both ${a} and ${b}: ${sentence(n, { op: 'div', d: a })} (${reason(n, { op: 'div', d: a })}), and ${sentence(n, { op: 'div', d: b })} (${reason(n, { op: 'div', d: b })})`;
      }
      if (p.d === 11) {
        const ds = digitsOf(n).reverse();
        const alt = ds.reduce((a, x, i) => a + (i % 2 === 0 ? x : -x), 0);
        return `its alternating digit sum (from the right) is ${alt}, and ${alt} ${isOrIsnt(alt % 11 === 0)} a multiple of 11`;
      }
      return `${fmt(n)} ÷ ${p.d} = ${fmt(n / d)}${n % d ? ` remainder ${n % d}` : ' exactly'}`;
    }
    case 'rem': {
      const d = BigInt(p.d);
      return `${fmt(n)} ÷ ${p.d} = ${fmt(n / d)} remainder ${n % d}`;
    }
    case 'prime': {
      if (n < 2n) return `${n} is less than 2`;
      const f = smallestFactor(n);
      if (f !== n) return `${fmt(n)} = ${fmt(f)} × ${fmt(n / f)}`;
      return n < 4n ? 'its only factors are 1 and itself' : `no whole number from 2 to ${isqrt(n)} divides it`;
    }
    case 'square': {
      const k = isqrt(n);
      return k * k === n ? `${fmt(n)} = ${k}²` : `${k}² = ${fmt(k * k)} and ${k + 1n}² = ${fmt((k + 1n) * (k + 1n))}, so nothing squares to ${fmt(n)}`;
    }
    case 'nDivisors':
      return `it has ${divisorCountBrute(n)} factors`;
    case 'not':
      return reason(n, p.p);
    case 'and':
    case 'or': {
      if (p.ps.length <= 3) return p.ps.map((q) => `${sentence(n, q)} (${reason(n, q)})`).join('; ');
      // Long lists: name only the part that decides it.
      const deciding = p.op === 'or' ? p.ps.find((q) => evalPred(n, q)) : p.ps.find((q) => !evalPred(n, q));
      if (deciding) return `${sentence(n, deciding)} (${reason(n, deciding)})`;
      return p.op === 'or' ? `it matches none of the ${p.ps.length} options` : `it meets all ${p.ps.length} parts`;
    }
  }
}

/** "442 isn't divisible by 9", with the verdict from evalPred. */
export function sentence(n: bigint, p: NumPredicate): string {
  const N = fmt(n);
  const holds = evalPred(n, p);
  switch (p.op) {
    case 'div':
      return `${N} ${isOrIsnt(holds)} divisible by ${p.d}`;
    case 'rem':
      return holds ? `${N} leaves remainder ${p.r} when divided by ${p.d}` : `${N} doesn't leave remainder ${p.r} when divided by ${p.d}`;
    case 'prime':
      return `${N} ${isOrIsnt(holds)} prime`;
    case 'square':
      return `${N} ${isOrIsnt(holds)} a perfect square`;
    case 'nDivisors':
      return holds ? `${N} has exactly ${p.k} factors` : `${N} doesn't have exactly ${p.k} factors`;
    case 'not':
      return sentence(n, p.p);
    case 'and':
    case 'or': {
      const d = describe(p);
      return `${N} ${holds ? 'meets' : "doesn't meet"} the condition${d.length <= 80 ? ` (${d})` : ''}`;
    }
  }
}

/** "442 isn't divisible by 9: its digits add to 4 + 4 + 2 = 10, and 10 isn't a multiple of 9." */
export const explainNumber = (n: bigint, p: NumPredicate) => `${sentence(n, p)}: ${reason(n, p)}.`;

// ------------------------------------------------------------------ expressions (Rule Detective)

function exprText(e: Expr, names: string[]): string {
  const wrap = (x: Expr) => (x.op === 'add' || x.op === 'sub' ? `(${exprText(x, names)})` : exprText(x, names));
  switch (e.op) {
    case 'var':
      return e.v === 'a' ? (names[0] ?? 'a') : (names[1] ?? 'b');
    case 'const':
      return String(e.c);
    case 'add':
      return `${exprText(e.l, names)} + ${exprText(e.r, names)}`;
    case 'sub':
      return `${exprText(e.l, names)} − ${wrap(e.r)}`;
    case 'mul':
      return `${wrap(e.l)} × ${wrap(e.r)}`;
    case 'sq':
      return e.e.op === 'var' || e.e.op === 'const' ? `${exprText(e.e, names)}²` : `(${exprText(e.e, names)})²`;
  }
}

function condLine(c: Cond, tuple: number[], names: string[]): string {
  const a = BigInt(tuple[0]);
  const b = BigInt(tuple[1] ?? 0);
  const v = evalExpr(c.expr, a, b);
  const label = c.expr.op === 'var' ? '' : `${exprText(c.expr, names)} = ${fmt(v)}, and `;
  return `${label}${explainNumber(v, c.pred)}`;
}

// ------------------------------------------------------------------ worked examples

/**
 * Another single-blank example for "divisible by 9" (or 3) that lands on a
 * bigger multiple (18, or 12 and up), so the learner sees that any multiple
 * counts, not just 9. Checked by enumerating fills.
 */
export function relatedDigitSumExample(d: 3 | 9, avoid: string, seed: number): { title: string; lines: string[] } | undefined {
  const target = d === 9 ? 18 : 12 + 3 * (seed % 2);
  const p: NumPredicate = { op: 'div', d };
  for (let k = 0; k < 90; k++) {
    const i = (k + seed) % 90;
    const a = 1 + Math.floor(i / 10);
    const c = i % 10;
    const b = target - a - c;
    if (b < 0 || b > 9) continue;
    if (`${a}_${c}` === avoid) continue;
    const fills = enumerateFills([a, null, c], p).map((f) => f[0]);
    if (!fills.includes(b)) continue;
    if (d === 9 && fills.length !== 1) continue;
    const n = BigInt(`${a}${b}${c}`);
    const lines =
      d === 9
        ? [`${a}_${c}: the known digits add to ${a + c}. ${b} brings the total to ${a + c + b}, a multiple of 9, so ${a}${b}${c} works (${a}${b}${c} ÷ 9 = ${n / 9n}).`]
        : [
            `${a}_${c}: the known digits add to ${a + c}. ${fills.join(', ')} all work: they bring the total to ${fills.map((x) => a + c + x).join(', ')}, each a multiple of 3.`,
          ];
    return { title: `Another one: make ${a}_${c} divisible by ${d}`, lines };
  }
  return undefined;
}

// ------------------------------------------------------------------ per board

/** The digits the learner made, or null if the fill doesn't fit the blanks. */
function constructDigits(p: ConstructPayload, fill: number[]): number[] | null {
  const blanks = p.fixed.filter((x) => x === null).length;
  if (fill.length !== blanks || fill.some((x) => !Number.isInteger(x) || x < 0 || x > 9)) return null;
  let j = 0;
  return p.fixed.map((x) => (x === null ? fill[j++] : (x as number)));
}

const leadingZero = (ds: number[]) => ds.length > 1 && ds[0] === 0;

/** The number made, or null if the fill doesn't fit or starts with 0 (the checker never accepts that). */
function constructNumber(p: ConstructPayload, fill: number[]): bigint | null {
  const ds = constructDigits(p, fill);
  return ds && !leadingZero(ds) ? BigInt(ds.join('')) : null;
}

const patternOf = (fixed: (number | null)[]) => fixed.map((x) => (x === null ? '_' : String(x))).join('');
const list = (xs: (string | number)[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function coachConstruct(item: Item, p: ConstructPayload, response: Response): Omit<Coaching, 'rule'> | null {
  const sols = enumerateFills(p.fixed, p.p);
  const single = p.fixed.filter((x) => x === null).length === 1;
  const known = p.fixed.filter((x): x is number => x !== null);
  const K = known.reduce((a, b) => a + b, 0);
  const digitSumRule = p.p.op === 'div' && (p.p.d === 3 || p.p.d === 9) ? p.p.d : null;

  if (p.mode === 'all') {
    if (response.kind !== 'constructAll' || !single) return null;
    const want = new Set(sols.map((f) => f[0]));
    const got = new Set(response.digits);
    const extra = [...got].filter((x) => !want.has(x)).sort();
    const missing = [...want].filter((x) => !got.has(x)).sort();
    const lines: string[] = [];
    for (const x of extra.slice(0, 3)) lines.push(`${x} doesn't work: ${explainNumber(constructNumber(p, [x])!, p.p)}`);
    for (const x of missing.slice(0, 3)) lines.push(`${x} also works: ${explainNumber(constructNumber(p, [x])!, p.p)}`);
    if (extra.length > 3 || missing.length > 3) lines.push('Check the rest the same way.');
    lines.push(want.size ? `Every digit that works: ${list([...want].sort())}.` : 'No digit works here.');
    return {
      submitted: got.size ? `You picked ${list([...got].sort())}.` : 'You picked no digits.',
      lines,
      specific: true,
      example: digitSumRule ? relatedDigitSumExample(digitSumRule, patternOf(p.fixed), item.seed) : undefined,
    };
  }

  if (response.kind !== 'construct') return null;
  const ds = constructDigits(p, response.digits);
  if (!ds) return null;
  const solutionLine = () => {
    if (single) return sols.length === 0 ? 'No digit works here.' : `${sols.length === 1 ? 'The only digit that works is' : 'Digits that work:'} ${list(sols.map((f) => f[0]))}.`;
    if (!sols.length) return 'No way of filling the blanks works here.';
    const one = constructNumber(p, sols[0])!;
    return `One answer is ${fmt(one)}. There ${sols.length === 1 ? 'is 1 way' : `are ${sols.length} ways`} to fill the blanks in all.`;
  };
  if (leadingZero(ds)) {
    return {
      submitted: `You made ${ds.join('')}.`,
      lines: [`A whole number can't start with 0, so ${ds.join('')} isn't a ${ds.length}-digit number.`, solutionLine()],
      specific: true,
    };
  }
  const n = BigInt(ds.join(''));
  const lines = [explainNumber(n, p.p)];
  if (single && digitSumRule) {
    const ks = known.length > 1 && known.length <= 9 ? ` (${known.join(' + ')})` : '';
    lines.push(`The known digits add to ${K}${ks}. The blank has to bring the total to a multiple of ${digitSumRule}.`);
    for (const f of sols.slice(0, 4)) lines.push(`${f[0]} makes ${fmt(constructNumber(p, f)!)}, whose digits add to ${K + f[0]}.`);
    if (sols.length > 4) lines.push(`${list(sols.slice(4).map((f) => f[0]))} work too.`);
    if (digitSumRule === 9) lines.push('Any multiple of 9 works: 18 and 27 count, not just 9.');
  } else {
    lines.push(solutionLine());
  }
  return {
    submitted: `You made ${fmt(n)}.`,
    lines,
    specific: true,
    example: single && digitSumRule ? relatedDigitSumExample(digitSumRule, patternOf(p.fixed), item.seed) : undefined,
  };
}

function coachRefute(item: Item, response: Response): Omit<Coaching, 'rule'> | null {
  const p = item.payload;
  if (p.kind !== 'refute' || response.kind !== 'refute') return null;
  const claim: Claim = p.claim;
  const names = p.varNames;
  const witness = findCounterexample(claim);
  const lines: string[] = [];
  // A counterexample meets every condition and fails at least one conclusion; show exactly those.
  const breaks = (t: number[]) => {
    const a = BigInt(t[0]);
    const b = BigInt(t[1] ?? 0);
    return [
      ...claim.given.map((c) => `It meets the condition: ${condLine(c, t, names)}`),
      ...claim.then.filter((c) => !evalPred(evalExpr(c.expr, a, b), c.pred)).map((c) => `But the conclusion fails: ${condLine(c, t, names)}`),
    ];
  };
  if (response.verdict === 'true') {
    if (!witness || !isCounterexample(claim, witness)) return null;
    lines.push(`It isn't always true. ${formatTuple(witness, names)} breaks it:`);
    lines.push(...breaks(witness));
    return { submitted: 'You said the claim is always true.', lines, specific: true };
  }
  const t = response.counterexample;
  const [lo, hi] = claim.domain;
  if (t.length !== claim.vars || t.some((x) => x < lo || x > hi)) return null;
  const a = BigInt(t[0]);
  const b = BigInt(t[1] ?? 0);
  const givenHolds = claim.given.every((c) => evalPred(evalExpr(c.expr, a, b), c.pred));
  if (!givenHolds) {
    const failing = claim.given.filter((c) => !evalPred(evalExpr(c.expr, a, b), c.pred));
    lines.push(`At ${formatTuple(t, names)} the condition doesn't hold, so it can't break the claim. ${failing.map((c) => condLine(c, t, names)).join(' ')}`);
    lines.push('A counterexample must meet the condition and still fail the conclusion.');
  } else {
    lines.push(
      claim.given.length
        ? `At ${formatTuple(t, names)} the condition holds and so does the conclusion, so it agrees with the claim.`
        : `At ${formatTuple(t, names)} the claim holds, so this doesn't break it.`,
    );
    lines.push(...claim.then.map((c) => condLine(c, t, names)));
  }
  if (witness) {
    lines.push(`${formatTuple(witness, names)} does break it:`);
    lines.push(...breaks(witness));
  } else lines.push(`No ${claim.vars === 2 ? 'pair of values' : 'value'} from ${fmt(lo)} to ${fmt(hi)} breaks it: the claim is true.`);
  return { submitted: `You chose ${formatTuple(t, names)}.`, lines, specific: true };
}

function coachChoice(item: Item, response: Response, result: CheckResult): Omit<Coaching, 'rule'> | null {
  const p = item.payload;
  if (p.kind !== 'choice' || response.kind !== 'choice') return null;
  const chosen = p.options.find((o) => o.id === response.optionId);
  if (!chosen) return null;
  const right = p.options.filter((o) => optionIsCorrect(p, o));
  const lines: string[] = [];
  if (right.length) lines.push(`The answer is ${list(right.map((o) => o.label))}.`);
  let specific = false;
  if (p.question.mode === 'predicate' && chosen.num !== undefined) {
    lines.push(explainNumber(BigInt(chosen.num), p.question.p));
    for (const o of right.slice(0, 1)) if (o.num !== undefined) lines.push(explainNumber(BigInt(o.num), p.question.p));
    specific = true;
  }
  if (!specific) lines.push(item.explanation);
  const tag = result.misconception ?? chosen.misconception;
  const note = noteFor(item.templateId, tag);
  return { submitted: `You chose ${chosen.label}.`, lines, specific, slip: note ? `A common slip with this answer: ${note}` : undefined };
}

function coachNumeric(item: Item, response: Response): Omit<Coaching, 'rule'> | null {
  const p = item.payload;
  if (p.kind !== 'numeric' || response.kind !== 'numeric') return null;
  const value = evalValue(p.spec);
  const lines = [`The answer is ${fmt(value)}${p.unit ? ` ${p.unit}` : ''}.`];
  const spec = p.spec;
  let specific = false;
  // Remainders from digit rules teach the rule, not long division: keep the item's own explanation there,
  // and for any number too long to read at a glance.
  if (spec.op === 'remainder' && item.skillId !== 'rem.digit-rules' && spec.n.length <= 12) {
    const n = BigInt(spec.n);
    const d = BigInt(spec.d);
    lines.push(`${fmt(n)} = ${spec.d} × ${fmt(n / d)} + ${n % d}, so the remainder is ${n % d}.`);
    specific = true;
  } else if (spec.op === 'countFills') {
    const fills = enumerateFills(spec.fixed, spec.p);
    const nums = fills.map((f) => {
      let j = 0;
      return spec.fixed.map((x) => (x === null ? f[j++] : x)).join('');
    });
    lines.push(nums.length ? `The ${nums.length === 1 ? 'number that works is' : `${nums.length} numbers that work are`} ${list(nums.slice(0, 10).map(fmt))}${nums.length > 10 ? ', and more' : ''}.` : 'No digit works.');
    specific = true;
  }
  if (!specific) lines.push(item.explanation);
  return { submitted: response.value ? `You answered ${fmt(response.value)}.` : 'You left it blank.', lines, specific };
}

function coachFactor(item: Item, response: Response): Omit<Coaching, 'rule'> | null {
  const p = item.payload;
  if (p.kind !== 'factor' || response.kind !== 'factor') return null;
  const lines: string[] = [];
  for (const q of [...new Set(response.primes)].filter((x) => !isPrimeBrute(BigInt(x))).slice(0, 3)) {
    const f = smallestFactor(BigInt(q));
    lines.push(`${fmt(q)} can still split: ${fmt(q)} = ${fmt(f)} × ${fmt(BigInt(q) / f)}.`);
  }
  const primes = primeFactorsBrute(p.n);
  const counts = new Map<number, number>();
  for (const x of primes) counts.set(x, (counts.get(x) ?? 0) + 1);
  const powers = [...counts].map(([x, e]) => (e === 1 ? `${x}` : `${x}${sup(e)}`)).join(' × ');
  lines.push(`${fmt(p.n)} = ${primes.join(' × ')}${counts.size < primes.length ? ` = ${powers}` : ''}. Any route of splits ends with these primes.`);
  return { submitted: `You ended with ${response.primes.map(fmt).join(' × ')}.`, lines, specific: true };
}

function coachRail(item: Item, response: Response): Omit<Coaching, 'rule'> | null {
  const p = item.payload;
  if (p.kind !== 'rail' || response.kind !== 'rail') return null;
  const chosen = p.stops[response.stop];
  if (!chosen) return null;
  const v = evalValue(p.spec);
  const right = p.stops.find((s) => BigInt(s.value) === v);
  if (!right) return null;
  const L = p.stops.length;
  const lines: string[] = [];
  if (p.spec.op === 'remainder') {
    const n = BigInt(p.spec.n);
    const d = BigInt(p.spec.d);
    lines.push(`${fmt(n)} = ${p.spec.d} × ${fmt(n / d)} + ${n % d}. ${fmt(n / d)} complete loops bring the token back to the start; ${n % d} more steps take it to ${right.label}.`);
  } else if (p.spec.op === 'powMod') {
    const { base, exp: e, d } = p.spec;
    const r = e % L;
    const pos = r === 0 ? L : r;
    // The loop must really be the cycle of the powers (stop i = base^(i+1)), or this explanation would be wrong.
    const valid = p.stops.every((s, i) => BigInt(s.value) === evalValue({ op: 'powMod', base, exp: i + 1, d })) && evalValue({ op: 'powMod', base, exp: L + 1, d }) === BigInt(p.stops[0].value);
    if (!valid || p.stops[pos - 1] !== right) return null;
    lines.push(`The loop repeats every ${L} powers. ${e} = ${L} × ${Math.floor(e / L)} + ${r}${r === 0 ? ': a whole number of loops ends on the last stop' : `, so it lands on stop ${r}`}: ${right.label}.`);
  } else return null;
  return { submitted: `You chose ${chosen.label}.`, lines, specific: true };
}

function coachSort(item: Item, response: Response, result: CheckResult): Omit<Coaching, 'rule'> | null {
  const p = item.payload;
  if (p.kind !== 'sort' || response.kind !== 'sort') return null;
  const yes = new Set(response.yes);
  const wrong = p.numbers.map((n, i) => ({ n, i })).filter(({ n, i }) => evalPred(BigInt(n), p.p) !== yes.has(i));
  if (wrong.length === 0) return null;
  // The checker's marks and this list must agree; if not, use the general explanation.
  if (result.marks && result.marks.some((ok, i) => ok === wrong.some((w) => w.i === i))) return null;
  const lines = wrong.slice(0, 4).map(({ n, i }) => {
    const placed = yes.has(i) ? p.yesLabel : p.noLabel;
    const belongs = yes.has(i) ? p.noLabel : p.yesLabel;
    return `You put ${fmt(n)} under “${placed}”. ${explainNumber(BigInt(n), p.p)} It belongs under “${belongs}”.`;
  });
  if (wrong.length > 4) lines.push(`${wrong.length - 4} more ${wrong.length - 4 === 1 ? 'is' : 'are'} in the wrong place; check them the same way.`);
  return { submitted: `${wrong.length} of ${p.numbers.length} ${wrong.length === 1 ? 'number was' : 'numbers were'} in the wrong place.`, lines, specific: true };
}

/**
 * Coaching for an answer. For a wrong answer it explains this response; for a
 * right one (or anything it can't explain specifically) it gives the item's own
 * explanation.
 */
export function coach(item: Item, response: Response, result: CheckResult): Coaching {
  const rule = item.ruleLens;
  const fallback: Coaching = { submitted: describeResponse(item, response), rule, lines: [item.explanation], specific: false };
  if (result.correct) return fallback;
  let c: Omit<Coaching, 'rule'> | null = null;
  try {
    const p = item.payload;
    switch (p.kind) {
      case 'sort':
        c = coachSort(item, response, result);
        break;
      case 'construct':
        c = coachConstruct(item, p, response);
        break;
      case 'refute':
        c = coachRefute(item, response);
        break;
      case 'choice':
        c = coachChoice(item, response, result);
        break;
      case 'numeric':
        c = coachNumeric(item, response);
        break;
      case 'factor':
        c = coachFactor(item, response);
        break;
      case 'rail':
        c = coachRail(item, response);
        break;
    }
  } catch {
    c = null;
  }
  // A line too long to read is no help: use the item's own explanation instead.
  if (c && [...c.lines, ...(c.example?.lines ?? [])].some((l) => l.length > MAX_LINE)) c = null;
  return c ? { ...c, rule } : fallback;
}

/** The learner's answer in words, for any board. */
export function describeResponse(item: Item, response: Response): string {
  const p = item.payload;
  switch (response.kind) {
    case 'sort':
      return p.kind === 'sort' ? `You sorted ${response.yes.length} of ${p.numbers.length} under “${p.yesLabel}”.` : 'You sorted the numbers.';
    case 'construct':
      if (p.kind === 'construct') {
        const n = constructNumber(p, response.digits);
        if (n !== null) return `You made ${fmt(n)}.`;
      }
      return `You entered ${response.digits.join('')}.`;
    case 'constructAll':
      return response.digits.length ? `You picked ${list([...response.digits].sort())}.` : 'You picked no digits.';
    case 'refute':
      return response.verdict === 'true' ? 'You said the claim is always true.' : `You chose ${formatTuple(response.counterexample, p.kind === 'refute' ? p.varNames : ['n'])}.`;
    case 'choice': {
      const o = p.kind === 'choice' ? p.options.find((x) => x.id === response.optionId) : undefined;
      return o ? `You chose ${o.label}.` : 'You chose an option.';
    }
    case 'numeric':
      return response.value ? `You answered ${fmt(response.value)}.` : 'You left it blank.';
    case 'factor':
      return `You ended with ${response.primes.map(fmt).join(' × ')}.`;
    case 'rail': {
      const s = p.kind === 'rail' ? p.stops[response.stop] : undefined;
      return s ? `You chose ${s.label}.` : 'You chose a stop.';
    }
  }
}

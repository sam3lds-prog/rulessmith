/**
 * Grade a learner's response against the item's structured meaning.
 * This is the only grading path in the app. It never reads `item.key`.
 */
import {
  claimHolds,
  enumerateFills,
  evalPred,
  evalValue,
  findCounterexample,
  isCounterexample,
  isPrimeBrute,
  parseWhole,
} from './evaluate';
import type { CheckResult, ChoiceOption, ChoicePayload, Item, MatchPayload, MazePayload, Response } from './types';
import { fmt, formatTuple } from './format';

export function optionIsCorrect(payload: ChoicePayload, option: ChoiceOption): boolean {
  const q = payload.question;
  switch (q.mode) {
    case 'value':
      return option.num !== undefined && BigInt(option.num) === evalValue(q.spec);
    case 'predicate':
      return option.num !== undefined && evalPred(BigInt(option.num), q.p);
    case 'factorization': {
      if (!option.factors) return false;
      const product = option.factors.reduce((acc, [p, e]) => acc * BigInt(p) ** BigInt(e), 1n);
      const bases = option.factors.map(([p]) => p);
      return (
        product === BigInt(q.n) &&
        option.factors.every(([p, e]) => isPrimeBrute(BigInt(p)) && e >= 1) &&
        new Set(bases).size === bases.length
      );
    }
    case 'claim':
      return option.claim !== undefined && claimHolds(option.claim);
  }
}

export function checkItem(item: Item, response: Response): CheckResult {
  const p = item.payload;
  switch (p.kind) {
    case 'sort': {
      if (response.kind !== 'sort') return { correct: false };
      const yes = new Set(response.yes);
      const marks = p.numbers.map((n, i) => evalPred(BigInt(n), p.p) === yes.has(i));
      return { correct: marks.every(Boolean), marks };
    }
    case 'construct': {
      const all = enumerateFills(p.fixed, p.p);
      const solutions = all.map((fill) => fill.join(''));
      if (p.mode === 'all') {
        if (response.kind !== 'constructAll') return { correct: false, solutions };
        const want = new Set(all.map((f) => f[0]));
        const got = new Set(response.digits);
        const correct = want.size === got.size && [...want].every((d) => got.has(d));
        return { correct, solutions };
      }
      if (response.kind !== 'construct') return { correct: false, solutions };
      const correct = all.some((fill) => fill.length === response.digits.length && fill.every((d, i) => d === response.digits[i]));
      return { correct, solutions };
    }
    case 'refute': {
      if (response.kind !== 'refute') return { correct: false };
      const witness = findCounterexample(p.claim);
      const solutions = witness ? [formatTuple(witness, p.varNames)] : [];
      if (response.verdict === 'true') return { correct: witness === null, solutions };
      return { correct: isCounterexample(p.claim, response.counterexample), solutions };
    }
    case 'choice': {
      if (response.kind !== 'choice') return { correct: false };
      const option = p.options.find((o) => o.id === response.optionId);
      if (!option) return { correct: false };
      const correct = optionIsCorrect(p, option);
      return { correct, misconception: correct ? undefined : option.misconception };
    }
    case 'numeric': {
      if (response.kind !== 'numeric') return { correct: false };
      const value = parseWhole(response.value);
      if (value === null) return { correct: false, feedback: 'Enter a whole number.' };
      return { correct: value === evalValue(p.spec) };
    }
    case 'factor': {
      const solutions = [primeFactorsBrute(p.n).join(' × ')];
      if (response.kind !== 'factor' || response.primes.length === 0) return { correct: false, solutions };
      const product = response.primes.reduce((acc, q) => acc * BigInt(q), 1n);
      const allPrime = response.primes.every((q) => Number.isInteger(q) && isPrimeBrute(BigInt(q)));
      const feedback = !allPrime ? 'Some pieces can still be split.' : product !== BigInt(p.n) ? `Those primes multiply to ${product}, not ${p.n}.` : undefined;
      return { correct: allPrime && product === BigInt(p.n), solutions, feedback };
    }
    case 'rail': {
      if (response.kind !== 'rail') return { correct: false };
      const stop = p.stops[response.stop];
      return { correct: stop !== undefined && BigInt(stop.value) === evalValue(p.spec) };
    }
    case 'maze': {
      if (response.kind !== 'maze') return { correct: false };
      const path = response.path;
      const marks = path.map((c) => inGrid(p, c) && evalPred(BigInt(p.cells[c]), p.p));
      const walk =
        path.length > 0 &&
        path[0] === p.start &&
        path[path.length - 1] === p.end &&
        new Set(path).size === path.length &&
        path.every((c, i) => inGrid(p, c) && (i === 0 || mazeNeighbours(p, path[i - 1], c)));
      return {
        correct: walk && marks.every(Boolean),
        marks,
        feedback: walk ? undefined : 'A path has to run from the start square to the finish, one neighbouring square at a time.',
      };
    }
    case 'match': {
      if (response.kind !== 'match' || response.pairs.length !== p.left.length) return { correct: false };
      const marks = p.left.map((l, i) => {
        const r = p.right[response.pairs[i]];
        return r !== undefined && BigInt(r.value) === evalValue(l.spec);
      });
      return { correct: marks.every(Boolean), marks };
    }
  }
}

const inGrid = (p: MazePayload, c: number) => Number.isInteger(c) && c >= 0 && c < p.rows * p.cols && c < p.cells.length;

/** True when two squares share a side (up, down, left or right). */
export function mazeNeighbours(p: Pick<MazePayload, 'cols'>, a: number, b: number): boolean {
  const ra = Math.floor(a / p.cols);
  const rb = Math.floor(b / p.cols);
  const ca = a % p.cols;
  const cb = b % p.cols;
  return (ra === rb && Math.abs(ca - cb) === 1) || (ca === cb && Math.abs(ra - rb) === 1);
}

/**
 * A shortest valid path through the maze, found by breadth-first search over
 * the squares whose numbers pass the condition (tested by brute force), or
 * null if there is none.
 */
export function mazePathBrute(p: MazePayload): number[] | null {
  const ok = (c: number) => evalPred(BigInt(p.cells[c]), p.p);
  if (!ok(p.start) || !ok(p.end)) return null;
  const prev = new Map<number, number>([[p.start, -1]]);
  const queue = [p.start];
  while (queue.length) {
    const c = queue.shift() as number;
    if (c === p.end) {
      const path = [c];
      while (prev.get(path[0]) !== -1) path.unshift(prev.get(path[0]) as number);
      return path;
    }
    const r = Math.floor(c / p.cols);
    const k = c % p.cols;
    const next = [r > 0 ? c - p.cols : -1, r < p.rows - 1 ? c + p.cols : -1, k > 0 ? c - 1 : -1, k < p.cols - 1 ? c + 1 : -1];
    for (const n of next) {
      if (n >= 0 && !prev.has(n) && ok(n)) {
        prev.set(n, c);
        queue.push(n);
      }
    }
  }
  return null;
}

/** For each left card, the right card whose value it has (computed directly), or -1. */
export function matchSolution(p: MatchPayload): number[] {
  return p.left.map((l) => {
    const v = evalValue(l.spec);
    return p.right.findIndex((r) => BigInt(r.value) === v);
  });
}

/** Prime factors of n with repetition, smallest first, by trial division. */
export function primeFactorsBrute(n: number): number[] {
  const out: number[] = [];
  let m = n;
  for (let q = 2; q * q <= m; q++) {
    while (m % q === 0) {
      out.push(q);
      m /= q;
    }
  }
  if (m > 1) out.push(m);
  return out;
}

/** The correct answer, computed independently, in display form. */
export function correctAnswerText(item: Item): string {
  const p = item.payload;
  switch (p.kind) {
    case 'numeric':
      return evalValue(p.spec).toString();
    case 'choice': {
      const right = p.options.find((o) => optionIsCorrect(p, o));
      return right ? right.label : '';
    }
    case 'refute': {
      const w = findCounterexample(p.claim);
      return w ? `False. Counterexample: ${formatTuple(w, p.varNames)}` : 'Always true';
    }
    case 'construct': {
      const all = enumerateFills(p.fixed, p.p);
      if (p.mode === 'all') return all.map((f) => f[0]).join(', ');
      return all.length > 0 ? all[0].join('') : '';
    }
    case 'sort':
      return p.numbers.filter((n) => evalPred(BigInt(n), p.p)).join(', ');
    case 'factor':
      return primeFactorsBrute(p.n).join(' × ');
    case 'rail': {
      const v = evalValue(p.spec);
      return p.stops.find((s) => BigInt(s.value) === v)?.label ?? v.toString();
    }
    case 'maze': {
      const path = mazePathBrute(p);
      return path ? path.map((c) => fmt(p.cells[c])).join(' → ') : '';
    }
    case 'match': {
      const sol = matchSolution(p);
      return p.left.map((l, i) => `${l.label} → ${p.right[sol[i]]?.label ?? evalValue(l.spec).toString()}`).join(', ');
    }
  }
}

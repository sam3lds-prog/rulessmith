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
import type { CheckResult, ChoiceOption, ChoicePayload, Item, Response } from './types';
import { formatTuple } from './format';

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
  }
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
  }
}

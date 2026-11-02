/**
 * Generator helpers. These use the shortcut rules the app teaches (digit sums,
 * last digits, alternating sums), which is how generators reason about items and
 * write explanations. The checker never calls into this file.
 */
import type { Rng } from './rng';
import type { NumPredicate } from './types';

export const digitSum = (s: string) => [...s].reduce((a, c) => a + Number(c), 0);

/** Alternating sum from the right: d0 − d1 + d2 − … */
export function alternatingSum(s: string): number {
  let total = 0;
  const digits = [...s].reverse();
  digits.forEach((c, i) => (total += i % 2 === 0 ? Number(c) : -Number(c)));
  return total;
}

const tail = (s: string, k: number) => Number(s.slice(-k));

export function ruleDiv(s: string, d: number): boolean {
  switch (d) {
    case 1:
      return true;
    case 2:
      return tail(s, 1) % 2 === 0;
    case 3:
      return digitSum(s) % 3 === 0;
    case 4:
      return tail(s, 2) % 4 === 0;
    case 5:
      return tail(s, 1) === 0 || tail(s, 1) === 5;
    case 6:
      return ruleDiv(s, 2) && ruleDiv(s, 3);
    case 8:
      return tail(s, 3) % 8 === 0;
    case 9:
      return digitSum(s) % 9 === 0;
    case 10:
      return tail(s, 1) === 0;
    case 11:
      return alternatingSum(s) % 11 === 0;
    case 12:
      return ruleDiv(s, 3) && ruleDiv(s, 4);
    case 15:
      return ruleDiv(s, 3) && ruleDiv(s, 5);
    case 18:
      return ruleDiv(s, 2) && ruleDiv(s, 9);
    case 20:
      return ruleDiv(s, 4) && ruleDiv(s, 5);
    case 24:
      return ruleDiv(s, 3) && ruleDiv(s, 8);
    case 25:
      return tail(s, 2) % 25 === 0;
    case 36:
      return ruleDiv(s, 4) && ruleDiv(s, 9);
    case 45:
      return ruleDiv(s, 5) && ruleDiv(s, 9);
    case 72:
      return ruleDiv(s, 8) && ruleDiv(s, 9);
    default:
      return BigInt(s) % BigInt(d) === 0n;
  }
}

export function isPrimeSmall(n: number): boolean {
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
  return true;
}

export const PRIMES_UNDER_100 = Array.from({ length: 100 }, (_, i) => i).filter(isPrimeSmall);

export function ruleEval(s: string, p: NumPredicate): boolean {
  switch (p.op) {
    case 'div':
      return ruleDiv(s, p.d);
    case 'rem':
      return Number(BigInt(s) % BigInt(p.d)) === p.r;
    case 'prime':
      return isPrimeSmall(Number(s));
    case 'square': {
      const r = Math.round(Math.sqrt(Number(s)));
      return r * r === Number(s);
    }
    case 'nDivisors':
      return divisorCountFromFactors(factorize(Number(s))) === p.k;
    case 'not':
      return !ruleEval(s, p.p);
    case 'and':
      return p.ps.every((q) => ruleEval(s, q));
    case 'or':
      return p.ps.some((q) => ruleEval(s, q));
  }
}

/** Prime factorization as [prime, exponent] pairs, ascending. */
export function factorize(n: number): [number, number][] {
  const out: [number, number][] = [];
  let m = n;
  for (let p = 2; p * p <= m; p++) {
    let e = 0;
    while (m % p === 0) {
      m /= p;
      e++;
    }
    if (e > 0) out.push([p, e]);
  }
  if (m > 1) out.push([m, 1]);
  return out;
}

/** The exponent formula: (e1 + 1)(e2 + 1)… */
export const divisorCountFromFactors = (f: [number, number][]) => f.reduce((acc, [, e]) => acc * (e + 1), 1);

export const productOf = (f: [number, number][]) => f.reduce((acc, [p, e]) => acc * p ** e, 1);

/** A random number with exactly `len` digits (no leading zero). */
export function randNum(rng: Rng, len: number): string {
  let s = String(rng.int(1, 9));
  for (let i = 1; i < len; i++) s += String(rng.int(0, 9));
  return s;
}

/** Digit-count range for a difficulty level (number-size knob). */
export function digitsFor(level: number): [number, number] {
  const table: [number, number][] = [
    [2, 3], [3, 3], [3, 4], [4, 4], [4, 5], [5, 5], [5, 6], [6, 6], [6, 7], [7, 8],
  ];
  return table[Math.min(Math.max(level, 1), 10) - 1];
}

export function lenFor(rng: Rng, level: number): number {
  const [lo, hi] = digitsFor(level);
  return rng.int(lo, hi);
}

/** Rejection-sample a number of the given length matching `test`. */
export function sampleWhere(rng: Rng, len: number, test: (s: string) => boolean, tries = 4000): string {
  for (let i = 0; i < tries; i++) {
    const s = randNum(rng, len);
    if (test(s)) return s;
  }
  throw new Error(`sampleWhere: nothing found for length ${len}`);
}

/** Pick `count` distinct values from a generator function. */
export function distinct(rng: Rng, count: number, make: () => string, tries = 500): string[] {
  const seen = new Set<string>();
  for (let i = 0; i < tries && seen.size < count; i++) seen.add(make());
  if (seen.size < count) throw new Error('distinct(): could not find enough values');
  return [...seen];
}

/**
 * How v1 of the app decided support: the rule was shown openly up to this
 * level. Kept only to read old saved data (state/migrate.ts). Support is now
 * set per slot (engine/mixer.ts supportFor), independent of level.
 */
export const LENS_OPEN_MAX_LEVEL = 4;

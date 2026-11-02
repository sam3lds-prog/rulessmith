/**
 * Independent checker primitives.
 *
 * Everything here is deliberately naive: trial division, stepping through
 * multiples, enumerating digit fills, BigInt powers. None of it uses the
 * shortcut rules the learner is being taught (digit sums, exponent formulas,
 * cycles), so a bug in a generator's rule-based reasoning cannot hide behind
 * the same bug in the checker.
 */
import type { Claim, Cond, Expr, NumPredicate, ValueSpec } from './types';

export function mod(a: bigint, d: bigint): bigint {
  const r = a % d;
  return r < 0n ? r + d : r;
}

export function isPrimeBrute(n: bigint): boolean {
  if (n < 2n) return false;
  for (let i = 2n; i * i <= n; i++) if (n % i === 0n) return false;
  return true;
}

export function isPerfectPowerBrute(n: bigint, power: 2 | 3): boolean {
  if (n < 0n) return false;
  let i = 0n;
  const p = BigInt(power);
  while (i ** p < n) i++;
  return i ** p === n;
}

export function divisorCountBrute(n: bigint): number {
  if (n < 1n) return 0;
  let count = 0;
  for (let i = 1n; i * i <= n; i++) {
    if (n % i === 0n) count += i * i === n ? 1 : 2;
  }
  return count;
}

export function evalPred(n: bigint, p: NumPredicate): boolean {
  switch (p.op) {
    case 'div':
      return mod(n, BigInt(p.d)) === 0n;
    case 'rem':
      return mod(n, BigInt(p.d)) === BigInt(p.r);
    case 'prime':
      return isPrimeBrute(n);
    case 'square':
      return isPerfectPowerBrute(n, 2);
    case 'nDivisors':
      return divisorCountBrute(n) === p.k;
    case 'not':
      return !evalPred(n, p.p);
    case 'and':
      return p.ps.every((q) => evalPred(n, q));
    case 'or':
      return p.ps.some((q) => evalPred(n, q));
  }
}

export function evalExpr(e: Expr, a: bigint, b: bigint): bigint {
  switch (e.op) {
    case 'var':
      return e.v === 'a' ? a : b;
    case 'const':
      return BigInt(e.c);
    case 'add':
      return evalExpr(e.l, a, b) + evalExpr(e.r, a, b);
    case 'sub':
      return evalExpr(e.l, a, b) - evalExpr(e.r, a, b);
    case 'mul':
      return evalExpr(e.l, a, b) * evalExpr(e.r, a, b);
    case 'sq': {
      const v = evalExpr(e.e, a, b);
      return v * v;
    }
  }
}

const condHolds = (c: Cond, a: bigint, b: bigint) => evalPred(evalExpr(c.expr, a, b), c.pred);

export function isCounterexample(claim: Claim, tuple: number[]): boolean {
  const [lo, hi] = claim.domain;
  if (tuple.length !== claim.vars) return false;
  if (tuple.some((x) => !Number.isInteger(x) || x < lo || x > hi)) return false;
  const a = BigInt(tuple[0]);
  const b = BigInt(tuple[1] ?? 0);
  return claim.given.every((c) => condHolds(c, a, b)) && !claim.then.every((c) => condHolds(c, a, b));
}

/** First counterexample in the domain, or null if the claim holds everywhere. */
export function findCounterexample(claim: Claim): number[] | null {
  const [lo, hi] = claim.domain;
  for (let a = lo; a <= hi; a++) {
    if (claim.vars === 1) {
      if (isCounterexample(claim, [a])) return [a];
    } else {
      for (let b = lo; b <= hi; b++) if (isCounterexample(claim, [a, b])) return [a, b];
    }
  }
  return null;
}

export const claimHolds = (claim: Claim) => findCounterexample(claim) === null;

/** Every way to fill the blanks with digits (no leading zero) that satisfies p. */
export function enumerateFills(fixed: (number | null)[], p: NumPredicate): number[][] {
  const blanks = fixed.map((d, i) => (d === null ? i : -1)).filter((i) => i >= 0);
  const out: number[][] = [];
  const total = 10 ** blanks.length;
  for (let k = 0; k < total; k++) {
    const fill = blanks.map((_, j) => Math.floor(k / 10 ** (blanks.length - 1 - j)) % 10);
    const digits = fixed.map((d) => d as number);
    blanks.forEach((pos, j) => (digits[pos] = fill[j]));
    if (digits[0] === 0 && digits.length > 1) continue;
    if (evalPred(BigInt(digits.join('')), p)) out.push(fill);
  }
  return out;
}

function gcdBrute(a: number, b: number): number {
  for (let i = Math.min(a, b); i >= 1; i--) if (a % i === 0 && b % i === 0) return i;
  return 1;
}

function lcmBrute(a: number, b: number): number {
  for (let m = a; ; m += a) if (m % b === 0) return m;
}

function primeFactorsBrute(n: number): number[] {
  const out: number[] = [];
  for (let p = 2; p <= n; p++) {
    if (n % p === 0 && isPrimeBrute(BigInt(p))) out.push(p);
  }
  return out;
}

const COMBOS: Record<string, (a: bigint, b: bigint) => bigint> = {
  sum: (a, b) => a + b,
  difference: (a, b) => a - b,
  product: (a, b) => a * b,
  aSquared: (a) => a * a,
  sumOfSquares: (a, b) => a * a + b * b,
};

export function evalValue(spec: ValueSpec): bigint {
  switch (spec.op) {
    case 'remainder':
      return mod(BigInt(spec.n), BigInt(spec.d));
    case 'powMod':
      return mod(BigInt(spec.base) ** BigInt(spec.exp), BigInt(spec.d));
    case 'productOfPowersMod':
      return mod(
        spec.terms.reduce((acc, [base, exp]) => acc * BigInt(base) ** BigInt(exp), 1n),
        BigInt(spec.d),
      );
    case 'factorCount': {
      let count = 0;
      for (let i = 1; i <= spec.n; i++) if (spec.n % i === 0) count++;
      return BigInt(count);
    }
    case 'gcd':
      return BigInt(gcdBrute(spec.a, spec.b));
    case 'lcm':
      return BigInt(lcmBrute(spec.a, spec.b));
    case 'largestPrimeFactor': {
      const f = primeFactorsBrute(spec.n);
      return BigInt(f[f.length - 1]);
    }
    case 'smallestPrimeFactor':
      return BigInt(primeFactorsBrute(spec.n)[0]);
    case 'distinctPrimeCount':
      return BigInt(primeFactorsBrute(spec.n).length);
    case 'distinctPrimeSum':
      return BigInt(primeFactorsBrute(spec.n).reduce((a, b) => a + b, 0));
    case 'trailingZeros': {
      let n = BigInt(spec.n);
      let z = 0;
      while (n > 0n && n % 10n === 0n) {
        n /= 10n;
        z++;
      }
      return BigInt(z);
    }
    case 'smallestMultiplierToPower': {
      for (let k = 1; ; k++) if (isPerfectPowerBrute(BigInt(spec.n * k), spec.power)) return BigInt(k);
    }
    case 'smallest': {
      for (let n = spec.from; n <= spec.to; n++) if (evalPred(BigInt(n), spec.p)) return BigInt(n);
      throw new Error('smallest(): no value in range');
    }
    case 'count': {
      let c = 0;
      for (let n = spec.from; n <= spec.to; n++) if (evalPred(BigInt(n), spec.p)) c++;
      return BigInt(c);
    }
    case 'countFills':
      return BigInt(enumerateFills(spec.fixed, spec.p).length);
    case 'comboRemainder': {
      // Try many concrete pairs with the stated remainders; the answer must not depend on the pair.
      const d = BigInt(spec.d);
      const fn = COMBOS[spec.combo];
      let seen: bigint | null = null;
      for (let i = 0; i < 12; i++) {
        for (let j = 0; j < 12; j++) {
          const a = BigInt(spec.ra) + d * BigInt(i + 1);
          const b = BigInt(spec.rb) + d * BigInt(j + 2);
          const r = mod(fn(a, b), d);
          if (seen === null) seen = r;
          else if (seen !== r) throw new Error('comboRemainder(): remainder is not determined');
        }
      }
      return seen as bigint;
    }
    case 'shortfall': {
      for (let k = 0; ; k++) if ((spec.n + k) % spec.d === 0) return BigInt(k);
    }
  }
}

/** Parse a learner's typed number. Returns null for anything that is not a whole number. */
export function parseWhole(text: string): bigint | null {
  const cleaned = text.replace(/[,\s]/g, '');
  if (!/^-?\d+$/.test(cleaned)) return null;
  return BigInt(cleaned);
}

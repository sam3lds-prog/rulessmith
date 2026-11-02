/**
 * Track 2: Primes and factors. Five micro-skills, three item families each.
 */
import {
  A,
  add,
  B,
  type ClaimBankEntry,
  claim1,
  div,
  type Distractor,
  k,
  makeChoice,
  makeNumeric,
  makeRefute,
  makeSort,
  nearValues,
  rem,
  sq,
} from '../builders';
import { factorLabel, fmt, sup } from '../format';
import { digitSum, divisorCountFromFactors, factorize, isPrimeSmall, productOf } from '../numbers';
import type { Rng } from '../rng';
import type { Claim, NumPredicate, Template } from '../types';

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Random factorization sized by level. Returns ascending [prime, exponent] pairs. */
function randomFactorization(rng: Rng, level: number, maxN: number): [number, number][] {
  const pools: { primes: number[]; count: [number, number]; exp: [number, number] }[] = [
    { primes: [2, 3, 5], count: [2, 2], exp: [1, 2] },
    { primes: [2, 3, 5, 7], count: [2, 3], exp: [1, 3] },
    { primes: [2, 3, 5, 7, 11, 13], count: [3, 3], exp: [1, 3] },
  ];
  const pool = pools[level <= 3 ? 0 : level <= 6 ? 1 : 2];
  for (let tries = 0; tries < 500; tries++) {
    const primes = rng.shuffle(pool.primes).slice(0, rng.int(pool.count[0], pool.count[1])).sort((a, b) => a - b);
    const f = primes.map((p) => [p, rng.int(pool.exp[0], pool.exp[1])] as [number, number]);
    const n = productOf(f);
    if (n <= maxN && n >= 12) return f;
  }
  return [
    [2, 2],
    [3, 1],
  ];
}

// ================================================================ pf.primes

const PR_LENS = 'A prime has exactly two factors: 1 and itself. To test n, divide by each prime up to √n. If none divides it, n is prime.';

function primeRange(level: number): [number, number] {
  if (level <= 2) return [2, 60];
  if (level <= 4) return [2, 150];
  if (level <= 6) return [100, 400];
  if (level <= 8) return [200, 1000];
  return [1000, 3000];
}

const smallestFactor = (n: number) => {
  for (let p = 2; p * p <= n; p++) if (n % p === 0) return p;
  return n;
};

const primesSort: Template = {
  id: 'pf.primes/sort',
  skillId: 'pf.primes',
  board: 'sort',
  version: 1,
  generate: ({ rng, level }) => {
    const [lo, hi] = primeRange(level);
    return makeSort({
      rng,
      level,
      p: { op: 'prime' },
      prompt: 'Sort each number: prime or not?',
      yesLabel: 'Prime',
      noLabel: 'Not prime',
      lens: PR_LENS,
      hints: ['Knock out the easy ones: even numbers, numbers ending in 5, digit sums divisible by 3.', 'For the rest, try 7, 11 and 13.'],
      why: (s) => {
        const n = Number(s);
        const f = smallestFactor(n);
        return f === n ? 'prime' : `${f} × ${n / f}`;
      },
      nearMiss: (s) => {
        const n = Number(s);
        return n % 2 === 1 && n % 5 !== 0 && digitSum(s) % 3 !== 0 && !isPrimeSmall(n);
      },
      sample: (r, test) => {
        for (let i = 0; i < 4000; i++) {
          const s = String(r.int(lo, hi));
          if (test(s)) return s;
        }
        throw new Error('primesSort: sample failed');
      },
    });
  },
};

const PRIME_CLAIMS: ClaimBankEntry[] = [
  {
    text: 'Every odd number greater than 1 is prime.',
    claim: claim1([rem(2, 1)], [{ op: 'prime' }], [3, 2000]),
    isTrue: false,
    why: 'Odd numbers can still have odd factors, like 3 × 3.',
  },
  {
    text: 'n² + n + 41 is prime for every whole number n.',
    claim: { vars: 1, given: [], then: [{ expr: add(add(sq(A), A), k(41)), pred: { op: 'prime' } }], domain: [0, 60] },
    isTrue: false,
    why: 'It works for a long run of values, which is exactly why examples alone never prove a rule. At n = 40 it gives 41².',
  },
  {
    text: 'Every prime greater than 3 is 1 more or 1 less than a multiple of 6.',
    claim: claim1([{ op: 'prime' }], [{ op: 'or', ps: [rem(6, 1), rem(6, 5)] }], [5, 2000]),
    isTrue: true,
    why: 'Any other remainder by 6 (0, 2, 3, 4) makes the number divisible by 2 or 3.',
  },
  {
    text: 'If p is prime, then p + 2 is prime.',
    claim: { vars: 1, given: [{ expr: A, pred: { op: 'prime' } }], then: [{ expr: add(A, k(2)), pred: { op: 'prime' } }], domain: [2, 2000] },
    isTrue: false,
    why: 'Twin primes exist, but most primes are not followed by another prime two steps later.',
  },
  {
    text: 'Every number that ends in 1 is prime.',
    claim: claim1([rem(10, 1)], [{ op: 'prime' }], [2, 2000]),
    isTrue: false,
    why: 'The last digit only rules out factors of 2 and 5.',
  },
  {
    text: 'Every prime number is odd.',
    claim: claim1([{ op: 'prime' }], [rem(2, 1)], [1, 2000]),
    isTrue: false,
    why: '2 is prime and even. It is the only even prime.',
  },
  {
    text: 'If a number has exactly 3 factors, it is a perfect square.',
    claim: claim1([{ op: 'nDivisors', k: 3 }], [{ op: 'square' }], [1, 2000]),
    isTrue: true,
    why: 'Factors pair up (d with n ÷ d). An odd count means one factor pairs with itself, so n is a square.',
  },
  {
    text: 'The sum of two odd primes is never prime.',
    claim: {
      vars: 2,
      given: [
        { expr: A, pred: { op: 'and', ps: [{ op: 'prime' }, rem(2, 1)] } },
        { expr: B, pred: { op: 'and', ps: [{ op: 'prime' }, rem(2, 1)] } },
      ],
      then: [{ expr: add(A, B), pred: { op: 'not', p: { op: 'prime' } } }],
      domain: [3, 120],
    },
    isTrue: true,
    why: 'Two odd numbers add to an even number bigger than 2, and the only even prime is 2.',
  },
];

const primesRefute: Template = {
  id: 'pf.primes/refute',
  skillId: 'pf.primes',
  board: 'refute',
  version: 1,
  generate: ({ rng }) => {
    const entry = rng.pick(PRIME_CLAIMS);
    return makeRefute({
      rng,
      entry,
      varNames: entry.claim.vars === 2 ? ['a', 'b'] : entry.text.includes('p ') ? ['p'] : ['n'],
      lens: PR_LENS,
      hints: ['Try the smallest cases first, including 2.', 'One counterexample is enough to break a claim.'],
    });
  },
};

const PRIME_POOLS = [
  [2, 3, 5],
  [7, 11, 13],
  [13, 17, 19, 23],
];

const primesTransfer: Template = {
  id: 'pf.primes/rows',
  skillId: 'pf.primes',
  board: 'numeric',
  transfer: true,
  version: 1,
  generate: ({ rng, level }) => {
    const pool = PRIME_POOLS[level <= 3 ? 0 : level <= 6 ? 1 : 2];
    const p = rng.pick(pool);
    const qs = Array.from({ length: 40 }, (_, i) => p + i).filter((q) => isPrimeSmall(q) && q >= p);
    const q = rng.pick(qs.slice(0, 6));
    const n = p * q;
    return makeNumeric({
      prompt: `A gardener plants ${n} seedlings in equal rows, with more than one row and more than one seedling in each row. What is the fewest number of rows possible?`,
      spec: { op: 'smallestPrimeFactor', n },
      answer: p,
      lens: PR_LENS,
      hints: ['The number of rows must be a factor of the total.', 'Fewest rows means the smallest factor bigger than 1.'],
      explanation: `${n} = ${p} × ${q}, and no smaller number than ${p} divides ${n}. So the fewest rows is ${p}, with ${q} seedlings in each.`,
      unit: 'rows',
    });
  },
};

// ================================================================ pf.factorize

const FZ_LENS = 'Divide out the smallest prime again and again (2, then 3, 5, 7, 11…) until 1 is left. Every number has exactly one prime factorization.';

const nextPrime = (p: number) => {
  for (let q = p + 1; ; q++) if (isPrimeSmall(q)) return q;
};

function factorizationDistractors(rng: Rng, f: [number, number][]): Distractor[] {
  const out: Distractor[] = [];
  const clone = () => f.map(([p, e]) => [p, e] as [number, number]);

  // Composite base: same product, but a non-prime appears.
  const withSquare = f.findIndex(([, e]) => e >= 2);
  if (withSquare >= 0) {
    const g = clone();
    const [p, e] = g[withSquare];
    const rest = g.filter((_, i) => i !== withSquare);
    const parts: [number, number][] = e % 2 === 0 ? [[p * p, e / 2]] : [[p, 1], [p * p, (e - 1) / 2]];
    const factors = [...parts, ...rest];
    out.push({ label: factorLabel(factors), factors, misconception: 'composite-base' });
  } else if (f.length >= 2) {
    const [[p1, e1], [p2], ...rest] = clone();
    const factors: [number, number][] = [[p1 * p2, 1], ...(e1 > 1 ? [[p1, e1 - 1] as [number, number]] : []), ...rest];
    out.push({ label: factorLabel(factors), factors, misconception: 'composite-base' });
  }

  // Exponent slip.
  {
    const g = clone();
    const i = rng.int(0, g.length - 1);
    g[i] = [g[i][0], g[i][1] > 1 && rng.chance(0.5) ? g[i][1] - 1 : g[i][1] + 1];
    out.push({ label: factorLabel(g), factors: g, misconception: 'exponent-slip' });
  }

  // Dropped factor.
  if (f.length >= 2) {
    const g = clone();
    g.splice(rng.int(0, g.length - 1), 1);
    out.push({ label: factorLabel(g), factors: g, misconception: 'dropped-factor' });
  }

  // Wrong prime.
  {
    const g = clone();
    const i = g.length - 1;
    const q = nextPrime(g[i][0]);
    if (!g.some(([p]) => p === q)) {
      g[i] = [q, g[i][1]];
      out.push({ label: factorLabel(g), factors: g, misconception: 'wrong-prime' });
    }
  }
  // Keep bases ascending so the order of a label never gives the answer away.
  return out.map((d) => {
    const factors = [...(d.factors ?? [])].sort((x, y) => x[0] - y[0]);
    return { ...d, factors, label: factorLabel(factors) };
  });
}

const factorizeChoice: Template = {
  id: 'pf.factorize/choose',
  skillId: 'pf.factorize',
  board: 'choice',
  version: 1,
  generate: ({ rng, level }) => {
    const f = randomFactorization(rng, level, level <= 3 ? 225 : level <= 6 ? 5000 : 60000);
    const n = productOf(f);
    return makeChoice({
      rng,
      prompt: `Which is the prime factorization of ${fmt(n)}?`,
      question: { mode: 'factorization', n },
      correct: { label: factorLabel(f), factors: f },
      distractors: factorizationDistractors(rng, f),
      lens: FZ_LENS,
      hints: ['Check that every base is prime.', 'Multiply each option out and compare with the number.'],
      explanation: `${fmt(n)} = ${factorLabel(f)}. Every base is prime and the product matches. Watch for options that multiply out correctly but use a non-prime like 4 or 6.`,
    });
  },
};

const factorizeNumeric: Template = {
  id: 'pf.factorize/largest',
  skillId: 'pf.factorize',
  board: 'numeric',
  version: 1,
  generate: ({ rng, level }) => {
    const f = randomFactorization(rng, level, level <= 3 ? 225 : level <= 6 ? 5000 : 60000);
    const n = productOf(f);
    if (level <= 5) {
      const largest = f[f.length - 1][0];
      return makeNumeric({
        prompt: `What is the largest prime factor of ${fmt(n)}?`,
        spec: { op: 'largestPrimeFactor', n },
        answer: largest,
        lens: FZ_LENS,
        hints: ['Divide out small primes first.', 'What is left when you can divide no further?'],
        explanation: `${fmt(n)} = ${factorLabel(f)}, so the largest prime factor is ${largest}.`,
      });
    }
    const sum = f.reduce((a, [p]) => a + p, 0);
    return makeNumeric({
      prompt: `What is the sum of the different prime factors of ${fmt(n)}?`,
      spec: { op: 'distinctPrimeSum', n },
      answer: sum,
      lens: FZ_LENS,
      hints: ['Find the prime factorization first.', 'Add each different prime once, ignoring exponents.'],
      explanation: `${fmt(n)} = ${factorLabel(f)}. The different primes are ${f.map(([p]) => p).join(', ')}, which add to ${sum}.`,
    });
  },
};

const factorizeZeros: Template = {
  id: 'pf.factorize/trailing-zeros',
  skillId: 'pf.factorize',
  board: 'numeric',
  transfer: true,
  version: 1,
  generate: ({ rng, level }) => {
    const hard = level >= 7;
    const twoBase = hard ? rng.pick([2, 4, 8]) : 2;
    const fiveBase = hard ? rng.pick([5, 25]) : 5;
    const twoExp = rng.int(1, hard ? 6 : 5);
    const fiveExp = rng.int(1, hard ? 5 : 5);
    const extra: [number, number][] = level >= 4 ? [[rng.pick([3, 7]), rng.int(1, 4)]] : [];
    const terms: [number, number][] = [[twoBase, twoExp], [fiveBase, fiveExp], ...extra].sort((a, b) => a[0] - b[0]) as [number, number][];
    const twos = twoExp * Math.round(Math.log2(twoBase));
    const fives = fiveExp * (fiveBase === 25 ? 2 : 1);
    const zeros = Math.min(twos, fives);
    const n = terms.reduce((acc, [b, e]) => acc * BigInt(b) ** BigInt(e), 1n).toString();
    const label = terms.map(([b, e]) => `${b}${sup(e)}`).join(' × ');
    return makeNumeric({
      prompt: `N = ${label}. How many zeros does N end with?`,
      spec: { op: 'trailingZeros', n },
      answer: zeros,
      lens: 'Each zero at the end of a number comes from one factor of 10 = 2 × 5.',
      hints: ['Count the factors of 2 and the factors of 5 in N.', 'Each zero needs one 2 and one 5. Which runs out first?'],
      explanation: `N has ${twos} factor${twos === 1 ? '' : 's'} of 2 and ${fives} factor${fives === 1 ? '' : 's'} of 5. Each trailing zero uses one of each, so N ends in ${zeros} zero${zeros === 1 ? '' : 's'}.${extra.length ? ' The other primes do not help.' : ''}`,
    });
  },
};

// ================================================================ pf.divisor-count

const DC_LENS = 'Write n = p^a × q^b × … Then n has (a + 1)(b + 1)… factors, counting 1 and n.';

const expString = (f: [number, number][]) => f.map(([, e]) => `(${e} + 1)`).join(' × ');

const divisorNumeric: Template = {
  id: 'pf.divisor-count/count',
  skillId: 'pf.divisor-count',
  board: 'numeric',
  version: 1,
  generate: ({ rng, level }) => {
    const f = randomFactorization(rng, level, level <= 3 ? 100 : level <= 6 ? 1000 : 50000);
    const n = productOf(f);
    const count = divisorCountFromFactors(f);
    return makeNumeric({
      prompt: `How many positive factors does ${fmt(n)} have?`,
      spec: { op: 'factorCount', n },
      answer: count,
      lens: DC_LENS,
      hints: ['Start with the prime factorization.', 'Add 1 to each exponent, then multiply.'],
      explanation: `${fmt(n)} = ${factorLabel(f)}, so it has ${expString(f)} = ${count} factors.`,
    });
  },
};

const divisorChoice: Template = {
  id: 'pf.divisor-count/choose',
  skillId: 'pf.divisor-count',
  board: 'choice',
  version: 1,
  generate: ({ rng, level }) => {
    const f = randomFactorization(rng, level, level <= 3 ? 100 : level <= 6 ? 1000 : 50000);
    const n = productOf(f);
    const count = divisorCountFromFactors(f);
    const exps = f.map(([, e]) => e);
    return makeChoice({
      rng,
      prompt: `${fmt(n)} = ${factorLabel(f)}. How many positive factors does it have?`,
      question: { mode: 'value', spec: { op: 'factorCount', n } },
      correct: { label: String(count), num: String(count) },
      distractors: nearValues(count, [
        { value: exps.reduce((a, e) => a * e, 1), misconception: 'forgot-plus-one' },
        { value: exps.reduce((a, e) => a + e + 1, 0), misconception: 'added-instead-of-multiplied' },
        { value: count - 2, misconception: 'excluded-1-and-n' },
        { value: exps.reduce((a, e) => a + e, 0), misconception: 'exponent-sum' },
      ]),
      lens: DC_LENS,
      hints: ['Every factor picks some power of each prime, from 0 up to its exponent.', 'Multiply the number of choices for each prime.'],
      explanation: `Each factor chooses a power of each prime: ${f.map(([p, e]) => `${e + 1} choices for ${p}`).join(', ')}. That gives ${expString(f)} = ${count}.`,
    });
  },
};

const divisorTransfer: Template = {
  id: 'pf.divisor-count/arrangements',
  skillId: 'pf.divisor-count',
  board: 'numeric',
  transfer: true,
  version: 1,
  generate: ({ rng, level }) => {
    const f = randomFactorization(rng, level, level <= 3 ? 100 : level <= 6 ? 600 : 5000);
    const n = productOf(f);
    const count = divisorCountFromFactors(f);
    return makeNumeric({
      prompt: `${fmt(n)} chairs are set out in a rectangle: some number of rows, each with the same number of chairs, using every chair. How many different rectangles are possible? (3 rows of 4 and 4 rows of 3 count as different.)`,
      spec: { op: 'factorCount', n },
      answer: count,
      lens: DC_LENS,
      hints: ['Each choice of the number of rows is a factor of the total.', 'So count the factors.'],
      explanation: `Every factor of ${fmt(n)} gives one choice of rows. ${fmt(n)} = ${factorLabel(f)} has ${expString(f)} = ${count} factors, so there are ${count} rectangles.`,
      unit: 'rectangles',
    });
  },
};

// ================================================================ pf.gcd-lcm

const GL_LENS =
  'GCD: the primes both numbers share, each to the smaller power. LCM: every prime that appears, each to the larger power. And GCD × LCM = a × b.';

function gcdPair(rng: Rng, level: number) {
  const [gLo, gHi, xLo, xHi] = level <= 3 ? [2, 6, 1, 5] : level <= 6 ? [4, 15, 2, 9] : [6, 30, 3, 15];
  for (let i = 0; i < 500; i++) {
    const g = rng.int(gLo, gHi);
    const x = rng.int(xLo, xHi);
    const y = rng.int(xLo, xHi);
    if (x !== y && gcd(x, y) === 1) {
      const a = g * x;
      const b = g * y;
      return { a, b, g, l: g * x * y };
    }
  }
  return { a: 12, b: 18, g: 6, l: 36 };
}

const gcdNumeric: Template = {
  id: 'pf.gcd-lcm/compute',
  skillId: 'pf.gcd-lcm',
  board: 'numeric',
  version: 1,
  generate: ({ rng, level }) => {
    const { a, b, g, l } = gcdPair(rng, level);
    const want = rng.chance(0.5) ? 'gcd' : 'lcm';
    const fa = factorLabel(factorize(a));
    const fb = factorLabel(factorize(b));
    return want === 'gcd'
      ? makeNumeric({
          prompt: `What is the greatest common divisor of ${a} and ${b}?`,
          spec: { op: 'gcd', a, b },
          answer: g,
          lens: GL_LENS,
          hints: [`${a} = ${fa} and ${b} = ${fb}.`, 'Keep only the primes both share, at the smaller power.'],
          explanation: `${a} = ${fa}, ${b} = ${fb}. The shared part is ${g}.`,
        })
      : makeNumeric({
          prompt: `What is the least common multiple of ${a} and ${b}?`,
          spec: { op: 'lcm', a, b },
          answer: l,
          lens: GL_LENS,
          hints: [`${a} = ${fa} and ${b} = ${fb}.`, 'Take every prime that appears, at the larger power.'],
          explanation: `${a} = ${fa}, ${b} = ${fb}. Every prime at its larger power gives ${l}. Check: ${g} × ${l} = ${a} × ${b}.`,
        });
  },
};

const gcdChoice: Template = {
  id: 'pf.gcd-lcm/choose',
  skillId: 'pf.gcd-lcm',
  board: 'choice',
  version: 1,
  generate: ({ rng, level }) => {
    const { a, b, g, l } = gcdPair(rng, level);
    const lcmQ = rng.chance(0.5);
    return lcmQ
      ? makeChoice({
          rng,
          prompt: `What is the least common multiple of ${a} and ${b}?`,
          question: { mode: 'value', spec: { op: 'lcm', a, b } },
          correct: { label: String(l), num: String(l) },
          distractors: nearValues(l, [
            { value: a * b, misconception: 'multiplied-instead-of-lcm' },
            { value: g, misconception: 'swapped-gcd-lcm' },
            { value: 2 * l, misconception: 'common-multiple-not-least' },
          ]),
          lens: GL_LENS,
          hints: ['Multiplying the two numbers gives a common multiple, but is it the least?', 'LCM = a × b ÷ GCD.'],
          explanation: `GCD(${a}, ${b}) = ${g}, so LCM = ${a} × ${b} ÷ ${g} = ${l}. ${a} × ${b} = ${a * b} is a common multiple but not the least.`,
        })
      : makeChoice({
          rng,
          prompt: `What is the greatest common divisor of ${a} and ${b}?`,
          question: { mode: 'value', spec: { op: 'gcd', a, b } },
          correct: { label: String(g), num: String(g) },
          distractors: nearValues(g, [
            { value: Math.min(a, b), misconception: 'smaller-number-is-gcd' },
            { value: l, misconception: 'swapped-gcd-lcm' },
            { value: 1, misconception: 'assumed-coprime' },
            { value: g / 2, misconception: 'common-divisor-not-greatest' },
          ]),
          lens: GL_LENS,
          hints: ['List the prime factors of each number.', 'Multiply the shared primes at the smaller power.'],
          explanation: `${a} = ${factorLabel(factorize(a))} and ${b} = ${factorLabel(factorize(b))}. They share ${factorLabel(factorize(g))} = ${g}.`,
        });
  },
};

const gcdTransfer: Template = {
  id: 'pf.gcd-lcm/context',
  skillId: 'pf.gcd-lcm',
  board: 'numeric',
  transfer: true,
  version: 1,
  generate: ({ rng, level }) => {
    if (rng.chance(0.5)) {
      const { a, b, l } = gcdPair(rng, Math.min(level, 6));
      return makeNumeric({
        prompt: `Two buses leave a station together at 8:00. One leaves every ${a} minutes and the other every ${b} minutes. How many minutes until they next leave together?`,
        spec: { op: 'lcm', a, b },
        answer: l,
        lens: GL_LENS,
        hints: ['They meet at times that are multiples of both intervals.', 'Find the least common multiple.'],
        explanation: `They leave together after a common multiple of ${a} and ${b}. The least one is ${l}, so ${l} minutes.`,
        unit: 'minutes',
      });
    }
    const { a, b, g } = gcdPair(rng, level);
    const x = a * 10;
    const y = b * 10;
    return makeNumeric({
      prompt: `A floor is ${x} cm by ${y} cm. What is the side length of the largest square tile that covers it exactly with whole tiles?`,
      spec: { op: 'gcd', a: x, b: y },
      answer: g * 10,
      lens: GL_LENS,
      hints: ['The tile side must divide both lengths.', 'Find the greatest common divisor.'],
      explanation: `The side must divide both ${x} and ${y}. Their greatest common divisor is ${g * 10}, so the tile is ${g * 10} cm.`,
      unit: 'cm',
    });
  },
};

// ================================================================ pf.powers

const SQ_LENS = 'In a perfect square every prime exponent is even. In a perfect cube every exponent is a multiple of 3.';

const powersMultiplier: Template = {
  id: 'pf.powers/multiplier',
  skillId: 'pf.powers',
  board: 'numeric',
  version: 1,
  generate: ({ rng, level }) => {
    const power: 2 | 3 = level >= 7 ? 3 : 2;
    for (let i = 0; i < 500; i++) {
      const f = randomFactorization(rng, Math.min(level, 6), power === 2 ? 5000 : 3000);
      const n = productOf(f);
      const need = f.map(([p, e]) => [p, (power - (e % power)) % power] as [number, number]).filter(([, e]) => e > 0);
      const kVal = productOf(need);
      if (kVal <= 1 || kVal > (power === 2 ? 210 : 900)) continue;
      const word = power === 2 ? 'perfect square' : 'perfect cube';
      return makeNumeric({
        prompt: `What is the smallest positive whole number k such that ${fmt(n)} × k is a ${word}?`,
        spec: { op: 'smallestMultiplierToPower', n, power },
        answer: kVal,
        lens: SQ_LENS,
        hints: [`${fmt(n)} = ${factorLabel(f)}.`, `Raise each exponent to the next multiple of ${power}.`],
        explanation: `${fmt(n)} = ${factorLabel(f)}. To make every exponent a multiple of ${power}, multiply by ${factorLabel(need)} = ${kVal}.`,
      });
    }
    throw new Error('powersMultiplier: no item');
  },
};

const powersSort: Template = {
  id: 'pf.powers/sort',
  skillId: 'pf.powers',
  board: 'sort',
  version: 1,
  generate: ({ rng, level }) => {
    const [lo, hi] = level <= 3 ? [1, 200] : level <= 6 ? [100, 2000] : [1000, 20000];
    const nearest = (n: number) => Math.round(Math.sqrt(n));
    return makeSort({
      rng,
      level,
      p: { op: 'square' },
      prompt: 'Sort each number: is it a perfect square?',
      yesLabel: 'Perfect square',
      noLabel: 'Not a square',
      lens: SQ_LENS + ' Squares never end in 2, 3, 7 or 8.',
      hints: ['A square never ends in 2, 3, 7 or 8.', 'Find the nearest square root and check.'],
      why: (s) => {
        const n = Number(s);
        const r = nearest(n);
        if (r * r === n) return `${r}²`;
        if ([2, 3, 7, 8].includes(n % 10)) return `ends in ${n % 10}`;
        const below = Math.floor(Math.sqrt(n));
        return `between ${below}² and ${below + 1}²`;
      },
      nearMiss: (s) => {
        const n = Number(s);
        const r = nearest(n);
        return Math.abs(n - r * r) <= 12 && [0, 1, 4, 5, 6, 9].includes(n % 10);
      },
      sample: (r, test) => {
        for (let i = 0; i < 6000; i++) {
          // Bias toward squares and near-squares so the sort is not trivially "no".
          const n = r.chance(0.5) ? r.int(lo, hi) : (() => {
            const root = r.int(Math.ceil(Math.sqrt(lo)), Math.floor(Math.sqrt(hi)));
            return root * root + r.int(-12, 12);
          })();
          if (n < lo || n > hi) continue;
          const s = String(n);
          if (test(s)) return s;
        }
        throw new Error('powersSort: sample failed');
      },
    });
  },
};

const SQUARE_CLAIMS: ClaimBankEntry[] = [
  {
    text: 'Every perfect square leaves a remainder of 0 or 1 when divided by 4.',
    claim: claim1([{ op: 'square' }], [{ op: 'or', ps: [rem(4, 0), rem(4, 1)] }]),
    isTrue: true,
    why: 'An even number squared is a multiple of 4; an odd number squared is 1 more than a multiple of 4.',
  },
  {
    text: 'If n² is divisible by 12, then n is divisible by 12.',
    claim: { vars: 1, given: [{ expr: sq(A), pred: div(12) }], then: [{ expr: A, pred: div(12) }], domain: [1, 2000] },
    isTrue: false,
    why: 'n only needs the factors 2 and 3; squaring supplies the second 2.',
  },
  {
    text: 'If n² is divisible by 4, then n is divisible by 4.',
    claim: { vars: 1, given: [{ expr: sq(A), pred: div(4) }], then: [{ expr: A, pred: div(4) }], domain: [1, 2000] },
    isTrue: false,
    why: 'n only needs one factor of 2; squaring doubles it.',
  },
  {
    text: 'If n² is divisible by 9, then n is divisible by 3.',
    claim: { vars: 1, given: [{ expr: sq(A), pred: div(9) }], then: [{ expr: A, pred: div(3) }], domain: [1, 2000] },
    isTrue: true,
    why: '3 is prime, so if 3 divides n × n it must divide n.',
  },
  {
    text: 'A perfect square never ends in the digit 7.',
    claim: claim1([{ op: 'square' }], [{ op: 'not', p: rem(10, 7) }]),
    isTrue: true,
    why: 'The last digit of n² depends only on the last digit of n, and 0² to 9² end in 0, 1, 4, 5, 6 or 9.',
  },
  {
    text: 'If n² is divisible by 8, then n is divisible by 8.',
    claim: { vars: 1, given: [{ expr: sq(A), pred: div(8) }], then: [{ expr: A, pred: div(8) }], domain: [1, 2000] },
    isTrue: false,
    why: 'n = 4 gives n² = 16, a multiple of 8, but 4 is not.',
  },
];

const powersRefute: Template = {
  id: 'pf.powers/refute',
  skillId: 'pf.powers',
  board: 'refute',
  transfer: true,
  version: 1,
  generate: ({ rng }) =>
    makeRefute({
      rng,
      entry: rng.pick(SQUARE_CLAIMS),
      varNames: ['n'],
      lens: SQ_LENS,
      hints: ['Squaring doubles every exponent in the prime factorization.', 'Try small values of n.'],
    }),
};

export const PRIMES_TEMPLATES: Template[] = [
  primesSort,
  primesRefute,
  primesTransfer,
  factorizeChoice,
  factorizeNumeric,
  factorizeZeros,
  divisorNumeric,
  divisorChoice,
  divisorTransfer,
  gcdNumeric,
  gcdChoice,
  gcdTransfer,
  powersMultiplier,
  powersSort,
  powersRefute,
];

export type { Claim, NumPredicate };

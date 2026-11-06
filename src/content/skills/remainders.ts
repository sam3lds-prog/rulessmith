/**
 * Track 3: Remainders. Five micro-skills, three item families each.
 */
import { and, makeChoice, makeConstruct, makeMatch, makeNumeric, nearValues, rem, retry } from '../builders';
import { describe, fmt, sup, WEEKDAYS } from '../format';
import { digitSum, randNum } from '../numbers';
import type { Rng } from '../rng';
import type { Combo, NumPredicate, Template } from '../types';

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const modn = (a: number, d: number) => ((a % d) + d) % d;

// ================================================================ rem.basics

const RB_LENS = 'n = divisor × quotient + remainder, and the remainder is always smaller than the divisor.';

function basicSizes(level: number): { n: [number, number]; d: [number, number] } {
  if (level <= 2) return { n: [10, 99], d: [2, 9] };
  if (level <= 4) return { n: [100, 999], d: [3, 12] };
  if (level <= 6) return { n: [1000, 9999], d: [7, 25] };
  return { n: [10000, 999999], d: [11, 60] };
}

const basicsNumeric: Template = {
  id: 'rem.basics/compute',
  skillId: 'rem.basics',
  board: 'numeric',
  version: 1,
  generate: ({ rng, level }) => {
    const s = basicSizes(level);
    const d = rng.int(s.d[0], s.d[1]);
    const n = rng.int(s.n[0], s.n[1]);
    const q = Math.floor(n / d);
    const r = n - q * d;
    return makeNumeric({
      prompt: `What is the remainder when ${fmt(n)} is divided by ${d}?`,
      spec: { op: 'remainder', n: String(n), d },
      answer: r,
      lens: RB_LENS,
      hints: [`Find the largest multiple of ${d} that is not more than ${fmt(n)}.`, 'The remainder is what is left over.'],
      explanation: `${fmt(n)} = ${d} × ${fmt(q)} + ${r}, so the remainder is ${r}.`,
    });
  },
};

const basicsChoice: Template = {
  id: 'rem.basics/choose',
  skillId: 'rem.basics',
  board: 'choice',
  version: 1,
  generate: ({ rng, level }) => {
    const s = basicSizes(level);
    const d = rng.int(Math.max(3, s.d[0]), s.d[1]);
    const r = rng.int(1, d - 1);
    const qLo = Math.ceil(s.n[0] / d);
    const qHi = Math.floor(s.n[1] / d) - 1;
    const q = () => rng.int(qLo, qHi);
    const right = d * q() + r;
    const p: NumPredicate = rem(d, r);
    return makeChoice({
      rng,
      prompt: `Which number leaves a remainder of ${r} when divided by ${d}?`,
      question: { mode: 'predicate', p },
      correct: { label: fmt(right), num: String(right) },
      distractors: [
        { num: String(d * q() + ((r + 1) % d)), misconception: 'off-by-one' },
        { num: String(d * q() + modn(r - 1, d)), misconception: 'off-by-one' },
        { num: String(d * q()), misconception: 'multiple-not-remainder' },
        { num: String(r * q() + (r > 1 ? r - 1 : 2)), misconception: 'quotient-confusion' },
      ].filter((x) => modn(Number(x.num), d) !== r),
      lens: RB_LENS,
      hints: [`Subtract ${r} from each option.`, `Is what is left a multiple of ${d}?`],
      explanation: `${fmt(right)} − ${r} = ${fmt(right - r)}, which is ${d} × ${fmt((right - r) / d)}. So ${fmt(right)} leaves remainder ${r}.`,
    });
  },
};

const basicsWeekday: Template = {
  id: 'rem.basics/weekday',
  skillId: 'rem.basics',
  board: 'choice',
  transfer: true,
  version: 1,
  generate: ({ rng, level }) => {
    const start = rng.int(0, 6);
    const n = level <= 3 ? rng.int(10, 60) : level <= 6 ? rng.int(100, 400) : rng.int(1000, 5000);
    const offset = n % 7;
    const day = (off: number) => WEEKDAYS[(start + off) % 7];
    const option = (off: number, misconception: string) => ({ label: day(off), num: String(off), misconception });
    return makeChoice({
      rng,
      prompt: `Today is ${WEEKDAYS[start]}. What day of the week will it be ${fmt(n)} days from now?`,
      question: { mode: 'value', spec: { op: 'remainder', n: String(n), d: 7 } },
      correct: { label: day(offset), num: String(offset) },
      distractors: [
        option((offset + 1) % 7, 'off-by-one'),
        option((offset + 6) % 7, 'off-by-one'),
        option(Math.floor(n / 7) % 7, 'used-quotient'),
        option((offset + 3) % 7, 'guess'),
      ],
      lens: 'The week repeats every 7 days, so only the remainder after dividing by 7 matters.',
      hints: ['Whole weeks bring you back to the same day.', `What is the remainder when ${fmt(n)} is divided by 7?`],
      explanation: `${fmt(n)} = 7 × ${fmt(Math.floor(n / 7))} + ${offset}. The whole weeks land on ${WEEKDAYS[start]} again, then ${offset} more day${offset === 1 ? '' : 's'} gives ${day(offset)}.`,
    });
  },
};

// ================================================================ rem.digit-rules

const RD_LENS =
  'Remainder by 9 (or 3) = remainder of the digit sum. By 10, 5 or 2: only the last digit matters. By 4 or 25: the last two digits. By 8: the last three.';

const bigLen = (rng: Rng, level: number) => (level <= 3 ? rng.int(5, 6) : level <= 6 ? rng.int(7, 9) : rng.int(10, 14));

const digitRulesSum: Template = {
  id: 'rem.digit-rules/digit-sum',
  skillId: 'rem.digit-rules',
  board: 'numeric',
  version: 1,
  generate: ({ rng, level }) => {
    const d = rng.pick([9, 3]);
    const n = randNum(rng, bigLen(rng, level));
    const S = digitSum(n);
    const r = S % d;
    return makeNumeric({
      prompt: `What is the remainder when ${fmt(n)} is divided by ${d}?`,
      spec: { op: 'remainder', n, d },
      answer: r,
      lens: RD_LENS,
      hints: ['You do not need long division.', `Add the digits, then divide that sum by ${d}.`],
      explanation: `The digits add to ${S}, and ${S} divided by ${d} leaves ${r}. A number and its digit sum always leave the same remainder by ${d}.`,
    });
  },
};

const digitRulesTail: Template = {
  id: 'rem.digit-rules/last-digits',
  skillId: 'rem.digit-rules',
  board: 'choice',
  version: 1,
  generate: ({ rng, level }) => {
    const d = level <= 3 ? rng.pick([10, 5]) : level <= 6 ? rng.pick([4, 25]) : rng.pick([8, 4, 25]);
    const kDigits = d === 8 ? 3 : d === 4 || d === 25 ? 2 : 1;
    const n = randNum(rng, bigLen(rng, level));
    const tail = Number(n.slice(-kDigits));
    const r = tail % d;
    return makeChoice({
      rng,
      prompt: `What is the remainder when ${fmt(n)} is divided by ${d}?`,
      question: { mode: 'value', spec: { op: 'remainder', n, d } },
      correct: { label: String(r), num: String(r) },
      distractors: nearValues(r, [
        { value: Number(n.slice(-1)) % d, misconception: 'used-only-last-digit' },
        { value: digitSum(n) % d, misconception: 'used-digit-sum' },
        { value: Number(n.slice(-2)) % d, misconception: 'used-too-few-digits' },
      ]).filter((x) => Number(x.num) < d),
      lens: RD_LENS,
      hints: [`Only the last ${kDigits === 1 ? 'digit matters' : `${kDigits} digits matter`} for ${d}.`, `Divide ${tail} by ${d}.`],
      explanation: `${kDigits === 1 ? '10' : kDigits === 2 ? '100' : '1,000'} is a multiple of ${d}, so everything before the last ${kDigits === 1 ? 'digit' : `${kDigits} digits`} leaves no remainder. ${tail} ÷ ${d} leaves ${r}.`,
    });
  },
};

const digitRulesRepeat: Template = {
  id: 'rem.digit-rules/repeated',
  skillId: 'rem.digit-rules',
  board: 'numeric',
  transfer: true,
  version: 1,
  generate: ({ rng, level }) => {
    const d = rng.pick([9, 3]);
    const block = level >= 7 ? rng.pick(['123', '45', '2026', '17']) : String(rng.int(1, 9));
    const count = rng.int(level <= 3 ? 10 : 20, level <= 3 ? 30 : 60);
    const n = block.repeat(count);
    const S = digitSum(block) * count;
    const r = S % d;
    const describeN =
      block.length === 1
        ? `the ${n.length}-digit number made of ${count} ${block}s (${block}${block}${block}…${block})`
        : `the number made by writing ${block} ${count} times in a row (${block}${block}…${block})`;
    return makeNumeric({
      prompt: `What is the remainder when ${describeN} is divided by ${d}?`,
      spec: { op: 'remainder', n, d },
      answer: r,
      lens: RD_LENS,
      hints: ['You cannot write this number out, but you can add its digits.', `Digit sum = (digits in one block) × ${count}.`],
      explanation: `Each ${block} contributes ${digitSum(block)} to the digit sum, so the total is ${digitSum(block)} × ${count} = ${S}. ${S} ÷ ${d} leaves ${r}.`,
    });
  },
};

// ================================================================ rem.arithmetic

const RA_LENS = 'Remainders follow the arithmetic: the remainder of a sum or product equals the remainder of the sum or product of the remainders.';

const COMBO_TEXT: Record<Combo, string> = {
  sum: 'a + b',
  difference: 'a − b',
  product: 'a × b',
  aSquared: 'a²',
  sumOfSquares: 'a² + b²',
};

function comboValue(combo: Combo, ra: number, rb: number) {
  switch (combo) {
    case 'sum':
      return ra + rb;
    case 'difference':
      return ra - rb;
    case 'product':
      return ra * rb;
    case 'aSquared':
      return ra * ra;
    case 'sumOfSquares':
      return ra * ra + rb * rb;
  }
}

function arithmeticSetup(rng: Rng, level: number) {
  const d = level <= 3 ? rng.int(5, 9) : level <= 6 ? rng.int(7, 13) : rng.int(11, 17);
  const combos: Combo[] = level <= 3 ? ['sum'] : level <= 6 ? ['sum', 'product', 'difference'] : ['product', 'aSquared', 'sumOfSquares'];
  const combo = rng.pick(combos);
  let ra = rng.int(1, d - 1);
  let rb = rng.int(1, d - 1);
  if (combo === 'difference' && ra < rb) [ra, rb] = [rb, ra];
  const raw = comboValue(combo, ra, rb);
  return { d, combo, ra, rb, raw, answer: modn(raw, d) };
}

const arithmeticNumeric: Template = {
  id: 'rem.arithmetic/compute',
  skillId: 'rem.arithmetic',
  board: 'numeric',
  version: 1,
  generate: ({ rng, level }) => {
    const { d, combo, ra, rb, raw, answer } = arithmeticSetup(rng, level);
    const bText = combo === 'aSquared' ? '' : `, and b leaves remainder ${rb}`;
    return makeNumeric({
      prompt: `When divided by ${d}, a leaves remainder ${ra}${bText}. What remainder does ${COMBO_TEXT[combo]} leave when divided by ${d}?`,
      spec: { op: 'comboRemainder', d, ra, rb, combo },
      answer,
      lens: RA_LENS,
      hints: ['Work with the remainders instead of a and b.', `Then reduce the result by ${d}.`],
      explanation: `Use the remainders: ${COMBO_TEXT[combo].replace(/a/g, String(ra)).replace(/b/g, String(rb))} = ${raw}, and ${raw} leaves ${answer} when divided by ${d}.`,
    });
  },
};

const arithmeticChoice: Template = {
  id: 'rem.arithmetic/choose',
  skillId: 'rem.arithmetic',
  board: 'choice',
  version: 1,
  generate: ({ rng, level }) => {
    const { d, combo, ra, rb, raw, answer } = arithmeticSetup(rng, level);
    const bText = combo === 'aSquared' ? '' : ` and b leaves remainder ${rb}`;
    return makeChoice({
      rng,
      prompt: `a leaves remainder ${ra} when divided by ${d}${bText}. What remainder does ${COMBO_TEXT[combo]} leave when divided by ${d}?`,
      question: { mode: 'value', spec: { op: 'comboRemainder', d, ra, rb, combo } },
      correct: { label: String(answer), num: String(answer) },
      distractors: nearValues(answer, [
        { value: raw, misconception: 'did-not-reduce' },
        { value: modn(ra + rb, d), misconception: 'added-instead-of-multiplied' },
        { value: modn(ra * rb, d), misconception: 'multiplied-instead-of-added' },
      ]).filter((x) => Number(x.num) < d * 3),
      lens: RA_LENS,
      hints: ['Replace a and b with their remainders.', 'A remainder must be smaller than the divisor.'],
      explanation: `With the remainders: ${raw}, which leaves ${answer} when divided by ${d}.`,
    });
  },
};

const arithmeticTransfer: Template = {
  id: 'rem.arithmetic/cards',
  skillId: 'rem.arithmetic',
  board: 'numeric',
  transfer: true,
  version: 1,
  generate: ({ rng, level }) => {
    const d = level <= 3 ? rng.int(5, 8) : rng.int(7, 12);
    const ra = rng.int(1, d - 1);
    const rb = rng.int(1, d - 1);
    const answer = (ra + rb) % d;
    return makeNumeric({
      prompt: `Box A's cards, dealt into piles of ${d}, leave ${ra} over. Box B's cards, dealt into piles of ${d}, leave ${rb} over. If all the cards are combined and dealt into piles of ${d}, how many are left over?`,
      spec: { op: 'comboRemainder', d, ra, rb, combo: 'sum' },
      answer,
      lens: RA_LENS,
      hints: ['The full piles from each box still make full piles.', `Combine the leftovers: ${ra} + ${rb}.`],
      explanation: `Only the leftovers matter: ${ra} + ${rb} = ${ra + rb}${ra + rb >= d ? `, which makes one more pile of ${d} with ${answer} over` : ''}. So ${answer} cards are left over.`,
      unit: 'cards',
    });
  },
};

/**
 * Remainder Rails: a token starts at stop 0 and moves n steps round a loop of d
 * stops. Complete loops change nothing, so it lands on n mod d.
 */
const basicsRail: Template = {
  id: 'rem.basics/rail',
  skillId: 'rem.basics',
  board: 'rail',
  version: 1,
  generate: ({ rng, level }) => {
    const d = level <= 2 ? rng.int(3, 6) : level <= 5 ? rng.int(5, 9) : rng.int(7, 12);
    const n = level <= 2 ? rng.int(d + 2, 40) : level <= 5 ? rng.int(40, 400) : rng.int(400, 99999);
    const q = Math.floor(n / d);
    const r = n % d;
    return {
      prompt: `A token starts at stop 0 on a loop of ${d} stops and moves ${fmt(n)} steps forward. Where does it land?`,
      ruleLens: 'Every complete loop brings the token back to where it started. Only the leftover steps move it: the remainder of steps ÷ stops.',
      hints: [`How many complete loops of ${d} fit in ${fmt(n)} steps?`, 'The leftover steps after those loops decide the stop.'],
      explanation: `${fmt(n)} = ${d} × ${fmt(q)} + ${r}. The ${fmt(q)} complete loops end back at stop 0, and the last ${r} step${r === 1 ? '' : 's'} reach stop ${r}.`,
      payload: {
        kind: 'rail',
        spec: { op: 'remainder', n: String(n), d },
        stops: Array.from({ length: d }, (_, i) => ({ label: String(i), value: i })),
        walk: `${fmt(n)} steps`,
        loop: d,
      },
      key: { kind: 'rail', stop: r },
    };
  },
};

/**
 * Match Up for remainders: pair each number with its remainder. The extra card
 * comes from a common slip: one number's quotient, or the distance up to the
 * next multiple.
 */
const basicsMatch: Template = {
  id: 'rem.basics/match',
  skillId: 'rem.basics',
  board: 'match',
  version: 1,
  generate: ({ rng, level }) =>
    retry(() => {
      const count = level <= 3 ? 3 : 4;
      const d = level <= 2 ? rng.int(5, 7) : level <= 5 ? rng.int(6, 9) : rng.int(8, 13);
      // Four divisions in a row: numbers stay at most four digits, so it's quick work, not long division.
      const [lo, hi] = level <= 3 ? [10, 99] : level <= 6 ? [100, 999] : [1000, 9999];
      const rs = rng.shuffle(Array.from({ length: d }, (_, i) => i)).slice(0, count);
      const cards: { n: number; q: number; r: number }[] = [];
      for (const r of rs) {
        const qlo = Math.max(2, Math.ceil((lo - r) / d));
        const qhi = Math.floor((hi - r) / d);
        if (qhi < qlo) return null;
        const q = rng.int(qlo, qhi);
        cards.push({ n: d * q + r, q, r });
      }
      const slips = rng.shuffle([
        ...cards.filter((c) => c.q < d).map((c) => ({ value: c.q, misconception: 'quotient-for-remainder', of: c })),
        ...cards.filter((c) => c.r > 0).map((c) => ({ value: d - c.r, misconception: 'distance-to-next-multiple', of: c })),
      ]);
      return makeMatch({
        rng,
        prompt: `Match each number with its remainder when divided by ${d}. One remainder card is left over.`,
        lens: RB_LENS,
        hints: [`Find the largest multiple of ${d} that fits in each number.`, `The remainder is what's left over, and it's always less than ${d}. It isn't the quotient.`],
        left: cards.map((c) => ({ label: fmt(c.n), spec: { op: 'remainder', n: String(c.n), d }, value: c.r })),
        decoys: slips,
        leftTitle: 'Number',
        rightTitle: `Remainder after ÷ ${d}`,
        explain: (decoy) => {
          const of = (decoy as (typeof slips)[number]).of;
          const why =
            decoy.misconception === 'quotient-for-remainder'
              ? `it's the quotient of ${fmt(of.n)} ÷ ${d}, not a remainder`
              : `it's how far ${fmt(of.n)} is from the next multiple of ${d}, not what's left over`;
          return `${cards.map((c) => `${fmt(c.n)} = ${d} × ${fmt(c.q)} + ${c.r}`).join('. ')}. The extra card, ${decoy.value}, matches none of them: ${why}.`;
        },
      });
    }),
};

// ================================================================ rem.cycles

const RC_LENS = 'Units digits of powers repeat in short cycles. 7: 7, 9, 3, 1, then again. Divide the exponent by the cycle length and use the remainder.';

function cycleOf(base: number, d: number): number[] {
  const out: number[] = [];
  let v = modn(base, d);
  const first = v;
  do {
    out.push(v);
    v = modn(v * base, d);
  } while (v !== first && out.length < 40);
  return out;
}

const cycleText = (c: number[]) => c.join(', ');

function powerFromCycle(base: number, exp: number, d: number) {
  const c = cycleOf(base, d);
  const pos = (exp - 1) % c.length;
  return { c, pos, value: c[pos] };
}

/**
 * Remainder Rails, power cycles: the stops are the repeating units digits, and
 * the learner finds where a large power lands. An exponent divisible by the
 * cycle length lands on the last stop, never on a "zero" position.
 */
const cyclesRail: Template = {
  id: 'rem.cycles/rail',
  skillId: 'rem.cycles',
  board: 'rail',
  version: 1,
  generate: ({ rng, level }) => {
    const base = level <= 4 ? rng.pick([2, 3, 7, 8]) : rng.pick([2, 3, 7, 8, 12, 13, 17, 18, 22, 27]);
    const c = cycleOf(base, 10);
    // About a third of the time the exponent is a multiple of the cycle length: the trap the guide calls out.
    const span = level <= 3 ? [5, 24] : level <= 6 ? [25, 99] : [100, 999];
    let exp = rng.int(span[0], span[1]);
    if (rng.chance(0.35)) exp = Math.max(c.length, exp - (exp % c.length));
    const pos = (exp - 1) % c.length;
    const value = c[pos];
    const mult = exp % c.length === 0;
    return {
      prompt: `Units digits of powers of ${base} go round a loop: ${c.join(', ')}. Which units digit does ${base}${sup(exp)} have?`,
      ruleLens: RC_LENS,
      hints: [
        `The loop has ${c.length} stops. Divide ${exp} by ${c.length}.`,
        'A remainder of 0 means the last stop in the loop, not a stop before the first.',
      ],
      explanation: `${exp} = ${c.length} × ${Math.floor(exp / c.length)} + ${exp % c.length}. ${mult ? `Remainder 0 means a whole number of loops, so ${base}${sup(exp)} lands on the last stop, ${value}.` : `Remainder ${exp % c.length} means stop ${exp % c.length} of the loop, so ${base}${sup(exp)} ends in ${value}.`}`,
      payload: {
        kind: 'rail',
        spec: { op: 'powMod', base, exp, d: 10 },
        stops: c.map((v, i) => ({ label: `${base}${sup(i + 1)} → ${v}`, value: v })),
        walk: `${base}${sup(exp)}`,
        loop: c.length,
      },
      key: { kind: 'rail', stop: pos },
    };
  },
};

/**
 * Match Up for power cycles: pair each power with its units digit. The extra
 * card is the neighbouring digit in one power's cycle: the off-by-one slip of
 * counting the exponent's remainder from the wrong place.
 */
const cyclesMatch: Template = {
  id: 'rem.cycles/match',
  skillId: 'rem.cycles',
  board: 'match',
  version: 1,
  generate: ({ rng, level }) =>
    retry(() => {
      const count = level <= 4 ? 3 : 4;
      const bases = level <= 4 ? [2, 3, 7, 8] : [2, 3, 4, 7, 8, 9, 12, 13, 17, 18];
      const span = level <= 3 ? [5, 24] : level <= 6 ? [25, 99] : [100, 999];
      const cards: { base: number; exp: number; c: number[]; value: number }[] = [];
      for (let tries = 0; cards.length < count && tries < 200; tries++) {
        const base = rng.pick(bases);
        const exp = rng.int(span[0], span[1]);
        const { c, value } = powerFromCycle(base, exp, 10);
        if (cards.some((x) => x.value === value || x.base === base)) continue;
        cards.push({ base, exp, c, value });
      }
      if (cards.length < count) return null;
      const slips = rng.shuffle(
        cards.flatMap((x) => {
          const L = x.c.length;
          const pos = (x.exp - 1) % L;
          return [x.c[(pos + 1) % L], x.c[(pos + L - 1) % L]].map((value) => ({ value, misconception: 'cycle-step-off', of: x }));
        }),
      );
      return makeMatch({
        rng,
        prompt: 'Match each power with its units digit. One card is left over.',
        lens: RC_LENS,
        hints: ['Write the cycle of units digits for each base: 7 goes 7, 9, 3, 1, then repeats.', 'Divide each exponent by its cycle length. A remainder of 0 means the last digit in the cycle.'],
        left: cards.map((x) => ({ label: `${x.base}${sup(x.exp)}`, spec: { op: 'powMod', base: x.base, exp: x.exp, d: 10 }, value: x.value })),
        decoys: slips,
        leftTitle: 'Power',
        rightTitle: 'Units digit',
        explain: (decoy) =>
          `${cards
            .map((x) => {
              const L = x.c.length;
              const r = x.exp % L;
              return `${x.base}${sup(x.exp)}: the cycle is ${cycleText(x.c)}, and ${x.exp} = ${L} × ${Math.floor(x.exp / L)} + ${r}, so ${r === 0 ? 'a whole number of cycles ends on the last digit' : `it's the ${ordinal(r)} digit in the cycle`}: ${x.value}`;
            })
            .join('. ')}. The extra card, ${decoy.value}, sits next to the right digit in the cycle of ${(decoy as (typeof slips)[number]).of.base}: it's what you get by counting one step too far or too short.`,
      });
    }),
};

const cyclesUnits: Template = {
  id: 'rem.cycles/units',
  skillId: 'rem.cycles',
  board: 'numeric',
  version: 1,
  generate: ({ rng, level }) => {
    const base = level <= 6 ? rng.pick([2, 3, 4, 7, 8, 9]) : rng.pick([13, 17, 27, 32, 48, 69, 74]);
    const exp = level <= 3 ? rng.int(5, 20) : level <= 6 ? rng.int(20, 99) : rng.int(50, 300);
    const { c, value } = powerFromCycle(base, exp, 10);
    return makeNumeric({
      prompt: `What is the units digit of ${base}${sup(exp)}?`,
      spec: { op: 'powMod', base, exp, d: 10 },
      answer: value,
      lens: RC_LENS,
      hints: [
        base >= 10 ? `Only the units digit of ${base} matters: ${base % 10}.` : `Write out the first few powers of ${base}.`,
        `The units digits cycle with length ${c.length}. Where does ${exp} land?`,
      ],
      explanation: `The units digits of powers of ${base} cycle ${cycleText(c)} (length ${c.length}). ${exp} leaves remainder ${exp % c.length === 0 ? `0, so take the last in the cycle` : exp % c.length} when divided by ${c.length}, giving ${value}.`,
    });
  },
};

const cyclesMod: Template = {
  id: 'rem.cycles/remainder',
  skillId: 'rem.cycles',
  board: 'choice',
  version: 1,
  generate: ({ rng, level }) => {
    const d = level <= 3 ? 5 : rng.pick([5, 7]);
    const bases = Array.from({ length: 12 }, (_, i) => i + 2).filter((b) => gcd(b, d) === 1 && b % d !== 1);
    const base = rng.pick(bases);
    const exp = level <= 3 ? rng.int(6, 30) : level <= 6 ? rng.int(30, 120) : rng.int(100, 500);
    const { c, value } = powerFromCycle(base, exp, d);
    return makeChoice({
      rng,
      prompt: `What is the remainder when ${base}${sup(exp)} is divided by ${d}?`,
      question: { mode: 'value', spec: { op: 'powMod', base, exp, d } },
      correct: { label: String(value), num: String(value) },
      distractors: nearValues(value, [
        { value: base % d, misconception: 'ignored-exponent' },
        { value: exp % d, misconception: 'used-exponent-remainder' },
        { value: c[exp % c.length], misconception: 'cycle-off-by-one' },
      ]).filter((x) => Number(x.num) < d),
      lens: RC_LENS.replace('Units digits', 'Remainders'),
      hints: [`Find the remainders of ${base}¹, ${base}², ${base}³ … divided by ${d}.`, `They repeat every ${c.length}. Where does ${exp} land?`],
      explanation: `Powers of ${base} leave remainders ${cycleText(c)} when divided by ${d}, repeating every ${c.length}. Position ${exp} in that cycle gives ${value}.`,
    });
  },
};

const cyclesProduct: Template = {
  id: 'rem.cycles/product',
  skillId: 'rem.cycles',
  board: 'numeric',
  transfer: true,
  version: 1,
  generate: ({ rng, level }) => {
    const b1 = rng.pick([2, 3, 7, 8]);
    const b2 = rng.pick([3, 7, 9, 4].filter((b) => b !== b1));
    const e1 = rng.int(level <= 3 ? 5 : 15, level <= 3 ? 20 : 99);
    const e2 = rng.int(level <= 3 ? 5 : 15, level <= 3 ? 20 : 99);
    const u1 = powerFromCycle(b1, e1, 10).value;
    const u2 = powerFromCycle(b2, e2, 10).value;
    const answer = (u1 * u2) % 10;
    return makeNumeric({
      prompt: `What is the units digit of ${b1}${sup(e1)} × ${b2}${sup(e2)}?`,
      spec: { op: 'productOfPowersMod', terms: [[b1, e1], [b2, e2]], d: 10 },
      answer,
      lens: RC_LENS,
      hints: ['Find the units digit of each power separately.', 'Then multiply those two digits and keep the units digit.'],
      explanation: `${b1}${sup(e1)} ends in ${u1} and ${b2}${sup(e2)} ends in ${u2}. ${u1} × ${u2} = ${u1 * u2}, which ends in ${answer}.`,
    });
  },
};

// ================================================================ rem.reverse

const RR_LENS = 'Numbers that leave remainder r when divided by d are r, r + d, r + 2d, … List one condition, then check the others.';

const COPRIME_SETS = [
  [3, 4],
  [3, 5],
  [4, 5],
  [5, 7],
  [4, 7],
  [3, 7],
  [5, 6],
];

function conditions(rng: Rng, count: 1 | 2 | 3) {
  const ds = count === 3 ? rng.pick([[3, 4, 5], [3, 5, 7], [4, 5, 7]]) : count === 2 ? rng.pick(COPRIME_SETS) : [rng.int(4, 12)];
  return ds.map((d) => ({ d, r: rng.int(0, d - 1) }));
}

const condText = (cs: { d: number; r: number }[]) =>
  cs.map(({ d, r }) => `remainder ${r} when divided by ${d}`).join(cs.length === 2 ? ' and ' : ', ');

const reverseSmallest: Template = {
  id: 'rem.reverse/smallest',
  skillId: 'rem.reverse',
  board: 'numeric',
  version: 1,
  generate: ({ rng, level }) => {
    if (level <= 3) {
      const [{ d, r }] = conditions(rng, 1);
      const floor = rng.int(20, 90);
      let n = floor + 1;
      while (n % d !== r) n++;
      return makeNumeric({
        prompt: `What is the smallest number greater than ${floor} that leaves a remainder of ${r} when divided by ${d}?`,
        spec: { op: 'smallest', p: rem(d, r), from: floor + 1, to: floor + d + 1 },
        answer: n,
        lens: RR_LENS,
        hints: [`Find the largest multiple of ${d} not above ${floor}.`, `Add ${r}, then step up by ${d} if needed.`],
        explanation: `${n} = ${d} × ${Math.floor(n / d)} + ${r}, and the one before it, ${n - d}, is not greater than ${floor}.`,
      });
    }
    const cs = conditions(rng, level <= 6 ? 2 : 3);
    const p = and(...cs.map(({ d, r }) => rem(d, r)));
    const lcm = cs.reduce((a, { d }) => (a * d) / gcd(a, d), 1);
    let n = 1;
    while (!cs.every(({ d, r }) => n % d === r)) n++;
    const first = cs[cs.length - 1];
    const list = Array.from({ length: 5 }, (_, i) => first.r + i * first.d).filter((x) => x > 0);
    return makeNumeric({
      prompt: `What is the smallest positive whole number that leaves ${condText(cs)}?`,
      spec: { op: 'smallest', p, from: 1, to: lcm },
      answer: n,
      lens: RR_LENS,
      hints: [`List numbers with remainder ${first.r} when divided by ${first.d}: ${list.join(', ')}, …`, 'Check each one against the other conditions.'],
      explanation: `Stepping through numbers with remainder ${first.r} by ${first.d}, the first that meets every condition is ${n}. The pattern repeats every ${lcm}.`,
    });
  },
};

const reverseCount: Template = {
  id: 'rem.reverse/count',
  skillId: 'rem.reverse',
  board: 'numeric',
  version: 1,
  generate: ({ rng, level }) => {
    const N = level <= 3 ? rng.int(40, 100) : level <= 6 ? rng.int(100, 500) : rng.int(500, 2000);
    if (level <= 6) {
      const d = rng.int(3, 12);
      const r = rng.int(0, d - 1);
      let count = 0;
      for (let n = 1; n <= N; n++) if (n % d === r) count++;
      const firstN = r === 0 ? d : r;
      return makeNumeric({
        prompt: `How many whole numbers from 1 to ${fmt(N)} leave a remainder of ${r} when divided by ${d}?`,
        spec: { op: 'count', p: rem(d, r), from: 1, to: N },
        answer: count,
        lens: RR_LENS,
        hints: [`The first one is ${firstN}. Then every ${d}th number after it.`, `How many steps of ${d} fit between ${firstN} and ${fmt(N)}?`],
        explanation: `They are ${firstN}, ${firstN + d}, ${firstN + 2 * d}, … up to the last one not above ${fmt(N)}. That is ${count} numbers.`,
      });
    }
    const cs = conditions(rng, 2);
    const p = and(...cs.map(({ d, r }) => rem(d, r)));
    let count = 0;
    for (let n = 1; n <= N; n++) if (cs.every(({ d, r }) => n % d === r)) count++;
    const lcm = cs[0].d * cs[1].d;
    return makeNumeric({
      prompt: `How many whole numbers from 1 to ${fmt(N)} leave ${condText(cs)}?`,
      spec: { op: 'count', p, from: 1, to: N },
      answer: count,
      lens: RR_LENS,
      hints: ['Find the smallest number that meets both conditions.', `The pattern repeats every ${lcm}.`],
      explanation: `Numbers meeting both conditions repeat every ${lcm}. Counting them up to ${fmt(N)} gives ${count}.`,
    });
  },
};

const reverseBuild: Template = {
  id: 'rem.reverse/build',
  skillId: 'rem.reverse',
  board: 'construct',
  transfer: true,
  version: 1,
  generate: ({ rng, level }) =>
    retry(() => {
      const cs = conditions(rng, 2);
      const p = and(...cs.map(({ d, r }) => rem(d, r)));
      const len = level <= 5 ? 3 : 4;
      return makeConstruct({
        fixed: Array.from({ length: len }, () => null),
        p,
        mode: 'one',
        prompt: `Build a ${len}-digit number that leaves ${condText(cs)}.`,
        lens: RR_LENS,
        hints: ['Find the smallest positive number that meets both conditions.', `Add multiples of ${cs[0].d * cs[1].d} until it has ${len} digits.`],
        explain: (sol) => `Any number that ${describe(p)} works, for example ${fmt(sol[0])}. There are ${sol.length} such ${len}-digit numbers.`,
      });
    }),
};

export const REMAINDER_TEMPLATES: Template[] = [
  basicsNumeric,
  basicsChoice,
  basicsWeekday,
  basicsRail,
  basicsMatch,
  digitRulesSum,
  digitRulesTail,
  digitRulesRepeat,
  arithmeticNumeric,
  arithmeticChoice,
  arithmeticTransfer,
  cyclesUnits,
  cyclesRail,
  cyclesMatch,
  cyclesMod,
  cyclesProduct,
  reverseSmallest,
  reverseCount,
  reverseBuild,
];

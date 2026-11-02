/**
 * Track 1: Divisibility. Eight micro-skills, three item families each.
 * The skill list is a working draft for the content reviewer (Phase 0 task).
 */
import {
  A,
  add,
  and,
  B,
  blank,
  claim1,
  fillIn,
  type ClaimBankEntry,
  div,
  makeChoice,
  makeConstruct,
  makeNumeric,
  makeRefute,
  makeSort,
  mul,
  notDiv,
  rem,
  retry,
  showWithBlanks,
  sub,
} from '../builders';
import { describe, fmt } from '../format';
import { alternatingSum, digitSum, lenFor, randNum, ruleDiv, ruleEval, sampleWhere } from '../numbers';
import type { Rng } from '../rng';
import type { Claim, Cond, NumPredicate, Template } from '../types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const last = (s: string) => Number(s.slice(-1));

// ================================================================ div.last-digit

const LD_LENS = 'Divisible by 2: the last digit is even. By 5: the last digit is 0 or 5. By 10: the last digit is 0.';
const LD_HINTS = [
  'Only the last digit decides divisibility by 2, 5 and 10.',
  'Cover every digit except the last one, then test that digit against the rule.',
];

function lastDigitTarget(rng: Rng, level: number): NumPredicate {
  if (level <= 3) return div(rng.pick([2, 5, 10]));
  if (level <= 6) return rng.pick([and(div(5), notDiv(10)), and(div(2), notDiv(10)), div(10)]);
  return rng.pick([and(div(5), notDiv(2)), and(div(2), notDiv(5)), and(div(5), notDiv(10))]);
}

const lastDigitSort: Template = {
  id: 'div.last-digit/sort',
  skillId: 'div.last-digit',
  board: 'sort',
  version: 1,
  generate: ({ rng, level }) => {
    const p = lastDigitTarget(rng, level);
    return makeSort({
      rng,
      level,
      p,
      prompt: `Sort each number: is it ${describe(p)}?`,
      yesLabel: cap(describe(p)),
      noLabel: 'No',
      lens: LD_LENS,
      hints: LD_HINTS,
      why: (s) => `ends in ${last(s)}`,
      nearMiss: (s) => ruleDiv(s, 2) || ruleDiv(s, 5),
    });
  },
};

const lastDigitConstruct: Template = {
  id: 'div.last-digit/construct',
  skillId: 'div.last-digit',
  board: 'construct',
  version: 1,
  generate: ({ rng, level }) =>
    retry(() => {
      const p = lastDigitTarget(rng, level);
      const s = randNum(rng, lenFor(rng, level));
      const middleBlank = level >= 9 && rng.chance(0.5);
      const pos = middleBlank ? rng.int(1, s.length - 2) : s.length - 1;
      const fixed = blank(s, [pos]);
      const mode = level >= 6 ? 'all' : 'one';
      return makeConstruct({
        fixed,
        p,
        mode,
        prompt:
          mode === 'all'
            ? `Select every digit that can fill the blank in ${showWithBlanks(fixed)} so the number is ${describe(p)}.`
            : `Fill the blank so ${showWithBlanks(fixed)} is ${describe(p)}.`,
        lens: LD_LENS,
        hints: middleBlank
          ? ['Which digit actually decides this rule?', 'If the blank is not the last digit, does it change anything?']
          : LD_HINTS,
        explain: (sol) =>
          middleBlank
            ? `Only the last digit matters here, so the blank can be anything: ${sol.length === 10 ? 'all ten digits work' : sol.join(', ')}.`
            : `To be ${describe(p)}, the last digit can be ${sol.join(', ')}.`,
      });
    }),
};

const lastDigitTransfer: Template = {
  id: 'div.last-digit/context',
  skillId: 'div.last-digit',
  board: 'choice',
  transfer: true,
  version: 1,
  generate: ({ rng, level }) => {
    const len = lenFor(rng, Math.max(level, 2));
    const ending = (digits: number[]) => {
      const head = randNum(rng, len - 1);
      return head + String(rng.pick(digits));
    };
    const scenes = [
      {
        p: and(div(5), notDiv(10)),
        prompt:
          'Pens are packed in boxes of 5 with none left over, but the same order cannot be packed in boxes of 10 without leftovers. Which order size fits?',
        right: () => ending([5]),
        wrong: [
          { make: () => ending([0]), misconception: 'ends-in-zero-also-fits' },
          { make: () => ending([2, 4, 6, 8]), misconception: 'even-means-divisible-by-5' },
          { make: () => ending([1, 3, 7, 9]), misconception: 'guess' },
        ],
        why: 'Fives need a last digit of 0 or 5; tens need 0. Only a number ending in 5 passes the first test and fails the second.',
      },
      {
        p: and(div(2), notDiv(10)),
        prompt:
          'Chairs are set out in rows of 2 with none left over, but they cannot be set out in rows of 10 with none left over. How many chairs could there be?',
        right: () => ending([2, 4, 6, 8]),
        wrong: [
          { make: () => ending([0]), misconception: 'ends-in-zero-also-fits' },
          { make: () => ending([5]), misconception: 'five-means-even' },
          { make: () => ending([1, 3, 7, 9]), misconception: 'guess' },
        ],
        why: 'Twos need an even last digit; tens need 0. So the last digit must be 2, 4, 6 or 8.',
      },
      {
        p: div(10),
        prompt: 'Coins are wrapped in rolls of 10 with none left over. Which number of coins works?',
        right: () => ending([0]),
        wrong: [
          { make: () => ending([5]), misconception: 'five-is-enough-for-ten' },
          { make: () => ending([2, 4, 6, 8]), misconception: 'even-is-enough-for-ten' },
          { make: () => ending([1, 3]), misconception: 'guess' },
        ],
        why: 'A multiple of 10 always ends in 0.',
      },
    ];
    const scene = level <= 3 ? scenes[2] : rng.pick(scenes.slice(0, 2));
    const right = scene.right();
    return makeChoice({
      rng,
      prompt: scene.prompt,
      question: { mode: 'predicate', p: scene.p },
      correct: { label: fmt(right), num: right },
      distractors: scene.wrong.map((w) => {
        const n = w.make();
        return { num: n, misconception: w.misconception };
      }),
      hints: ['Turn the story into a divisibility test.', 'Which last digits pass the first test but fail the second?'],
      explanation: `${fmt(right)} works. ${scene.why}`,
    });
  },
};

// ================================================================ div.digit-sum

const DS_LENS = 'Divisible by 3: the digits add to a multiple of 3. By 9: the digits add to a multiple of 9.';

function digitSumTarget(rng: Rng, level: number): NumPredicate {
  if (level <= 6) return div(rng.pick([3, 9]));
  return rng.pick([div(9), and(div(3), notDiv(9))]);
}

const knownSum = (fixed: (number | null)[]) => fixed.reduce<number>((a, d) => a + (d ?? 0), 0);

const digitSumSort: Template = {
  id: 'div.digit-sum/sort',
  skillId: 'div.digit-sum',
  board: 'sort',
  version: 1,
  generate: ({ rng, level }) => {
    const p = digitSumTarget(rng, level);
    const nineTarget = JSON.stringify(p).includes('"d":9');
    return makeSort({
      rng,
      level,
      p,
      prompt: `Sort each number: is it ${describe(p)}?`,
      yesLabel: cap(describe(p)),
      noLabel: 'No',
      lens: DS_LENS,
      hints: ['Add the digits of each number.', 'Compare each digit sum with the multiples of 3 (3, 6, 9, 12…) or 9 (9, 18, 27…).'],
      why: (s) => `digits add to ${digitSum(s)}`,
      nearMiss: nineTarget ? (s) => ruleDiv(s, 3) : (s) => [3, 6, 9].includes(last(s)),
    });
  },
};

const digitSumConstruct: Template = {
  id: 'div.digit-sum/construct',
  skillId: 'div.digit-sum',
  board: 'construct',
  version: 1,
  generate: ({ rng, level }) =>
    retry(() => {
      const p = digitSumTarget(rng, level);
      const s = randNum(rng, Math.max(3, lenFor(rng, level)));
      const twoBlanks = level >= 9;
      const positions = twoBlanks
        ? rng.shuffle(Array.from({ length: s.length - 1 }, (_, i) => i + 1)).slice(0, 2)
        : [rng.int(1, s.length - 1)];
      const fixed = blank(s, positions);
      const mode = level >= 7 && !twoBlanks ? 'all' : 'one';
      const S = knownSum(fixed);
      return makeConstruct({
        fixed,
        p,
        mode,
        prompt:
          mode === 'all'
            ? `Select every digit that can fill the blank in ${showWithBlanks(fixed)} so the number is ${describe(p)}.`
            : `Fill the ${twoBlanks ? 'blanks' : 'blank'} so ${showWithBlanks(fixed)} is ${describe(p)}.`,
        lens: DS_LENS,
        hints: [`The digits you can see add to ${S}.`, 'What must the blank add so the total hits the next multiple?'],
        explain: (sol) =>
          twoBlanks
            ? `The known digits add to ${S}, so the two blanks must bring the total to a multiple that passes the test. One answer is ${fillIn(fixed, sol[0])}; there are ${sol.length} ways in all.`
            : `The known digits add to ${S}. The blank digits that work are ${sol.join(', ')}.`,
      });
    }),
};

const digitSumCount: Template = {
  id: 'div.digit-sum/count',
  skillId: 'div.digit-sum',
  board: 'numeric',
  transfer: true,
  version: 1,
  generate: ({ rng, level }) => {
    const p = digitSumTarget(rng, level);
    const s = randNum(rng, Math.max(3, lenFor(rng, level)));
    const fixed = blank(s, [rng.int(1, s.length - 1)]);
    const works = Array.from({ length: 10 }, (_, d) => d).filter((d) =>
      ruleEval(fixed.map((x) => (x === null ? d : x)).join(''), p),
    );
    return makeNumeric({
      prompt: `How many different digits could fill the blank so that ${showWithBlanks(fixed)} is ${describe(p)}?`,
      spec: { op: 'countFills', fixed, p },
      answer: works.length,
      lens: DS_LENS,
      hints: [`The visible digits add to ${knownSum(fixed)}.`, 'List each digit 0 to 9 that brings the total to a multiple, then count them.'],
      explanation: `The visible digits add to ${knownSum(fixed)}. The digits that work are ${works.length ? works.join(', ') : 'none'}, so the answer is ${works.length}.`,
    });
  },
};

/** Claims that separate "divisible by 3" from "divisible by 9" (Rule Breaker, the Gatehouse chapter). */
const DIGIT_SUM_CLAIMS: ClaimBankEntry[] = [
  {
    text: 'Every multiple of 3 is a multiple of 9.',
    claim: claim1([div(3)], [div(9)]),
    isTrue: false,
    why: 'A digit sum can be a multiple of 3 without being a multiple of 9: 12 has digit sum 3.',
  },
  {
    text: 'Every multiple of 9 is a multiple of 3.',
    claim: claim1([div(9)], [div(3)]),
    isTrue: true,
    why: '9 = 3 × 3, so whatever 9 divides, 3 divides too. A digit sum that is a multiple of 9 is also a multiple of 3.',
  },
  {
    text: 'Every multiple of 6 is a multiple of 9.',
    claim: claim1([div(6)], [div(9)]),
    isTrue: false,
    why: '6 needs a digit sum that is a multiple of 3 and an even number; that is not enough for 9.',
  },
  {
    text: 'If a number is divisible by 9, it is divisible by 6.',
    claim: claim1([div(9)], [div(6)]),
    isTrue: false,
    why: '6 also needs the number to be even, and an odd multiple of 9 like 9 or 27 is not.',
  },
  {
    text: 'Every number divisible by 3 and by 9 is divisible by 27.',
    claim: claim1([div(3), div(9)], [div(27)]),
    isTrue: false,
    why: 'The digit-sum test stops at 9: 18 passes both tests but is not a multiple of 27.',
  },
];

const digitSumRefute: Template = {
  id: 'div.digit-sum/refute',
  skillId: 'div.digit-sum',
  board: 'refute',
  version: 1,
  generate: ({ rng, level }) =>
    makeRefute({
      rng,
      // The first three claims are the core 3-versus-9 contrast; harder levels add 6 and 27.
      entry: rng.pick(level <= 3 ? DIGIT_SUM_CLAIMS.slice(0, 3) : DIGIT_SUM_CLAIMS),
      varNames: ['n'],
      lens: DS_LENS,
      hints: ['Try small multiples first: 3, 6, 9, 12…', 'One number that meets the "if" part but not the "then" part breaks the claim.'],
    }),
};

// ================================================================ div.last-two

const LT_LENS = 'Divisible by 4: the last two digits form a multiple of 4. By 8: the last three digits form a multiple of 8.';

function lastTwoTarget(rng: Rng, level: number): { p: NumPredicate; k: number } {
  if (level <= 4) return { p: div(4), k: 2 };
  if (level <= 7) return rng.chance(0.5) ? { p: div(4), k: 2 } : { p: div(8), k: 3 };
  return rng.chance(0.5) ? { p: div(8), k: 3 } : { p: and(div(4), notDiv(8)), k: 3 };
}

const lastTwoSort: Template = {
  id: 'div.last-two/sort',
  skillId: 'div.last-two',
  board: 'sort',
  version: 1,
  generate: ({ rng, level }) => {
    const { p, k } = lastTwoTarget(rng, level);
    return makeSort({
      rng,
      level,
      p,
      prompt: `Sort each number: is it ${describe(p)}?`,
      yesLabel: cap(describe(p)),
      noLabel: 'No',
      lens: LT_LENS,
      hints: [`Look only at the last ${k === 2 ? 'two' : 'three'} digits.`, 'Is that small number a multiple of the divisor?'],
      why: (s) => `ends in ${s.slice(-k)}`,
      nearMiss: k === 2 ? (s) => ruleDiv(s, 2) : (s) => ruleDiv(s, 4),
      len: (r) => Math.max(k + 1, lenFor(r, level)),
    });
  },
};

const lastTwoConstruct: Template = {
  id: 'div.last-two/construct',
  skillId: 'div.last-two',
  board: 'construct',
  version: 1,
  generate: ({ rng, level }) =>
    retry(() => {
      const { p, k } = lastTwoTarget(rng, level);
      const s = randNum(rng, Math.max(k + 1, lenFor(rng, level)));
      const pos = s.length - rng.int(1, k);
      const fixed = blank(s, [pos]);
      const mode = level >= 6 ? 'all' : 'one';
      return makeConstruct({
        fixed,
        p,
        mode,
        prompt:
          mode === 'all'
            ? `Select every digit that can fill the blank in ${showWithBlanks(fixed)} so the number is ${describe(p)}.`
            : `Fill the blank so ${showWithBlanks(fixed)} is ${describe(p)}.`,
        lens: LT_LENS,
        hints: [`Only the last ${k === 2 ? 'two' : 'three'} digits matter.`, 'Try each digit in the blank and test the small number at the end.'],
        explain: (sol) => `With the last ${k === 2 ? 'two' : 'three'} digits in view, the blank can be ${sol.join(', ')}.`,
      });
    }),
};

const mod100In = (multipleOf: number): NumPredicate => ({
  op: 'or',
  ps: Array.from({ length: Math.ceil(100 / multipleOf) }, (_, i) => rem(100, i * multipleOf)).filter(
    (q) => q.op === 'rem' && q.r < 100,
  ),
});

const LAST_TWO_CLAIMS: ClaimBankEntry[] = [
  {
    text: 'If the last digit of a number is divisible by 4, the number is divisible by 4.',
    claim: claim1([{ op: 'or', ps: [rem(10, 0), rem(10, 4), rem(10, 8)] }], [div(4)]),
    isTrue: false,
    why: 'The rule for 4 needs the last two digits, not just the last one.',
  },
  {
    text: 'If the last two digits of a number form a multiple of 4, the number is divisible by 4.',
    claim: claim1([mod100In(4)], [div(4)]),
    isTrue: true,
    why: '100 is a multiple of 4, so everything before the last two digits is already a multiple of 4.',
  },
  {
    text: 'Every number divisible by 4 is divisible by 8.',
    claim: claim1([div(4)], [div(8)]),
    isTrue: false,
    why: 'Being a multiple of 4 gives only two factors of 2; 8 needs three.',
  },
  {
    text: 'Every number divisible by 8 is divisible by 4.',
    claim: claim1([div(8)], [div(4)]),
    isTrue: true,
    why: '8 = 4 × 2, so every multiple of 8 is a multiple of 4.',
  },
  {
    text: 'If the last two digits of a number form a multiple of 8, the number is divisible by 8.',
    claim: claim1([mod100In(8)], [div(8)]),
    isTrue: false,
    why: '100 is not a multiple of 8, so the rule for 8 needs the last three digits.',
  },
];

const lastTwoRefute: Template = {
  id: 'div.last-two/refute',
  skillId: 'div.last-two',
  board: 'refute',
  transfer: true,
  version: 1,
  generate: ({ rng }) =>
    makeRefute({
      rng,
      entry: rng.pick(LAST_TWO_CLAIMS),
      varNames: ['n'],
      lens: LT_LENS,
      hints: ['Test the claim on small numbers first.', 'A single number that meets the "if" but not the "then" breaks the claim.'],
    }),
};

// ================================================================ div.two-rules (6, 15, 18)

function twoRulesTarget(level: number): { d: number; parts: [number, number]; lens: string } {
  if (level <= 4) return { d: 6, parts: [2, 3], lens: '6 = 2 × 3: the number must pass the rule for 2 and the rule for 3.' };
  if (level <= 7) return { d: 15, parts: [3, 5], lens: '15 = 3 × 5: the number must pass the rule for 3 and the rule for 5.' };
  return { d: 18, parts: [2, 9], lens: '18 = 2 × 9: the number must pass the rule for 2 and the rule for 9.' };
}

const passMarks = (s: string, parts: number[]) =>
  parts.map((q) => `${q} ${ruleDiv(s, q) ? '✓' : '✗'}`).join(', ');

const twoRulesSort: Template = {
  id: 'div.two-rules/sort',
  skillId: 'div.two-rules',
  board: 'sort',
  version: 1,
  generate: ({ rng, level }) => {
    const t = twoRulesTarget(level);
    return makeSort({
      rng,
      level,
      p: div(t.d),
      prompt: `Sort each number: is it divisible by ${t.d}?`,
      yesLabel: `Divisible by ${t.d}`,
      noLabel: 'No',
      lens: t.lens,
      hints: [`Run two tests: ${t.parts[0]} and ${t.parts[1]}.`, 'A number passes only if it passes both tests.'],
      why: (s) => passMarks(s, t.parts),
      nearMiss: (s) => ruleDiv(s, t.parts[0]) !== ruleDiv(s, t.parts[1]),
    });
  },
};

const twoRulesConstruct: Template = {
  id: 'div.two-rules/construct',
  skillId: 'div.two-rules',
  board: 'construct',
  version: 1,
  generate: ({ rng, level }) =>
    retry(() => {
      const t = twoRulesTarget(level);
      const s = randNum(rng, Math.max(3, lenFor(rng, level)));
      const fixed = blank(s, [rng.int(1, s.length - 1)]);
      const mode = level >= 7 ? 'all' : 'one';
      return makeConstruct({
        fixed,
        p: div(t.d),
        mode,
        prompt:
          mode === 'all'
            ? `Select every digit that can fill the blank in ${showWithBlanks(fixed)} so the number is divisible by ${t.d}.`
            : `Fill the blank so ${showWithBlanks(fixed)} is divisible by ${t.d}.`,
        lens: t.lens,
        hints: [`Which digits pass the ${t.parts[0]} test? Which pass the ${t.parts[1]} test?`, 'Keep only the digits that pass both.'],
        explain: (sol) => `A digit must pass both the ${t.parts[0]} test and the ${t.parts[1]} test. That leaves ${sol.join(', ')}.`,
      });
    }),
};

const TWO_RULE_CLAIMS: ClaimBankEntry[] = [
  {
    text: 'Every even number whose digits add to a multiple of 3 is divisible by 6.',
    claim: claim1([div(2), div(3)], [div(6)]),
    isTrue: true,
    why: '2 and 3 share no factor, so passing both tests means divisible by 2 × 3 = 6.',
  },
  {
    text: 'Every number divisible by 6 is divisible by 12.',
    claim: claim1([div(6)], [div(12)]),
    isTrue: false,
    why: '12 needs two factors of 2; a multiple of 6 may have only one.',
  },
  {
    text: 'If a number is divisible by 3 and ends in 5, it is divisible by 15.',
    claim: claim1([div(3), rem(10, 5)], [div(15)]),
    isTrue: true,
    why: 'Ending in 5 makes it a multiple of 5; 3 and 5 share no factor, so it is a multiple of 15.',
  },
  {
    text: 'If a number is divisible by 6 and by 9, it is divisible by 54.',
    claim: claim1([div(6), div(9)], [div(54)]),
    isTrue: false,
    why: '6 and 9 share a factor of 3, so together they only guarantee 18, not 6 × 9.',
  },
  {
    text: 'If a number is divisible by 3 and by 6, it is divisible by 18.',
    claim: claim1([div(3), div(6)], [div(18)]),
    isTrue: false,
    why: 'Every multiple of 6 is already a multiple of 3, so the two facts only guarantee 6.',
  },
];

const twoRulesRefute: Template = {
  id: 'div.two-rules/refute',
  skillId: 'div.two-rules',
  board: 'refute',
  transfer: true,
  version: 1,
  generate: ({ rng }) =>
    makeRefute({
      rng,
      entry: rng.pick(TWO_RULE_CLAIMS),
      varNames: ['n'],
      lens: 'Two divisibility facts combine into their product only when the divisors share no common factor.',
      hints: ['Try the smallest numbers that meet the "if" part.', 'Do the two divisors share a factor?'],
    }),
};

// ================================================================ div.eleven

const EL_LENS =
  'Divisible by 11: starting from the right, add and subtract the digits in turn. If the result is a multiple of 11 (0 counts), so is the number.';

const elevenSort: Template = {
  id: 'div.eleven/sort',
  skillId: 'div.eleven',
  board: 'sort',
  version: 1,
  generate: ({ rng, level }) =>
    makeSort({
      rng,
      level,
      p: div(11),
      prompt: 'Sort each number: is it divisible by 11?',
      yesLabel: 'Divisible by 11',
      noLabel: 'No',
      lens: EL_LENS,
      hints: ['From the right: + − + − the digits.', 'The alternating total must be 0, 11, −11, 22…'],
      why: (s) => `alternating sum ${alternatingSum(s)}`,
      nearMiss: (s) => digitSum(s) % 11 === 0 || Math.abs(alternatingSum(s)) % 11 === 1,
      len: (r) => Math.max(3, lenFor(r, level)),
    }),
};

const elevenConstruct: Template = {
  id: 'div.eleven/construct',
  skillId: 'div.eleven',
  board: 'construct',
  version: 1,
  generate: ({ rng, level }) =>
    retry(() => {
      const s = randNum(rng, Math.max(3, lenFor(rng, level)));
      const fixed = blank(s, [rng.int(1, s.length - 1)]);
      const mode = level >= 7 ? 'all' : 'one';
      return makeConstruct({
        fixed,
        p: div(11),
        mode,
        prompt:
          mode === 'all'
            ? `Select every digit that can fill the blank in ${showWithBlanks(fixed)} so the number is divisible by 11.`
            : `Fill the blank so ${showWithBlanks(fixed)} is divisible by 11.`,
        lens: EL_LENS,
        hints: ['Write the alternating sum with the blank as x.', 'Which value of x makes it 0 or a multiple of 11?'],
        explain: (sol) => `Setting the alternating sum to a multiple of 11 gives the blank as ${sol.join(' or ')}.`,
      });
    }),
};

const elevenCount: Template = {
  id: 'div.eleven/count',
  skillId: 'div.eleven',
  board: 'numeric',
  transfer: true,
  version: 1,
  generate: ({ rng, level }) => {
    const s = randNum(rng, Math.max(4, lenFor(rng, level)));
    const fixed = blank(s, [rng.int(1, s.length - 1)]);
    const works = Array.from({ length: 10 }, (_, d) => d).filter((d) =>
      ruleDiv(fixed.map((x) => (x === null ? d : x)).join(''), 11),
    );
    return makeNumeric({
      prompt: `How many different digits could fill the blank so that ${showWithBlanks(fixed)} is divisible by 11?`,
      spec: { op: 'countFills', fixed, p: div(11) },
      answer: works.length,
      lens: EL_LENS,
      hints: ['Changing the blank by 1 changes the alternating sum by exactly 1.', 'How many digits 0 to 9 can land the sum on a multiple of 11?'],
      explanation: works.length
        ? `Only ${works.join(', ')} works, so the answer is ${works.length}. One step in the blank moves the alternating sum by one, so at most one digit can hit a multiple of 11.`
        : 'No digit works, so the answer is 0: the alternating sum can only reach values that miss every multiple of 11.',
    });
  },
};

// ================================================================ div.combined

const COMBINED = [
  { d: 12, parts: [3, 4] as [number, number], minLevel: 1 },
  { d: 36, parts: [4, 9] as [number, number], minLevel: 4 },
  { d: 24, parts: [3, 8] as [number, number], minLevel: 6 },
  { d: 45, parts: [5, 9] as [number, number], minLevel: 6 },
  { d: 72, parts: [8, 9] as [number, number], minLevel: 8 },
];
const CB_LENS =
  'Split a big divisor into factors that share no common factor: 12 = 3 × 4, 24 = 3 × 8, 36 = 4 × 9, 45 = 5 × 9, 72 = 8 × 9. Pass both tests and you pass the big one.';

const combinedFor = (rng: Rng, level: number) => rng.pick(COMBINED.filter((c) => c.minLevel <= level));

const combinedSort: Template = {
  id: 'div.combined/sort',
  skillId: 'div.combined',
  board: 'sort',
  version: 1,
  generate: ({ rng, level }) => {
    const c = combinedFor(rng, level);
    return makeSort({
      rng,
      level,
      p: div(c.d),
      prompt: `Sort each number: is it divisible by ${c.d}?`,
      yesLabel: `Divisible by ${c.d}`,
      noLabel: 'No',
      lens: CB_LENS,
      hints: [`${c.d} = ${c.parts[0]} × ${c.parts[1]}. Test each part.`, 'Both tests must pass.'],
      why: (s) => passMarks(s, c.parts),
      nearMiss: (s) => ruleDiv(s, c.parts[0]) || ruleDiv(s, c.parts[1]),
      len: (r) => Math.max(3, lenFor(r, level)),
    });
  },
};

const COMBINED_CLAIMS: ClaimBankEntry[] = [
  {
    text: 'If a number is divisible by 4 and by 6, it is divisible by 24.',
    claim: claim1([div(4), div(6)], [div(24)]),
    isTrue: false,
    why: '4 and 6 share a factor of 2, so together they only guarantee 12.',
  },
  {
    text: 'If a number is divisible by 3 and by 8, it is divisible by 24.',
    claim: claim1([div(3), div(8)], [div(24)]),
    isTrue: true,
    why: '3 and 8 share no factor, so passing both means divisible by 3 × 8 = 24.',
  },
  {
    text: 'If a number is divisible by 2 and by 12, it is divisible by 24.',
    claim: claim1([div(2), div(12)], [div(24)]),
    isTrue: false,
    why: 'Every multiple of 12 is already even, so the second fact adds nothing.',
  },
  {
    text: 'If a number is divisible by 4 and by 9, it is divisible by 36.',
    claim: claim1([div(4), div(9)], [div(36)]),
    isTrue: true,
    why: '4 and 9 share no factor, so passing both means divisible by 36.',
  },
  {
    text: 'If a number is divisible by 12 and by 18, it is divisible by 216.',
    claim: claim1([div(12), div(18)], [div(216)]),
    isTrue: false,
    why: '12 and 18 share a factor of 6; together they only guarantee their least common multiple, 36.',
  },
  {
    text: 'If a number is divisible by 8 and by 9, it is divisible by 72.',
    claim: claim1([div(8), div(9)], [div(72)]),
    isTrue: true,
    why: '8 and 9 share no factor, so passing both means divisible by 72.',
  },
  {
    text: 'If a number is divisible by 8 and by 12, it is divisible by 96.',
    claim: claim1([div(8), div(12)], [div(96)]),
    isTrue: false,
    why: '8 and 12 share a factor of 4; together they only guarantee 24.',
  },
];

const combinedRefute: Template = {
  id: 'div.combined/refute',
  skillId: 'div.combined',
  board: 'refute',
  version: 1,
  generate: ({ rng }) =>
    makeRefute({
      rng,
      entry: rng.pick(COMBINED_CLAIMS),
      varNames: ['n'],
      lens: CB_LENS,
      hints: ['Do the two divisors share a common factor?', 'Try their least common multiple as a test number.'],
    }),
};

const combinedTransfer: Template = {
  id: 'div.combined/context',
  skillId: 'div.combined',
  board: 'choice',
  transfer: true,
  version: 1,
  generate: ({ rng, level }) => {
    const c = combinedFor(rng, level);
    const [x, y] = c.parts;
    const len = Math.max(3, lenFor(rng, level));
    const right = sampleWhere(rng, len, (s) => ruleDiv(s, c.d));
    const onlyX = sampleWhere(rng, len, (s) => ruleDiv(s, x) && !ruleDiv(s, y));
    const onlyY = sampleWhere(rng, len, (s) => ruleDiv(s, y) && !ruleDiv(s, x));
    const neither = sampleWhere(rng, len, (s) => !ruleDiv(s, x) && !ruleDiv(s, y) && ruleDiv(s, 2));
    return makeChoice({
      rng,
      prompt: `A teacher splits a stack of worksheets evenly into ${x} piles, or evenly into ${y} piles, with none left over either way. How many worksheets could there be?`,
      question: { mode: 'predicate', p: div(c.d) },
      correct: { label: fmt(right), num: right },
      distractors: [
        { num: onlyX, misconception: `passes-${x}-only` },
        { num: onlyY, misconception: `passes-${y}-only` },
        { num: neither, misconception: 'guess' },
      ],
      lens: CB_LENS,
      hints: [`The count must be divisible by ${x} and by ${y}.`, `Since ${x} and ${y} share no factor, that means divisible by ${c.d}.`],
      explanation: `${fmt(right)} passes both tests (${passMarks(right, c.parts)}), so it splits both ways.`,
    });
  },
};

// ================================================================ div.sums

const pairCond = (expr: Cond['expr'], pred: NumPredicate): Cond => ({ expr, pred });
const pairClaim = (given: Cond[], then: Cond[]): Claim => ({ vars: 2, given, then, domain: [1, 120] });

const SUM_CLAIMS: ClaimBankEntry[] = [
  {
    text: 'If a and b are both divisible by 7, then a + b is divisible by 7.',
    claim: pairClaim([pairCond(A, div(7)), pairCond(B, div(7))], [pairCond(add(A, B), div(7))]),
    isTrue: true,
    why: 'a = 7x and b = 7y, so a + b = 7(x + y).',
  },
  {
    text: 'If a + b is divisible by 5, then a is divisible by 5.',
    claim: pairClaim([pairCond(add(A, B), div(5))], [pairCond(A, div(5))]),
    isTrue: false,
    why: 'Two numbers that are not multiples of 5 can still add up to one.',
  },
  {
    text: 'If a × b is divisible by 6, then a is divisible by 6.',
    claim: pairClaim([pairCond(mul(A, B), div(6))], [pairCond(A, div(6))]),
    isTrue: false,
    why: 'The factors 2 and 3 can be split between a and b.',
  },
  {
    text: 'If a is divisible by 4 and b is divisible by 6, then a × b is divisible by 24.',
    claim: pairClaim([pairCond(A, div(4)), pairCond(B, div(6))], [pairCond(mul(A, B), div(24))]),
    isTrue: true,
    why: 'a × b = 4x × 6y = 24xy.',
  },
  {
    text: 'If a is divisible by 3 and b is not, then a + b is not divisible by 3.',
    claim: pairClaim([pairCond(A, div(3)), pairCond(B, notDiv(3))], [pairCond(add(A, B), notDiv(3))]),
    isTrue: true,
    why: 'Adding a multiple of 3 does not change the remainder that b leaves when divided by 3.',
  },
  {
    text: 'If a is divisible by 6 and b is divisible by 4, then a + b is divisible by 4.',
    claim: pairClaim([pairCond(A, div(6)), pairCond(B, div(4))], [pairCond(add(A, B), div(4))]),
    isTrue: false,
    why: 'A multiple of 6 need not be a multiple of 4, so the sum can miss 4.',
  },
  {
    text: 'If a − b is divisible by 9 and a is divisible by 9, then b is divisible by 9.',
    claim: pairClaim([pairCond(sub(A, B), div(9)), pairCond(A, div(9))], [pairCond(B, div(9))]),
    isTrue: true,
    why: 'b = a − (a − b), a difference of two multiples of 9.',
  },
  {
    text: 'If a and b are both odd, then a + b is divisible by 4.',
    claim: pairClaim([pairCond(A, rem(2, 1)), pairCond(B, rem(2, 1))], [pairCond(add(A, B), div(4))]),
    isTrue: false,
    why: 'Two odd numbers always make an even sum, but not always a multiple of 4.',
  },
];

const sumsRefute: Template = {
  id: 'div.sums/refute',
  skillId: 'div.sums',
  board: 'refute',
  version: 1,
  generate: ({ rng }) =>
    makeRefute({
      rng,
      entry: rng.pick(SUM_CLAIMS),
      varNames: ['a', 'b'],
      lens: 'Write each number as a multiple: if a is divisible by 6, then a = 6x. Then see what the sum or product must contain.',
      hints: ['Try small multiples for a and b.', 'Write a = (divisor) × x and expand.'],
    }),
};

const SUM_PAIRS: [number, number][] = [
  [6, 10],
  [4, 6],
  [6, 9],
  [8, 12],
  [10, 15],
  [4, 10],
];

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

function mustBeTrueOptions(x: number, y: number) {
  const given = [pairCond(A, div(x)), pairCond(B, div(y))];
  const g = gcd(x, y);
  const opt = (text: string, then: Cond[], misconception?: string) => ({
    label: text,
    claim: pairClaim(given, then),
    misconception: misconception ?? 'guess',
  });
  const truths = [opt(`a × b is divisible by ${x * y}`, [pairCond(mul(A, B), div(x * y))])];
  if (g > 1) truths.push(opt(`a + b is divisible by ${g}`, [pairCond(add(A, B), div(g))]));
  const falsehoods = [
    opt(`a + b is divisible by ${x}`, [pairCond(add(A, B), div(x))], 'sum-keeps-first-divisor'),
    opt(`a + b is divisible by ${x + y}`, [pairCond(add(A, B), div(x + y))], 'sum-of-divisors'),
    opt(`a × b is divisible by ${2 * x * y}`, [pairCond(mul(A, B), div(2 * x * y))], 'overcounting-factors'),
    opt(`a is divisible by ${y}`, [pairCond(A, div(y))], 'swapped-divisors'),
  ];
  return { truths, falsehoods, given };
}

const sumsChoice: Template = {
  id: 'div.sums/must-be-true',
  skillId: 'div.sums',
  board: 'choice',
  version: 1,
  generate: ({ rng }) => {
    const [x, y] = rng.pick(SUM_PAIRS);
    const { truths, falsehoods } = mustBeTrueOptions(x, y);
    const right = rng.pick(truths);
    return makeChoice({
      rng,
      prompt: `a is divisible by ${x} and b is divisible by ${y}. Which must be true?`,
      question: { mode: 'claim' },
      correct: right,
      distractors: falsehoods,
      hints: [`Write a = ${x}x and b = ${y}y.`, 'Test each statement with small values; one failure rules it out.'],
      explanation: `"${right.label}" always holds: with a = ${x}x and b = ${y}y, it follows for every x and y. Each other option fails for some pair, for example a = ${x}, b = ${y}${x === y ? '' : ` or a = ${2 * x}, b = ${y}`}.`,
    });
  },
};

const sumsTransfer: Template = {
  id: 'div.sums/context',
  skillId: 'div.sums',
  board: 'choice',
  transfer: true,
  version: 1,
  generate: ({ rng }) => {
    const [x, y] = rng.pick(SUM_PAIRS);
    const g = gcd(x, y);
    const given = [pairCond(A, div(x)), pairCond(B, div(y))];
    const total = (d: number, misconception?: string) => ({
      label: `a multiple of ${d}`,
      claim: pairClaim(given, [pairCond(add(A, B), div(d))]),
      misconception: misconception ?? 'guess',
    });
    const right = g > 1 ? total(g) : total(1);
    return makeChoice({
      rng,
      prompt: `Mia's marbles fill bags of ${x} exactly. Leo's marbles fill bags of ${y} exactly. Their combined total must be:`,
      question: { mode: 'claim' },
      correct: right,
      distractors: [total(x, 'sum-keeps-first-divisor'), total(y, 'sum-keeps-second-divisor'), total(x + y, 'sum-of-divisors'), total(x * y, 'product-of-divisors')],
      hints: [`Mia has ${x}m marbles and Leo has ${y}l.`, 'What factor do both of those always share?'],
      explanation: `The total is ${x}m + ${y}l. Both terms always share the factor ${g}, so the total is always a multiple of ${g}. Larger guesses fail: ${x} + ${y} = ${x + y} is not a multiple of ${x}.`,
    });
  },
};

// ================================================================ div.build

const BUILD_SPECS: { p: NumPredicate; minLevel: number }[] = [
  { p: and(div(3), div(4)), minLevel: 1 },
  { p: and(div(9), notDiv(2)), minLevel: 1 },
  { p: and(div(6), notDiv(4)), minLevel: 3 },
  { p: and(div(5), div(9)), minLevel: 3 },
  { p: and(div(4), notDiv(3)), minLevel: 5 },
  { p: and(div(6), div(9), notDiv(4)), minLevel: 6 },
  { p: and(div(8), div(3), notDiv(9)), minLevel: 8 },
];

const buildSpec = (rng: Rng, level: number) => rng.pick(BUILD_SPECS.filter((s) => s.minLevel <= level)).p;

const BUILD_LENS = 'Handle one condition at a time: fix the last digits for 2, 4, 5 or 8 first, then adjust the digit sum for 3 or 9.';

const buildTwoBlanks: Template = {
  id: 'div.build/two-blanks',
  skillId: 'div.build',
  board: 'construct',
  version: 1,
  generate: ({ rng, level }) =>
    retry(() => {
      const p = buildSpec(rng, level);
      const s = randNum(rng, Math.max(4, lenFor(rng, level)));
      const positions = [s.length - 1, rng.int(1, s.length - 2)];
      const fixed = blank(s, positions);
      return makeConstruct({
        fixed,
        p,
        mode: 'one',
        prompt: `Fill both blanks so ${showWithBlanks(fixed)} is ${describe(p)}.`,
        lens: BUILD_LENS,
        hints: ['Choose the last digit first.', 'Then pick the other blank to fix the digit sum.'],
        explain: (sol) => `One answer is ${fillIn(fixed, sol[0])}. There are ${sol.length} ways to fill the blanks in all.`,
      });
    }),
};

const buildFromScratch: Template = {
  id: 'div.build/from-scratch',
  skillId: 'div.build',
  board: 'construct',
  transfer: true,
  version: 1,
  generate: ({ rng, level }) =>
    retry(() => {
      const p = buildSpec(rng, level);
      const len = level <= 3 ? 3 : 4;
      const fixed = Array.from({ length: len }, () => null);
      return makeConstruct({
        fixed,
        p,
        mode: 'one',
        prompt: `Build a ${len}-digit number that is ${describe(p)}.`,
        lens: BUILD_LENS,
        hints: ['Start from a number you know is close, then adjust.', 'Check every condition before you submit.'],
        explain: (sol) => `Many numbers work, for example ${fmt(sol[0])} and ${fmt(sol[sol.length - 1])}. There are ${sol.length} in all.`,
      });
    }),
};

const buildCount: Template = {
  id: 'div.build/count',
  skillId: 'div.build',
  board: 'numeric',
  version: 1,
  // From level 1, so free learners (levels 1 to 3) have the three families Secure needs.
  // The spec still scales with level (buildSpec), so levels 4 and up are unchanged.
  generate: ({ rng, level }) =>
    retry(() => {
      const p = buildSpec(rng, level);
      const s = randNum(rng, Math.max(4, lenFor(rng, level)));
      const fixed = blank(s, [s.length - 1, rng.int(1, s.length - 2)]);
      const total = Array.from({ length: 100 }, (_, k) => k).filter((k) => {
        const digits = fixed.map((x) => x);
        const blanks = digits.map((d, i) => (d === null ? i : -1)).filter((i) => i >= 0);
        const fill = String(k).padStart(2, '0');
        blanks.forEach((pos, j) => (digits[pos] = Number(fill[j])));
        return ruleEval(digits.join(''), p);
      }).length;
      if (total === 0) return null;
      return makeNumeric({
        prompt: `In how many ways can you fill the two blanks in ${showWithBlanks(fixed)} so the number is ${describe(p)}?`,
        spec: { op: 'countFills', fixed, p },
        answer: total,
        lens: BUILD_LENS,
        hints: ['Count the last-digit choices first.', 'For each one, count how many middle digits fix the digit sum.'],
        explanation: `Working digit by digit gives ${total} combinations.`,
      });
    }),
};

export const DIVISIBILITY_TEMPLATES: Template[] = [
  lastDigitSort,
  lastDigitConstruct,
  lastDigitTransfer,
  digitSumSort,
  digitSumConstruct,
  digitSumCount,
  digitSumRefute,
  lastTwoSort,
  lastTwoConstruct,
  lastTwoRefute,
  twoRulesSort,
  twoRulesConstruct,
  twoRulesRefute,
  elevenSort,
  elevenConstruct,
  elevenCount,
  combinedSort,
  combinedRefute,
  combinedTransfer,
  sumsRefute,
  sumsChoice,
  sumsTransfer,
  buildTwoBlanks,
  buildFromScratch,
  buildCount,
];

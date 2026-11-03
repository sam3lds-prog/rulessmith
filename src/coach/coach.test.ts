import { describe, expect, it } from 'vitest';
import { checkItem, generateItem, TEMPLATES, type Item, type Response } from '../content';
import { evalPred } from '../content/evaluate';
import type { NumPredicate, Payload } from '../content/types';
import { coach, reason, relatedDigitSumExample, sentence } from './explain';

function makeItem(payload: Payload, extra: Partial<Item> = {}): Item {
  return {
    id: 'test@1#1',
    templateId: 'test',
    skillId: 'div.digit-sum',
    family: 'test',
    board: payload.kind,
    level: 1,
    seed: 1,
    templateVersion: 1,
    contentVersion: 'test',
    transfer: false,
    prompt: 'Test',
    ruleLens: 'Divisible by 9: the digits add to a multiple of 9.',
    hints: [],
    explanation: 'General explanation.',
    payload,
    key: { kind: 'numeric', value: '0' },
    ...extra,
  };
}

const run = (item: Item, r: Response) => coach(item, r, checkItem(item, r));

describe('coaching a missing digit', () => {
  const item = makeItem({ kind: 'construct', fixed: [4, null, 2], p: { op: 'div', d: 9 }, mode: 'one' });

  it('explains 442 from the learner’s own digit and shows the digit that works', () => {
    const r: Response = { kind: 'construct', digits: [4] };
    expect(checkItem(item, r).correct).toBe(false);
    const c = run(item, r);
    expect(c.specific).toBe(true);
    expect(c.submitted).toBe('You made 442.');
    expect(c.lines[0]).toBe("442 isn't divisible by 9: its digits add to 4 + 4 + 2 = 10, and 10 isn't a multiple of 9.");
    expect(c.lines).toContain('The known digits add to 6 (4 + 2). The blank has to bring the total to a multiple of 9.');
    expect(c.lines).toContain('3 makes 432, whose digits add to 9.');
    expect(c.lines).toContain('Any multiple of 9 works: 18 and 27 count, not just 9.');
    expect(c.rule).toMatch(/multiple of 9/);
    expect(c.example?.lines.join(' ')).toMatch(/brings the total to 18, a multiple of 9/);
  });

  it('a related example shows 18 as a multiple of 9: 8_4 → 864', () => {
    const ex = relatedDigitSumExample(9, '4_2', 74)!;
    expect(ex.title).toBe('Another one: make 8_4 divisible by 9');
    expect(ex.lines[0]).toBe('8_4: the known digits add to 12. 6 brings the total to 18, a multiple of 9, so 864 works (864 ÷ 9 = 96).');
    // Never the same pattern as the puzzle just missed.
    expect(relatedDigitSumExample(9, '8_4', 74)!.title).not.toMatch(/8_4/);
  });

  it('accepts every valid digit, not just one', () => {
    const two = makeItem({ kind: 'construct', fixed: [4, null, 5], p: { op: 'div', d: 9 }, mode: 'one' });
    expect(checkItem(two, { kind: 'construct', digits: [0] }).correct).toBe(true);
    expect(checkItem(two, { kind: 'construct', digits: [9] }).correct).toBe(true);
    const c = run(two, { kind: 'construct', digits: [5] });
    expect(c.lines).toContain('0 makes 405, whose digits add to 9.');
    expect(c.lines).toContain('9 makes 495, whose digits add to 18.');
  });

  it('"find all" names the missing and the extra digits', () => {
    const all = makeItem({ kind: 'construct', fixed: [4, null, 5], p: { op: 'div', d: 9 }, mode: 'all' });
    const r: Response = { kind: 'constructAll', digits: [9, 3] };
    expect(checkItem(all, r).correct).toBe(false);
    expect(checkItem(all, { kind: 'constructAll', digits: [9, 0] }).correct).toBe(true);
    expect(checkItem(all, { kind: 'constructAll', digits: [9] }).correct).toBe(false);
    const c = run(all, r);
    expect(c.submitted).toBe('You picked 3 and 9.');
    expect(c.lines).toContain("3 doesn't work: 435 isn't divisible by 9: its digits add to 4 + 3 + 5 = 12, and 12 isn't a multiple of 9.");
    expect(c.lines).toContain('0 also works: 405 is divisible by 9: its digits add to 4 + 0 + 5 = 9, and 9 is a multiple of 9.');
    expect(c.lines.at(-1)).toBe('Every digit that works: 0 and 9.');
  });

  it('works for 3, 5 and 10 too', () => {
    const three = run(makeItem({ kind: 'construct', fixed: [2, null, 2], p: { op: 'div', d: 3 }, mode: 'one' }), { kind: 'construct', digits: [0] });
    expect(three.lines[0]).toBe("202 isn't divisible by 3: its digits add to 2 + 0 + 2 = 4, and 4 isn't a multiple of 3.");
    expect(three.lines).toContain('2 makes 222, whose digits add to 6.');
    const five = run(makeItem({ kind: 'construct', fixed: [7, 1, null], p: { op: 'div', d: 5 }, mode: 'one' }), { kind: 'construct', digits: [4] });
    expect(five.lines[0]).toBe("714 isn't divisible by 5: it ends in 4, and multiples of 5 end in 0 or 5.");
    expect(five.lines[1]).toBe('Digits that work: 0 and 5.');
    const ten = run(makeItem({ kind: 'construct', fixed: [7, 1, null], p: { op: 'div', d: 10 }, mode: 'one' }), { kind: 'construct', digits: [5] });
    expect(ten.lines[0]).toBe("715 isn't divisible by 10: it ends in 5, and multiples of 10 end in 0.");
    expect(ten.lines[1]).toBe('The only digit that works is 0.');
  });
});

describe('coaching a sort', () => {
  it('names each misplaced number with its own reason', () => {
    const item = makeItem({ kind: 'sort', numbers: ['84', '81', '90'], p: { op: 'div', d: 9 }, yesLabel: 'Divisible by 9', noLabel: 'No' });
    const c = run(item, { kind: 'sort', yes: [0, 2] });
    expect(c.submitted).toBe('2 of 3 numbers were in the wrong place.');
    expect(c.lines[0]).toBe("You put 84 under “Divisible by 9”. 84 isn't divisible by 9: its digits add to 8 + 4 = 12, and 12 isn't a multiple of 9. It belongs under “No”.");
    expect(c.lines[1]).toBe('You put 81 under “No”. 81 is divisible by 9: its digits add to 8 + 1 = 9, and 9 is a multiple of 9. It belongs under “Divisible by 9”.');
    expect(c.lines).toHaveLength(2);
  });

  it('explains combined conditions part by part', () => {
    const p: NumPredicate = { op: 'and', ps: [{ op: 'div', d: 2 }, { op: 'div', d: 3 }] };
    const item = makeItem({ kind: 'sort', numbers: ['15', '12'], p, yesLabel: 'Divisible by 6', noLabel: 'No' });
    const c = run(item, { kind: 'sort', yes: [0, 1] });
    expect(c.lines[0]).toContain("15 doesn't meet the condition");
    expect(c.lines[0]).toContain('15 isn\'t divisible by 2 (it ends in 5, an odd digit)');
    expect(c.lines[0]).toContain('15 is divisible by 3');
  });
});

describe('coaching a claim (Rule Detective)', () => {
  const claim = { vars: 1 as const, given: [{ expr: { op: 'var' as const, v: 'a' as const }, pred: { op: 'div' as const, d: 3 } }], then: [{ expr: { op: 'var' as const, v: 'a' as const }, pred: { op: 'div' as const, d: 9 } }], domain: [1, 100] as [number, number] };
  const item = makeItem({ kind: 'refute', claim, claimText: 'If n is divisible by 3, then n is divisible by 9.', candidates: [[12], [18], [20]], varNames: ['n'] });

  it('"always true" gets the actual counterexample, with both parts checked', () => {
    const c = run(item, { kind: 'refute', verdict: 'true' });
    expect(c.lines[0]).toBe("It isn't always true. n = 3 breaks it:");
    expect(c.lines).toContain('It meets the condition: 3 is divisible by 3: its digits add to 3, and 3 is a multiple of 3.');
    expect(c.lines).toContain("But the conclusion fails: 3 isn't divisible by 9: its digits add to 3, and 3 isn't a multiple of 9.");
  });

  it('a number that misses the condition, or agrees with the claim, is explained as such', () => {
    const miss = run(item, { kind: 'refute', verdict: 'false', counterexample: [20] });
    expect(miss.lines[0]).toMatch(/^At n = 20 the condition doesn't hold/);
    const agrees = run(item, { kind: 'refute', verdict: 'false', counterexample: [18] });
    expect(agrees.lines[0]).toBe('At n = 18 the condition holds and so does the conclusion, so it agrees with the claim.');
    expect(agrees.lines.join(' ')).toContain('n = 3 does break it:');
  });
});

describe('coaching other boards', () => {
  it('factor: names the piece that can still split, and the primes', () => {
    const item = makeItem({ kind: 'factor', n: 36 });
    const c = run(item, { kind: 'factor', primes: [2, 18] });
    expect(c.lines[0]).toBe('18 can still split: 18 = 2 × 9.');
    expect(c.lines[1]).toBe('36 = 2 × 2 × 3 × 3 = 2² × 3². Any route of splits ends with these primes.');
  });

  it('rail: groups the complete loops', () => {
    const item = makeItem({
      kind: 'rail',
      spec: { op: 'remainder', n: '28', d: 5 },
      stops: [0, 1, 2, 3, 4].map((v) => ({ label: String(v), value: v })),
      walk: '28 steps',
      loop: 5,
    });
    const c = run(item, { kind: 'rail', stop: 1 });
    expect(c.lines[0]).toBe('28 = 5 × 5 + 3. 5 complete loops bring the token back to the start; 3 more steps take it to 3.');
  });

  it('a tagged choice gets a reviewed note, phrased as a common slip; an untagged one does not', () => {
    const item = makeItem({
      kind: 'choice',
      question: { mode: 'predicate', p: { op: 'div', d: 4 } },
      options: [
        { id: 'a', label: '1,234', num: '1234', misconception: 'used-only-last-digit' },
        { id: 'b', label: '1,236', num: '1236' },
        { id: 'c', label: '1,238', num: '1238', misconception: 'not-a-reviewed-tag' },
      ],
    });
    const c = run(item, { kind: 'choice', optionId: 'a' });
    expect(c.slip).toBe('A common slip with this answer: For 4 and 8, one last digit is not enough: use the last two or three.');
    expect(c.lines).toContain("1234 isn't divisible by 4: its last two digits make 34, and 34 isn't a multiple of 4.");
    expect(run(item, { kind: 'choice', optionId: 'c' }).slip).toBeUndefined();
  });
});

describe('every family has accurate coaching or a safe fallback', () => {
  function wrongResponse(item: Item): Response | undefined {
    const p = item.payload;
    const tries: Response[] =
      p.kind === 'numeric'
        ? [{ kind: 'numeric', value: '999999937' }, { kind: 'numeric', value: '0' }]
        : p.kind === 'choice'
          ? p.options.map((o) => ({ kind: 'choice' as const, optionId: o.id }))
          : p.kind === 'sort'
            ? [{ kind: 'sort', yes: [] }, { kind: 'sort', yes: p.numbers.map((_, i) => i) }]
            : p.kind === 'refute'
              ? [{ kind: 'refute', verdict: 'true' }, ...p.candidates.map((c) => ({ kind: 'refute' as const, verdict: 'false' as const, counterexample: c }))]
              : p.kind === 'factor'
                ? [{ kind: 'factor', primes: [p.n] }]
                : p.kind === 'rail'
                  ? p.stops.map((_, i) => ({ kind: 'rail' as const, stop: i }))
                  : p.mode === 'all'
                    ? [{ kind: 'constructAll', digits: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }, { kind: 'constructAll', digits: [0] }]
                    : Array.from({ length: 10 }, (_, d) => ({ kind: 'construct' as const, digits: p.fixed.filter((x) => x === null).map(() => d) }));
    return tries.find((r) => !checkItem(item, r).correct);
  }

  it('across every template, level and a few seeds: no broken text, and the right kind of coaching', () => {
    let specific = 0;
    let total = 0;
    for (const t of TEMPLATES) {
      for (const level of [t.minLevel ?? 1, 5, 10]) {
        if (level < (t.minLevel ?? 1)) continue;
        for (const seed of [11, 222, 3333]) {
          const item = generateItem(t.id, level, seed);
          const r = wrongResponse(item);
          if (!r) continue;
          const c = run(item, r);
          const text = [c.submitted, ...c.lines, ...(c.example?.lines ?? []), c.slip ?? ''].join(' ');
          expect(text, item.id).not.toMatch(/undefined|NaN|\[object/);
          expect(c.lines.length, item.id).toBeGreaterThan(0);
          if (!c.specific) expect(c.lines.at(-1), item.id).toBe(item.explanation);
          total++;
          if (c.specific) specific++;
          // Sort, construct and refute always get a response-specific explanation.
          if (['sort', 'construct', 'refute', 'factor'].includes(item.payload.kind)) expect(c.specific, item.id).toBe(true);
        }
      }
    }
    expect(specific / total).toBeGreaterThan(0.5);
  });
});

describe('reasons agree with the checker', () => {
  it('every "is / isn\'t" matches brute force, for every divisor the content uses', () => {
    for (const d of [2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 15, 18, 24, 25, 36, 45, 72]) {
      for (let n = 1; n < 2500; n += 7) {
        const p: NumPredicate = { op: 'div', d };
        const holds = evalPred(BigInt(n), p);
        expect(sentence(BigInt(n), p).includes("isn't"), `${n} ÷ ${d}`).toBe(!holds);
        const why = reason(BigInt(n), p);
        if (why.includes(' a multiple of ')) expect(why.includes("isn't a multiple"), `${n} ÷ ${d}: ${why}`).toBe(!holds);
        if (why.includes('÷')) expect(why.includes('remainder'), `${n} ÷ ${d}: ${why}`).toBe(!holds);
      }
    }
    for (let n = 1; n < 400; n += 3) {
      expect(sentence(BigInt(n), { op: 'prime' }).includes("isn't")).toBe(!evalPred(BigInt(n), { op: 'prime' }));
      expect(sentence(BigInt(n), { op: 'square' }).includes("isn't")).toBe(!evalPred(BigInt(n), { op: 'square' }));
    }
  });
});

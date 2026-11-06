/**
 * Content audit. This is the automated half of the content factory's
 * verification step: every template, at every level, across many seeds, must
 * produce items the independent checker agrees with.
 *
 * Run: npm run content:audit   (SEEDS=200 npm run content:audit for a deeper pass)
 */
import { describe, expect, it } from 'vitest';
import { matchSolution, mazeNeighbours, mazePathBrute, optionIsCorrect } from './check';
import { claimHolds, enumerateFills, evalPred, evalValue, isPrimeBrute } from './evaluate';
import { FREE_MAX_LEVEL } from '../config';
import { checkItem, generateItem, SKILLS, TEMPLATES, templatesForSkill } from './index';

const SEEDS = Number(process.env.SEEDS ?? 25);

describe('curriculum', () => {
  it('every skill has at least three families, two board types and one transfer family', () => {
    for (const skill of SKILLS) {
      const ts = TEMPLATES.filter((t) => t.skillId === skill.id);
      expect(ts.length, skill.id).toBeGreaterThanOrEqual(3);
      expect(new Set(ts.map((t) => t.board)).size, skill.id).toBeGreaterThanOrEqual(2);
      expect(ts.some((t) => t.transfer), `${skill.id} needs a transfer family`).toBe(true);
    }
  });

  it('every skill can reach Secure within the free levels, so nobody pays to prove they learned', () => {
    for (const skill of SKILLS) {
      const ts = templatesForSkill(skill.id, FREE_MAX_LEVEL);
      expect(ts.length, skill.id).toBeGreaterThanOrEqual(3);
      expect(new Set(ts.map((t) => t.board)).size, skill.id).toBeGreaterThanOrEqual(2);
      expect(ts.some((t) => t.transfer), skill.id).toBe(true);
    }
  });

  it('every template belongs to a known skill and ids are unique', () => {
    const ids = new Set<string>();
    for (const t of TEMPLATES) {
      expect(SKILLS.some((s) => s.id === t.skillId), t.id).toBe(true);
      expect(ids.has(t.id), `duplicate ${t.id}`).toBe(false);
      ids.add(t.id);
    }
  });
});

describe.each(TEMPLATES.map((t) => [t.id, t] as const))('%s', (id, template) => {
  it('produces items the checker agrees with, at every level', () => {
    for (let level = template.minLevel ?? 1; level <= 10; level++) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const s = seed * 7919 + level;
        const item = generateItem(id, level, s, { allowDisabled: true });
        const where = `${item.id}`;

        // Text quality.
        for (const text of [item.prompt, item.explanation, ...item.hints]) {
          expect(text.length, where).toBeGreaterThan(0);
          expect(text, where).not.toMatch(/undefined|NaN|\[object/);
        }
        expect(item.hints.length, where).toBeGreaterThanOrEqual(2);

        // The generator's key must pass the independent checker.
        const result = checkItem(item, item.key);
        expect(result.correct, `${where} key rejected by checker`).toBe(true);

        const p = item.payload;
        switch (p.kind) {
          case 'sort': {
            const yes = p.numbers.filter((n) => evalPred(BigInt(n), p.p)).length;
            expect(yes, where).toBeGreaterThan(0);
            expect(yes, where).toBeLessThan(p.numbers.length);
            expect(new Set(p.numbers).size, `${where} duplicate numbers`).toBe(p.numbers.length);
            break;
          }
          case 'choice': {
            const right = p.options.filter((o) => optionIsCorrect(p, o));
            expect(right.length, `${where} must have exactly one correct option`).toBe(1);
            expect(p.options.length, where).toBeGreaterThanOrEqual(3);
            expect(new Set(p.options.map((o) => o.label)).size, `${where} duplicate labels`).toBe(p.options.length);
            break;
          }
          case 'refute': {
            const truth = claimHolds(p.claim);
            expect(p.candidates.length, where).toBeGreaterThanOrEqual(4);
            if (truth) expect(item.key, where).toEqual({ kind: 'refute', verdict: 'true' });
            break;
          }
          case 'construct': {
            const sol = enumerateFills(p.fixed, p.p);
            expect(sol.length, where).toBeGreaterThan(0);
            if (p.mode === 'all') expect(p.fixed.filter((d) => d === null).length, where).toBe(1);
            break;
          }
          case 'numeric':
            break;
          case 'factor': {
            // Composite with at least three prime pieces, so there is something to split twice.
            expect(isPrimeBrute(BigInt(p.n)), where).toBe(false);
            expect(item.key.kind === 'factor' && item.key.primes.length >= 3, where).toBe(true);
            // A wrong tree (one piece left unsplit) is rejected.
            const primes = item.key.kind === 'factor' ? item.key.primes : [];
            expect(checkItem(item, { kind: 'factor', primes: [primes[0] * primes[1], ...primes.slice(2)] }).correct, where).toBe(false);
            break;
          }
          case 'rail': {
            const v = evalValue(p.spec);
            const right = p.stops.filter((st) => BigInt(st.value) === v);
            expect(right.length, `${where} exactly one stop is right`).toBe(1);
            expect(p.stops.length, where).toBe(p.loop);
            expect(p.stops.length, where).toBeGreaterThanOrEqual(2);
            break;
          }
          case 'maze': {
            const total = p.rows * p.cols;
            expect(p.cells.length, where).toBe(total);
            expect(p.cols, `${where} fits a phone`).toBeLessThanOrEqual(5);
            expect(new Set(p.cells).size, `${where} duplicate numbers`).toBe(total);
            const pass = p.cells.filter((c) => evalPred(BigInt(c), p.p)).length;
            // There is something to avoid, and enough of it that the route isn't just "everything".
            expect(pass, where).toBeLessThanOrEqual(Math.ceil(total * 0.75));
            expect(total - pass, where).toBeGreaterThanOrEqual(4);
            // A route exists (brute-force search), and it starts and ends where the board says.
            const route = mazePathBrute(p);
            expect(route, `${where} has no route`).not.toBeNull();
            // Stepping straight from start to finish is refused unless they really are neighbours,
            // and a path through a failing square is refused.
            if (!mazeNeighbours(p, p.start, p.end)) expect(checkItem(item, { kind: 'maze', path: [p.start, p.end] }).correct, where).toBe(false);
            const key = item.key.kind === 'maze' ? item.key.path : [];
            const besideFail = key.flatMap((c) => [c - p.cols, c + p.cols, c % p.cols ? c - 1 : -1, (c + 1) % p.cols ? c + 1 : -1]).find((n) => n >= 0 && n < total && !key.includes(n) && !evalPred(BigInt(p.cells[n]), p.p));
            expect(besideFail, `${where} nothing to avoid next to the route`).toBeDefined();
            // Any valid path counts: the shortest one found by search is accepted too.
            expect(checkItem(item, { kind: 'maze', path: route! }).correct, where).toBe(true);
            break;
          }
          case 'match': {
            const values = p.right.map((r) => r.value);
            expect(new Set(values).size, `${where} right-hand values repeat`).toBe(values.length);
            expect(p.right.length, `${where} needs one extra card`).toBe(p.left.length + 1);
            expect(new Set(p.left.map((l) => l.label)).size, where).toBe(p.left.length);
            // Every left card has exactly one partner, computed directly, and the extra card has none.
            const sol = matchSolution(p);
            expect(sol.every((j) => j >= 0), `${where} a card has no partner`).toBe(true);
            expect(new Set(sol).size, where).toBe(p.left.length);
            const extra = p.right.filter((_, j) => !sol.includes(j));
            expect(extra.length, where).toBe(1);
            expect(extra[0].misconception, `${where} the extra card needs a named slip`).toBeTruthy();
            for (const l of p.left) expect(p.right.filter((r) => BigInt(r.value) === evalValue(l.spec)).length, where).toBe(1);
            break;
          }
        }
      }
    }
  });

  it('regenerates identically from the same seed', () => {
    const a = generateItem(id, 5, 12345, { allowDisabled: true });
    const b = generateItem(id, 5, 12345, { allowDisabled: true });
    expect(a).toEqual(b);
  });
});

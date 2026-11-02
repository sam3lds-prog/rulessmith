/**
 * Content audit. This is the automated half of the content factory's
 * verification step: every template, at every level, across many seeds, must
 * produce items the independent checker agrees with.
 *
 * Run: npm run content:audit   (SEEDS=200 npm run content:audit for a deeper pass)
 */
import { describe, expect, it } from 'vitest';
import { optionIsCorrect } from './check';
import { claimHolds, enumerateFills, evalPred } from './evaluate';
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

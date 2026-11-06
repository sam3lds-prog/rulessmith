/**
 * Number Maze and Match Up: the checker accepts every valid answer and nothing
 * else, by brute force. Worked examples never give the puzzle's own answer away.
 */
import { describe, expect, it } from 'vitest';
import { questionKey, workedExample } from '../coach/example';
import { draftHasWork, sessionHasWork } from '../state/work';
import type { ActiveSession } from '../state/types';
import { correctAnswerText, mazePathBrute } from './check';
import { checkItem, generateItem, setRemoteDisabledTemplates, TEMPLATES, type Item, type MatchPayload, type MazePayload } from './index';

const asItem = (payload: MazePayload | MatchPayload): Item => ({
  id: 't@1#1',
  templateId: 't',
  skillId: 'div.digit-sum',
  family: 't',
  board: payload.kind,
  level: 1,
  seed: 1,
  templateVersion: 1,
  contentVersion: 't',
  transfer: false,
  prompt: 'p',
  hints: ['a', 'b'],
  explanation: 'e',
  payload,
  key: { kind: 'numeric', value: '0' },
});

describe('Number Maze checking', () => {
  // 3 × 3, multiples of 3:
  //   12 15 18
  //   30 22 21
  //   33 36 24
  // Two routes: along the top and down the right, or down the left and along the bottom.
  const maze: MazePayload = { kind: 'maze', rows: 3, cols: 3, cells: ['12', '15', '18', '30', '22', '21', '33', '36', '24'], p: { op: 'div', d: 3 }, start: 0, end: 8, label: 'multiples of 3' };
  const item = asItem(maze);
  const check = (path: number[]) => checkItem(item, { kind: 'maze', path });

  it('accepts every valid path, not just one', () => {
    expect(check([0, 1, 2, 5, 8]).correct).toBe(true);
    expect(check([0, 3, 6, 7, 8]).correct).toBe(true);
  });

  it('refuses a path through a number that fails, and marks that step', () => {
    const r = check([0, 1, 4, 5, 8]);
    expect(r.correct).toBe(false);
    expect(r.marks).toEqual([true, true, false, true, true]);
  });

  it('refuses diagonal steps, jumps, repeats, and paths that miss the start or the finish', () => {
    expect(check([0, 4, 8]).correct).toBe(false);
    expect(check([0, 2, 5, 8]).correct).toBe(false);
    expect(check([0, 1, 0, 1, 2, 5, 8]).correct).toBe(false);
    expect(check([1, 2, 5, 8]).correct).toBe(false);
    expect(check([0, 1, 2, 5]).correct).toBe(false);
    expect(check([0, 1, 2, 5, 8, 9]).correct).toBe(false);
    expect(check([]).correct).toBe(false);
  });

  it('wraps nothing round the edge: the end of one row is not next to the start of the next', () => {
    const strip: MazePayload = { ...maze, cells: ['3', '6', '9', '12', '4', '5', '7', '8', '15'] };
    expect(checkItem(asItem(strip), { kind: 'maze', path: [0, 1, 2, 3] }).correct).toBe(false);
  });

  it('finds a route by search, or none when the numbers block every way through', () => {
    expect(mazePathBrute(maze)).toHaveLength(5);
    expect(mazePathBrute({ ...maze, cells: ['12', '15', '19', '31', '22', '21', '34', '36', '24'] })).toBeNull();
  });
});

describe('Match Up checking', () => {
  const match: MatchPayload = {
    kind: 'match',
    left: [
      { label: '47', spec: { op: 'remainder', n: '47', d: 7 } },
      { label: '30', spec: { op: 'remainder', n: '30', d: 7 } },
    ],
    right: [
      { label: '2', value: 2 },
      { label: '6', value: 6, misconception: 'quotient-for-remainder' },
      { label: '5', value: 5 },
    ],
    leftTitle: 'Number',
    rightTitle: 'Remainder',
  };
  const item = asItem(match);

  it('grades each pair by computing the value, and marks each one', () => {
    expect(checkItem(item, { kind: 'match', pairs: [2, 0] })).toEqual({ correct: true, marks: [true, true] });
    // The extra card's slip is recorded, so analytics and check notes can see it.
    expect(checkItem(item, { kind: 'match', pairs: [1, 0] })).toEqual({ correct: false, marks: [false, true], misconception: 'quotient-for-remainder' });
    expect(correctAnswerText(item)).toBe('47 → 5, 30 → 2');
  });

  it('refuses incomplete, out-of-range or doubled-up answers', () => {
    expect(checkItem(item, { kind: 'match', pairs: [2] }).correct).toBe(false);
    expect(checkItem(item, { kind: 'match', pairs: [2, 9] }).correct).toBe(false);
    expect(checkItem(item, { kind: 'match', pairs: [2, 2] }).correct).toBe(false);
  });
});

describe('work in progress on the new boards', () => {
  it('a maze path past the start square, or any pair made, is work', () => {
    expect(draftHasWork({ kind: 'maze', path: [0] })).toBe(false);
    expect(draftHasWork({ kind: 'maze', path: [0, 1] })).toBe(true);
    expect(draftHasWork({ kind: 'match', pairs: [null, null] })).toBe(false);
    expect(draftHasWork({ kind: 'match', pairs: [null, 2] })).toBe(true);
  });

  it('opening a worked example is work, like a hint', () => {
    const base = { results: [], progress: { itemId: 'x', draft: null, hints: 0, ruleRevealed: false, firstSeenAt: 0, activeMs: 0 } } as unknown as ActiveSession;
    expect(sessionHasWork(base)).toBe(false);
    expect(sessionHasWork({ ...base, progress: { ...base.progress!, example: true } })).toBe(true);
  });
});

describe('worked examples', () => {
  it('come from the same family and level, and are never the same question', () => {
    for (const t of TEMPLATES) {
      for (const level of [t.minLevel ?? 1, 6, 10]) {
        const item = generateItem(t.id, level, 777 + level);
        const ex = workedExample(item);
        expect(ex, item.id).not.toBeNull();
        expect(ex!.templateId).toBe(item.templateId);
        expect(ex!.level).toBe(item.level);
        expect(ex!.id).not.toBe(item.id);
        expect(questionKey(ex!), item.id).not.toBe(questionKey(item));
        // Deterministic: the same puzzle always offers the same example.
        expect(workedExample(item)!.id).toBe(ex!.id);
      }
    }
  });

  it("are chosen without looking at the answer, so a family with few answers doesn't give its answer away", () => {
    // Largest prime factor at low levels is 3 or 5; how many digits fit an 11 blank is 0 or 1.
    // Picking an example with a different answer would reveal the answer every time.
    for (const [id, level] of [['pf.factorize/largest', 2], ['div.eleven/count', 6]] as const) {
      let same = 0;
      let total = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const item = generateItem(id, level, seed * 7919);
        const ex = workedExample(item);
        if (!ex) continue;
        total++;
        if (correctAnswerText(ex) === correctAnswerText(item)) same++;
      }
      expect(total, id).toBeGreaterThan(250);
      // Roughly as often as chance: neither "always different" nor "always the same".
      expect(same / total, id).toBeGreaterThan(0.2);
      expect(same / total, id).toBeLessThan(0.95);
    }
  });

  it('none when the family has been switched off or changed since the puzzle was made', () => {
    const item = generateItem('div.digit-sum/maze', 3, 5);
    setRemoteDisabledTemplates(['div.digit-sum/maze']);
    expect(workedExample(item)).toBeNull();
    setRemoteDisabledTemplates([]);
    expect(workedExample({ ...item, templateVersion: item.templateVersion + 1 })).toBeNull();
  });
});

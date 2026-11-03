import { afterEach, describe, expect, it } from 'vitest';
import { checkItem, generateItem, setRemoteDisabledTemplates, SKILLS, TEMPLATE_BY_ID } from '../content';
import { createRng } from '../content/rng';
import { newSkillState } from '../engine/mastery';
import type { Attempt } from '../engine/types';
import { gameSlots, gamesForSkill, gameTemplates, GAMES, practiceSlots } from '../games/registry';
import { mistakeCounts, mistakes, reviewEntry } from './mistakes';

function attemptFor(templateId: string, opts: Partial<Attempt> = {}): Attempt {
  const item = generateItem(templateId, 2, 42);
  const response = item.payload.kind === 'sort' ? { kind: 'sort' as const, yes: [] } : undefined;
  return {
    id: `a-${templateId}`,
    itemId: item.id,
    templateId,
    templateVersion: item.templateVersion,
    contentVersion: item.contentVersion,
    skillId: item.skillId,
    family: item.family,
    level: item.level,
    transfer: item.transfer,
    support: 'guided',
    correct: response ? checkItem(item, response).correct : false,
    hintBeforeAnswer: false,
    hintsUsed: 0,
    ruleShown: true,
    response,
    ms: 1000,
    at: 1000,
    mode: 'skill',
    ...opts,
  };
}

afterEach(() => setRemoteDisabledTemplates([]));

describe('reviewing mistakes', () => {
  it('rebuilds the exact puzzle and keeps the recorded verdict', () => {
    const a = attemptFor('div.digit-sum/sort');
    expect(a.correct).toBe(false);
    const e = reviewEntry(a);
    expect(e.status).toBe('ok');
    expect(e.item?.id).toBe(a.itemId);
    expect(e.result?.correct).toBe(false);
  });

  it('never shows a different puzzle: changed versions, withdrawn and unknown templates, and missing answers fall back honestly', () => {
    expect(reviewEntry(attemptFor('div.digit-sum/sort', { templateVersion: 99 })).status).toBe('changed');
    expect(reviewEntry(attemptFor('div.digit-sum/sort', { templateVersion: 0 })).status).toBe('changed');
    expect(reviewEntry({ ...attemptFor('div.digit-sum/sort'), itemId: 'gone/away@2#1', templateId: 'gone/away' }).status).toBe('unknown');
    const noResponse = reviewEntry(attemptFor('div.digit-sum/sort', { response: undefined }));
    expect(noResponse.status).toBe('no-response');
    expect(noResponse.result).toBeUndefined();
    const answered = attemptFor('div.digit-sum/sort');
    setRemoteDisabledTemplates(['div.digit-sum/sort']);
    const withdrawn = reviewEntry(answered);
    expect(withdrawn.status).toBe('withdrawn');
    expect(withdrawn.item).toBeUndefined();
  });

  it('flags a recorded verdict that today’s checker disagrees with, instead of regrading it', () => {
    const a = { ...attemptFor('div.digit-sum/sort'), correct: true };
    expect(reviewEntry(a).status).toBe('corrected');
  });

  it('lists wrong answers newest first, by skill, from every mode', () => {
    const list: Attempt[] = [
      attemptFor('div.digit-sum/sort', { id: '1', at: 1, mode: 'check' }),
      attemptFor('div.last-digit/sort', { id: '2', at: 3, mode: 'quest' }),
      attemptFor('div.digit-sum/sort', { id: '3', at: 2, mode: 'skill', correct: true }),
    ];
    expect(mistakes(list).map((a) => a.id)).toEqual(['2', '1']);
    expect(mistakes(list, { skillId: 'div.digit-sum' }).map((a) => a.id)).toEqual(['1']);
    expect(mistakeCounts(list)).toEqual({ 'div.digit-sum': 1, 'div.last-digit': 1 });
  });
});

describe('games for a topic', () => {
  const pick = { rng: createRng(5), maxLevel: () => 10 };

  it('every released skill has at least one way to play or practise', () => {
    for (const k of SKILLS) {
      const games = gamesForSkill(k.id);
      const practice = practiceSlots({ ...pick, state: newSkillState(k.id) });
      expect(games.length + practice.length, k.id).toBeGreaterThan(0);
    }
  });

  it('a game only uses its own board style for its own skill, and levels climb within the cap', () => {
    for (const k of SKILLS) {
      for (const g of gamesForSkill(k.id)) {
        const slots = gameSlots({ ...pick, state: newSkillState(k.id), game: g });
        expect(slots.length, `${k.id} ${g}`).toBe(5);
        for (const s of slots) {
          expect(s.skillId).toBe(k.id);
          expect(TEMPLATE_BY_ID[s.templateId].board).toBe(GAMES[g].board);
          expect(s.reason).toBe('game');
        }
        expect(slots.at(-1)!.level).toBeGreaterThanOrEqual(slots[0].level);
      }
    }
    const capped = gameSlots({ rng: createRng(1), maxLevel: () => 3, state: { ...newSkillState('div.digit-sum'), rating: 2000 }, game: 'forge' });
    expect(capped.every((s) => s.level <= 3)).toBe(true);
  });

  it('the divisibility path has Pattern Sort, Missing Digit and Rule Detective', () => {
    expect(gamesForSkill('div.digit-sum')).toEqual(['gates', 'forge', 'breaker']);
    expect(GAMES.gates.name).toBe('Pattern Sort');
    expect(GAMES.forge.name).toBe('Missing Digit');
    expect(GAMES.breaker.name).toBe('Rule Detective');
  });

  it('a switched-off family is never offered, and an empty game is not offered at all', () => {
    const before = gameTemplates('div.digit-sum', 'forge').map((t) => t.id);
    expect(before.length).toBeGreaterThan(0);
    setRemoteDisabledTemplates(before);
    expect(gamesForSkill('div.digit-sum')).not.toContain('forge');
    expect(gameSlots({ ...pick, state: newSkillState('div.digit-sum'), game: 'forge' })).toEqual([]);
  });
});

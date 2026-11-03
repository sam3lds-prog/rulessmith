import { describe, expect, it } from 'vitest';
import { generateItem, SKILL_BY_ID, TEMPLATE_BY_ID } from '../content';
import { createRng } from '../content/rng';
import { BLUEPRINTS, coverage, examSkills } from '../exams/blueprints';
import { FEEL, NEUTRAL_EVENTS } from '../feel/events';
import { GAMES } from '../games/registry';
import { newSkillState } from '../engine/mastery';
import { DAY_MS } from '../engine/time';
import { MISSION_BY_ID, MISSIONS, missionSlots, missionState, nextMission, type Quests } from '../quests/chapters';
import { drillSlots, heldOutSlots, repairSlots, summarizeCheck } from '../quizzes/policies';
import { tokenBalance, weekKey, weeklyProgress, weeklyRewardEntry, weeksMet } from '../rewards/ledger';
import { migrateData, migrateSnapshot } from '../state/migrate';
import type { TokenEntry } from '../state/types';
import { INITIAL } from '../state/types';

const NOW = new Date(2026, 10, 4, 10).getTime(); // a Wednesday

describe('tokens and the weekly goal', () => {
  it('v4 removes workshop objects and refunds what was spent on them, keeping everything else', () => {
    const v3 = {
      ...INITIAL,
      grants: [{ id: 'item:fern', itemId: 'fern', source: 'purchase', at: 1, catalogVersion: 1 }],
      project: { itemId: 'rug', at: 1 },
      tokenLedger: [
        { id: 'session-1', delta: 40, reason: 'session', at: 1 },
        { id: 'buy:fern', delta: -15, reason: 'purchase', at: 2 },
        { id: 'weekly:2026-11-02', delta: 10, reason: 'weekly', at: 3 },
      ],
      quests: { 'gate-1': { version: 1, completedAt: 5, runs: 1 } },
      settings: { previewAds: false, sound: false, haptics: true, reduceMotion: false, focus: true },
    };
    const d = migrateData(v3 as unknown as Record<string, unknown>, 3) as unknown as Record<string, unknown>;
    expect(d.grants).toBeUndefined();
    expect(d.project).toBeUndefined();
    expect(tokenBalance(d.tokenLedger as TokenEntry[])).toBe(50);
    expect(d.tokens).toBe(50);
    expect((d.quests as Quests)['gate-1'].completedAt).toBe(5);
    expect(d.settings).toEqual({ previewAds: false, sound: false, haptics: true, reduceMotion: false });
    // A v3 server snapshot loses its objects and object purchases the same way.
    const snap = migrateSnapshot({ v: 3, ...v3 } as unknown as Record<string, unknown>)!;
    expect(snap).not.toHaveProperty('grants');
    expect(snap.tokenLedger.map((e) => e.id)).toEqual(['session-1', 'weekly:2026-11-02']);
  });

  it('a week runs Monday to Sunday, and its goal pays once', () => {
    expect(weekKey(NOW)).toBe('2026-11-02');
    expect(weekKey(new Date(2026, 10, 8, 23).getTime())).toBe('2026-11-02');
    expect(weekKey(new Date(2026, 10, 9, 1).getTime())).toBe('2026-11-09');
    const w = weeklyProgress(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], NOW);
    expect(w.days).toBe(3);
    expect(w.met).toBe(false);
    expect(weeklyRewardEntry(w.week, NOW).id).toBe('weekly:2026-11-02');
  });

  it('finds every week whose goal was met, including past ones', () => {
    const days = ['2026-10-19', '2026-10-20', '2026-10-22', '2026-10-25', '2026-10-27', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
    expect(weeksMet(days)).toEqual(['2026-10-19', '2026-11-02']);
  });
});

describe('chapters', () => {
  it('missions use real skills, templates and games', () => {
    for (const m of MISSIONS) {
      for (const s of m.skills) expect(SKILL_BY_ID[s], `${m.id} ${s}`).toBeTruthy();
      for (const step of m.steps) for (const t of step.templates) expect(TEMPLATE_BY_ID[t], `${m.id} ${t}`).toBeTruthy();
      if (m.game) expect(GAMES[m.game]).toBeTruthy();
      if (m.kind === 'play' || m.kind === 'transfer') expect(m.steps.length, m.id).toBeGreaterThan(0);
      else expect(m.length, m.id).toBeGreaterThan(0);
    }
  });

  it("builds each mission's puzzles: the right kind, no repeats, never above the learner's level cap", () => {
    for (const m of MISSIONS.filter((x) => x.steps.length)) {
      for (const seed of [1, 2, 3]) {
        const slots = missionSlots(m, { rng: createRng(seed), maxLevel: () => 3 });
        expect(slots.length, m.id).toBe(m.steps.reduce((n, s) => n + s.count, 0));
        const ids = new Set<string>();
        for (const slot of slots) {
          expect(slot.level, m.id).toBeLessThanOrEqual(3);
          expect(slot.support).toBe(m.support);
          const item = generateItem(slot.templateId, slot.level, slot.seed, { version: slot.version });
          const step = m.steps.find((s) => s.templates.includes(slot.templateId))!;
          if (step.accept) expect(step.accept(item), `${m.id} ${item.id}`).toBe(true);
          const key = item.payload.kind === 'refute' ? item.payload.claimText : item.id;
          expect(ids.has(key), `${m.id} repeats ${key}`).toBe(false);
          ids.add(key);
        }
      }
    }
  });

  it('the mission for 9 only uses "divisible by 9", and the first gate only 5 and 10', () => {
    const forge = missionSlots(MISSION_BY_ID['forge-9'], { rng: createRng(7), maxLevel: () => 10 });
    for (const s of forge) {
      const p = generateItem(s.templateId, s.level, s.seed).payload;
      expect(p.kind === 'construct' && p.p.op === 'div' && p.p.d === 9).toBe(true);
    }
    const gate = missionSlots(MISSION_BY_ID['gate-1'], { rng: createRng(7), maxLevel: () => 10 });
    for (const s of gate) {
      const p = generateItem(s.templateId, s.level, s.seed).payload;
      expect(p.kind === 'sort' && p.p.op === 'div' && [5, 10].includes(p.p.d)).toBe(true);
    }
  });

  it('missions are open in any order; recall waits for a day after the check', () => {
    const quests: Quests = {};
    expect(missionState(MISSION_BY_ID['check-gate'], quests, NOW).status).toBe('available');
    expect(missionState(MISSION_BY_ID['recall-gate'], quests, NOW).status).toBe('waiting');
    quests['check-gate'] = { version: 1, completedAt: NOW, runs: 1 };
    expect(missionState(MISSION_BY_ID['recall-gate'], quests, NOW + 3600_000).status).toBe('waiting');
    expect(missionState(MISSION_BY_ID['recall-gate'], quests, NOW + DAY_MS).status).toBe('available');
    expect(nextMission({}, NOW)?.id).toBe('gate-1');
    expect(nextMission({ 'gate-1': { version: 1, completedAt: NOW, runs: 1 } }, NOW)?.id).toBe('forge-9');
    expect(nextMission({}, NOW, 'harbor')?.id).toBe('rails-1');
  });
});

describe('quizzes', () => {
  const states = { 'div.digit-sum': { ...newSkillState('div.digit-sum'), status: 'practicing' as const, rating: 1100 } };

  it('a check is independent, avoids the families just played, mixes forms and includes an unfamiliar one', () => {
    for (const seed of [1, 2, 3, 4]) {
      const slots = heldOutSlots({ rng: createRng(seed), maxLevel: () => 10, skills: ['div.digit-sum'], states, length: 5, avoid: ['div.digit-sum/construct'], reason: 'check' });
      expect(slots).toHaveLength(5);
      expect(slots.every((s) => s.support === 'independent')).toBe(true);
      expect(slots.some((s) => s.templateId === 'div.digit-sum/construct')).toBe(false);
      expect(new Set(slots.map((s) => TEMPLATE_BY_ID[s.templateId].board)).size).toBeGreaterThanOrEqual(2);
      expect(slots.some((s) => TEMPLATE_BY_ID[s.templateId].transfer)).toBe(true);
    }
  });

  it('free learners get checks within their levels', () => {
    const slots = heldOutSlots({ rng: createRng(1), maxLevel: () => 3, skills: ['div.digit-sum', 'div.last-digit'], states: { 'div.digit-sum': { ...newSkillState('div.digit-sum'), rating: 1700 } }, length: 5, reason: 'check' });
    expect(Math.max(...slots.map((s) => s.level))).toBeLessThanOrEqual(3);
  });

  it('a drill spreads across the exam skills; a repair is short and guided', () => {
    const drill = drillSlots({ rng: createRng(2), maxLevel: () => 10, states: {}, skills: [{ id: 'div.last-digit', weight: 1 }, { id: 'rem.basics', weight: 1 }] });
    expect(drill).toHaveLength(12);
    expect(new Set(drill.map((s) => s.skillId)).size).toBe(2);
    const repair = repairSlots({ rng: createRng(3), maxLevel: () => 10, skillId: 'div.digit-sum', states });
    expect(repair).toHaveLength(3);
    expect(repair.every((s) => s.support === 'guided' && !TEMPLATE_BY_ID[s.templateId].transfer)).toBe(true);
  });

  it('the end of a check says what you can do, what needs a look, and what to play next', () => {
    const s = summarizeCheck([
      { skillId: 'div.last-digit', templateId: 'a', correct: true, hint: false },
      { skillId: 'div.digit-sum', templateId: 'rem.digit-rules/last-digits', correct: false, hint: false, misconception: 'used-digit-sum' },
      { skillId: 'div.digit-sum', templateId: 'rem.arithmetic/choose', correct: false, hint: false, misconception: 'multiplied-instead-of-added' },
      { skillId: 'div.digit-sum', templateId: 'c', correct: true, hint: false },
    ]);
    expect(s.correct).toBe(2);
    expect(s.canDo).toEqual(['div.last-digit']);
    expect(s.oneMoreLook[0]).toMatchObject({ skillId: 'div.digit-sum', missed: 2, of: 3 });
    // Only notes reviewed for that family: the remainder-arithmetic note depends on the question, so it isn't shown.
    expect(s.oneMoreLook[0].notes).toEqual(['The digit-sum test works for 3 and 9 only. Other divisors need their own test.']);
    expect(s.next).toEqual({ kind: 'repair', skillId: 'div.digit-sum' });
  });

  it('answers right only with a hint are not "on your own" and need one more look', () => {
    const s = summarizeCheck([
      { skillId: 'div.last-digit', templateId: 'a', correct: true, hint: true },
      { skillId: 'div.last-digit', templateId: 'b', correct: true, hint: false },
      { skillId: 'div.digit-sum', templateId: 'c', correct: true, hint: false },
    ]);
    expect(s).toMatchObject({ correct: 3, unaided: 2, helped: 1, total: 3 });
    expect(s.canDo).toEqual(['div.digit-sum']);
    expect(s.oneMoreLook).toEqual([{ skillId: 'div.last-digit', missed: 0, helped: 1, of: 2, notes: [] }]);
  });
});

describe('exam blueprints', () => {
  it('every exam links its official source and says what is covered', () => {
    for (const b of Object.values(BLUEPRINTS)) {
      expect(b.source.url).toMatch(/^https:\/\//);
      expect(b.domains.length).toBeGreaterThan(1);
      expect(b.scope.length).toBeGreaterThan(20);
    }
    expect(BLUEPRINTS.sat.domains.every((d) => d.status !== 'foundations')).toBe(true);
  });

  it('coverage counts released skills honestly', () => {
    const states = {
      'div.last-digit': { ...newSkillState('div.last-digit'), status: 'secure' as const },
      'div.digit-sum': { ...newSkillState('div.digit-sum'), status: 'practicing' as const },
    };
    const c = coverage(['gmat'], states, NOW);
    expect(c.released).toBe(examSkills(['gmat']).length);
    expect(c.secure).toBe(1);
    expect(c.practicing).toBe(1);
    expect(c.label).toBe(`1 of ${c.released} released skills secure`);
  });
});

describe('feedback grammar', () => {
  it('nothing heard before an independent answer hints at correctness', () => {
    const correctnessSounds = new Set([FEEL.correct.sound, FEEL.incorrect.sound]);
    for (const e of NEUTRAL_EVENTS) expect(correctnessSounds.has(FEEL[e].sound)).toBe(false);
    for (const spec of Object.values(FEEL)) expect(spec.visualMs[0]).toBeLessThanOrEqual(spec.visualMs[1]);
  });
});

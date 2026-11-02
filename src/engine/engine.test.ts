import { describe, expect, it } from 'vitest';
import { generateItem, checkItem, serveItem, setRemoteDisabledTemplates, SKILLS, TemplateUnavailableError, TEMPLATE_BY_ID } from '../content';
import { createRng } from '../content/rng';
import { dailySlot } from './daily';
import { applyAttempt, displayStatus, meetsSecure, newSkillState, secureGaps } from './mastery';
import {
  challengeSlot,
  composeSession,
  dueReviews,
  frontier,
  isReady,
  ladderNextLevel,
  makeSlot,
  replacementSlot,
  skillSession,
  supportFor,
  type States,
} from './mixer';
import { nextPlacementItem, placementRatings, recordPlacement, startPlacement } from './placement';
import { buildPlan, currentWeek, orderSkills, replanIfDue, selectSkills, todaysTargets } from './planner';
import { expectedSuccess, levelForBand } from './rating';
import { DAY_MS, dayKey as dayKeyOf } from './time';
import type { Attempt, EvidenceEntry, Profile, SkillState } from './types';

const NOW = new Date(2026, 10, 2, 9, 0, 0).getTime();

let seq = 0;
const attempt = (over: Partial<Attempt>): Attempt => ({
  id: `a${++seq}`,
  itemId: 'x',
  templateId: 'div.digit-sum/sort',
  templateVersion: 1,
  contentVersion: 'test',
  skillId: 'div.digit-sum',
  family: 'div.digit-sum/sort',
  level: 3,
  transfer: false,
  support: 'independent',
  correct: true,
  hintBeforeAnswer: false,
  hintsUsed: 0,
  ruleShown: false,
  ms: 20000,
  at: NOW,
  mode: 'journey',
  ...over,
});

const ev = (over: Partial<EvidenceEntry>): EvidenceEntry => ({ correct: true, support: 'independent', family: 'f0', transfer: false, day: 'd1', level: 3, ...over });

const profile = (over: Partial<Profile> = {}): Profile => ({
  ageBand: '18plus',
  role: 'working-adult',
  exams: ['gmat'],
  testDate: undefined,
  goal: { kind: 'score', target: '705' },
  currentLevel: { kind: 'self', rating: 3 },
  minutesPerDay: 20,
  daysPerWeek: 4,
  subjects: ['quant'],
  style: { timed: false },
  createdAt: NOW,
  ...over,
});

describe('difficulty', () => {
  it('picks harder levels for stronger learners and keeps success in band', () => {
    expect(levelForBand(1400, 'practice')).toBeGreaterThan(levelForBand(1000, 'practice'));
    const r = 1300;
    const lv = levelForBand(r, 'practice');
    const p = expectedSuccess(r, lv);
    expect(p).toBeGreaterThan(0.6);
    expect(p).toBeLessThan(0.9);
    expect(levelForBand(r, 'challenge')).toBeGreaterThanOrEqual(lv);
  });
});

describe('mastery', () => {
  it('becomes Secure only with 8/10 across 3 families, 2 days and a transfer item', () => {
    let s = newSkillState('div.digit-sum');
    const fams = ['div.digit-sum/sort', 'div.digit-sum/construct'];
    // Ten correct answers in two families on one day: not Secure.
    for (let i = 0; i < 10; i++) s = applyAttempt(s, attempt({ family: fams[i % 2] })).state;
    expect(s.status).toBe('practicing');
    expect(secureGaps(s)).toContain('practice on another day');
    // Next day, the transfer family (third family) completes it.
    s = applyAttempt(s, attempt({ family: 'div.digit-sum/count', transfer: true, at: NOW + DAY_MS })).state;
    expect(s.status).toBe('secure');
    expect(s.nextReviewAt).toBe(NOW + DAY_MS + DAY_MS);
  });

  it('hinted attempts are practice, not evidence', () => {
    let s = newSkillState('div.digit-sum');
    for (let i = 0; i < 10; i++) s = applyAttempt(s, attempt({ hintBeforeAnswer: true })).state;
    expect(s.evidence.length).toBe(0);
    expect(s.status).toBe('learning');
    expect(s.rating).toBeGreaterThan(1000);
  });

  it('after a missed review, Secure must be re-proved with fresh evidence', () => {
    const evidence = Array.from({ length: 10 }, (_, i) => ev({ family: `f${i % 3}`, transfer: i === 0, day: i < 5 ? 'd1' : 'd2', at: NOW - 1000 }));
    let s: SkillState = { ...newSkillState('div.digit-sum'), evidence, status: 'secure', reviewStage: 0, nextReviewAt: NOW };
    s = applyAttempt(s, attempt({ correct: false })).state;
    expect(s.status).toBe('practicing');
    // Old evidence still holds 9 of the last 10 correct, but it no longer counts toward Secure.
    s = applyAttempt(s, attempt({ correct: true, at: NOW + 1000 })).state;
    expect(s.status).toBe('practicing');
    expect(secureGaps(s)[0]).toMatch(/7 more correct/);
  });

  it('a missed review demotes Secure to Practicing; a correct one extends the interval', () => {
    const evidence = [
      ...Array.from({ length: 8 }, (_, i) => ev({ family: `f${i % 3}`, transfer: i === 0, day: i < 4 ? 'd1' : 'd2' })),
    ];
    expect(meetsSecure(evidence)).toBe(true);
    const secure = { ...newSkillState('div.digit-sum'), evidence, status: 'secure' as const, reviewStage: 0, nextReviewAt: NOW };
    expect(displayStatus(secure, NOW)).toBe('review');
    const kept = applyAttempt(secure, attempt({ correct: true })).state;
    expect(kept.status).toBe('secure');
    expect(kept.nextReviewAt).toBe(NOW + 3 * DAY_MS);
    const lost = applyAttempt(secure, attempt({ correct: false })).state;
    expect(lost.status).toBe('practicing');
  });
});

describe('guided practice and independent checks', () => {
  const fams = ['div.digit-sum/sort', 'div.digit-sum/construct', 'div.digit-sum/count'];

  it('answers with the rule on screen reach Practicing but can never make a skill Secure', () => {
    let s = newSkillState('div.digit-sum');
    // Ten correct guided answers that would meet every other Secure condition: 3 families, 2 days, a transfer item.
    for (let i = 0; i < 10; i++) {
      s = applyAttempt(s, attempt({ support: 'guided', ruleShown: true, family: fams[i % 3], transfer: i === 2, at: NOW + (i < 5 ? 0 : DAY_MS) })).state;
    }
    expect(s.status).toBe('practicing');
    expect(meetsSecure(s.evidence)).toBe(false);
    expect(secureGaps(s)[0]).toMatch(/8 more correct on your own/);
  });

  it('only independent answers count toward Secure', () => {
    let s = newSkillState('div.digit-sum');
    for (let i = 0; i < 6; i++) s = applyAttempt(s, attempt({ support: 'guided', family: fams[i % 3] })).state;
    for (let i = 0; i < 7; i++) s = applyAttempt(s, attempt({ family: fams[i % 3], transfer: i === 2, at: NOW + (i < 4 ? 0 : DAY_MS) })).state;
    expect(s.status).toBe('practicing');
    s = applyAttempt(s, attempt({ family: fams[0], at: NOW + DAY_MS })).state;
    expect(s.status).toBe('secure');
  });

  it('guided practice on a Secure skill neither proves nor disproves it', () => {
    const evidence = Array.from({ length: 8 }, (_, i) => ev({ family: `f${i % 3}`, transfer: i === 0, day: i < 4 ? 'd1' : 'd2' }));
    const secure: SkillState = { ...newSkillState('div.digit-sum'), evidence, status: 'secure', reviewStage: 0, nextReviewAt: NOW };
    const after = applyAttempt(secure, attempt({ support: 'guided', correct: false })).state;
    expect(after.status).toBe('secure');
    expect(after.nextReviewAt).toBe(NOW);
  });

  it('a skill is practised guided until Practicing, then checked independently; reviews are always independent', () => {
    const fresh = newSkillState('div.digit-sum');
    expect(supportFor(fresh, 'target')).toBe('guided');
    expect(supportFor({ ...fresh, status: 'learning' }, 'stretch')).toBe('guided');
    expect(supportFor({ ...fresh, status: 'practicing' }, 'target')).toBe('independent');
    for (const reason of ['review', 'checkpoint', 'ladder', 'challenge', 'daily', 'placement'] as const) expect(supportFor(fresh, reason)).toBe('independent');
  });

  it('free learners (levels 1 to 3) still get independent checks', () => {
    const st = { ...newSkillState('div.digit-sum'), status: 'practicing' as const, rating: 1600 };
    const slots = skillSession(st, { rng: createRng(5), maxLevel: () => 3 }, 8);
    expect(slots.every((x) => x.level <= 3)).toBe(true);
    expect(slots.every((x) => x.support === 'independent')).toBe(true);
    const learning = skillSession({ ...st, status: 'learning' }, { rng: createRng(5), maxLevel: () => 3 }, 8);
    expect(learning.every((x) => x.support === 'guided')).toBe(true);
  });
});

describe('kill switch and template versions', () => {
  it('a switched-off template is never generated or served, and slots are replaced like for like', () => {
    const slot = makeSlot(newSkillState('div.digit-sum'), 'learn', 'target', { rng: createRng(2), maxLevel: () => 10 });
    expect(serveItem(slot)).not.toBeNull();
    setRemoteDisabledTemplates([slot.templateId]);
    try {
      expect(() => generateItem(slot.templateId, slot.level, slot.seed)).toThrow(TemplateUnavailableError);
      expect(serveItem(slot)).toBeNull();
      // Audit and report triage can still rebuild the exact puzzle.
      expect(generateItem(slot.templateId, slot.level, slot.seed, { allowDisabled: true }).id).toBe(`${slot.templateId}@${slot.level}#${slot.seed}`);
      for (let i = 0; i < 20; i++) {
        const next = makeSlot(newSkillState('div.digit-sum'), 'learn', 'target', { rng: createRng(i + 10), maxLevel: () => 10 });
        expect(next.templateId).not.toBe(slot.templateId);
      }
      const repl = replacementSlot(slot, newSkillState('div.digit-sum'), { rng: createRng(3), maxLevel: () => 10 })!;
      expect(repl.templateId).not.toBe(slot.templateId);
      expect([repl.skillId, repl.reason, repl.support, repl.level]).toEqual([slot.skillId, slot.reason, slot.support, slot.level]);
    } finally {
      setRemoteDisabledTemplates([]);
    }
  });

  it('a skill with every family switched off yields no replacement', () => {
    const ids = Object.values(TEMPLATE_BY_ID).filter((t) => t.skillId === 'div.digit-sum').map((t) => t.id);
    const slot = makeSlot(newSkillState('div.digit-sum'), 'learn', 'target', { rng: createRng(2), maxLevel: () => 10 });
    setRemoteDisabledTemplates(ids);
    try {
      expect(replacementSlot(slot, newSkillState('div.digit-sum'), { rng: createRng(3), maxLevel: () => 10 })).toBeNull();
      const session = composeSession({ states: {}, targets: ['div.digit-sum'], now: NOW, rng: createRng(4), maxLevel: () => 10 });
      expect(session.some((x) => x.skillId === 'div.digit-sum')).toBe(false);
    } finally {
      setRemoteDisabledTemplates([]);
    }
  });

  it('the daily puzzle moves to the next family in the rotation when its own is switched off', () => {
    const day = '2026-11-02';
    const usual = dailySlot(day)!;
    setRemoteDisabledTemplates([usual.templateId]);
    try {
      const moved = dailySlot(day)!;
      expect(moved.templateId).not.toBe(usual.templateId);
      expect(dailySlot(day)).toEqual(moved);
      expect(moved.support).toBe('independent');
    } finally {
      setRemoteDisabledTemplates([]);
    }
  });

  it('a slot made by an older template version is not served as if it were the same puzzle', () => {
    const slot = makeSlot(newSkillState('div.digit-sum'), 'learn', 'target', { rng: createRng(2), maxLevel: () => 10 });
    expect(slot.version).toBe(TEMPLATE_BY_ID[slot.templateId].version);
    expect(serveItem({ ...slot, version: slot.version - 1 })).toBeNull();
    expect(() => generateItem(slot.templateId, slot.level, slot.seed, { version: slot.version + 1 })).toThrow(/changed/);
  });
});

describe('graph and mixer', () => {
  it('a skill is ready only when prerequisites are Practicing', () => {
    const states: States = {};
    expect(isReady(states, 'div.last-two')).toBe(false);
    states['div.last-digit'] = { ...newSkillState('div.last-digit'), status: 'practicing' };
    expect(isReady(states, 'div.last-two')).toBe(true);
    expect(frontier(states)).toContain('div.last-two');
  });

  it('composes a session that mixes target, review and stretch, with playable items', () => {
    const states: States = {
      'div.last-digit': { ...newSkillState('div.last-digit'), status: 'secure', nextReviewAt: NOW - 1000, rating: 1200 },
      'div.digit-sum': { ...newSkillState('div.digit-sum'), status: 'practicing', rating: 1150 },
    };
    expect(dueReviews(states, NOW)).toEqual(['div.last-digit']);
    const slots = composeSession({ states, targets: ['div.digit-sum'], now: NOW, rng: createRng(3), maxLevel: () => 10 });
    expect(slots.length).toBe(8);
    expect(slots.some((s) => s.reason === 'review' && s.skillId === 'div.last-digit')).toBe(true);
    expect(slots.filter((s) => s.reason === 'target').length).toBeGreaterThanOrEqual(4);
    expect(slots.some((s) => s.reason === 'stretch')).toBe(true);
    for (const slot of slots) {
      const item = generateItem(slot.templateId, slot.level, slot.seed);
      expect(checkItem(item, item.key).correct).toBe(true);
    }
  });

  it('respects the free-tier level cap', () => {
    const states: States = { 'div.digit-sum': { ...newSkillState('div.digit-sum'), status: 'practicing', rating: 1700 } };
    const slots = composeSession({ states, targets: ['div.digit-sum'], now: NOW, rng: createRng(9), maxLevel: () => 3 });
    expect(Math.max(...slots.map((s) => s.level))).toBeLessThanOrEqual(3);
  });

  it('challenge runs use the chosen level range, not the free-tier cap', () => {
    for (let i = 0; i < 20; i++) {
      const slot = challengeSlot(['div.combined'], [8, 10], { rng: createRng(i + 1), maxLevel: () => 3 }, {});
      expect(slot.level).toBeGreaterThanOrEqual(8);
      expect(slot.level).toBeLessThanOrEqual(10);
    }
  });

  it('ladder climbs on success and drops on a miss', () => {
    expect(ladderNextLevel(4, true)).toBe(5);
    expect(ladderNextLevel(4, false)).toBe(3);
    expect(ladderNextLevel(10, true)).toBe(10);
  });
});

describe('placement', () => {
  it('asks 8 to 15 items and rates a strong learner above a weak one', () => {
    const run = (correct: boolean) => {
      let s = startPlacement({ exams: ['gmat'], currentLevel: { kind: 'self', rating: 3 } });
      let n = 0;
      for (let item = nextPlacementItem(s); item && !s.done; item = nextPlacementItem(s)) {
        s = recordPlacement(s, { ...item, correct });
        n++;
      }
      return { n, ratings: placementRatings(s, ['gmat']) };
    };
    const strong = run(true);
    const weak = run(false);
    expect(strong.n).toBeGreaterThanOrEqual(8);
    expect(strong.n).toBeLessThanOrEqual(15);
    expect(strong.ratings['div.digit-sum']).toBeGreaterThan(weak.ratings['div.digit-sum']);
  });
});

describe('journey planner', () => {
  it('orders skills so prerequisites always come first', () => {
    const ids = selectSkills(['gmat']);
    const order = orderSkills(ids, ['gmat'], {});
    for (const id of order) {
      const skill = SKILLS.find((s) => s.id === id)!;
      for (const p of skill.prereqs) if (order.includes(p)) expect(order.indexOf(p)).toBeLessThan(order.indexOf(id));
    }
  });

  it('builds a fitting plan with milestones and checkpoints', () => {
    const plan = buildPlan(profile({ testDate: '2027-03-01' }), {}, NOW);
    expect(plan.fits).toBe(true);
    expect(plan.weeks.length).toBeGreaterThan(1);
    expect(plan.weeks.some((w) => w.checkpoint)).toBe(true);
    expect(plan.summary).toMatch(/GMAT Quant plan: 4 sessions a week, 20 minutes each/);
    expect(todaysTargets(plan, {}, NOW).length).toBeGreaterThan(0);
    expect(currentWeek(plan, NOW)?.index).toBe(0);
  });

  it('says so when the plan does not fit, and offers alternatives', () => {
    const plan = buildPlan(profile({ testDate: '2026-11-20', minutesPerDay: 10, daysPerWeek: 3 }), {}, NOW);
    expect(plan.fits).toBe(false);
    expect(plan.dropped.length).toBeGreaterThan(0);
    expect(plan.alternatives.map((a) => a.kind).sort()).toEqual(['later-date', 'more-time', 'narrower']);
  });

  it('re-planning keeps week numbers moving, so checkpoints still arrive', () => {
    const p = profile({ testDate: '2027-04-01' });
    const plan = buildPlan(p, {}, NOW);
    const later = NOW + 15 * DAY_MS;
    const next = replanIfDue(plan, p, {}, later)!;
    expect(next).not.toBe(plan);
    expect(next.startedOn).toBe(plan.startedOn);
    expect(currentWeek(next, later)?.index).toBe(2);
    expect(currentWeek(next, later)?.checkpoint).toBe(true);
    expect(next.summary).toMatch(/Week 3:/);
  });

  it('the later-date alternative fits, even across a daylight-saving change', () => {
    for (const start of [new Date(2027, 2, 1, 9).getTime(), new Date(2027, 9, 20, 9).getTime()]) {
      const p = profile({ testDate: '2027-03-20', minutesPerDay: 10, daysPerWeek: 3 });
      const tight = buildPlan({ ...p, testDate: dayKeyOf(start + 14 * DAY_MS) }, {}, start);
      const later = tight.alternatives.find((a) => a.kind === 'later-date');
      expect(later).toBeTruthy();
      const moved = buildPlan({ ...p, testDate: (later as { date: string }).date }, {}, start);
      expect(moved.fits).toBe(true);
    }
  });

  it('a plan where nothing fits still reads properly', () => {
    const plan = buildPlan(profile({ testDate: '2026-11-09', minutesPerDay: 10, daysPerWeek: 3 }), {}, NOW);
    expect(plan.summary).not.toMatch(/undefined/);
  });

  it('placement does not drift for a learner answering exactly as expected', () => {
    let s = startPlacement({ exams: ['gmat'], currentLevel: { kind: 'self', rating: 3 } });
    const start = s.theta;
    for (let i = 0; i < 6; i++) {
      const item = nextPlacementItem(s)!;
      // Alternate right and wrong around a 60% target: expected net change is small.
      s = recordPlacement(s, { ...item, correct: i % 5 !== 1 && i % 5 !== 3 });
    }
    expect(Math.abs(s.theta - start)).toBeLessThan(150);
  });

  it('gives a rolling plan without a test date, and re-plans after a week', () => {
    const p = profile();
    const plan = buildPlan(p, {}, NOW);
    expect(plan.rolling).toBe(true);
    expect(plan.summary).toMatch(/rolling/);
    expect(replanIfDue(plan, p, {}, NOW + 3 * DAY_MS)).toBe(plan);
    const states: States = { 'div.last-digit': { ...newSkillState('div.last-digit'), status: 'secure' } };
    const next = replanIfDue(plan, p, states, NOW + 8 * DAY_MS)!;
    expect(next).not.toBe(plan);
    expect(next.order).not.toContain('div.last-digit');
  });
});

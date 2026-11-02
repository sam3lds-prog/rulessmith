import { describe, expect, it } from 'vitest';
import { generateItem, checkItem, SKILLS } from '../content';
import { createRng } from '../content/rng';
import { applyAttempt, displayStatus, meetsSecure, newSkillState, secureGaps } from './mastery';
import { challengeSlot, composeSession, dueReviews, frontier, isReady, ladderNextLevel, type States } from './mixer';
import { nextPlacementItem, placementRatings, recordPlacement, startPlacement } from './placement';
import { buildPlan, currentWeek, orderSkills, replanIfDue, selectSkills, todaysTargets } from './planner';
import { expectedSuccess, levelForBand } from './rating';
import { DAY_MS, dayKey as dayKeyOf } from './time';
import type { Attempt, Profile, SkillState } from './types';

const NOW = new Date(2026, 10, 2, 9, 0, 0).getTime();

const attempt = (over: Partial<Attempt>): Attempt => ({
  itemId: 'x',
  skillId: 'div.digit-sum',
  family: 'div.digit-sum/sort',
  level: 3,
  transfer: false,
  correct: true,
  hintBeforeAnswer: false,
  ms: 20000,
  at: NOW,
  mode: 'journey',
  ...over,
});

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
  style: { timed: false, reminders: true },
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
    const evidence = Array.from({ length: 10 }, (_, i) => ({ correct: true, family: `f${i % 3}`, transfer: i === 0, day: i < 5 ? 'd1' : 'd2', level: 3, at: NOW - 1000 }));
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
      ...Array.from({ length: 8 }, (_, i) => ({ correct: true, family: `f${i % 3}`, transfer: i === 0, day: i < 4 ? 'd1' : 'd2', level: 3 })),
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

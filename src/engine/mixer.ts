/**
 * Review scheduling and session composition.
 *
 * A journey session is 60% target topic, 30% due review, 10% stretch (plan
 * defaults; test other mixes). Template choice favours item families the
 * learner has not yet proven, and brings in a transfer item once a skill is
 * Practicing so the Secure rule can be met.
 *
 * Support (guided or independent) is decided per slot by `supportFor`: a skill
 * is practised with the rule on screen until it reaches Practicing, then
 * checked with the rule hidden. Reviews, checkpoints, ladders, challenges, the
 * daily puzzle and placement are always independent. This holds at every
 * level, so free learners (levels 1 to 3) get real independent checks too.
 */
import { SKILL_BY_ID, SKILLS } from '../content/curriculum';
import { templatesForSkill, templateVersionOf } from '../content';
import type { Rng } from '../content/rng';
import { independentEvidence, isReviewDue, newSkillState, SECURE_RULE } from './mastery';
import { levelForBand } from './rating';
import type { Band, SkillState, Slot, Support } from './types';

export type States = Record<string, SkillState>;

export const stateOf = (states: States, id: string) => states[id] ?? newSkillState(id);

export function dueReviews(states: States, now: number): string[] {
  return Object.values(states)
    .filter((s) => isReviewDue(s, now))
    .sort((a, b) => (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0))
    .map((s) => s.skillId);
}

const rank = { new: 0, learning: 1, practicing: 2, secure: 3 } as const;

/** A skill is ready once every prerequisite has reached Practicing. */
export function isReady(states: States, skillId: string): boolean {
  const skill = SKILL_BY_ID[skillId];
  return !!skill && skill.prereqs.every((p) => rank[stateOf(states, p).status] >= rank.practicing);
}

/** Skills ready to learn now, not yet Secure, in curriculum order. */
export function frontier(states: States, among: string[] = SKILLS.map((s) => s.id)): string[] {
  return among.filter((id) => stateOf(states, id).status !== 'secure' && isReady(states, id));
}

export function bandFor(s: SkillState): Band {
  return s.status === 'new' || s.status === 'learning' ? 'learn' : 'practice';
}

/**
 * Guided while a skill is new or being learned; independent once it is Practicing,
 * and always independent for reviews, checks and challenges.
 */
export function supportFor(state: SkillState, reason: Slot['reason']): Support {
  if (reason === 'target' || reason === 'stretch') return state.status === 'new' || state.status === 'learning' ? 'guided' : 'independent';
  return 'independent';
}

export interface PickOptions {
  rng: Rng;
  maxLevel: (skillId: string) => number;
  /** Seeds served recently per template, to avoid repeats within 30 days. */
  recentSeeds?: Record<string, number[]>;
}

/** Every family for a skill is switched off (or none exists at this level). Callers skip the skill. */
export class NoTemplatesError extends Error {
  constructor(readonly skillId: string) {
    super(`No servable templates for ${skillId}`);
    this.name = 'NoTemplatesError';
  }
}

/** Whether a skill has anything to serve at a level right now (the kill switch can empty a skill). */
export const hasTemplates = (skillId: string, level = 10) => templatesForSkill(skillId, level).length > 0;

/** Choose a template family for a skill: unproven families first, transfer once Practicing. */
export function pickTemplate(state: SkillState, level: number, rng: Rng): string {
  const ts = templatesForSkill(state.skillId, level);
  if (ts.length === 0) throw new NoTemplatesError(state.skillId);
  const win = independentEvidence(state.evidence).slice(-SECURE_RULE.window);
  const provenTransfer = win.some((e) => e.correct && e.transfer);
  if (state.status === 'practicing' && !provenTransfer) {
    const transfer = ts.filter((t) => t.transfer);
    if (transfer.length && rng.chance(0.5)) return rng.pick(transfer).id;
  }
  const counts = (id: string) => win.filter((e) => e.family === id && e.correct).length;
  const pool = state.status === 'new' ? ts.filter((t) => !t.transfer) : ts;
  const min = Math.min(...pool.map((t) => counts(t.id)));
  return rng.pick(pool.filter((t) => counts(t.id) === min)).id;
}

export function freshSeed(rng: Rng, templateId: string, recent?: Record<string, number[]>): number {
  const used = new Set(recent?.[templateId] ?? []);
  for (let i = 0; i < 20; i++) {
    const s = rng.int(1, 2 ** 31 - 1);
    if (!used.has(s)) return s;
  }
  return rng.int(1, 2 ** 31 - 1);
}

export function makeSlot(
  state: SkillState,
  band: Band,
  reason: Slot['reason'],
  opts: PickOptions,
  levelOverride?: number,
  support: Support = supportFor(state, reason),
): Slot {
  const cap = opts.maxLevel(state.skillId);
  const level = Math.min(cap, levelOverride ?? levelForBand(state.rating, band));
  const templateId = pickTemplate(state, level, opts.rng);
  return {
    skillId: state.skillId,
    templateId,
    version: templateVersionOf(templateId),
    level,
    seed: freshSeed(opts.rng, templateId, opts.recentSeeds),
    band,
    reason,
    support,
  };
}

/**
 * A fresh slot for the same job as `slot` (same skill, band, reason, support),
 * used when the old one can no longer be served. Null if the skill has nothing left to serve.
 */
export function replacementSlot(slot: Slot, state: SkillState, opts: PickOptions): Slot | null {
  try {
    return makeSlot(state, slot.band, slot.reason, { ...opts, maxLevel: () => slot.level }, slot.level, slot.support);
  } catch (e) {
    if (e instanceof NoTemplatesError) return null;
    throw e;
  }
}

/** Interleave groups so the session alternates topic, review and stretch work. */
function interleave(target: Slot[], review: Slot[], stretch: Slot[]): Slot[] {
  const out: Slot[] = [];
  // Warm up with two target items, then alternate.
  out.push(...target.splice(0, 2));
  while (target.length || review.length) {
    if (review.length) out.push(review.shift()!);
    if (target.length) out.push(target.shift()!);
    if (target.length && out.length % 3 === 0) out.push(target.shift()!);
  }
  out.push(...stretch);
  return out;
}

export interface ComposeArgs extends PickOptions {
  states: States;
  /** Target skills for today, from the journey plan (or the learner's pick). */
  targets: string[];
  now: number;
  length?: number;
}

export function composeSession(args: ComposeArgs): Slot[] {
  const { states, now } = args;
  const length = args.length ?? 8;
  const nReview = Math.round(length * 0.3);
  const nStretch = Math.max(1, Math.round(length * 0.1));

  // Skills whose every family is switched off are skipped everywhere.
  const servable = (ids: string[]) => ids.filter((id) => hasTemplates(id));

  const reviews = servable(dueReviews(states, now)).slice(0, nReview);
  // Not enough due? Revisit Practicing skills that were seen longest ago.
  if (reviews.length < nReview) {
    const older = Object.values(states)
      .filter((s) => s.status === 'practicing' && !args.targets.includes(s.skillId) && !reviews.includes(s.skillId))
      .sort((a, b) => (a.lastSeenAt ?? 0) - (b.lastSeenAt ?? 0))
      .map((s) => s.skillId);
    reviews.push(...servable(older).slice(0, nReview - reviews.length));
  }

  let targets = servable(args.targets.filter((id) => stateOf(states, id).status !== 'secure'));
  if (targets.length === 0) targets = servable(frontier(states)).slice(0, 2);
  if (targets.length === 0) targets = servable(SKILLS.map((s) => s.id)).slice(0, 1);
  if (targets.length === 0) return [];
  targets = targets.slice(0, 2);

  const nTarget = length - reviews.length - nStretch;
  const targetSlots = Array.from({ length: nTarget }, (_, i) => {
    const st = stateOf(states, targets[i % targets.length]);
    return makeSlot(st, bandFor(st), 'target', args);
  });
  const reviewSlots = reviews.map((id) => makeSlot(stateOf(states, id), 'practice', 'review', args));

  // Stretch: the next ready skill if the target is going well, otherwise a challenge item on the target.
  const next = frontier(states).find((id) => !targets.includes(id) && hasTemplates(id));
  const lead = stateOf(states, targets[0]);
  const stretchSkill = next && lead.status === 'practicing' ? stateOf(states, next) : lead;
  const stretchSlots = Array.from({ length: nStretch }, () => makeSlot(stretchSkill, stretchSkill === lead ? 'challenge' : 'learn', 'stretch', args));

  return interleave(targetSlots, reviewSlots, stretchSlots);
}

/** A focused run on one skill. */
export function skillSession(state: SkillState, opts: PickOptions, length = 8): Slot[] {
  return Array.from({ length }, (_, i) => makeSlot(state, i === length - 1 ? 'challenge' : bandFor(state), 'target', opts));
}

/** Mixed checkpoint: transfer-heavy items across skills the learner is working on or has secured. */
export function checkpointSession(states: States, opts: PickOptions, length = 10): Slot[] {
  const pool = Object.values(states).filter(
    (s) => (s.status === 'practicing' || s.status === 'secure') && hasTemplates(s.skillId, Math.min(opts.maxLevel(s.skillId), levelForBand(s.rating, 'practice'))),
  );
  if (pool.length === 0) return [];
  return Array.from({ length }, (_, i) => {
    const st = pool[i % pool.length];
    const level = Math.min(opts.maxLevel(st.skillId), levelForBand(st.rating, 'practice'));
    const ts = templatesForSkill(st.skillId, level);
    const transfer = ts.filter((t) => t.transfer);
    const t = transfer.length && opts.rng.chance(0.6) ? opts.rng.pick(transfer) : opts.rng.pick(ts);
    return {
      skillId: st.skillId,
      templateId: t.id,
      version: t.version,
      level,
      seed: freshSeed(opts.rng, t.id, opts.recentSeeds),
      band: 'practice' as Band,
      reason: 'checkpoint' as const,
      support: 'independent' as const,
    };
  });
}

/** Challenge builder: learner-chosen skills and level range, generated on demand. */
export function challengeSlot(skills: string[], levels: [number, number], opts: PickOptions, states: States): Slot {
  const open = skills.filter((id) => hasTemplates(id, levels[1]));
  if (open.length === 0) throw new NoTemplatesError(skills.join(','));
  const st = stateOf(states, opts.rng.pick(open));
  const level = opts.rng.int(levels[0], levels[1]);
  // Access to this level range is checked when the run starts (Challenge pack or
  // Premium for 8 to 10), so the normal-session level cap does not apply here.
  return makeSlot(st, 'challenge', 'challenge', { ...opts, maxLevel: () => 10 }, level);
}

/** Endless ladder: up one level after each success; the run ends after three misses. */
export function ladderNextLevel(level: number, correct: boolean): number {
  return correct ? Math.min(10, level + 1) : Math.max(1, level - 1);
}
export const LADDER_MISSES = 3;

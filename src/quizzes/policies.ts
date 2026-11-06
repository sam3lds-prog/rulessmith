/**
 * Quizzes: what each kind is for and how it behaves, plus the slot builders.
 * Pure: unit-tested.
 *
 * - practice: a chosen skill or missed concept; help available; explanation after each answer.
 * - check:    about five fresh items; rule hidden, no hints shown first; explanations after the set.
 * - drill:    10 to 15 items across the exam's released skills; error review afterwards.
 * - recall:   a short fresh set after a gap.
 * - repair:   a short guided set on a concept the learner just missed, before a fresh check.
 *
 * "Fresh" means held out: a check avoids the families the learner just played
 * (a game that showed the solution pattern must not supply the same question
 * as unseen), mixes board forms, and includes an unfamiliar framing when one exists.
 * Every first response is recorded as it was; a later retry never replaces it.
 */
import { SKILL_BY_ID, templatesForSkill, type Template } from '../content';
import type { Rng } from '../content/rng';
import { freshSeed, stateOf, type States } from '../engine/mixer';
import { levelForBand } from '../engine/rating';
import type { Slot, Support } from '../engine/types';

export type QuizKind = 'practice' | 'check' | 'drill' | 'recall' | 'repair';

export interface QuizPolicy {
  kind: QuizKind;
  title: string;
  length: number;
  support: Support;
  feedback: 'immediate' | 'after-set';
  /** Whether a clock may be shown (only where the learner asked for timed practice). */
  timing: 'never' | 'optional';
  /** Uses one of the day's free runs. */
  countsAsRun: boolean;
}

export const POLICIES: Record<QuizKind, QuizPolicy> = {
  practice: { kind: 'practice', title: 'Practice quiz', length: 6, support: 'guided', feedback: 'immediate', timing: 'never', countsAsRun: true },
  check: { kind: 'check', title: 'Concept check', length: 5, support: 'independent', feedback: 'after-set', timing: 'never', countsAsRun: false },
  drill: { kind: 'drill', title: 'Mixed exam drill', length: 12, support: 'independent', feedback: 'after-set', timing: 'optional', countsAsRun: true },
  recall: { kind: 'recall', title: 'Recall check', length: 3, support: 'independent', feedback: 'immediate', timing: 'never', countsAsRun: false },
  repair: { kind: 'repair', title: 'Repair', length: 3, support: 'guided', feedback: 'immediate', timing: 'never', countsAsRun: false },
};

interface Pick {
  rng: Rng;
  maxLevel: (skillId: string) => number;
  recentSeeds?: Record<string, number[]>;
}

/**
 * Held-out, independent items across `skills`: families in `avoid` are skipped
 * where the skill has others, board forms are mixed, and one unfamiliar
 * (transfer) framing is included when the skill has one.
 */
export function heldOutSlots(args: Pick & { skills: string[]; states: States; length: number; avoid?: string[]; reason: Slot['reason'] }): Slot[] {
  const { rng, states, length } = args;
  const skills = args.skills.filter((id) => templatesForSkill(id).length > 0);
  if (skills.length === 0) return [];
  const avoid = new Set(args.avoid ?? []);
  const usedTemplates = new Set<string>();
  const usedBoards = new Set<string>();
  let transferUsed = false;
  const order = rng.shuffle(skills);
  const slots: Slot[] = [];
  for (let i = 0; i < length; i++) {
    const skillId = order[i % order.length];
    const st = stateOf(states, skillId);
    const level = Math.max(1, Math.min(args.maxLevel(skillId), levelForBand(st.rating, 'practice')));
    const all = templatesForSkill(skillId, level);
    const fresh = all.filter((t) => !avoid.has(t.id));
    const pool = fresh.length ? fresh : all;
    const score = (t: Template) =>
      (usedTemplates.has(t.id) ? 0 : 4) + (usedBoards.has(t.board) ? 0 : 2) + (!transferUsed && t.transfer ? 3 : 0) + rng.next();
    const t = [...pool].sort((a, b) => score(b) - score(a))[0];
    usedTemplates.add(t.id);
    usedBoards.add(t.board);
    if (t.transfer) transferUsed = true;
    slots.push({
      skillId,
      templateId: t.id,
      version: t.version,
      level,
      seed: freshSeed(rng, t.id, args.recentSeeds),
      band: 'practice',
      reason: args.reason,
      support: 'independent',
    });
  }
  return slots;
}

/** A mixed drill weighted toward the skills the exam leans on and the learner hasn't secured. */
export function drillSlots(args: Pick & { skills: { id: string; weight: number }[]; states: States; length?: number }): Slot[] {
  const length = args.length ?? POLICIES.drill.length;
  const weighted = args.skills
    .filter((s) => s.weight > 0 && templatesForSkill(s.id).length > 0)
    .map((s) => ({ id: s.id, w: s.weight * (stateOf(args.states, s.id).status === 'secure' ? 0.5 : 1) }));
  if (weighted.length === 0) return [];
  const total = weighted.reduce((n, s) => n + s.w, 0);
  const chosen: string[] = [];
  for (let i = 0; i < length; i++) {
    let r = args.rng.next() * total;
    const hit = weighted.find((s) => (r -= s.w) <= 0) ?? weighted[weighted.length - 1];
    chosen.push(hit.id);
  }
  return chosen.flatMap((id) => heldOutSlots({ ...args, skills: [id], length: 1, reason: 'drill' }));
}

/**
 * A short guided repair for a missed concept: build-and-sort families first
 * (the Forge and Gates games), at an easier level than the check.
 */
export function repairSlots(args: Pick & { skillId: string; states: States; length?: number }): Slot[] {
  const st = stateOf(args.states, args.skillId);
  const level = Math.max(1, Math.min(args.maxLevel(args.skillId), levelForBand(st.rating, 'learn') - 1));
  const all = templatesForSkill(args.skillId, level).filter((t) => !t.transfer);
  if (all.length === 0) return [];
  const preferred = [...all].sort((a, b) => rank(a) - rank(b));
  return Array.from({ length: args.length ?? POLICIES.repair.length }, (_, i) => {
    const t = preferred[i % preferred.length];
    return {
      skillId: args.skillId,
      templateId: t.id,
      version: t.version,
      level,
      seed: freshSeed(args.rng, t.id, args.recentSeeds),
      band: 'learn' as const,
      reason: 'repair' as const,
      support: 'guided' as const,
    };
  });
}

const BOARD_RANK: Record<string, number> = { construct: 0, sort: 1, factor: 1, rail: 1, refute: 2, choice: 3, numeric: 4 };
const rank = (t: Template) => BOARD_RANK[t.board] ?? 5;

// ------------------------------------------------------------------ after a check

export interface CheckAnswer {
  skillId: string;
  templateId: string;
  correct: boolean;
  hint: boolean;
  misconception?: string;
}

export interface CheckSummary {
  correct: number;
  /** Right with no hint and the rule hidden: what "on your own" means everywhere else. */
  unaided: number;
  /** Right, but after a hint or revealing the rule. */
  helped: number;
  total: number;
  /** "What can I do?" Skills answered right every time, on your own. */
  canDo: string[];
  /** "What needs one more look?" Missed, or right only with help. */
  oneMoreLook: { skillId: string; missed: number; helped: number; of: number; notes: string[] }[];
  /** "What should I play next?" */
  next: { kind: 'repair'; skillId: string } | { kind: 'continue' };
}

export function summarizeCheck(answers: CheckAnswer[]): CheckSummary {
  const bySkill = new Map<string, CheckAnswer[]>();
  for (const a of answers) bySkill.set(a.skillId, [...(bySkill.get(a.skillId) ?? []), a]);
  const canDo: string[] = [];
  const oneMoreLook: CheckSummary['oneMoreLook'] = [];
  for (const [skillId, list] of bySkill) {
    const missed = list.filter((a) => !a.correct).length;
    const helped = list.filter((a) => a.correct && a.hint).length;
    if (missed === 0 && helped === 0) canDo.push(skillId);
    else {
      const notes = [...new Set(list.filter((a) => !a.correct && a.misconception).map((a) => noteFor(a.templateId, a.misconception)).filter(Boolean))] as string[];
      oneMoreLook.push({ skillId, missed, helped, of: list.length, notes });
    }
  }
  // Misses first, then answers that needed help.
  oneMoreLook.sort((a, b) => b.missed / b.of - a.missed / a.of || b.helped / b.of - a.helped / a.of);
  return {
    correct: answers.filter((a) => a.correct).length,
    unaided: answers.filter((a) => a.correct && !a.hint).length,
    helped: answers.filter((a) => a.correct && a.hint).length,
    total: answers.length,
    canDo,
    oneMoreLook,
    next: oneMoreLook.length ? { kind: 'repair', skillId: oneMoreLook[0].skillId } : { kind: 'continue' },
  };
}

/** Short coaching for named wrong answers. Shown after a check, never before an answer. */
export const MISCONCEPTION_NOTES: Record<string, string> = {
  'used-digit-sum': 'The digit-sum test works for 3 and 9 only. Other divisors need their own test.',
  'used-only-last-digit': 'For 4 and 8, one last digit is not enough: use the last two or three.',
  'five-means-even': 'Ending in 5 makes a number odd, not even.',
  'five-is-enough-for-ten': 'Divisible by 10 needs a last digit of 0; 5 is not enough.',
  'even-is-enough-for-ten': 'Even is not enough for 10: the last digit must be 0.',
  'even-means-divisible-by-5': 'Even and divisible by 5 are separate tests: 5 needs a last digit of 0 or 5.',
  'ends-in-zero-also-fits': 'A number ending in 0 passes the test for 10 too; check the "but not" part.',
  'composite-base': 'Every base in a prime factorization must itself be prime: 4 and 6 are not.',
  'swapped-gcd-lcm': 'The GCD is the largest shared factor; the LCM is the smallest shared multiple.',
  'smaller-number-is-gcd': 'The smaller number is the GCD only when it divides the larger one.',
  'common-divisor-not-greatest': 'That divides both numbers, but a larger number does too.',
  'common-multiple-not-least': 'That is a shared multiple, but a smaller one exists.',
  'multiplied-instead-of-lcm': 'Multiplying gives a common multiple, not always the least one.',
  'assumed-coprime': 'The numbers share a factor, so their product is not their LCM.',
  'forgot-plus-one': 'For the number of factors, add one to each exponent before multiplying.',
  'excluded-1-and-n': '1 and the number itself are factors too.',
  'exponent-sum': 'Multiply the (exponent + 1) terms; don’t add them.',
  'cycle-off-by-one': 'In a cycle, a remainder of 0 means the last position, not the first.',
  'cycle-step-off': "Count places in the cycle from the first power: the exponent's remainder picks the place, and a remainder of 0 is the last place.",
  'quotient-for-remainder': 'The remainder is what is left after the full groups. How many full groups there are is the quotient.',
  'distance-to-next-multiple': 'The remainder counts up from the multiple below the number, not down from the multiple above it.',
  'used-exponent-remainder': 'Divide the exponent by the cycle length, then find that position in the cycle.',
  'multiple-not-remainder': 'The remainder is what is left over, not the multiple below it.',
  'quotient-confusion': 'The question asks for the remainder, not how many times it divides.',
  'off-by-one': 'Count again carefully at the ends of the range.',
  'added-instead-of-multiplied': 'For a product, multiply the remainders (then reduce).',
  'multiplied-instead-of-added': 'For a sum, add the remainders (then reduce).',
};

/**
 * Which notes a reviewer has checked against each family's actual questions. A
 * tag's note is shown only for the families listed here: the same tag can mean
 * something different elsewhere (a remainder slip is not a factor-count slip),
 * and some notes only fit one kind of question. Add a family only after
 * checking the note against every question it can generate.
 */
export const REVIEWED_NOTES: Record<string, string[]> = {
  'div.last-digit/context': ['ends-in-zero-also-fits', 'even-means-divisible-by-5', 'five-means-even', 'five-is-enough-for-ten', 'even-is-enough-for-ten'],
  'pf.primes/rows': ['composite-base'],
  'pf.divisor-count/choose': ['forgot-plus-one', 'exponent-sum', 'excluded-1-and-n'],
  'pf.gcd-lcm/choose': ['multiplied-instead-of-lcm', 'swapped-gcd-lcm', 'common-multiple-not-least', 'smaller-number-is-gcd', 'common-divisor-not-greatest'],
  'rem.digit-rules/last-digits': ['used-digit-sum'],
  'rem.basics/match': ['quotient-for-remainder', 'distance-to-next-multiple'],
  'rem.cycles/match': ['cycle-step-off'],
};

/** The reviewed note for a tagged wrong answer in this family, if there is one. */
export function noteFor(templateId: string | undefined, tag: string | undefined): string | undefined {
  if (!templateId || !tag || !REVIEWED_NOTES[templateId]?.includes(tag)) return undefined;
  return MISCONCEPTION_NOTES[tag];
}

export const skillTitle = (id: string) => SKILL_BY_ID[id]?.name ?? id;

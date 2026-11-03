/**
 * Paths (chapters) and their steps (missions). A mission is a short, versioned
 * set of puzzles with one mathematical goal. Completing one is recorded, but it
 * never marks a skill Secure: only evidence does. Ids are stored in saved data
 * and never change; titles may.
 *
 * Learning is never locked behind story: every mission can be played at any
 * time, in any order. The order is a recommendation. The one exception is a
 * recall mission, which only makes sense after a gap.
 *
 * Pure: unit-tested.
 */
import { generateItem, templateVersionOf, type Item } from '../content';
import type { Rng } from '../content/rng';
import type { GameId } from '../games/registry';
import { freshSeed } from '../engine/mixer';
import type { Slot, Support } from '../engine/types';

export type MissionKind = 'play' | 'check' | 'transfer' | 'recall';

export interface MissionStep {
  templates: string[];
  levels: [number, number];
  count: number;
  /** Only puzzles that pass this are used (e.g. "divisible by 9" for the digit-sum mission). */
  accept?: (item: Item) => boolean;
}

export interface Mission {
  id: string;
  /** Bump when the steps change; completion is recorded with the version played. */
  version: number;
  chapterId: string;
  title: string;
  /** The mathematical goal, in one sentence. */
  goal: string;
  kind: MissionKind;
  game?: GameId;
  support: Support;
  skills: string[];
  /** For play and transfer missions. Check and recall missions are built by the quiz policies. */
  steps: MissionStep[];
  /** Number of questions for check and recall missions. */
  length?: number;
  /** What the learner can do afterwards, in one sentence. */
  outcome: string;
  /** Recall missions open this many hours after `after` is complete. */
  after?: string;
  waitHours?: number;
  minutes: number;
}

export interface Chapter {
  id: string;
  title: string;
  /** The topic track the path belongs to. */
  track: string;
  blurb: string;
  missions: Mission[];
}

const isDiv = (item: Item, ds: number[]) => item.payload.kind === 'sort' || item.payload.kind === 'construct' ? item.payload.p.op === 'div' && ds.includes(item.payload.p.d) : false;
const claimText = (item: Item) => (item.payload.kind === 'refute' ? item.payload.claimText : item.id);

export const GATEHOUSE: Chapter = {
  id: 'gatehouse',
  title: 'Divisibility path',
  track: 'div',
  blurb: 'Divisibility rules you can see and use: last digits, then digit sums.',
  missions: [
    {
      id: 'gate-1',
      version: 1,
      chapterId: 'gatehouse',
      title: 'Sort by 5 and 10',
      goal: 'Use the last digit to test for 5 and 10.',
      kind: 'play',
      game: 'gates',
      support: 'guided',
      skills: ['div.last-digit'],
      steps: [{ templates: ['div.last-digit/sort'], levels: [1, 2], count: 3, accept: (i) => isDiv(i, [5, 10]) }],
      outcome: 'You can tell at a glance whether a number is divisible by 5 or 10.',
      minutes: 2,
    },
    {
      id: 'forge-9',
      version: 1,
      chapterId: 'gatehouse',
      title: 'Missing digit: multiples of 9',
      goal: 'Use digit sums to test divisibility by 9.',
      kind: 'play',
      game: 'forge',
      support: 'guided',
      skills: ['div.digit-sum'],
      steps: [{ templates: ['div.digit-sum/construct'], levels: [1, 3], count: 4, accept: (i) => isDiv(i, [9]) }],
      outcome: 'You can complete a number so its digits add to a multiple of 9.',
      minutes: 3,
    },
    {
      id: 'breaker-3-9',
      version: 1,
      chapterId: 'gatehouse',
      title: 'Is every multiple of 3 a multiple of 9?',
      goal: 'Divisible by 3 does not mean divisible by 9.',
      kind: 'play',
      game: 'breaker',
      support: 'guided',
      skills: ['div.digit-sum'],
      steps: [{ templates: ['div.digit-sum/refute'], levels: [1, 3], count: 3 }],
      outcome: 'You can show with one number that divisible by 3 does not mean divisible by 9.',
      minutes: 2,
    },
    {
      id: 'check-gate',
      version: 1,
      chapterId: 'gatehouse',
      title: 'Check last digits and digit sums',
      goal: 'Use the last-digit and digit-sum rules with them hidden.',
      kind: 'check',
      support: 'independent',
      skills: ['div.last-digit', 'div.digit-sum'],
      steps: [],
      length: 5,
      outcome: 'Evidence that you can use these rules with the rule hidden.',
      minutes: 4,
    },
    {
      id: 'transfer-gate',
      version: 1,
      chapterId: 'gatehouse',
      title: 'Use the rules on new problems',
      goal: 'Use the rules in an unfamiliar problem.',
      kind: 'transfer',
      support: 'independent',
      skills: ['div.last-digit', 'div.digit-sum'],
      steps: [{ templates: ['div.last-digit/context', 'div.digit-sum/count'], levels: [2, 3], count: 3 }],
      outcome: 'You can use the rules in a problem that looks different.',
      minutes: 3,
    },
    {
      id: 'recall-gate',
      version: 1,
      chapterId: 'gatehouse',
      title: 'Recall it a day later',
      goal: 'Recall the rules after a day away.',
      kind: 'recall',
      support: 'independent',
      skills: ['div.last-digit', 'div.digit-sum'],
      steps: [],
      length: 3,
      after: 'check-gate',
      waitHours: 20,
      outcome: 'Evidence that the rules stuck after a day away.',
      minutes: 2,
    },
  ],
};

export const FOUNDRY: Chapter = {
  id: 'foundry',
  title: 'Prime factors path',
  track: 'pf',
  blurb: 'Every number breaks into the same primes, whichever way you split it.',
  missions: [
    {
      id: 'factory-1',
      version: 1,
      chapterId: 'foundry',
      title: 'Split numbers into primes',
      goal: 'Break numbers into their prime parts.',
      kind: 'play',
      game: 'factory',
      support: 'guided',
      skills: ['pf.factorize'],
      steps: [{ templates: ['pf.factorize/tree'], levels: [1, 3], count: 4 }],
      outcome: 'You can break any number here into its primes.',
      minutes: 3,
    },
    {
      id: 'check-foundry',
      version: 1,
      chapterId: 'foundry',
      title: 'Check prime factors',
      goal: 'Spot primes and factorize with no help on screen.',
      kind: 'check',
      support: 'independent',
      skills: ['pf.primes', 'pf.factorize'],
      steps: [],
      length: 5,
      outcome: 'Evidence that you can factorize with the rule hidden.',
      minutes: 4,
    },
  ],
};

export const HARBOR: Chapter = {
  id: 'harbor',
  title: 'Remainders path',
  track: 'rem',
  blurb: 'Remainders and cycles: complete loops change nothing.',
  missions: [
    {
      id: 'rails-1',
      version: 1,
      chapterId: 'harbor',
      title: 'Walk the remainder loop',
      goal: 'Find where a long walk round a loop ends.',
      kind: 'play',
      game: 'rails',
      support: 'guided',
      skills: ['rem.basics', 'rem.cycles'],
      steps: [
        { templates: ['rem.basics/rail'], levels: [1, 2], count: 3 },
        { templates: ['rem.cycles/rail'], levels: [1, 3], count: 2 },
      ],
      outcome: 'You can find where a long walk round a loop ends using the remainder.',
      minutes: 3,
    },
    {
      id: 'check-harbor',
      version: 1,
      chapterId: 'harbor',
      title: 'Check remainders',
      goal: 'Find remainders and cycle positions with no help on screen.',
      kind: 'check',
      support: 'independent',
      skills: ['rem.basics', 'rem.cycles'],
      steps: [],
      length: 5,
      outcome: 'Evidence that you can find remainders with the rule hidden.',
      minutes: 4,
    },
  ],
};

export const CHAPTERS: Chapter[] = [GATEHOUSE, FOUNDRY, HARBOR];
export const MISSIONS: Mission[] = CHAPTERS.flatMap((c) => c.missions);
export const MISSION_BY_ID: Record<string, Mission> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
export const CHAPTER_BY_ID: Record<string, Chapter> = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));

// ------------------------------------------------------------------ progress

export interface QuestRecord {
  version: number;
  startedAt?: number;
  completedAt?: number;
  /** Best result on check-type missions. */
  best?: { correct: number; total: number };
  runs: number;
}

export type Quests = Record<string, QuestRecord>;

export type MissionState = { status: 'done'; at: number } | { status: 'available' } | { status: 'waiting'; readyAt: number };

export function missionState(m: Mission, quests: Quests, now: number): MissionState {
  const rec = quests[m.id];
  if (rec?.completedAt) return { status: 'done', at: rec.completedAt };
  if (m.after) {
    const prior = quests[m.after]?.completedAt;
    if (!prior) return { status: 'waiting', readyAt: Infinity };
    const readyAt = prior + (m.waitHours ?? 0) * 3600 * 1000;
    if (now < readyAt) return { status: 'waiting', readyAt };
  }
  return { status: 'available' };
}

export const missionsDone = (quests: Quests) => Object.values(quests).filter((q) => q.completedAt).length;

export function chapterProgress(c: Chapter, quests: Quests) {
  const done = c.missions.filter((m) => quests[m.id]?.completedAt).length;
  return { done, of: c.missions.length };
}

/**
 * The recommended next mission: the first available, unfinished one, starting
 * with `preferChapter` (the chapter for the learner's next plan topic).
 */
export function nextMission(quests: Quests, now: number, preferChapter?: string): Mission | undefined {
  const order = preferChapter ? [CHAPTER_BY_ID[preferChapter], ...CHAPTERS.filter((c) => c.id !== preferChapter)].filter(Boolean) : CHAPTERS;
  for (const c of order) for (const m of c.missions) if (missionState(m, quests, now).status === 'available') return m;
  return undefined;
}

export const chapterForTrack = (track: string) => CHAPTERS.find((c) => c.track === track);

// ------------------------------------------------------------------ building a mission's puzzles

/**
 * Puzzles for a play or transfer mission. Seeds are tried until the puzzle
 * passes the step's `accept` rule, is not a repeat of another puzzle in the
 * mission (or a recently seen seed), and its template is servable.
 */
export function missionSlots(m: Mission, opts: { rng: Rng; maxLevel: (skillId: string) => number; recentSeeds?: Record<string, number[]> }): Slot[] {
  const slots: Slot[] = [];
  const seen = new Set<string>();
  for (const step of m.steps) {
    for (let i = 0; i < step.count; i++) {
      const templateId = step.templates[i % step.templates.length];
      for (let tries = 0; tries < 400; tries++) {
        const seed = freshSeed(opts.rng, templateId, opts.recentSeeds);
        const wanted = opts.rng.int(step.levels[0], step.levels[1]);
        let item: Item;
        try {
          item = generateItem(templateId, wanted, seed);
        } catch {
          break;
        }
        if (Math.min(wanted, opts.maxLevel(item.skillId)) !== wanted) {
          // A free learner never gets a level above their cap.
          item = generateItem(templateId, Math.min(wanted, opts.maxLevel(item.skillId)), seed);
        }
        if (step.accept && !step.accept(item)) continue;
        const key = item.payload.kind === 'refute' ? claimText(item) : item.id;
        if (seen.has(key)) continue;
        seen.add(key);
        slots.push({
          skillId: item.skillId,
          templateId,
          version: templateVersionOf(templateId),
          level: item.level,
          seed,
          band: 'learn',
          reason: 'quest',
          support: m.support,
        });
        break;
      }
    }
  }
  return slots;
}

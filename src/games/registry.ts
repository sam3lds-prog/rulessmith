/**
 * The games. Each one is a presentation of an existing board: it declares what
 * it teaches and how it looks, and produces the same typed Responses the
 * checker grades. Grading never moves into a game.
 *
 * Game ids are stored in saved sessions and missions, so they never change;
 * only their names do.
 */
import { templatesForSkill } from '../content';
import type { BoardKind, Item, Template } from '../content/types';
import { freshSeed, supportFor, type PickOptions } from '../engine/mixer';
import { levelForBand } from '../engine/rating';
import type { SkillState, Slot } from '../engine/types';

export type GameId = 'gates' | 'forge' | 'breaker' | 'factory' | 'rails';

export interface Game {
  id: GameId;
  name: string;
  /** One line under the title: what you do. */
  tagline: string;
  board: BoardKind;
  /** What the game is good for, in learner language. */
  teaches: string;
  submitLabel: string;
  /** Short line under a guided round. */
  guidedNote: string;
}

export const GAMES: Record<GameId, Game> = {
  gates: {
    id: 'gates',
    name: 'Pattern Sort',
    tagline: 'Sort each number by the condition on screen.',
    board: 'sort',
    teaches: 'From simple divisibility to near misses and combined conditions.',
    submitLabel: 'Check my sort',
    guidedNote: 'Practice with the rule on screen. Tap a placed number to move it.',
  },
  forge: {
    id: 'forge',
    name: 'Missing Digit',
    tagline: 'Place digits so the number meets the condition.',
    board: 'construct',
    teaches: '"Find one" accepts any digit that works. "Find all" needs every digit that works, and no others.',
    submitLabel: 'Check my number',
    guidedNote: 'Practice with the rule on screen. Any valid answer counts.',
  },
  breaker: {
    id: 'breaker',
    name: 'Rule Detective',
    tagline: 'Test a claim. Find the number that breaks it, if there is one.',
    board: 'refute',
    teaches: 'A counterexample must meet the condition and break the conclusion.',
    submitLabel: 'Check my verdict',
    guidedNote: 'Examples never prove a rule. One counterexample breaks it.',
  },
  factory: {
    id: 'factory',
    name: 'Factor Split',
    tagline: 'Split a number until every piece is prime.',
    board: 'factor',
    teaches: 'Any route of splits ends in the same primes.',
    submitLabel: 'Check my primes',
    guidedNote: 'Practice with the rule on screen. Prime pieces are marked.',
  },
  rails: {
    id: 'rails',
    name: 'Remainder Loop',
    tagline: 'Find where a walk round a loop of stops lands.',
    board: 'rail',
    teaches: 'Complete loops change nothing: only the remainder matters.',
    submitLabel: 'Check my stop',
    guidedNote: 'Practice with the rule on screen. Group the complete loops first.',
  },
};

export const GAME_ORDER: GameId[] = ['gates', 'forge', 'breaker', 'factory', 'rails'];

const BY_BOARD: Partial<Record<BoardKind, GameId>> = { sort: 'gates', construct: 'forge', refute: 'breaker', factor: 'factory', rail: 'rails' };

/** The game an item is played in, or null for plain question formats (choice, numeric). */
export const gameForBoard = (board: BoardKind): GameId | null => BY_BOARD[board] ?? null;
export const gameForItem = (item: Pick<Item, 'board'>) => gameForBoard(item.board);

/** Enabled templates for a skill that a game can play, at or below `maxLevel`. */
export function gameTemplates(skillId: string, game: GameId, maxLevel = 10): Template[] {
  return templatesForSkill(skillId, maxLevel).filter((t) => gameForBoard(t.board) === game);
}

/** The games a skill can be played in right now (switched-off families and level limits respected). */
export function gamesForSkill(skillId: string, maxLevel = 10): GameId[] {
  return GAME_ORDER.filter((g) => gameTemplates(skillId, g, maxLevel).length > 0);
}

export const GAME_ROUNDS = 5;

/**
 * Rounds of one game for one skill. Levels start at the learner's practice band
 * and step up every two rounds (never above the cap). Support follows the
 * usual rule (guided while New or Learning, rule hidden once Practicing), so a
 * game counts as real evidence. Empty if the skill has nothing for this game.
 */
export function gameSlots(args: PickOptions & { state: SkillState; game: GameId; length?: number }): Slot[] {
  const { state, game, rng } = args;
  const cap = args.maxLevel(state.skillId);
  const base = Math.max(1, Math.min(cap, levelForBand(state.rating, 'practice')));
  const length = args.length ?? GAME_ROUNDS;
  const slots: Slot[] = [];
  let last: string | undefined;
  for (let i = 0; i < length; i++) {
    const want = Math.min(cap, base + Math.floor(i / 2));
    // The highest level at or below `want` that has a template for this game.
    let level = want;
    while (level > 1 && gameTemplates(state.skillId, game, level).length === 0) level--;
    const pool = gameTemplates(state.skillId, game, level);
    if (pool.length === 0) return [];
    const varied = pool.length > 1 ? pool.filter((t) => t.id !== last) : pool;
    const t = rng.pick(varied);
    last = t.id;
    slots.push({
      skillId: state.skillId,
      templateId: t.id,
      version: t.version,
      level,
      seed: freshSeed(rng, t.id, args.recentSeeds),
      band: 'practice',
      reason: 'game',
      support: supportFor(state, 'target'),
    });
  }
  return slots;
}

/**
 * Guided practice on one skill: the rule stays on screen and each answer gets
 * feedback at once. `templateId` narrows it to one family (practising a
 * mistake); otherwise it rotates through the skill's families.
 */
export function practiceSlots(args: PickOptions & { state: SkillState; templateId?: string; length?: number }): Slot[] {
  const { state, rng } = args;
  const cap = args.maxLevel(state.skillId);
  const level = Math.max(1, Math.min(cap, levelForBand(state.rating, 'learn')));
  let pool = templatesForSkill(state.skillId, level);
  if (args.templateId) pool = pool.filter((t) => t.id === args.templateId);
  if (pool.length === 0) return [];
  const order = rng.shuffle(pool);
  return Array.from({ length: args.length ?? 6 }, (_, i) => {
    const t = order[i % order.length];
    return {
      skillId: state.skillId,
      templateId: t.id,
      version: t.version,
      level,
      seed: freshSeed(rng, t.id, args.recentSeeds),
      band: 'learn' as const,
      reason: 'practice' as const,
      support: 'guided' as const,
    };
  });
}

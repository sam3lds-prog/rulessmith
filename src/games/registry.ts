/**
 * The games. Each one is a presentation of an existing board: it declares what
 * it teaches and how it looks, and produces the same typed Responses the
 * checker grades. Grading never moves into a game.
 */
import type { BoardKind, Item } from '../content/types';

export type GameId = 'gates' | 'forge' | 'breaker' | 'factory' | 'rails';

export interface Game {
  id: GameId;
  name: string;
  /** One line under the title: what you do. */
  tagline: string;
  board: BoardKind;
  /** What the game is good for, in learner language. */
  teaches: string;
  /** Help the game can show in guided play. Independent checks show none of it before submitting. */
  help: ('rule' | 'hints' | 'representation')[];
  submitLabel: string;
  /** Short line for a guided round. */
  guidedNote: string;
}

export const GAMES: Record<GameId, Game> = {
  gates: {
    id: 'gates',
    name: 'Number Gates',
    tagline: 'Route each number through the right gate.',
    board: 'sort',
    teaches: 'Classify numbers by a rule: last digits, digit sums, primes.',
    help: ['rule', 'hints'],
    submitLabel: 'Check my routes',
    guidedNote: 'This is guided play. Take your time.',
  },
  forge: {
    id: 'forge',
    name: 'Number Forge',
    tagline: 'Fit a digit. Wake the machine.',
    board: 'construct',
    teaches: 'Build a number that meets a rule. Every valid answer counts.',
    help: ['rule', 'hints', 'representation'],
    submitLabel: 'Test your number',
    guidedNote: 'This is guided play. Take your time.',
  },
  breaker: {
    id: 'breaker',
    name: 'Rule Breaker',
    tagline: 'Break a false claim with one number.',
    board: 'refute',
    teaches: 'Test a claim, and find the counterexample that breaks it.',
    help: ['rule', 'hints'],
    submitLabel: 'Test the claim',
    guidedNote: 'Examples never prove a rule. One counterexample breaks it.',
  },
  factory: {
    id: 'factory',
    name: 'Factor Factory',
    tagline: 'Split it down to prime parts.',
    board: 'factor',
    teaches: 'Prime factorization as structure: every route ends in the same primes.',
    help: ['rule', 'hints', 'representation'],
    submitLabel: 'Check my primes',
    guidedNote: 'This is guided play. Prime pieces are marked.',
  },
  rails: {
    id: 'rails',
    name: 'Remainder Rails',
    tagline: 'Send the token round the loop.',
    board: 'rail',
    teaches: 'Remainders and cycles: complete loops change nothing.',
    help: ['rule', 'hints', 'representation'],
    submitLabel: 'Send the token',
    guidedNote: 'This is guided play. Group the complete loops first.',
  },
};

const BY_BOARD: Partial<Record<BoardKind, GameId>> = { sort: 'gates', construct: 'forge', refute: 'breaker', factor: 'factory', rail: 'rails' };

/** The game an item is played in, or null for plain question formats (choice, numeric). */
export const gameForBoard = (board: BoardKind): GameId | null => BY_BOARD[board] ?? null;
export const gameForItem = (item: Pick<Item, 'board'>) => gameForBoard(item.board);

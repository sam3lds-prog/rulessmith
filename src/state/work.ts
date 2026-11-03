/**
 * Whether an open session holds work the learner would lose if it were
 * replaced: an answer, a hint, a revealed rule, or anything placed on the board.
 * A session that was only opened can be replaced freely. Pure: unit-tested.
 */
import type { BoardDraft } from '../content/types';
import type { ActiveSession } from './types';

export function draftHasWork(d: BoardDraft | null | undefined): boolean {
  if (!d) return false;
  switch (d.kind) {
    case 'sort':
      return d.bins.some((b) => b !== null);
    case 'construct':
      return d.fill.some((x) => x !== null);
    case 'constructAll':
      return d.picked.length > 0;
    case 'refute':
      return d.choice !== null;
    case 'choice':
      return d.sel !== null;
    case 'numeric':
      return d.text !== '';
    case 'factor':
      return d.splits.length > 0;
    case 'rail':
      return d.stop !== null;
  }
}

export function sessionHasWork(a: ActiveSession | undefined): boolean {
  if (!a) return false;
  if (a.results.length > 0) return true;
  const p = a.progress;
  return !!p && (p.hints > 0 || p.ruleRevealed || draftHasWork(p.draft));
}

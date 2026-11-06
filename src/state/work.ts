/**
 * Whether an open session holds work the learner would lose if it were
 * replaced: an answer, a hint, a revealed rule, or anything placed on the board.
 * A session that was only opened can be replaced freely. Pure: unit-tested.
 */
import type { BoardDraft } from '../content/types';
import { rebuildSkills } from '../sync/merge';
import type { ActiveSession, Data } from './types';

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
    case 'maze':
      // The start square is always on the path; anything past it is work.
      return d.path.length > 1;
    case 'match':
      return d.pairs.some((x) => x !== null);
  }
}

export function sessionHasWork(a: ActiveSession | undefined): boolean {
  if (!a) return false;
  if (a.results.length > 0) return true;
  const p = a.progress;
  return !!p && (p.hints > 0 || p.ruleRevealed || !!p.example || draftHasWork(p.draft));
}

/**
 * The learning record as screens outside a session may show it. While a check
 * or drill holds its verdicts until the end (`feedback: 'after-set'`), its
 * answers so far are left out of mistake lists, evidence counts and skill
 * statuses, so leaving mid-check never reveals how it is going. Skill states
 * are rebuilt from the remaining attempts, which gives exactly the live states
 * without those answers.
 */
export function visibleRecord(d: Pick<Data, 'attempts' | 'skills' | 'placementRuns' | 'baseline' | 'active'>): Pick<Data, 'attempts' | 'skills'> {
  const a = d.active;
  if (!a || a.feedback !== 'after-set' || a.results.length === 0) return { attempts: d.attempts, skills: d.skills };
  const held = new Set(a.results.map((r) => r.attemptId));
  const attempts = d.attempts.filter((x) => !held.has(x.id));
  return { attempts, skills: rebuildSkills(attempts, d.placementRuns, d.baseline) };
}

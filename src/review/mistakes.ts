/**
 * Reviewing mistakes from the attempt log, the permanent record.
 *
 * A puzzle is shown again only when it can be rebuilt exactly: same template,
 * same version, same level and seed. Items are deterministic, so that rebuild
 * is the puzzle the learner saw. Anything else gets an honest fallback with only
 * what is known (the answer given, the topic, the date):
 * - `changed`: the template has a newer version, or the answer predates versions;
 * - `withdrawn`: the template is switched off (it may have had a problem), so it
 *   isn't shown, even for review, and never served as a new question;
 * - `unknown`: the template no longer exists;
 * - `no-response`: the answer was recorded before responses were stored.
 *
 * The first answer is never regraded: the verdict shown is the one recorded.
 * If today's checker would grade the same response differently (the checking
 * was corrected), that is flagged instead of silently changing history.
 * Pure: unit-tested.
 */
import { checkItem, generateItem, isTemplateDisabled, parseItemId, TEMPLATE_BY_ID } from '../content';
import type { CheckResult, Item } from '../content/types';
import type { Attempt } from '../engine/types';

export type ReviewStatus = 'ok' | 'corrected' | 'changed' | 'withdrawn' | 'unknown' | 'no-response';

export interface ReviewEntry {
  attempt: Attempt;
  status: ReviewStatus;
  /** Present for `ok` and `corrected`. */
  item?: Item;
  /** Today's checker on the recorded response, for the explanation only. */
  result?: CheckResult;
}

/** Rebuild the puzzle behind an attempt, or say why it can't be shown. */
export function reviewEntry(attempt: Attempt): ReviewEntry {
  const parsed = parseItemId(attempt.itemId);
  const template = parsed ? TEMPLATE_BY_ID[parsed.templateId] : undefined;
  if (!parsed || !template) return { attempt, status: 'unknown' };
  if (isTemplateDisabled(parsed.templateId)) return { attempt, status: 'withdrawn' };
  if (!attempt.templateVersion || attempt.templateVersion !== template.version) return { attempt, status: 'changed' };
  let item: Item;
  try {
    item = generateItem(parsed.templateId, parsed.level, parsed.seed, { version: attempt.templateVersion });
  } catch {
    return { attempt, status: 'changed' };
  }
  if (!attempt.response) return { attempt, status: 'no-response', item };
  const result = checkItem(item, attempt.response);
  return { attempt, item, result, status: result.correct === attempt.correct ? 'ok' : 'corrected' };
}

/** Wrong first answers, newest first, optionally for one skill. Placement answers are included: they are real answers too. */
export function mistakes(attempts: Attempt[], opts: { skillId?: string; limit?: number } = {}): Attempt[] {
  const out = attempts.filter((a) => !a.correct && (!opts.skillId || a.skillId === opts.skillId)).sort((a, b) => b.at - a.at);
  return opts.limit ? out.slice(0, opts.limit) : out;
}

/** Mistake counts per skill, for filters and the Progress tab. */
export function mistakeCounts(attempts: Attempt[], since = 0): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of attempts) if (!a.correct && a.at >= since) out[a.skillId] = (out[a.skillId] ?? 0) + 1;
  return out;
}

export const STATUS_NOTE: Record<Exclude<ReviewStatus, 'ok'>, string> = {
  corrected: "We've corrected how this puzzle is checked since you answered. Your answer stays as it was recorded; the explanation below is the current one.",
  changed: "This puzzle has changed since you answered, so it can't be shown exactly. Your answer is still in your record.",
  withdrawn: "This puzzle was taken out of use, so it isn't shown again. Your answer is still in your record.",
  unknown: 'This kind of puzzle is no longer in the app. Your answer is still in your record.',
  'no-response': 'This answer was saved before the app kept a copy of what you entered, so only the puzzle is shown.',
};

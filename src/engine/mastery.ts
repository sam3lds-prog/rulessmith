/**
 * Evidence and mastery. Three separate systems share the skill graph:
 * difficulty (rating.ts), evidence of understanding (this file), and memory
 * review (the review fields here, scheduled by mixer.ts). A learner who is
 * slow, used a hint, saw the rule, or keeps seeing one format is never
 * labelled Secure.
 *
 * Evidence comes in two kinds (Support):
 * - guided: the rule was on screen. Counts toward Practicing.
 * - independent: the rule was hidden and no hint was used. Counts toward Practicing and Secure.
 * A hint (or revealing a hidden rule) before answering makes the attempt practice only: no evidence at all.
 */
import { BASE_RATING, updateRating } from './rating';
import { DAY_MS, dayKey } from './time';
import type { Attempt, DisplayStatus, EvidenceEntry, SkillState } from './types';

/** Secure = 8 of the last 10 independent first attempts, across 3+ families and 2+ days, including a transfer item. */
export const SECURE_RULE = { window: 10, minCorrect: 8, minFamilies: 3, minDays: 2, needsTransfer: true };

/** Practicing = 4 of the last 6 unhinted attempts, guided or independent. (Draft threshold; revise with real data.) */
export const PRACTICING_RULE = { window: 6, minAttempts: 4, minCorrect: 4 };

export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 21];

/** Guided entries share the list, so it keeps enough room for a full Secure window of independent ones. */
const EVIDENCE_CAP = 40;

export function newSkillState(skillId: string, rating = BASE_RATING): SkillState {
  return { skillId, rating, attempts: 0, evidence: [], status: 'new', reviewStage: 0 };
}

/** Only independent answers (rule hidden, no hints) can prove Secure. */
export const independentEvidence = (evidence: EvidenceEntry[]) => evidence.filter((e) => e.support === 'independent');

export function meetsSecure(evidence: EvidenceEntry[]): boolean {
  const win = independentEvidence(evidence).slice(-SECURE_RULE.window);
  const right = win.filter((e) => e.correct);
  if (right.length < SECURE_RULE.minCorrect) return false;
  if (new Set(right.map((e) => e.family)).size < SECURE_RULE.minFamilies) return false;
  if (new Set(right.map((e) => e.day)).size < SECURE_RULE.minDays) return false;
  if (SECURE_RULE.needsTransfer && !right.some((e) => e.transfer)) return false;
  return true;
}

export function meetsPracticing(evidence: EvidenceEntry[]): boolean {
  const win = evidence.slice(-PRACTICING_RULE.window);
  return win.length >= PRACTICING_RULE.minAttempts && win.filter((e) => e.correct).length >= PRACTICING_RULE.minCorrect;
}

export const isReviewDue = (s: SkillState, now: number) =>
  s.status === 'secure' && s.nextReviewAt !== undefined && now >= s.nextReviewAt;

export function displayStatus(s: SkillState | undefined, now: number): DisplayStatus {
  if (!s) return 'new';
  return isReviewDue(s, now) ? 'review' : s.status;
}

/** What the Secure rule still needs, in learner language. Empty when Secure. */
export function secureGaps(s: SkillState): string[] {
  if (s.status === 'secure') return [];
  const ev = s.demotedAt !== undefined ? s.evidence.filter((e) => (e.at ?? 0) > (s.demotedAt as number)) : s.evidence;
  const win = independentEvidence(ev).slice(-SECURE_RULE.window);
  const right = win.filter((e) => e.correct);
  const gaps: string[] = [];
  const more = SECURE_RULE.minCorrect - right.length;
  if (more > 0) gaps.push(`${more} more correct on your own (rule hidden, no hints)`);
  const fams = new Set(right.map((e) => e.family)).size;
  if (fams < SECURE_RULE.minFamilies) gaps.push(`${SECURE_RULE.minFamilies - fams} more puzzle type${SECURE_RULE.minFamilies - fams === 1 ? '' : 's'}`);
  if (new Set(right.map((e) => e.day)).size < SECURE_RULE.minDays) gaps.push('practice on another day');
  if (!right.some((e) => e.transfer)) gaps.push('one unfamiliar problem');
  return gaps;
}

function demote(s: SkillState, now: number) {
  s.status = 'practicing';
  s.reviewStage = 0;
  s.nextReviewAt = undefined;
  s.secureAt = undefined;
  s.demotedAt = now;
}

const scheduleNext = (now: number, stage: number) =>
  now + REVIEW_INTERVALS_DAYS[Math.min(stage, REVIEW_INTERVALS_DAYS.length - 1)] * DAY_MS;

export interface AttemptOutcome {
  state: SkillState;
  from: DisplayStatus;
  to: DisplayStatus;
}

export function applyAttempt(prev: SkillState, a: Attempt, now = a.at): AttemptOutcome {
  const from = displayStatus(prev, now);
  const s: SkillState = { ...prev, evidence: [...prev.evidence] };
  s.attempts += 1;
  s.lastSeenAt = now;

  const independent = a.support === 'independent' && !a.hintBeforeAnswer;
  // Difficulty: hinted or guided attempts still move the rating, but by half as much.
  const k = (prev.attempts < 10 ? 40 : 24) * (independent ? 1 : 0.5);
  s.rating = updateRating(prev.rating, a.level, a.correct, k);

  if (!a.hintBeforeAnswer) {
    s.evidence.push({ correct: a.correct, support: a.support, family: a.family, transfer: a.transfer, day: dayKey(a.at), level: a.level, at: a.at });
    if (s.evidence.length > EVIDENCE_CAP) s.evidence.splice(0, s.evidence.length - EVIDENCE_CAP);
    // Fluency is measured only when the learner worked unaided.
    if (a.correct && independent) s.fluencyMs = s.fluencyMs === undefined ? a.ms : Math.round(s.fluencyMs * 0.7 + a.ms * 0.3);
  }

  if (prev.status === 'secure') {
    // Practice on a secured skill (hinted or guided) neither proves nor disproves it.
    if (!independent) return { state: s, from, to: displayStatus(s, now) };
    if (isReviewDue(prev, now)) {
      if (a.correct) {
        s.reviewStage = prev.reviewStage + 1;
        s.nextReviewAt = scheduleNext(now, s.reviewStage);
      } else {
        demote(s, now);
      }
    } else if (!a.correct) {
      const win = independentEvidence(s.evidence).slice(-SECURE_RULE.window);
      if (win.filter((e) => e.correct).length < SECURE_RULE.minCorrect) demote(s, now);
    }
    return { state: s, from, to: displayStatus(s, now) };
  }

  // After a demotion, Secure has to be re-proved with fresh evidence only.
  const fresh = s.demotedAt !== undefined ? s.evidence.filter((e) => (e.at ?? 0) > (s.demotedAt as number)) : s.evidence;
  if (meetsSecure(fresh)) {
    s.status = 'secure';
    s.demotedAt = undefined;
    s.secureAt = now;
    s.reviewStage = 0;
    s.nextReviewAt = scheduleNext(now, 0);
  } else if (meetsPracticing(s.evidence)) {
    s.status = 'practicing';
  } else {
    s.status = 'learning';
  }
  return { state: s, from, to: displayStatus(s, now) };
}

const ORDER: DisplayStatus[] = ['new', 'learning', 'practicing', 'review', 'secure'];
export const statusRank = (s: DisplayStatus) => ORDER.indexOf(s);

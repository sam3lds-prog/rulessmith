/**
 * Mapping between the app's records and Supabase rows. Pure, so the round trip
 * is unit-tested: an attempt that goes up must come back identical.
 */
import type { Response } from '../content/types';
import type { Attempt, SessionMode, Support } from '../engine/types';
import type { ContentReport } from '../state/types';

export interface AttemptRow {
  user_id: string;
  attempt_id: string;
  item_id: string;
  template_id: string;
  template_version: number;
  content_version: string;
  skill_id: string;
  family: string;
  level: number;
  transfer: boolean;
  support: Support;
  correct: boolean;
  hint_before_answer: boolean;
  hints_used: number;
  rule_shown: boolean;
  response: Response | null;
  misconception: string | null;
  ms: number;
  first_seen_at: string | null;
  mode: SessionMode;
  session_id: string | null;
  answered_at: string;
  received_at?: string;
}

const iso = (ms: number) => new Date(ms).toISOString();

export function toAttemptRow(userId: string, a: Attempt): AttemptRow {
  return {
    user_id: userId,
    attempt_id: a.id,
    item_id: a.itemId,
    template_id: a.templateId,
    template_version: a.templateVersion,
    content_version: a.contentVersion,
    skill_id: a.skillId,
    family: a.family,
    level: a.level,
    transfer: a.transfer,
    support: a.support,
    correct: a.correct,
    hint_before_answer: a.hintBeforeAnswer,
    hints_used: a.hintsUsed,
    rule_shown: a.ruleShown,
    response: a.response ?? null,
    misconception: a.misconception ?? null,
    ms: Math.max(0, Math.round(a.ms)),
    first_seen_at: a.firstSeenAt !== undefined ? iso(a.firstSeenAt) : null,
    mode: a.mode,
    session_id: a.sessionId ?? null,
    answered_at: iso(a.at),
  };
}

export function fromAttemptRow(r: AttemptRow): Attempt {
  const out: Attempt = {
    id: r.attempt_id,
    itemId: r.item_id,
    templateId: r.template_id,
    templateVersion: r.template_version ?? 0,
    contentVersion: r.content_version ?? '',
    skillId: r.skill_id,
    family: r.family,
    level: r.level,
    transfer: r.transfer,
    support: r.support,
    correct: r.correct,
    hintBeforeAnswer: r.hint_before_answer,
    hintsUsed: r.hints_used ?? 0,
    ruleShown: r.rule_shown,
    ms: r.ms,
    at: Date.parse(r.answered_at),
    mode: r.mode,
  };
  if (r.response) out.response = r.response;
  if (r.misconception) out.misconception = r.misconception;
  if (r.first_seen_at) out.firstSeenAt = Date.parse(r.first_seen_at);
  if (r.session_id) out.sessionId = r.session_id;
  return out;
}

export const toReportRow = (userId: string, r: ContentReport) => ({
  user_id: userId,
  report_id: r.id,
  item_id: r.itemId,
  content_version: r.contentVersion,
  reason: r.reason,
  created_at: iso(r.at),
});

/** Pulls overlap the cursor by this much, so a row committed late (with an earlier receipt time) is not skipped. Merging by id makes the overlap harmless. */
export const PULL_OVERLAP_MS = 10 * 60 * 1000;

export const pullFrom = (cursor: string | undefined) => (cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : undefined);

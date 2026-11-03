/**
 * Saved-data migrations. Pure, so they are unit-tested.
 *
 * v1 (rulesmith-v1, before Nov 2026 fixes) to v2:
 * - Evidence and attempts get a support mode. v1 showed the rule openly at
 *   levels 1 to 4 and did not count that as help, so those answers become
 *   guided; levels 5 and up hid the rule (opening it counted as a hint), so
 *   those stay independent.
 * - Skills marked Secure on guided answers go back to Practicing. That is the
 *   honest reading of the old record.
 * - Attempts and reports get stable ids. Tokens and finished sessions become
 *   ledgers. Unfinished-session slots get a support mode and template version.
 * - The "700+ Challenge" pack is renamed.
 * - The migrated skill states become the baseline that later rebuilds start from.
 */
import { parseItemId, templateVersionOf } from '../content';
import { LENS_OPEN_MAX_LEVEL } from '../content/numbers';
import { meetsSecure } from '../engine/mastery';
import { parseDay } from '../engine/time';
import type { Attempt, EvidenceEntry, SkillState, Slot, Support } from '../engine/types';
import { RENAMED_PRODUCTS } from '../monetization/products';
import { derived, type Synced } from '../sync/merge';
import { INITIAL, type ContentReport, type Data, type DailyResult, type SessionLogEntry, type TokenEntry } from './types';

export const STATE_VERSION = 4;

type Loose = Record<string, any>;

/** What v1 showed at a level: the rule was on screen at levels 1 to 4. */
export const legacySupport = (level: number): Support => (level <= LENS_OPEN_MAX_LEVEL ? 'guided' : 'independent');

/**
 * The id a v1 attempt gets. The server migration builds the same id for rows
 * uploaded before ids existed, so they line up instead of duplicating.
 */
export const legacyAttemptId = (at: number, itemId: string) => `legacy-${at}-${itemId}`;

export function migrateEvidence(e: Loose): EvidenceEntry {
  return { ...(e as EvidenceEntry), support: e.support ?? legacySupport(e.level ?? 1) };
}

export function migrateSkill(s: Loose): SkillState {
  const evidence = ((s.evidence ?? []) as Loose[]).map(migrateEvidence);
  const out: SkillState = { ...(s as SkillState), evidence };
  if (out.status === 'secure') {
    const fresh = out.demotedAt !== undefined ? evidence.filter((e) => (e.at ?? 0) > (out.demotedAt as number)) : evidence;
    if (!meetsSecure(fresh)) {
      out.status = 'practicing';
      out.secureAt = undefined;
      out.nextReviewAt = undefined;
      out.reviewStage = 0;
    }
  }
  return out;
}

export function migrateAttempt(a: Loose): Attempt {
  if (a.id && a.support) return a as Attempt;
  const parsed = parseItemId(a.itemId ?? '');
  const support = legacySupport(a.level ?? 1);
  return {
    id: a.id ?? legacyAttemptId(a.at, a.itemId),
    itemId: a.itemId,
    templateId: a.templateId ?? parsed?.templateId ?? a.family,
    templateVersion: a.templateVersion ?? 0,
    contentVersion: a.contentVersion ?? '',
    skillId: a.skillId,
    family: a.family,
    level: a.level,
    transfer: Boolean(a.transfer),
    support,
    correct: Boolean(a.correct),
    hintBeforeAnswer: Boolean(a.hintBeforeAnswer),
    hintsUsed: a.hintsUsed ?? (a.hintBeforeAnswer ? 1 : 0),
    ruleShown: a.ruleShown ?? (support === 'guided' || Boolean(a.hintBeforeAnswer)),
    response: a.response,
    misconception: a.misconception,
    ms: a.ms ?? 0,
    firstSeenAt: a.firstSeenAt,
    at: a.at,
    mode: a.mode ?? 'journey',
    sessionId: a.sessionId,
  };
}

export function migrateSlot(s: Loose): Slot {
  const review = s.reason !== 'target' && s.reason !== 'stretch';
  return {
    ...(s as Slot),
    version: s.version ?? templateVersionOf(s.templateId),
    support: s.support ?? (review ? 'independent' : legacySupport(s.level ?? 1)),
  };
}

const migrateReport = (r: Loose, i: number): ContentReport => ({ ...(r as ContentReport), id: r.id ?? `legacy-report-${r.at}-${i}` });

const renamePacks = (ids: string[] = []) => ids.map((id) => RENAMED_PRODUCTS[id] ?? id);

/** Ledgers from v1 counters. One carried-over entry keeps the balance; the session count becomes placeholder entries. */
/** Coins spent on workshop objects (`buy:<item>`). The objects were removed in v4, so the spends go too (a refund). */
export const withoutWorkshopSpends = (ledger: TokenEntry[] | undefined): TokenEntry[] => (ledger ?? []).filter((e) => !String(e.id).startsWith('buy:'));

function ledgersFromV1(s: Loose): { tokenLedger: TokenEntry[]; sessionLog: SessionLogEntry[] } {
  const tokenLedger: TokenEntry[] = s.tokenLedger ?? (s.tokens ? [{ id: 'legacy-balance', delta: s.tokens, reason: 'carried-over', at: 0 }] : []);
  const sessionLog: SessionLogEntry[] =
    s.sessionLog ?? Array.from({ length: s.sessionsCompleted ?? 0 }, (_, i) => ({ id: `legacy-session-${i}`, mode: 'journey' as const, at: 0, correct: 0, total: 1, early: false }));
  return { tokenLedger, sessionLog };
}

function migrateDaily(daily: Loose = {}): Record<string, DailyResult> {
  const out: Record<string, DailyResult> = {};
  for (const [day, r] of Object.entries(daily)) out[day] = { ...(r as DailyResult), at: (r as DailyResult).at ?? parseDay(day) };
  return out;
}

/** Bring any saved state up to the current version. Unknown keys are dropped; missing keys get defaults. */
export function migrateData(raw: Loose | undefined, version: number): Data {
  if (!raw) return { ...INITIAL };
  const s: Loose = { ...raw };
  if (version < 2) {
    const attempts = ((s.attempts ?? []) as Loose[]).map(migrateAttempt);
    const skills: Record<string, SkillState> = {};
    for (const [id, st] of Object.entries((s.skills ?? {}) as Loose)) skills[id] = migrateSkill(st as Loose);
    const { tokenLedger, sessionLog } = ledgersFromV1(s);
    const reports = ((s.reports ?? []) as Loose[]).map(migrateReport);
    const acct: Loose = s.account ?? { mode: 'none' };
    const pushedUpTo: number = acct.mode === 'cloud' ? (acct.syncedAttemptAt ?? 0) : 0;
    const reportsPushed: number = acct.mode === 'cloud' ? (acct.reportsSynced ?? 0) : 0;
    const active = s.active ? { ...s.active, slots: ((s.active.slots ?? []) as Loose[]).map(migrateSlot), progress: undefined } : undefined;
    const entitlements = s.entitlements ? { ...s.entitlements, ownedPacks: renamePacks(s.entitlements.ownedPacks) } : INITIAL.entitlements;
    const daily = migrateDaily(s.daily);
    Object.assign(s, {
      attempts,
      skills,
      tokenLedger,
      sessionLog,
      reports,
      daily,
      active,
      entitlements,
      // v1 kept a bare PlacementState that no screen used; the check now saves its own progress.
      placement: undefined,
      placementRuns: [],
      // v1 capped its attempt log and wrote placement ratings straight onto skills, so the log alone
      // can't reproduce these states. Rebuilds start from them instead of erasing them.
      baseline: Object.keys(skills).length ? { at: Date.now(), skills, covers: attempts.map((a) => a.id) } : undefined,
      outbox: {
        attempts: attempts.filter((a) => a.at > pushedUpTo).map((a) => a.id),
        reports: reports.slice(reportsPushed).map((r) => r.id),
      },
      account: {
        mode: acct.mode ?? 'none',
        email: acct.email,
        userId: acct.userId,
        savedAt: acct.savedAt,
        lastSyncAt: acct.lastSyncAt,
      },
      ...derived({ tokenLedger, sessionLog, daily }),
    });
  }
  if (version < 3) {
    // v3 (the workshop): mission progress, objects, check records and feel settings start empty or at their defaults.
    // Existing tokens become Workshop Coins as they are (same ledger), and an unfinished session keeps immediate feedback.
    if (s.active) s.active = { ...s.active, feedback: s.active.feedback ?? 'immediate' };
    if (s.lastRecap) s.lastRecap = { ...s.lastRecap, attemptIds: s.lastRecap.attemptIds ?? [], rewards: s.lastRecap.rewards ?? { coins: s.lastRecap.tokens ?? 0, items: [] } };
  }
  if (version < 4) {
    // v4 removed the workshop, and its data with it (the owner's decision): objects, the project
    // and the coins spent on objects, which are refunded by dropping those spends. Learning records,
    // missions, checks and the rest of the token ledger are untouched.
    delete s.grants;
    delete s.project;
    s.tokenLedger = withoutWorkshopSpends(s.tokenLedger);
    if (s.settings) delete s.settings.focus;
    if (s.lastRecap) {
      const { rewards, ...rest } = s.lastRecap;
      s.lastRecap = { ...rest, tokens: rewards?.coins ?? rest.tokens ?? 0 };
    }
    Object.assign(s, derived({ tokenLedger: s.tokenLedger, sessionLog: s.sessionLog ?? [], daily: s.daily ?? {} }));
  }
  s.settings = { ...INITIAL.settings, ...(s.settings ?? {}) };
  const out = { ...INITIAL } as unknown as Loose;
  for (const k of Object.keys(INITIAL)) if (s[k] !== undefined) out[k] = s[k];
  return out as unknown as Data;
}

/**
 * Bring a server snapshot (learner_state.state) up to date. v1 snapshots held
 * counters and the old skill states; the counters become ledgers and the
 * placement history starts empty (skills are rebuilt from attempts).
 */
export function migrateSnapshot(raw: Loose | null | undefined): Synced | undefined {
  if (!raw) return undefined;
  const v = typeof raw.v === 'number' ? raw.v : 1;
  const s: Loose = v >= 2 ? raw : { ...raw, ...ledgersFromV1(raw), daily: migrateDaily(raw.daily), placementRuns: raw.placementRuns ?? [] };
  return {
    profile: s.profile,
    plan: s.plan,
    placementRuns: s.placementRuns ?? [],
    baseline: s.baseline,
    // A v3 snapshot may still carry object purchases; v4 has none (see withoutWorkshopSpends).
    tokenLedger: withoutWorkshopSpends(s.tokenLedger),
    sessionLog: s.sessionLog ?? [],
    daily: s.daily ?? {},
    ladderBest: s.ladderBest ?? {},
    checkpoints: s.checkpoints ?? [],
    quests: s.quests ?? {},
    checks: s.checks ?? [],
  };
}

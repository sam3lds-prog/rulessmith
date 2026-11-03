/**
 * Merging a learner's data from two places (this device and the server, or a
 * guest bucket being imported into an account). Pure, so it is unit-tested.
 *
 * Rules:
 * - Attempts are the record. They merge by id (union), never by "who answered more".
 * - Skill states are derived: when attempts arrive from elsewhere they are rebuilt
 *   by replaying every attempt in time order through the same `applyAttempt`
 *   the app uses live, so a merged state equals the state one device would have
 *   reached by answering all of them.
 * - Tokens and sessions are ledgers that merge by id; streak, token balance and
 *   session count are recomputed from them.
 * - Profile and plan keep the newer copy. Daily results, checkpoints and placement
 *   runs merge by their key; ladder bests keep the maximum.
 */
import { applyAttempt, newSkillState } from '../engine/mastery';
import { dayKey } from '../engine/time';
import type { Attempt } from '../engine/types';
import type { Quests } from '../quests/chapters';
import type { Baseline, CheckRecord, ContentReport, Data, PlacementRun, SessionLogEntry, States, TokenEntry } from '../state/types';

/** Fields that follow a learner to another device in the server snapshot (learner_state.state). */
export const SYNCED_KEYS = [
  'profile',
  'plan',
  'placementRuns',
  'baseline',
  'tokenLedger',
  'sessionLog',
  'daily',
  'ladderBest',
  'checkpoints',
  'quests',
  'checks',
] as const;
export type Synced = Pick<Data, (typeof SYNCED_KEYS)[number]>;

/**
 * Version tag written into server snapshots. v4 removed the workshop (objects,
 * project and object purchases). The server refuses an update that lowers it
 * (supabase/migrations/20261103000000_snapshot_version_guard.sql), so an older
 * app can't put them back.
 */
export const SNAPSHOT_VERSION = 4;

export function pickSynced(d: Data): Synced {
  return {
    profile: d.profile,
    plan: d.plan,
    placementRuns: d.placementRuns,
    baseline: d.baseline,
    tokenLedger: d.tokenLedger,
    sessionLog: d.sessionLog,
    daily: d.daily,
    ladderBest: d.ladderBest,
    checkpoints: d.checkpoints,
    quests: d.quests,
    checks: d.checks,
  };
}

/** Mission records from two devices: finished stays finished (earliest time), the best result wins, runs keep the larger count. */
export function mergeQuests(a: Quests = {}, b: Quests = {}): Quests {
  const out: Quests = { ...b };
  for (const [id, x] of Object.entries(a)) {
    const y = out[id];
    if (!y) {
      out[id] = x;
      continue;
    }
    const min = (p?: number, q?: number) => (p === undefined ? q : q === undefined ? p : Math.min(p, q));
    const ratio = (r?: { correct: number; total: number }) => (r && r.total ? r.correct / r.total : -1);
    out[id] = {
      version: Math.max(x.version, y.version),
      startedAt: min(x.startedAt, y.startedAt),
      completedAt: min(x.completedAt, y.completedAt),
      best: ratio(x.best) >= ratio(y.best) ? (x.best ?? y.best) : y.best,
      runs: Math.max(x.runs, y.runs),
    };
  }
  return out;
}

function unionBy<T>(a: T[], b: T[], key: (x: T) => string | number): T[] {
  const seen = new Map<string | number, T>();
  for (const x of a) seen.set(key(x), x);
  for (const x of b) if (!seen.has(key(x))) seen.set(key(x), x);
  return [...seen.values()];
}

const byAt = <T extends { at: number }>(xs: T[]) => [...xs].sort((x, y) => x.at - y.at);

/** Attempts from both sides, by id, oldest first. */
export function mergeAttempts(a: Attempt[], b: Attempt[]): Attempt[] {
  return unionBy(a, b, (x) => x.id).sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

export function mergeReports(a: ContentReport[], b: ContentReport[]): ContentReport[] {
  return byAt(unionBy(a, b, (x) => x.id));
}

const profileTime = (p: Data['profile']) => p?.updatedAt ?? p?.createdAt ?? 0;

/**
 * Two baselines (two devices that each carried over old data): keep the one
 * covering more attempts; the other's attempts are then replayed on top. The
 * choice is deterministic, so every device makes the same one.
 */
export function pickBaseline(a: Baseline | undefined, b: Baseline | undefined): Baseline | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.covers.length !== b.covers.length) return a.covers.length > b.covers.length ? a : b;
  if (a.at !== b.at) return a.at > b.at ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

/**
 * Merge two snapshots. `prefer` makes one side's profile and plan win when it
 * has them (used when importing a guest into an account that already has a plan).
 */
export function mergeSynced(a: Synced, b: Synced | undefined, prefer?: 'a' | 'b'): Synced {
  if (!b) return a;
  const pick = <T>(x: T | undefined, y: T | undefined, newer: () => boolean): T | undefined => {
    if (prefer === 'a' && x !== undefined) return x;
    if (prefer === 'b' && y !== undefined) return y;
    if (x === undefined) return y;
    if (y === undefined) return x;
    return newer() ? x : y;
  };
  const daily: Data['daily'] = { ...b.daily };
  for (const [day, r] of Object.entries(a.daily ?? {})) {
    const other = daily[day];
    // Same day on two devices: the first answer is the day's result.
    daily[day] = !other ? r : (r.at ?? Infinity) <= (other.at ?? Infinity) ? r : other;
  }
  const ladderBest: Record<string, number> = { ...(b.ladderBest ?? {}) };
  for (const [id, v] of Object.entries(a.ladderBest ?? {})) ladderBest[id] = Math.max(v, ladderBest[id] ?? 0);
  return {
    profile: pick(a.profile, b.profile, () => profileTime(a.profile) >= profileTime(b.profile)),
    plan: pick(a.plan, b.plan, () => (a.plan?.createdAt ?? 0) >= (b.plan?.createdAt ?? 0)),
    placementRuns: byAt(unionBy<PlacementRun>(a.placementRuns ?? [], b.placementRuns ?? [], (x) => x.at)),
    baseline: pickBaseline(a.baseline, b.baseline),
    tokenLedger: byAt(unionBy<TokenEntry>(a.tokenLedger ?? [], b.tokenLedger ?? [], (x) => x.id)),
    sessionLog: byAt(unionBy<SessionLogEntry>(a.sessionLog ?? [], b.sessionLog ?? [], (x) => x.id)),
    daily,
    ladderBest,
    checkpoints: byAt(unionBy(a.checkpoints ?? [], b.checkpoints ?? [], (x) => x.at)),
    quests: mergeQuests(a.quests, b.quests),
    checks: byAt(unionBy<CheckRecord>(a.checks ?? [], b.checks ?? [], (x) => x.id)),
  };
}

/**
 * Apply placement ratings the way the app always has: a skill takes the placement
 * rating only if it has no practice yet beyond placement answers (mode 'try'),
 * so re-running onboarding never wipes earned progress.
 */
export function applyPlacementRun(states: States, attemptsSoFar: Attempt[], run: PlacementRun): States {
  const out = { ...states };
  for (const [id, rating] of Object.entries(run.ratings)) {
    const prev = out[id] ?? newSkillState(id);
    const onlyPlacement = attemptsSoFar.filter((x) => x.skillId === id).every((x) => x.mode === 'try');
    out[id] = { ...prev, rating: prev.attempts === 0 || onlyPlacement ? rating : prev.rating };
  }
  return out;
}

/**
 * Skill states from scratch: placement runs and attempts replayed in time order,
 * on top of the baseline (if any) for history that predates the full log.
 */
export function rebuildSkills(attempts: Attempt[], placementRuns: PlacementRun[], baseline?: Baseline): States {
  type Ev = { at: number; order: number; attempt?: Attempt; run?: PlacementRun };
  const covered = new Set(baseline?.covers ?? []);
  const events: Ev[] = [
    ...attempts.filter((a) => !covered.has(a.id)).map((attempt) => ({ at: attempt.at, order: 0, attempt })),
    // At equal times an answer comes before the placement result it fed into.
    ...placementRuns.filter((r) => !baseline || r.at > baseline.at).map((run) => ({ at: run.at, order: 1, run })),
  ].sort((x, y) => x.at - y.at || x.order - y.order);
  let states: States = baseline ? JSON.parse(JSON.stringify(baseline.skills)) : {};
  // Attempts in the baseline already happened; placement must see them as prior practice.
  const seen: Attempt[] = attempts.filter((a) => covered.has(a.id));
  for (const e of events) {
    if (e.attempt) {
      const a = e.attempt;
      states = { ...states, [a.skillId]: applyAttempt(states[a.skillId] ?? newSkillState(a.skillId), a, a.at).state };
      seen.push(a);
    } else if (e.run) {
      states = applyPlacementRun(states, seen, e.run);
    }
  }
  return states;
}

/** Consecutive active days ending on the most recent one. */
export function streakFrom(days: Iterable<string>): Data['streak'] {
  const set = new Set(days);
  if (set.size === 0) return { count: 0 };
  const sorted = [...set].sort();
  const lastDay = sorted[sorted.length - 1];
  let count = 0;
  // Walk back one calendar day at a time (noon avoids daylight-saving edges).
  const [y, m, d] = lastDay.split('-').map(Number);
  const cursor = new Date(y, m - 1, d, 12);
  while (set.has(dayKey(cursor.getTime()))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { lastDay, count };
}

/** Token balance, finished-session count and streak, recomputed from the ledgers. */
export function derived(s: Pick<Data, 'tokenLedger' | 'sessionLog' | 'daily'>): Pick<Data, 'tokens' | 'sessionsCompleted' | 'streak'> {
  const tokens = s.tokenLedger.reduce((n, e) => n + e.delta, 0);
  const sessionsCompleted = s.sessionLog.filter((e) => !e.early && e.total > 0).length;
  const days = [...s.sessionLog.filter((e) => e.total > 0).map((e) => dayKey(e.at)), ...Object.keys(s.daily)];
  return { tokens, sessionsCompleted, streak: streakFrom(days) };
}

/**
 * Fold remote data into local data. Rebuilds skills only when something new
 * arrived (attempts or placement runs this device had not seen).
 */
export function mergeRemote(local: Data, remote: { synced?: Synced; attempts: Attempt[] }): { data: Data; changed: boolean } {
  const synced = mergeSynced(pickSynced(local), remote.synced);
  const attempts = mergeAttempts(local.attempts, remote.attempts);
  const newAttempts = attempts.length !== local.attempts.length;
  const newRuns = synced.placementRuns.length !== local.placementRuns.length;
  const newBaseline = synced.baseline !== local.baseline;
  const skills = newAttempts || newRuns || newBaseline ? rebuildSkills(attempts, synced.placementRuns, synced.baseline) : local.skills;
  const data: Data = { ...local, ...synced, attempts, skills, ...derived(synced) };
  const changed = newAttempts || newRuns || newBaseline || JSON.stringify(synced) !== JSON.stringify(pickSynced(local));
  return { data, changed };
}

/**
 * Import a guest's data into an account bucket, as an explicit choice of the
 * learner. The account's own profile and plan win if it has them. Every
 * imported attempt and report joins the outbox so it reaches the server.
 */
export function importGuest(target: Data, guest: Data): Data {
  const synced = mergeSynced(pickSynced(target), pickSynced(guest), 'a');
  const attempts = mergeAttempts(target.attempts, guest.attempts);
  const reports = mergeReports(target.reports, guest.reports);
  const keepGuestFlow = !target.plan;
  return {
    ...target,
    ...synced,
    attempts,
    reports,
    skills: rebuildSkills(attempts, synced.placementRuns, synced.baseline),
    ...derived(synced),
    outbox: {
      attempts: [...new Set([...target.outbox.attempts, ...guest.attempts.map((a) => a.id)])],
      reports: [...new Set([...target.outbox.reports, ...guest.reports.map((r) => r.id)])],
    },
    recentSeeds: { ...guest.recentSeeds, ...target.recentSeeds },
    // An unfinished session, placement or daily puzzle comes along only if the account has nothing in its place.
    active: target.active ?? guest.active,
    placement: keepGuestFlow ? (target.placement ?? guest.placement) : target.placement,
    dailyProgress: target.dailyProgress ?? guest.dailyProgress,
    triedPuzzle: target.triedPuzzle ?? guest.triedPuzzle,
  };
}

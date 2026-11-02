/**
 * The shape of a learner's saved data. Pure TypeScript (no React Native), so
 * migration, storage buckets and sync merging can be unit-tested in Node.
 *
 * Each learner's data lives in its own storage bucket (state/buckets.ts):
 * one for the guest on this device, one per signed-in account.
 */
import type { BoardDraft } from '../content/types';
import type { PlacementState } from '../engine/placement';
import type { Attempt, DisplayStatus, JourneyPlan, Profile, SessionMode, SkillState, Slot, Support } from '../engine/types';
import { EMPTY_ENTITLEMENTS, type Entitlements } from '../monetization/entitlements';

export type States = Record<string, SkillState>;

/**
 * An unfinished puzzle, saved as the learner works so a refresh, background
 * or force-close cannot erase a hint or a revealed rule.
 */
export interface ItemProgress {
  /** The puzzle this belongs to. Progress saved for a different item is ignored. */
  itemId: string;
  draft: BoardDraft | null;
  hints: number;
  /** A hidden rule was opened (independent items). That makes the answer hinted. */
  ruleRevealed: boolean;
  firstSeenAt: number;
  /** Time on the puzzle with the app in the foreground. */
  activeMs: number;
}

/** What the item screen hands back when the learner checks an answer. */
export interface AnswerRecord {
  correct: boolean;
  /** A hint, or a hidden rule opened, before answering. */
  hint: boolean;
  hintsUsed: number;
  ruleShown: boolean;
  support: Support;
  ms: number;
  firstSeenAt: number;
  response: import('../content/types').Response;
  misconception?: string;
}

export interface SessionResult {
  attemptId: string;
  itemId: string;
  skillId: string;
  templateId: string;
  correct: boolean;
  hint: boolean;
  support: Support;
  ms: number;
  transfer: boolean;
  from: DisplayStatus;
  to: DisplayStatus;
}

export interface ActiveSession {
  id: string;
  mode: SessionMode;
  title: string;
  slots: Slot[];
  index: number;
  results: SessionResult[];
  startedAt: number;
  countsAsRun: boolean;
  timed: boolean;
  ladder?: { skillId: string; level: number; misses: number; peak: number };
  challenge?: { skills: string[]; levels: [number, number]; length: number };
  /** The puzzle at `index`, in progress. */
  progress?: ItemProgress;
}

export interface Recap {
  id: string;
  mode: SessionMode;
  title: string;
  correct: number;
  total: number;
  /** Skills that moved up a status this session. */
  proved: { skillId: string; to: DisplayStatus }[];
  /** Skills answered correctly at least once, without a status change. */
  practiced: string[];
  needsWork: string[];
  nextLabel?: string;
  tokens: number;
  endedOnMiss: boolean;
  timed: boolean;
  ladder?: { skillId: string; peak: number; best: number; newBest: boolean };
  adShown: boolean;
}

export interface ContentReport {
  id: string;
  itemId: string;
  contentVersion: string;
  reason: string;
  at: number;
}

export interface DailyResult {
  correct: boolean;
  ms: number;
  hints: number;
  at?: number;
}

/** Tokens are a ledger, so two devices' earnings and spending add up instead of overwriting each other. */
export interface TokenEntry {
  id: string;
  delta: number;
  reason: 'session' | 'daily' | 'bonus-run' | 'carried-over';
  at: number;
}

export interface SessionLogEntry {
  id: string;
  mode: SessionMode;
  at: number;
  correct: number;
  total: number;
  early: boolean;
}

/** Starting ratings from a placement check (or a skipped one). Replayed with the attempts when skills are rebuilt. */
export interface PlacementRun {
  at: number;
  ratings: Record<string, number>;
}

/**
 * Skill states carried over from saved data that predates the full attempt log
 * (v1 capped its log at 400 and wrote placement ratings straight onto skills).
 * Rebuilds start from these states and replay only the attempts not in `covers`,
 * so that history is never erased.
 */
export interface Baseline {
  at: number;
  skills: States;
  /** Attempt ids already reflected in `skills`. */
  covers: string[];
}

/** The placement check in progress, so it survives a restart. */
export interface PlacementProgress {
  state: PlacementState;
  slot: Slot | null;
  progress?: ItemProgress;
  /** Set once the current item is answered, until the learner continues. */
  answered?: { correct: boolean };
}

export interface Account {
  mode: 'none' | 'device' | 'cloud';
  email?: string;
  userId?: string;
  savedAt?: number;
  lastSyncAt?: number;
  /** Newest server receipt time already pulled (ISO). Pulls overlap it by a few minutes. */
  pullCursor?: string;
  /** When this device first loaded the account's server copy. Until then, nothing made here may overwrite it. */
  loadedAt?: number;
  syncError?: string;
  /** The saved sign-in is gone or belongs to someone else. Sync waits for the learner to sign in again. */
  needsSignIn?: boolean;
}

export interface Data {
  profile?: Profile;
  plan?: JourneyPlan;
  skills: States;
  /** Every answer this learner has given. Not capped: it is the record skills are rebuilt from. */
  attempts: Attempt[];
  /** Ids not yet acknowledged by the server. Cleared only after a successful upload. */
  outbox: { attempts: string[]; reports: string[] };
  placementRuns: PlacementRun[];
  baseline?: Baseline;
  tokenLedger: TokenEntry[];
  /** Derived from tokenLedger. */
  tokens: number;
  sessionLog: SessionLogEntry[];
  /** Derived from sessionLog. */
  sessionsCompleted: number;
  /** Free runs used today. Device-level: kept when the learner changes. */
  runs: { day: string; used: number; bonus: number };
  /** Device-level: purchases belong to the app store account, not to a learner bucket. */
  entitlements: Entitlements;
  recentSeeds: Record<string, number[]>;
  daily: Record<string, DailyResult>;
  dailyProgress?: ItemProgress & { day: string };
  /** Derived from session and daily days. */
  streak: { lastDay?: string; count: number };
  ladderBest: Record<string, number>;
  checkpoints: { at: number; correct: number; total: number }[];
  reports: ContentReport[];
  /** Device-level. */
  settings: { previewAds: boolean };
  placement?: PlacementProgress;
  active?: ActiveSession;
  lastRecap?: Recap;
  triedPuzzle?: { correct: boolean; ms: number };
  account: Account;
}

/** Kept on the device when the learner changes (sign in, sign out). Everything else belongs to one learner. */
export const DEVICE_KEYS = ['runs', 'entitlements', 'settings'] as const;

// Optional keys are listed as undefined on purpose: zustand merges state, so a
// key missing here would survive a reset or a change of learner.
export const INITIAL: Data = {
  profile: undefined,
  plan: undefined,
  placement: undefined,
  active: undefined,
  lastRecap: undefined,
  triedPuzzle: undefined,
  dailyProgress: undefined,
  baseline: undefined,
  skills: {},
  attempts: [],
  outbox: { attempts: [], reports: [] },
  placementRuns: [],
  tokenLedger: [],
  tokens: 0,
  sessionLog: [],
  sessionsCompleted: 0,
  runs: { day: '', used: 0, bonus: 0 },
  entitlements: EMPTY_ENTITLEMENTS,
  recentSeeds: {},
  daily: {},
  streak: { count: 0 },
  ladderBest: {},
  checkpoints: [],
  reports: [],
  settings: { previewAds: false },
  account: { mode: 'none' },
};

export const DATA_KEYS = Object.keys(INITIAL) as (keyof Data)[];

/** Only the saved fields of a state object (drops actions and runtime flags). */
export function pickData(s: Data): Data {
  const out = {} as Record<string, unknown>;
  for (const k of DATA_KEYS) out[k] = (s as unknown as Record<string, unknown>)[k];
  return out as unknown as Data;
}

/** A fresh learner, keeping only the device-level keys from `from`. */
export function freshLearner(from?: Partial<Data>): Data {
  const out: Data = { ...INITIAL };
  if (from) for (const k of DEVICE_KEYS) if (from[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = from[k];
  return out;
}

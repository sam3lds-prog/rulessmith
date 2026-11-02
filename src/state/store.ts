/**
 * App state. Local-first: everything is saved on the device (AsyncStorage,
 * which is localStorage on web), in one bucket per learner (state/buckets.ts).
 * Cloud sync is layered on top when Supabase is configured and the learner is
 * a signed-in adult (data/cloud.ts, sync/merge.ts).
 *
 * The learning record is the attempt log. Every graded answer becomes an
 * Attempt with a stable id, the learner's response, the template and content
 * version, and whether the rule was on screen or a hint was used. Skill states
 * are computed from attempts (live, one at a time; or rebuilt from the whole
 * log when attempts arrive from another device).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState as RNAppState, Platform } from 'react-native';
import { create } from 'zustand';
import { saveEventsNow, startAnalytics, uploadEvents } from '../analytics/pipeline';
import { discardEvents, setAnalyticsContext, track } from '../analytics/track';
import { config } from '../config';
import { serveItem, SKILL_BY_ID, templatesForSkill, type Item, type TrackId } from '../content';
import { createRng } from '../content/rng';
import * as cloud from '../data/cloud';
import { loadCachedFlags, refreshFlags } from '../data/flags';
import { dailySlot } from '../engine/daily';
import { newId } from '../engine/ids';
import { applyAttempt, displayStatus, statusRank } from '../engine/mastery';
import {
  challengeSlot,
  checkpointSession,
  composeSession,
  dueReviews,
  freshSeed,
  LADDER_MISSES,
  ladderNextLevel,
  makeSlot,
  NoTemplatesError,
  replacementSlot,
  skillSession,
  stateOf,
  supportFor,
} from '../engine/mixer';
import { nextPlacementItem, placementRatings, recordPlacement, relevantSkills, startPlacement, type PlacementState } from '../engine/placement';
import { buildPlan, replanIfDue, todaysTargets } from '../engine/planner';
import { ratingFromSelf } from '../engine/rating';
import { dayKey } from '../engine/time';
import type { Attempt, DisplayStatus, JourneyPlan, Profile, SessionMode, Slot } from '../engine/types';
import { grant, isPremium, maxLevelFor, ownsChallenge, runsAreUnlimited, runsLeftToday } from '../monetization/entitlements';
import { createTestProvider } from '../monetization/purchases';
import { TOKEN_COSTS, TOKEN_REWARDS } from '../monetization/tokens';
import { applyPlacementRun, derived, importGuest, mergeRemote, pickSynced } from '../sync/merge';
import { clearBucket, createSaver, GUEST, openAtLaunch, OWNER_KEY, readBucket, writeBucket, type KV } from './buckets';
import { migrateSnapshot } from './migrate';
import {
  DEVICE_KEYS,
  freshLearner,
  INITIAL,
  pickData,
  type ActiveSession,
  type AnswerRecord,
  type Data,
  type ItemProgress,
  type Recap,
  type SessionResult,
  type TokenEntry,
} from './types';

export type { ActiveSession, AnswerRecord, ContentReport, DailyResult, ItemProgress, Recap, SessionResult } from './types';

export type StartResult = { ok: true } | { ok: false; reason: 'no-runs' | 'locked' | 'empty' | 'no-profile' };

/** What happened when the current puzzle was checked against the kill switch and template versions. */
export type ServeStatus = 'ok' | 'replaced' | 'ended';

export interface SyncOutcome {
  ok: boolean;
  /** Attempts that arrived from the server and were new to this device. */
  pulled: number;
  /** The account had a saved snapshot on the server. */
  hadSnapshot: boolean;
}

interface Actions {
  setProfile(p: Profile): void;
  createPlan(): JourneyPlan | undefined;
  updateProfileAndReplan(patch: Partial<Profile>): void;
  saveOnDevice(): void;
  setTriedPuzzle(r: { correct: boolean; ms: number }): void;

  startPlacementCheck(): void;
  /** Swap the current placement puzzle for a fresh one (it was switched off or changed). Answers so far are kept. */
  replacePlacementSlot(): void;
  placementItem(): Item | null;
  savePlacementProgress(p: ItemProgress): void;
  answerPlacement(item: Item, r: AnswerRecord): void;
  /** Moves to the next placement puzzle, or finishes the check (and builds the plan). */
  continuePlacement(): { done: boolean };
  /** Ends the check now. With no answers (or `skipped`), ratings come from the self-rating. */
  finishPlacement(skipped: boolean): void;

  startSession(mode: SessionMode, opts?: { skillId?: string; skills?: string[]; levels?: [number, number] }): StartResult;
  currentItem(): Item | undefined;
  /** Replace the current puzzle if it was switched off or its template changed. */
  ensureServable(): ServeStatus;
  saveProgress(p: ItemProgress): void;
  recordAnswer(item: Item, r: AnswerRecord): SessionResult;
  advance(): { done: boolean };
  /** early: the learner ended the run before its last puzzle (no tokens, not a completed session). */
  finishSession(opts?: { early?: boolean }): Recap | undefined;
  abandonSession(): void;
  markAdShown(): void;

  saveDailyProgress(day: string, p: ItemProgress): void;
  recordDaily(day: string, item: Item, r: AnswerRecord): void;

  runsLeft(): number;
  buyBonusRunWithTokens(): boolean;
  grantRewardedRun(): void;
  purchase(productId: string): Promise<{ ok: boolean; error?: string }>;
  restorePurchases(): Promise<{ ok: boolean }>;

  report(item: Item, reason: string): void;
  setPreviewAds(on: boolean): void;
  deleteAllData(): Promise<{ ok: boolean; error?: string }>;

  /**
   * Open the account's bucket on this device and sync it. The guest's progress
   * joins the account only when `importGuest` is true (the learner chose it).
   */
  connectCloud(email: string, userId: string, opts: { importGuest: boolean }): Promise<{ ok: boolean; restored: boolean; error?: string }>;
  syncNow(): Promise<SyncOutcome>;
  /** Uploads what it can, signs out, and opens the guest bucket. The account's data never stays on screen. */
  disconnectCloud(): Promise<void>;
}

interface Runtime {
  hydrated: boolean;
  /** Which bucket is open: "guest" or a user id. */
  owner: string;
  /** Bumped when the kill-switch list changes, so screens re-check what they show. */
  flagsVersion: number;
}

export type AppState = Data & Actions & Runtime;

// Reviews of secured skills and the planned checkpoint stay free; everything else uses a run.
const COUNTED_MODES: SessionMode[] = ['journey', 'skill', 'ladder', 'challenge'];
const SEED_MEMORY = 40;

const sessionLength = (minutes: number | undefined) => (!minutes ? 8 : minutes <= 10 ? 6 : minutes <= 20 ? 8 : 10);

function rememberSeed(recent: Record<string, number[]>, templateId: string, seed: number) {
  const list = [...(recent[templateId] ?? []), seed].slice(-SEED_MEMORY);
  return { ...recent, [templateId]: list };
}

function freshRuns(runs: Data['runs'], now: number): Data['runs'] {
  const today = dayKey(now);
  return runs.day === today ? runs : { day: today, used: 0, bonus: 0 };
}

// ------------------------------------------------------------------ storage

/** The web static export renders in Node, where there is no window or localStorage. */
const canStore = () => !(Platform.OS === 'web' && typeof window === 'undefined');
const kv: KV = AsyncStorage as unknown as KV;

const deviceKeys = (s: Partial<Data>) => {
  const out: Partial<Data> = {};
  for (const k of DEVICE_KEYS) (out as Record<string, unknown>)[k] = s[k];
  return out;
};

const timeout = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The bucket being saved to. Null until launch has opened one, so nothing is written before then. */
let saverOwner: string | null = null;
const saver = createSaver(kv, () => ({ owner: saverOwner, data: pickData(useApp.getState()) }));

export const useApp = create<AppState>()((set, get) => {
  const maxLevel = (skillId: string) => maxLevelFor(skillId, get().entitlements, Date.now());
  const pick = () => ({ rng: createRng(Date.now() ^ Math.floor(Math.random() * 2 ** 30)), maxLevel, recentSeeds: get().recentSeeds });

  const addTokens = (entry: Omit<TokenEntry, 'at'> & { at?: number }) => {
    const s = get();
    if (s.tokenLedger.some((e) => e.id === entry.id)) return;
    const tokenLedger = [...s.tokenLedger, { at: Date.now(), ...entry }];
    set({ tokenLedger, ...derived({ tokenLedger, sessionLog: s.sessionLog, daily: s.daily }) });
  };

  /** Grade-once bookkeeping for one answer: the attempt record, skill state, outbox, seed memory. */
  const applyOne = (item: Item, r: AnswerRecord, mode: SessionMode, sessionId?: string) => {
    const now = Date.now();
    const s = get();
    const attempt: Attempt = {
      id: newId(),
      itemId: item.id,
      templateId: item.templateId,
      templateVersion: item.templateVersion,
      contentVersion: item.contentVersion,
      skillId: item.skillId,
      family: item.family,
      level: item.level,
      transfer: item.transfer,
      support: r.support,
      correct: r.correct,
      hintBeforeAnswer: r.hint,
      hintsUsed: r.hintsUsed,
      ruleShown: r.ruleShown,
      response: r.response,
      misconception: r.misconception,
      ms: Math.round(r.ms),
      firstSeenAt: r.firstSeenAt,
      at: now,
      mode,
      sessionId,
    };
    const outcome = applyAttempt(stateOf(s.skills, item.skillId), attempt, attempt.at);
    set({
      skills: { ...s.skills, [item.skillId]: outcome.state },
      attempts: [...s.attempts, attempt],
      outbox: { ...s.outbox, attempts: [...s.outbox.attempts, attempt.id] },
      recentSeeds: rememberSeed(s.recentSeeds, item.templateId, item.seed),
    });
    track('item_answered', {
      template: item.templateId,
      version: item.templateVersion,
      level: item.level,
      support: r.support,
      correct: r.correct,
      hint: r.hint,
      misconception: r.misconception,
      mode,
    });
    if (outcome.to === 'secure' && outcome.from !== 'secure') track('skill_secured', { skill: item.skillId });
    return { attempt, outcome };
  };

  // -------------------------------------------------------------- placement

  const placementSlot = (state: PlacementState): Slot | null => {
    const next = nextPlacementItem(state);
    if (!next) return null;
    const all = templatesForSkill(next.skillId, next.level);
    const plain = all.filter((t) => !t.transfer);
    const pool = plain.length ? plain : all;
    if (!pool.length) return null;
    const rng = pick().rng;
    const t = rng.pick(pool);
    return {
      skillId: next.skillId,
      templateId: t.id,
      version: t.version,
      level: next.level,
      seed: freshSeed(rng, t.id, get().recentSeeds),
      band: 'practice',
      reason: 'placement',
      support: 'independent',
    };
  };

  const completePlacement = (state: PlacementState | undefined, skipped: boolean) => {
    const s = get();
    const profile = s.profile;
    if (!profile) return;
    let ratings: Record<string, number>;
    if (skipped || !state || state.answers.length === 0) {
      const base = profile.currentLevel.kind === 'self' ? ratingFromSelf(profile.currentLevel.rating) : 1000;
      ratings = Object.fromEntries(relevantSkills(profile.exams).map((id) => [id, base]));
      track('placement_skipped', {});
    } else {
      ratings = placementRatings(state, profile.exams);
      track('placement_completed', { items: state.answers.length });
    }
    const run = { at: Date.now(), ratings };
    set({ placementRuns: [...s.placementRuns, run], skills: applyPlacementRun(s.skills, s.attempts, run), placement: undefined });
    get().createPlan();
  };

  // -------------------------------------------------------------- buckets

  /** Close the open bucket and open another. Synchronous switch, so no write can land in the wrong bucket. */
  const switchOwner = async (next: string) => {
    if (saverOwner === next && get().owner === next) return;
    await saver.flush();
    const data = await readBucket(kv, next);
    void saver.flush();
    const device = deviceKeys(pickData(get()));
    saverOwner = next;
    set({ ...(data ?? freshLearner()), ...device, owner: next });
    await saver.flush();
    await kv.setItem(OWNER_KEY, next);
    setAnalyticsContext({ ageBand: get().profile?.ageBand, userId: next === GUEST ? undefined : next });
  };

  let syncing: Promise<SyncOutcome> | null = null;

  const doSync = async (): Promise<SyncOutcome> => {
    const none: SyncOutcome = { ok: false, pulled: 0, hadSnapshot: false };
    const acct = get().account;
    if (acct.mode !== 'cloud' || !acct.userId || !cloud.cloudConfigured() || !canStore()) return none;
    const userId = acct.userId;
    const setAccount = (patch: Partial<Data['account']>) => {
      if (get().owner === userId) set({ account: { ...get().account, ...patch } });
    };
    try {
      const sessionUser = await cloud.sessionUserId();
      if (sessionUser !== userId) {
        setAccount({ needsSignIn: true, syncError: 'Sign in again to sync. Your progress is saved on this device.' });
        return none;
      }
      // 1. Pull and merge by id.
      const [snapshot, pulled] = await Promise.all([cloud.pullSnapshot(userId), cloud.pullAttempts(userId, acct.pullCursor)]);
      if (get().owner !== userId) return none;
      const before = get().attempts.length;
      const { data } = mergeRemote(pickData(get()), { synced: migrateSnapshot(snapshot), attempts: pulled.attempts });
      set({ ...data, account: { ...get().account, pullCursor: pulled.cursor } });
      const newFromServer = get().attempts.length - before;

      // 2. Upload the outbox. Ids leave it only when the server has them.
      const cur = get();
      const known = new Map(cur.attempts.map((a) => [a.id, a]));
      const pending = cur.outbox.attempts.map((id) => known.get(id)).filter((a): a is Attempt => !!a);
      const acked = new Set(pending.length ? await cloud.pushAttempts(userId, pending) : []);
      const reportById = new Map(cur.reports.map((r) => [r.id, r]));
      const pendingReports = cur.outbox.reports.map((id) => reportById.get(id)).filter((r) => !!r);
      const ackedReports = new Set(await cloud.pushReports(userId, pendingReports as NonNullable<(typeof pendingReports)[number]>[]));
      if (get().owner !== userId) return none;
      const o = get().outbox;
      set({
        outbox: {
          attempts: o.attempts.filter((id) => !acked.has(id) && known.has(id)),
          reports: o.reports.filter((id) => !ackedReports.has(id) && reportById.has(id)),
        },
      });

      // 3. Push the merged snapshot back.
      const fresh = get();
      if (fresh.profile) await cloud.pushSnapshot(userId, fresh.profile.ageBand, pickSynced(fresh), fresh.attempts.length);
      setAccount({ lastSyncAt: Date.now(), syncError: undefined, needsSignIn: false });
      return { ok: true, pulled: newFromServer, hadSnapshot: snapshot !== null };
    } catch (e) {
      setAccount({ syncError: e instanceof Error ? e.message : 'Sync failed' });
      return none;
    }
  };

  return {
    ...INITIAL,
    hydrated: false,
    owner: GUEST,
    flagsVersion: 0,

    setProfile: (p) => {
      const profile = { ...p, updatedAt: Date.now() };
      set({ profile });
      setAnalyticsContext({ ageBand: profile.ageBand });
      track('profile_completed', { exams: profile.exams.join(','), role: profile.role });
    },
    createPlan: () => {
      const { profile, skills } = get();
      if (!profile) return undefined;
      const plan = buildPlan(profile, skills, Date.now());
      set({ plan });
      track('plan_created', { weeks: plan.weeks.length, fits: plan.fits });
      return plan;
    },
    updateProfileAndReplan: (patch) => {
      const profile = get().profile;
      if (!profile) return;
      const next = { ...profile, ...patch, updatedAt: Date.now() };
      set({ profile: next, plan: buildPlan(next, get().skills, Date.now()) });
    },
    saveOnDevice: () => {
      if (get().account.mode !== 'cloud') set({ account: { ...get().account, mode: 'device', savedAt: Date.now() } });
      track('plan_saved', { mode: 'device' });
    },
    setTriedPuzzle: (triedPuzzle) => set({ triedPuzzle }),

    // ------------------------------------------------------------ placement

    startPlacementCheck: () => {
      const profile = get().profile;
      if (!profile) return;
      const state = startPlacement(profile);
      set({ placement: { state, slot: placementSlot(state) } });
    },
    replacePlacementSlot: () => {
      const pl = get().placement;
      if (!pl || pl.answered) return;
      set({ placement: { state: pl.state, slot: placementSlot(pl.state) } });
    },
    placementItem: () => {
      const slot = get().placement?.slot;
      return slot ? serveItem(slot) : null;
    },
    savePlacementProgress: (p) => {
      const pl = get().placement;
      if (pl && !pl.answered) set({ placement: { ...pl, progress: p } });
    },
    answerPlacement: (item, r) => {
      const pl = get().placement;
      if (!pl || pl.answered) return;
      // Placement answers count as ordinary independent attempts too, so the evidence isn't wasted.
      applyOne(item, { ...r, support: 'independent' }, 'try');
      set({ placement: { ...pl, answered: { correct: r.correct }, progress: undefined } });
    },
    continuePlacement: () => {
      const pl = get().placement;
      if (!pl || !pl.slot || !pl.answered) return { done: false };
      const updated = recordPlacement(pl.state, { skillId: pl.slot.skillId, level: pl.slot.level, correct: pl.answered.correct });
      const slot = updated.done ? null : placementSlot(updated);
      if (!slot) {
        completePlacement(updated, false);
        return { done: true };
      }
      set({ placement: { state: updated, slot } });
      return { done: false };
    },
    finishPlacement: (skipped) => {
      const pl = get().placement;
      let state = pl?.state;
      if (pl && pl.slot && pl.answered) state = recordPlacement(pl.state, { skillId: pl.slot.skillId, level: pl.slot.level, correct: pl.answered.correct });
      completePlacement(state, skipped);
    },

    // ------------------------------------------------------------ sessions

    startSession: (mode, opts = {}) => {
      const s = get();
      const now = Date.now();
      if (!s.profile && mode !== 'try') return { ok: false, reason: 'no-profile' };
      const runs = freshRuns(s.runs, now);
      let slots: Slot[] = [];
      let title = 'Session';
      let ladder: ActiveSession['ladder'];
      let challenge: ActiveSession['challenge'];
      const plan = replanIfDue(s.plan, s.profile!, s.skills, now);
      if (plan !== s.plan) set({ plan });

      try {
        switch (mode) {
          case 'journey': {
            const targets = todaysTargets(plan, s.skills, now);
            slots = composeSession({ ...pick(), states: s.skills, targets, now, length: sessionLength(s.profile?.minutesPerDay) });
            title = "Today's session";
            break;
          }
          case 'skill': {
            if (!opts.skillId) return { ok: false, reason: 'empty' };
            slots = skillSession(stateOf(s.skills, opts.skillId), pick(), sessionLength(s.profile?.minutesPerDay));
            title = SKILL_BY_ID[opts.skillId]?.name ?? 'Practice';
            break;
          }
          case 'review': {
            const due = dueReviews(s.skills, now).filter((id) => templatesForSkill(id).length > 0).slice(0, 8);
            slots = due.map((id) => makeSlot(stateOf(s.skills, id), 'practice', 'review', pick()));
            title = 'Review';
            break;
          }
          case 'checkpoint': {
            if (s.checkpoints.some((c) => now - c.at < 6 * 86400000)) return { ok: false, reason: 'empty' };
            slots = checkpointSession(s.skills, pick(), 10);
            title = 'Checkpoint';
            break;
          }
          case 'ladder': {
            if (!opts.skillId) return { ok: false, reason: 'empty' };
            const st = stateOf(s.skills, opts.skillId);
            slots = [makeSlot(st, 'learn', 'ladder', pick(), 1)];
            ladder = { skillId: opts.skillId, level: 1, misses: 0, peak: 1 };
            title = `Ladder: ${SKILL_BY_ID[opts.skillId]?.name ?? ''}`;
            break;
          }
          case 'challenge': {
            const skills = opts.skills ?? [];
            const levels = opts.levels ?? [8, 10];
            if (skills.length === 0) return { ok: false, reason: 'empty' };
            const allowed = levels[1] <= 7 ? skills.every((id) => maxLevel(id) >= levels[1]) : ownsChallenge(s.entitlements, now);
            if (!allowed) return { ok: false, reason: 'locked' };
            challenge = { skills, levels, length: 10 };
            slots = [challengeSlot(skills, levels, pick(), s.skills)];
            title = 'Challenge';
            break;
          }
          default:
            return { ok: false, reason: 'empty' };
        }
      } catch (e) {
        // Every family for the chosen skills is switched off right now.
        if (e instanceof NoTemplatesError) return { ok: false, reason: 'empty' };
        throw e;
      }
      if (slots.length === 0) return { ok: false, reason: 'empty' };

      const tracks = [...new Set(slots.map((x) => SKILL_BY_ID[x.skillId]?.track))].filter(Boolean) as TrackId[];
      const counted = COUNTED_MODES.includes(mode) && !runsAreUnlimited(tracks, s.entitlements, now);
      if (counted && runsLeftToday(runs.used, runs.bonus) <= 0) {
        set({ runs });
        track('runs_exhausted', { mode });
        return { ok: false, reason: 'no-runs' };
      }
      const active: ActiveSession = {
        id: newId(),
        mode,
        title,
        slots,
        index: 0,
        results: [],
        startedAt: now,
        countsAsRun: counted,
        timed: Boolean(s.profile?.style.timed) && mode === 'challenge',
        ladder,
        challenge,
      };
      set({ active, runs: counted ? { ...runs, used: runs.used + 1 } : runs });
      track('session_started', { mode, items: slots.length, guided: slots.filter((x) => x.support === 'guided').length });
      return { ok: true };
    },

    currentItem: () => {
      const a = get().active;
      const slot = a?.slots[a.index];
      return (slot && serveItem(slot)) ?? undefined;
    },

    ensureServable: () => {
      const a = get().active;
      if (!a) return 'ended';
      const slot = a.slots[a.index];
      if (!slot) return 'ended';
      // An answered slot is never regraded or swapped; the session screen moves past it.
      if (a.results.length > a.index) return 'ok';
      if (serveItem(slot)) return 'ok';
      const repl = replacementSlot(slot, stateOf(get().skills, slot.skillId), pick());
      const slots = [...a.slots];
      if (repl) slots[a.index] = repl;
      else slots.splice(a.index, 1);
      track('slot_replaced', { from: slot.templateId, to: repl?.templateId ?? 'none' });
      set({ active: { ...a, slots, progress: undefined } });
      if (!repl && a.index >= slots.length) return 'ended';
      return 'replaced';
    },

    saveProgress: (p) => {
      const a = get().active;
      if (!a || a.results.length > a.index) return;
      set({ active: { ...a, progress: p } });
    },

    recordAnswer: (item, r) => {
      const a = get().active;
      // Each slot is graded once. After a resume the same item may be on screen again.
      if (a && a.results.length > a.index) return a.results[a.index];
      const { attempt, outcome } = applyOne(item, r, a?.mode ?? 'journey', a?.id);
      const result: SessionResult = {
        attemptId: attempt.id,
        itemId: item.id,
        skillId: item.skillId,
        templateId: item.templateId,
        correct: r.correct,
        hint: r.hint,
        support: r.support,
        ms: r.ms,
        transfer: item.transfer,
        from: outcome.from,
        to: outcome.to,
      };
      if (!a) return result;
      const next: ActiveSession = { ...a, results: [...a.results, result], progress: undefined };
      try {
        if (a.ladder) {
          const level = ladderNextLevel(a.ladder.level, r.correct);
          const misses = a.ladder.misses + (r.correct ? 0 : 1);
          next.ladder = { ...a.ladder, level, misses, peak: Math.max(a.ladder.peak, r.correct ? a.ladder.level : 0) };
          if (misses < LADDER_MISSES) {
            const cap = maxLevel(a.ladder.skillId);
            next.slots = [...a.slots, makeSlot(stateOf(get().skills, a.ladder.skillId), 'challenge', 'ladder', pick(), Math.min(level, cap))];
          }
        }
        if (a.challenge && next.results.length < a.challenge.length) {
          next.slots = [...a.slots, challengeSlot(a.challenge.skills, a.challenge.levels, pick(), get().skills)];
        }
      } catch (e) {
        // Nothing left to serve (switched off mid-run): the run simply ends after this puzzle.
        if (!(e instanceof NoTemplatesError)) throw e;
      }
      set({ active: next });
      return result;
    },

    advance: () => {
      const a = get().active;
      if (!a) return { done: true };
      const index = a.index + 1;
      let slots = a.slots;
      const upcoming = slots[index];
      // A skill that reached Practicing during this session switches to checks with the rule hidden (and back, if it slipped).
      if (upcoming && (upcoming.reason === 'target' || upcoming.reason === 'stretch')) {
        const support = supportFor(stateOf(get().skills, upcoming.skillId), upcoming.reason);
        if (support !== upcoming.support) slots = slots.map((x, i) => (i === index ? { ...x, support } : x));
      }
      set({ active: { ...a, index, slots, progress: undefined } });
      return { done: index >= slots.length };
    },

    finishSession: (opts = {}) => {
      const s = get();
      const a = s.active;
      if (!a) return undefined;
      const early = Boolean(opts.early);
      const now = Date.now();
      const results = a.results;
      const proved = new Map<string, DisplayStatus>();
      // Only real promotions count as proof: reaching Practicing or Secure. Starting a skill (New → Learning) does not.
      for (const r of results) {
        if (statusRank(r.to) > statusRank(r.from) && (r.to === 'practicing' || r.to === 'secure')) proved.set(r.skillId, r.to);
      }
      const touched = [...new Set(results.map((r) => r.skillId))];
      const needsWork = touched.filter((id) => !proved.has(id) && results.some((r) => r.skillId === id && !r.correct));
      const practiced = touched.filter((id) => !proved.has(id) && !needsWork.includes(id));
      const correct = results.filter((r) => r.correct).length;
      const tokens = results.length > 0 && !early ? TOKEN_REWARDS.sessionComplete : 0;

      let ladder: Recap['ladder'];
      let ladderBest = s.ladderBest;
      if (a.ladder) {
        const best = s.ladderBest[a.ladder.skillId] ?? 0;
        const newBest = a.ladder.peak > best && correct > 0 && !early;
        if (newBest) ladderBest = { ...ladderBest, [a.ladder.skillId]: a.ladder.peak };
        ladder = { skillId: a.ladder.skillId, peak: correct > 0 ? a.ladder.peak : 0, best: Math.max(best, correct > 0 ? a.ladder.peak : 0), newBest };
      }

      const nextTargets = todaysTargets(s.plan, s.skills, now);
      const nextLabel = nextTargets.length ? SKILL_BY_ID[nextTargets[0]]?.name : undefined;

      const recap: Recap = {
        id: a.id,
        mode: a.mode,
        title: early ? `${a.title} (ended early)` : a.title,
        correct,
        total: results.length,
        proved: [...proved.entries()].map(([skillId, to]) => ({ skillId, to })),
        practiced,
        needsWork,
        nextLabel,
        tokens,
        endedOnMiss: results.length > 0 && !results[results.length - 1].correct,
        timed: a.timed,
        ladder,
        adShown: false,
      };

      const firstSession = s.sessionsCompleted === 0;
      const sessionLog = results.length > 0 ? [...s.sessionLog, { id: a.id, mode: a.mode, at: now, correct, total: results.length, early }] : s.sessionLog;
      const tokenLedger = tokens > 0 ? [...s.tokenLedger, { id: `session-${a.id}`, delta: tokens, reason: 'session' as const, at: now }] : s.tokenLedger;
      set({
        active: undefined,
        lastRecap: recap,
        sessionLog,
        tokenLedger,
        ...derived({ sessionLog, tokenLedger, daily: s.daily }),
        ladderBest,
        checkpoints: a.mode === 'checkpoint' ? [...s.checkpoints, { at: now, correct, total: results.length }] : s.checkpoints,
      });
      track('session_completed', { mode: a.mode, correct, total: results.length, early });
      if (firstSession && results.length > 0 && !early) track('mission_activated', {});
      void get().syncNow();
      void uploadEvents();
      return recap;
    },

    abandonSession: () => {
      const a = get().active;
      // An abandoned session with answers still counts its evidence; it just has no recap.
      set({ active: undefined });
      if (a) track('session_completed', { mode: a.mode, abandoned: true, total: a.results.length });
    },

    markAdShown: () => {
      const r = get().lastRecap;
      if (r) set({ lastRecap: { ...r, adShown: true } });
      track('ad_slot_rendered', { slot: 'session_break' });
    },

    // ------------------------------------------------------------ daily

    saveDailyProgress: (day, p) => {
      if (get().daily[day]) return;
      set({ dailyProgress: { ...p, day } });
    },

    recordDaily: (day, item, r) => {
      const s = get();
      if (s.daily[day]) return;
      if (s.profile) applyOne(item, { ...r, support: 'independent' }, 'daily');
      const daily = { ...get().daily, [day]: { correct: r.correct, ms: r.ms, hints: r.hintsUsed, at: Date.now() } };
      // One id per day, so two devices answering the same day earn the tokens once.
      const tokenLedger = [...get().tokenLedger, { id: `daily-${day}`, delta: TOKEN_REWARDS.dailyPuzzle, reason: 'daily' as const, at: Date.now() }];
      set({ daily, tokenLedger, dailyProgress: undefined, ...derived({ daily, tokenLedger, sessionLog: get().sessionLog }) });
      track('daily_answered', { correct: r.correct, hints: r.hintsUsed });
      void get().syncNow();
    },

    // ------------------------------------------------------------ runs, tokens, purchases

    runsLeft: () => {
      const s = get();
      if (isPremium(s.entitlements, Date.now())) return Infinity;
      const runs = freshRuns(s.runs, Date.now());
      return runsLeftToday(runs.used, runs.bonus);
    },

    buyBonusRunWithTokens: () => {
      const s = get();
      if (s.tokens < TOKEN_COSTS.bonusRun) return false;
      const runs = freshRuns(s.runs, Date.now());
      addTokens({ id: newId(), delta: -TOKEN_COSTS.bonusRun, reason: 'bonus-run' });
      set({ runs: { ...runs, bonus: runs.bonus + 1 } });
      return true;
    },

    grantRewardedRun: () => {
      const runs = freshRuns(get().runs, Date.now());
      set({ runs: { ...runs, bonus: runs.bonus + 1 } });
    },

    purchase: async (productId) => {
      const provider = createTestProvider(() => get().entitlements.ownedPacks);
      const res = await provider.purchase(productId);
      if (!res.ok) return { ok: false, error: res.error };
      set({ entitlements: grant(get().entitlements, productId, Date.now()) });
      track('purchase_completed', { product: productId, test: provider.isTest });
      return { ok: true };
    },

    restorePurchases: async () => {
      const provider = createTestProvider(() => get().entitlements.ownedPacks);
      const res = await provider.restore();
      let e = get().entitlements;
      for (const id of res.productIds) e = grant(e, id, Date.now());
      set({ entitlements: e });
      track('restore_completed', { count: res.productIds.length });
      return { ok: res.ok };
    },

    report: (item, reason) => {
      const s = get();
      const id = newId();
      set({
        reports: [...s.reports, { id, itemId: item.id, contentVersion: item.contentVersion, reason, at: Date.now() }],
        outbox: { ...s.outbox, reports: [...s.outbox.reports, id] },
      });
      track('content_reported', { item: item.id, version: item.templateVersion, reason });
    },

    setPreviewAds: (on) => set({ settings: { ...get().settings, previewAds: on } }),

    deleteAllData: async () => {
      const acct = get().account;
      if (acct.mode === 'cloud') {
        try {
          await cloud.deleteAccount();
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : 'Could not delete the account. Check your connection and try again.' };
        }
      }
      const me = get().owner;
      if (acct.userId) discardEvents((e) => e.userId === acct.userId);
      if (me !== GUEST) {
        await switchOwner(GUEST);
        await clearBucket(kv, me);
      }
      // The guest bucket on this device is wiped too: "Delete my data" leaves nothing of the learner behind.
      set({ ...freshLearner(pickData(get())), owner: GUEST });
      saver.reset();
      await saver.flush();
      return { ok: true };
    },

    // ------------------------------------------------------------ accounts

    connectCloud: async (email, userId, opts) => {
      try {
        const fromGuest = get().owner === GUEST;
        const guest = pickData(get());
        const existing = fromGuest ? await readBucket(kv, userId) : pickData(get());
        await switchOwner(userId);
        let cur = pickData(get());
        if (opts.importGuest && fromGuest) {
          cur = importGuest(cur, guest);
          track('guest_imported', { answers: guest.attempts.length, plan: Boolean(guest.plan) });
        }
        const prev = cur.account;
        set({
          ...cur,
          account: { mode: 'cloud', email, userId, savedAt: Date.now(), lastSyncAt: prev.userId === userId ? prev.lastSyncAt : undefined, pullCursor: prev.userId === userId ? prev.pullCursor : undefined },
        });
        if (opts.importGuest && fromGuest) {
          // The guest's progress now lives in the account. Leave an empty guest behind so it can't be imported twice.
          await writeBucket(kv, GUEST, freshLearner(guest));
        }
        track('plan_saved', { mode: 'cloud', imported: opts.importGuest });
        const r = await get().syncNow();
        const restored = Boolean(existing?.plan || existing?.attempts.length) || r.pulled > 0 || r.hadSnapshot;
        return { ok: true, restored, error: r.ok ? undefined : get().account.syncError };
      } catch (e) {
        return { ok: false, restored: false, error: e instanceof Error ? e.message : 'Sync failed' };
      }
    },

    syncNow: () => {
      if (!syncing) syncing = doSync().finally(() => (syncing = null));
      return syncing;
    },

    disconnectCloud: async () => {
      // Best effort: get the outbox up first. Anything left stays in the account's bucket on this device for next time.
      await Promise.race([get().syncNow(), timeout(8000)]);
      try {
        await cloud.signOut();
      } catch {
        // Offline sign-out still closes the account's bucket below.
      }
      await switchOwner(GUEST);
      track('signed_out', {});
    },
  };
});

// ------------------------------------------------------------------ launch

let booted = false;

async function refreshAndApply(force = false) {
  if (await refreshFlags(force)) {
    useApp.setState({ flagsVersion: useApp.getState().flagsVersion + 1 });
  }
}

/**
 * Open the learner's bucket and start saving, syncing and analytics. Called
 * once from the root layout, on the client only (the web export renders in Node).
 */
export async function bootstrapStore() {
  if (booted) return;
  booted = true;
  if (!canStore()) {
    useApp.setState({ hydrated: true });
    return;
  }
  // The kill switch applies from the first frame, offline too.
  if (await loadCachedFlags()) useApp.setState({ flagsVersion: useApp.getState().flagsVersion + 1 });
  let opened: { owner: string; data?: Data } = { owner: GUEST };
  try {
    opened = await openAtLaunch(kv);
  } catch {
    // Storage unreadable: start as a fresh guest rather than not at all.
  }
  saverOwner = opened.owner;
  useApp.setState({ ...(opened.data ?? freshLearner()), owner: opened.owner, hydrated: true });
  const s = useApp.getState();
  setAnalyticsContext({ ageBand: s.profile?.ageBand, userId: opened.owner === GUEST ? undefined : opened.owner });
  useApp.subscribe(() => saver.schedule());
  void startAnalytics();

  RNAppState.addEventListener('change', (st) => {
    if (st === 'active') {
      void refreshAndApply();
      void useApp.getState().syncNow();
    } else {
      void saver.flush();
      saveEventsNow();
      void uploadEvents();
    }
  });
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      void saver.flush();
      saveEventsNow();
    });
  }
  void refreshAndApply(true);
  void useApp.getState().syncNow();
}

/** Write pending saves now (the app also does this when it goes to the background). */
export const flushSaves = () => saver.flush();

/** Ads switched on (remote flag), or previewed by a developer. */
export const adsLive = (s: Pick<AppState, 'settings'>) => config.adsEnabled || (config.devTools && s.settings.previewAds);

export { dailySlot, displayStatus };

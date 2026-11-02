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
import { examSkills } from '../exams/blueprints';
import { MISSION_BY_ID, missionSlots, missionState, missionsDone } from '../quests/chapters';
import { drillSlots, heldOutSlots, POLICIES, repairSlots, summarizeCheck, type QuizKind } from '../quizzes/policies';
import { buy, grantOnce, milestoneGrants, weeklyProgress, weeklyRewardEntry } from '../rewards/ledger';
import { applyPlacementRun, derived, importGuest, mergeRemote, pickSynced, type Synced } from '../sync/merge';
import { itemForMission } from '../world/catalog';
import { clearBucket, createSaver, GUEST, openAtLaunch, OWNER_KEY, readBucket, writeBucket, type KV } from './buckets';
import { migrateSnapshot } from './migrate';
import {
  DEVICE_KEYS,
  freshLearner,
  INITIAL,
  pickData,
  type ActiveSession,
  type AnswerRecord,
  type CheckRecord,
  type Data,
  type FeelSettings,
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
  /** Play a chapter mission. Missions never use a free run: the chapters are free. */
  startMission(missionId: string): StartResult;
  /**
   * A quiz: a concept check on `skills`, a mixed drill for the learner's exam, a
   * guided repair of `skillId`, or a recall set on due skills.
   */
  startQuiz(kind: Exclude<QuizKind, 'practice'>, opts?: { skills?: string[]; skillId?: string }): StartResult;
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

  /** Buy a workshop object with Workshop Coins. */
  buyItem(itemId: string): boolean;
  /** The object the learner is working toward (shown on Play and Workshop). */
  chooseProject(itemId: string | undefined): void;
  setFeel(patch: Partial<FeelSettings>): void;

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
  /** The last save to this device failed. */
  storageError?: string;
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

/** Help just taken (or a puzzle just opened) is saved at once rather than after the usual short delay. */
const isUrgent = (prev: ItemProgress | undefined, next: ItemProgress) =>
  !prev || prev.itemId !== next.itemId || next.hints > prev.hints || (next.ruleRevealed && !prev.ruleRevealed);

/** The bucket being saved to. Null until launch has opened one, so nothing is written before then. */
let saverOwner: string | null = null;
const saver = createSaver(kv, () => ({ owner: saverOwner, data: pickData(useApp.getState()) }), {
  onError: (e) => {
    const storageError = e ? 'Your progress could not be saved on this device. Free up some storage space; the app will keep trying.' : undefined;
    if (useApp.getState().storageError !== storageError) useApp.setState({ storageError });
  },
});

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

  // -------------------------------------------------------------- missions and quizzes

  /** Families the learner played in the last day of chapter games, so a check can hold them out. */
  const recentlyPlayedFamilies = () => {
    const since = Date.now() - 86400000;
    return [...new Set(get().attempts.filter((x) => x.at > since && (x.mode === 'quest' || x.mode === 'repair')).map((x) => x.templateId))];
  };

  const begin = (args: {
    mode: SessionMode;
    title: string;
    slots: Slot[];
    missionId?: string;
    quiz?: QuizKind;
    countsAsRun?: boolean;
    timed?: boolean;
  }): StartResult => {
    const s = get();
    const now = Date.now();
    if (!s.profile) return { ok: false, reason: 'no-profile' };
    if (args.slots.length === 0) return { ok: false, reason: 'empty' };
    const runs = freshRuns(s.runs, now);
    const tracks = [...new Set(args.slots.map((x) => SKILL_BY_ID[x.skillId]?.track))].filter(Boolean) as TrackId[];
    const counted = Boolean(args.countsAsRun) && !runsAreUnlimited(tracks, s.entitlements, now);
    if (counted && runsLeftToday(runs.used, runs.bonus) <= 0) {
      set({ runs });
      track('runs_exhausted', { mode: args.mode });
      return { ok: false, reason: 'no-runs' };
    }
    const policy = args.quiz ? POLICIES[args.quiz] : undefined;
    const active: ActiveSession = {
      id: newId(),
      mode: args.mode,
      title: args.title,
      slots: args.slots,
      index: 0,
      results: [],
      startedAt: now,
      countsAsRun: counted,
      timed: Boolean(args.timed),
      missionId: args.missionId,
      quiz: args.quiz,
      feedback: policy?.feedback ?? 'immediate',
    };
    const quests = args.missionId
      ? {
          ...s.quests,
          [args.missionId]: {
            ...s.quests[args.missionId],
            version: s.quests[args.missionId]?.version ?? MISSION_BY_ID[args.missionId].version,
            runs: s.quests[args.missionId]?.runs ?? 0,
            startedAt: s.quests[args.missionId]?.startedAt ?? now,
          },
        }
      : s.quests;
    set({ active, quests, runs: counted ? { ...runs, used: runs.used + 1 } : runs });
    track(args.missionId ? 'quest_started' : args.quiz ? 'quiz_started' : 'session_started', { mode: args.mode, mission: args.missionId, quiz: args.quiz, items: args.slots.length });
    return { ok: true };
  };

  /** Days with any answered puzzle, for the weekly goal. */
  const activityDays = () => new Set(get().attempts.map((x) => dayKey(x.at)));

  /** Grants and coins that follow from what the learner has done: mission objects, milestones, the weekly goal. Each pays once. */
  const settleRewards = (now: number) => {
    const s = get();
    let grants = s.grants;
    let tokenLedger = s.tokenLedger;
    const week = weeklyProgress(activityDays(), now);
    if (week.met && !tokenLedger.some((e) => e.id === `weekly:${week.week}`)) tokenLedger = [...tokenLedger, weeklyRewardEntry(week.week, now)];
    const weeksMet = tokenLedger.filter((e) => e.reason === 'weekly').length;
    for (const [id, rec] of Object.entries(s.quests)) {
      const item = rec.completedAt ? itemForMission(id) : undefined;
      if (item) grants = grantOnce(grants, item.id, `mission:${id}`, rec.completedAt!);
    }
    grants = milestoneGrants(grants, missionsDone(s.quests), weeksMet, now);
    const newItems = grants.filter((g) => !s.grants.some((x) => x.id === g.id)).map((g) => g.itemId);
    const coins = tokenLedger.filter((e) => !s.tokenLedger.some((x) => x.id === e.id)).reduce((n, e) => n + e.delta, 0);
    if (grants !== s.grants || tokenLedger !== s.tokenLedger) {
      set({ grants, tokenLedger, ...derived({ tokenLedger, sessionLog: s.sessionLog, daily: s.daily }) });
      for (const itemId of newItems) track('project_revealed', { item: itemId });
    }
    return { newItems, coins };
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
      // 1. Pull and merge by id. Repeated if another device stores its snapshot between our pull and push.
      let cursor = acct.pullCursor;
      let newFromServer = 0;
      const pullAndMerge = async () => {
        const [snapshot, pulled] = await Promise.all([cloud.pullSnapshot(userId), cloud.pullAttempts(userId, cursor)]);
        if (get().owner !== userId) return null;
        const before = get().attempts.length;
        const { data } = mergeRemote(pickData(get()), { synced: migrateSnapshot(snapshot?.state), attempts: pulled.attempts });
        cursor = pulled.cursor;
        set({ ...data, account: { ...get().account, pullCursor: cursor, loadedAt: get().account.loadedAt ?? Date.now() } });
        newFromServer += get().attempts.length - before;
        return snapshot;
      };
      let snapshot = await pullAndMerge();
      if (get().owner !== userId) return none;
      const hadSnapshot = snapshot !== null;

      // 2. Upload the outbox. Ids leave it only when the server has them. Answers given while
      //    this upload is in flight stay in the outbox for the next sync.
      const cur = get();
      const known = new Map(cur.attempts.map((a) => [a.id, a]));
      const pending = cur.outbox.attempts.map((id) => known.get(id)).filter((a): a is Attempt => !!a);
      const acked = new Set(pending.length ? await cloud.pushAttempts(userId, pending) : []);
      const reportById = new Map(cur.reports.map((r) => [r.id, r]));
      const pendingReports = cur.outbox.reports.map((id) => reportById.get(id)).filter((r) => !!r);
      const ackedReports = new Set(await cloud.pushReports(userId, pendingReports as NonNullable<(typeof pendingReports)[number]>[]));
      if (get().owner !== userId) return none;
      const now = get();
      const haveAttempt = new Set(now.attempts.map((a) => a.id));
      const haveReport = new Set(now.reports.map((r) => r.id));
      set({
        outbox: {
          attempts: now.outbox.attempts.filter((id) => !acked.has(id) && haveAttempt.has(id)),
          reports: now.outbox.reports.filter((id) => !ackedReports.has(id) && haveReport.has(id)),
        },
      });

      // 3. Push the merged snapshot back, only if nobody else has since our pull; otherwise pull, merge and retry.
      let stored = !get().profile;
      for (let round = 0; round < 3 && !stored; round++) {
        if (round > 0) {
          snapshot = await pullAndMerge();
          if (get().owner !== userId) return none;
        }
        const fresh = get();
        if (!fresh.profile) break;
        stored = await cloud.pushSnapshot(userId, fresh.profile.ageBand, pickSynced(fresh), fresh.attempts.length, snapshot ? snapshot.version : null);
      }
      setAccount(
        stored
          ? { lastSyncAt: Date.now(), syncError: undefined, needsSignIn: false }
          : { needsSignIn: false, syncError: 'Another device is syncing this account. Your answers are uploaded; the rest syncs next time.' },
      );
      return { ok: stored, pulled: newFromServer, hadSnapshot };
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
      if (!pl || pl.answered) return;
      set({ placement: { ...pl, progress: p } });
      if (isUrgent(pl.progress, p)) void saver.flush();
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
        feedback: 'immediate',
      };
      set({ active, runs: counted ? { ...runs, used: runs.used + 1 } : runs });
      track('session_started', { mode, items: slots.length, guided: slots.filter((x) => x.support === 'guided').length });
      return { ok: true };
    },

    startMission: (missionId) => {
      const s = get();
      const m = MISSION_BY_ID[missionId];
      if (!m) return { ok: false, reason: 'empty' };
      if (missionState(m, s.quests, Date.now()).status === 'waiting') return { ok: false, reason: 'locked' };
      let slots: Slot[];
      if (m.kind === 'check' || m.kind === 'recall') {
        slots = heldOutSlots({
          ...pick(),
          skills: m.skills,
          states: s.skills,
          length: m.length ?? POLICIES[m.kind === 'check' ? 'check' : 'recall'].length,
          avoid: recentlyPlayedFamilies(),
          reason: m.kind === 'check' ? 'check' : 'recall',
        });
      } else {
        slots = missionSlots(m, pick());
      }
      return begin({
        mode: m.kind === 'check' ? 'check' : 'quest',
        title: m.title,
        slots,
        missionId,
        quiz: m.kind === 'check' ? 'check' : m.kind === 'recall' ? 'recall' : undefined,
        countsAsRun: false,
      });
    },

    startQuiz: (kind, opts = {}) => {
      const s = get();
      const policy = POLICIES[kind];
      switch (kind) {
        case 'check': {
          const skills = opts.skills?.length ? opts.skills : todaysTargets(s.plan, s.skills, Date.now());
          const slots = heldOutSlots({ ...pick(), skills, states: s.skills, length: policy.length, avoid: recentlyPlayedFamilies(), reason: 'check' });
          return begin({ mode: 'check', title: policy.title, slots, quiz: 'check' });
        }
        case 'drill': {
          const exams = s.profile?.exams ?? [];
          const ids = examSkills(exams);
          const skills = ids.map((id) => ({ id, weight: exams.length ? Math.max(...exams.map((e) => SKILL_BY_ID[id].weights[e])) : 1 }));
          const slots = drillSlots({ ...pick(), skills, states: s.skills });
          return begin({ mode: 'drill', title: policy.title, slots, quiz: 'drill', countsAsRun: true, timed: Boolean(s.profile?.style.timed) });
        }
        case 'repair': {
          if (!opts.skillId) return { ok: false, reason: 'empty' };
          const slots = repairSlots({ ...pick(), skillId: opts.skillId, states: s.skills });
          return begin({ mode: 'repair', title: `Repair: ${SKILL_BY_ID[opts.skillId]?.name ?? ''}`, slots, quiz: 'repair' });
        }
        case 'recall': {
          const due = dueReviews(s.skills, Date.now());
          const skills = opts.skills?.length ? opts.skills : due;
          const slots = heldOutSlots({ ...pick(), skills, states: s.skills, length: policy.length, avoid: recentlyPlayedFamilies(), reason: 'recall' });
          return begin({ mode: 'review', title: policy.title, slots, quiz: 'recall' });
        }
      }
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
      if (isUrgent(a.progress, p)) void saver.flush();
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

      // A mission counts as done when its last puzzle is answered (not ended early). Its object, any
      // milestone it completes and the weekly goal are settled below; each pays at most once.
      let quests = s.quests;
      if (a.missionId && !early && results.length > 0 && results.length >= a.slots.length) {
        const prev = quests[a.missionId];
        const best = !prev?.best || correct / results.length > prev.best.correct / Math.max(1, prev.best.total) ? { correct, total: results.length } : prev.best;
        quests = {
          ...quests,
          [a.missionId]: { ...prev, version: MISSION_BY_ID[a.missionId]?.version ?? 1, completedAt: prev?.completedAt ?? now, best, runs: (prev?.runs ?? 0) + 1 },
        };
        track('quest_completed', { mission: a.missionId, correct, total: results.length });
      }
      const isCheck = a.quiz === 'check' || a.quiz === 'drill' || a.quiz === 'recall';
      const check = isCheck && results.length > 0 ? summarizeCheck(results.map((r) => ({ skillId: r.skillId, templateId: r.templateId, correct: r.correct, hint: r.hint, misconception: s.attempts.find((x) => x.id === r.attemptId)?.misconception }))) : undefined;
      const checks: CheckRecord[] =
        check && !early
          ? [
              ...s.checks,
              {
                id: a.id,
                kind: a.quiz!,
                missionId: a.missionId,
                skills: [...new Set(results.map((r) => r.skillId))],
                correct,
                total: results.length,
                at: now,
                missed: results.filter((r) => !r.correct).map((r) => ({ skillId: r.skillId, misconception: s.attempts.find((x) => x.id === r.attemptId)?.misconception })),
              },
            ]
          : s.checks;
      if (check) track('quiz_submitted', { quiz: a.quiz, correct, total: results.length });

      const recap: Recap = {
        id: a.id,
        mode: a.mode,
        missionId: a.missionId,
        quiz: a.quiz,
        check,
        attemptIds: results.map((r) => r.attemptId),
        rewards: { coins: 0, items: [] },
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
        quests,
        checks,
        ...derived({ sessionLog, tokenLedger, daily: s.daily }),
        ladderBest,
        checkpoints: a.mode === 'checkpoint' ? [...s.checkpoints, { at: now, correct, total: results.length }] : s.checkpoints,
      });
      const settled = settleRewards(now);
      const withRewards: Recap = { ...recap, rewards: { coins: tokens + settled.coins, items: settled.newItems } };
      set({ lastRecap: withRewards });
      track('session_completed', { mode: a.mode, correct, total: results.length, early });
      if (firstSession && results.length > 0 && !early) track('mission_activated', {});
      void get().syncNow();
      void uploadEvents();
      return withRewards;
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
      const prev = get().dailyProgress;
      set({ dailyProgress: { ...p, day } });
      if (isUrgent(prev?.day === day ? prev : undefined, p)) void saver.flush();
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

    buyItem: (itemId) => {
      const s = get();
      const r = buy(s.tokenLedger, s.grants, itemId, Date.now());
      if (!r) return false;
      set({ tokenLedger: r.ledger, grants: r.grants, ...derived({ tokenLedger: r.ledger, sessionLog: s.sessionLog, daily: s.daily }) });
      track('project_revealed', { item: itemId, bought: true });
      return true;
    },

    chooseProject: (itemId) => {
      set({ project: itemId ? { itemId, at: Date.now() } : undefined });
      if (itemId) track('project_selected', { item: itemId });
    },

    setFeel: (patch) => set({ settings: { ...get().settings, ...patch } }),

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
          // The server deletes whoever the saved sign-in belongs to. Make sure that is this learner
          // (another tab or window may have signed in as someone else).
          if ((await cloud.sessionUserId()) !== acct.userId) {
            return { ok: false, error: `Sign in again as ${acct.email ?? 'this account'} to delete it. Nothing was deleted.` };
          }
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
        const local = fromGuest ? await readBucket(kv, userId) : pickData(get());
        // An account opened on this device for the first time starts from the server's copy. Until it is
        // loaded, nothing made here (a guest's plan, or onboarding after a failed first sync) could be told
        // apart from a newer plan, so the account isn't opened without it.
        let remote: { synced?: Synced; attempts: Attempt[]; cursor?: string } | null = null;
        if (!local?.account.loadedAt) {
          try {
            const [snapshot, pulled] = await Promise.all([cloud.pullSnapshot(userId), cloud.pullAttempts(userId, undefined)]);
            remote = { synced: migrateSnapshot(snapshot?.state), attempts: pulled.attempts, cursor: pulled.cursor };
          } catch {
            return { ok: false, restored: false, error: "You're signed in, but your account couldn't be loaded. Check your connection and try again." };
          }
        }
        await switchOwner(userId);
        let cur = pickData(get());
        if (remote) cur = { ...mergeRemote(cur, remote).data, account: { ...cur.account, pullCursor: remote.cursor, loadedAt: Date.now() } };
        const hadAccountData = Boolean(cur.plan || cur.profile || cur.attempts.length);
        if (opts.importGuest && fromGuest) {
          // The account's own profile and plan (loaded above) win; everything else is added.
          cur = importGuest(cur, guest);
          track('guest_imported', { answers: guest.attempts.length, plan: Boolean(guest.plan) });
        }
        const prev = cur.account;
        const same = prev.userId === userId || prev.userId === undefined;
        set({
          ...cur,
          account: {
            mode: 'cloud',
            email,
            userId,
            savedAt: Date.now(),
            lastSyncAt: same ? prev.lastSyncAt : undefined,
            pullCursor: same ? prev.pullCursor : undefined,
            loadedAt: same ? prev.loadedAt : undefined,
          },
        });
        if (opts.importGuest && fromGuest) {
          // Save the account with the guest's progress in it before emptying the guest, so a crash in
          // between can't lose it. If this save fails, the guest is left as it was.
          await saver.flush();
          if (!get().storageError) await writeBucket(kv, GUEST, freshLearner(guest));
        }
        track('plan_saved', { mode: 'cloud', imported: opts.importGuest });
        const r = await get().syncNow();
        return { ok: true, restored: hadAccountData || r.pulled > 0 || r.hadSnapshot, error: r.ok ? undefined : get().account.syncError };
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

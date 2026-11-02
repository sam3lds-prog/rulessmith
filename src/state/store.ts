/**
 * App state. Local-first: everything persists on the device (AsyncStorage,
 * which is localStorage on web). Cloud sync is layered on top in data/sync.ts
 * when Supabase is configured.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { track } from '../analytics/track';
import { config } from '../config';
import * as cloud from '../data/cloud';
import { generateItem, SKILL_BY_ID, type Item, type TrackId } from '../content';
import { createRng } from '../content/rng';
import { dailySlot } from '../engine/daily';
import { applyAttempt, displayStatus, newSkillState, statusRank } from '../engine/mastery';
import {
  challengeSlot,
  checkpointSession,
  composeSession,
  dueReviews,
  LADDER_MISSES,
  ladderNextLevel,
  makeSlot,
  skillSession,
  stateOf,
  type States,
} from '../engine/mixer';
import type { PlacementState } from '../engine/placement';
import { buildPlan, replanIfDue, todaysTargets } from '../engine/planner';
import { dayKey } from '../engine/time';
import type { Attempt, DisplayStatus, JourneyPlan, Profile, SessionMode, Slot } from '../engine/types';
import {
  EMPTY_ENTITLEMENTS,
  type Entitlements,
  grant,
  isPremium,
  maxLevelFor,
  ownsChallenge,
  runsAreUnlimited,
  runsLeftToday,
} from '../monetization/entitlements';
import { createTestProvider } from '../monetization/purchases';
import { TOKEN_COSTS, TOKEN_REWARDS } from '../monetization/tokens';

export interface SessionResult {
  itemId: string;
  skillId: string;
  templateId: string;
  correct: boolean;
  hint: boolean;
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
  itemId: string;
  contentVersion: string;
  reason: string;
  at: number;
}

export interface DailyResult {
  correct: boolean;
  ms: number;
  hints: number;
}

export type StartResult = { ok: true } | { ok: false; reason: 'no-runs' | 'locked' | 'empty' | 'no-profile' };

interface Data {
  profile?: Profile;
  plan?: JourneyPlan;
  skills: States;
  attempts: Attempt[];
  sessionsCompleted: number;
  runs: { day: string; used: number; bonus: number };
  tokens: number;
  entitlements: Entitlements;
  recentSeeds: Record<string, number[]>;
  daily: Record<string, DailyResult>;
  streak: { lastDay?: string; count: number };
  ladderBest: Record<string, number>;
  checkpoints: { at: number; correct: number; total: number }[];
  reports: ContentReport[];
  settings: { previewAds: boolean };
  placement?: PlacementState;
  active?: ActiveSession;
  lastRecap?: Recap;
  triedPuzzle?: { correct: boolean; ms: number };
  account: {
    mode: 'none' | 'device' | 'cloud';
    email?: string;
    userId?: string;
    savedAt?: number;
    lastSyncAt?: number;
    /** Newest attempt timestamp already pushed. */
    syncedAttemptAt?: number;
    reportsSynced?: number;
    syncError?: string;
  };
}

interface Actions {
  setProfile(p: Profile): void;
  setPlacement(p: PlacementState | undefined): void;
  applyPlacementRatings(ratings: Record<string, number>): void;
  createPlan(): JourneyPlan | undefined;
  updateProfileAndReplan(patch: Partial<Profile>): void;
  saveOnDevice(): void;
  setTriedPuzzle(r: { correct: boolean; ms: number }): void;

  startSession(mode: SessionMode, opts?: { skillId?: string; skills?: string[]; levels?: [number, number] }): StartResult;
  currentItem(): Item | undefined;
  recordAnswer(item: Item, r: { correct: boolean; hint: boolean; ms: number }): SessionResult;
  advance(): { done: boolean };
  /** early: the learner ended the run before its last puzzle (no tokens, not a completed session). */
  finishSession(opts?: { early?: boolean }): Recap | undefined;
  abandonSession(): void;
  markAdShown(): void;

  recordStandalone(item: Item, r: { correct: boolean; hint: boolean; ms: number }, mode: SessionMode): void;
  recordDaily(day: string, item: Item, r: { correct: boolean; hints: number; ms: number }): void;

  runsLeft(): number;
  buyBonusRunWithTokens(): boolean;
  grantRewardedRun(): void;
  purchase(productId: string): Promise<{ ok: boolean; error?: string }>;
  restorePurchases(): Promise<{ ok: boolean }>;

  report(item: Item, reason: string): void;
  setPreviewAds(on: boolean): void;
  deleteAllData(): Promise<{ ok: boolean; error?: string }>;

  connectCloud(email: string, userId: string): Promise<{ ok: boolean; restored: boolean; error?: string }>;
  syncNow(): Promise<void>;
  disconnectCloud(): Promise<void>;
}

/** Total puzzles answered, from skill states (which sync), not the device-local attempt log. */
const progressCount = (skills: States) => Object.values(skills).reduce((n, st) => n + (st?.attempts ?? 0), 0);

/** The fields that follow a learner to a new device. Purchases come from the store, not from here. */
const SYNCED_KEYS = ['profile', 'plan', 'skills', 'sessionsCompleted', 'tokens', 'daily', 'streak', 'ladderBest', 'checkpoints'] as const;

export type AppState = Data & Actions & { hydrated: boolean };

// Optional keys are listed as undefined on purpose: zustand merges state, so a key
// missing here would survive "Delete my data".
const INITIAL: Data = {
  profile: undefined,
  plan: undefined,
  placement: undefined,
  active: undefined,
  lastRecap: undefined,
  triedPuzzle: undefined,
  skills: {},
  attempts: [],
  sessionsCompleted: 0,
  runs: { day: '', used: 0, bonus: 0 },
  tokens: 0,
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

/** The web static export renders in Node, where there is no window or localStorage. */
const serverStorage: StateStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
const storageBackend = (): StateStorage =>
  Platform.OS === 'web' && typeof window === 'undefined' ? serverStorage : AsyncStorage;

// Reviews of secured skills and the planned checkpoint stay free; everything else uses a run.
const COUNTED_MODES: SessionMode[] = ['journey', 'skill', 'ladder', 'challenge'];
const ATTEMPT_LOG_CAP = 400;
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

function bumpStreak(streak: Data['streak'], now: number): Data['streak'] {
  const today = dayKey(now);
  if (streak.lastDay === today) return streak;
  const yesterday = dayKey(now - 86400000);
  return { lastDay: today, count: streak.lastDay === yesterday ? streak.count + 1 : 1 };
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => {
      const maxLevel = (skillId: string) => maxLevelFor(skillId, get().entitlements, Date.now());
      const pick = () => ({ rng: createRng(Date.now() ^ Math.floor(Math.random() * 2 ** 30)), maxLevel, recentSeeds: get().recentSeeds });

      const applyOne = (item: Item, r: { correct: boolean; hint: boolean; ms: number }, mode: SessionMode) => {
        const now = Date.now();
        const s = get();
        const attempt: Attempt = {
          itemId: item.id,
          skillId: item.skillId,
          family: item.family,
          level: item.level,
          transfer: item.transfer,
          correct: r.correct,
          hintBeforeAnswer: r.hint,
          ms: r.ms,
          at: now,
          mode,
        };
        const outcome = applyAttempt(stateOf(s.skills, item.skillId), attempt, now);
        set({
          skills: { ...s.skills, [item.skillId]: outcome.state },
          attempts: [...s.attempts, attempt].slice(-ATTEMPT_LOG_CAP),
          recentSeeds: rememberSeed(s.recentSeeds, item.templateId, item.seed),
        });
        track('item_answered', { template: item.templateId, level: item.level, correct: r.correct, hint: r.hint, mode });
        if (outcome.to === 'secure' && outcome.from !== 'secure') track('skill_secured', { skill: item.skillId });
        return outcome;
      };

      return {
        ...INITIAL,
        hydrated: false,

        setProfile: (profile) => {
          set({ profile });
          track('profile_completed', { exams: profile.exams.join(','), role: profile.role });
        },
        setPlacement: (placement) => set({ placement }),
        applyPlacementRatings: (ratings) => {
          const skills = { ...get().skills };
          const attempts = get().attempts;
          for (const [id, rating] of Object.entries(ratings)) {
            const prev = skills[id] ?? newSkillState(id);
            // Placement sets the starting rating. Its own answers (mode 'try') don't block that;
            // real practice does, so re-running onboarding never wipes earned progress.
            const onlyPlacement = attempts.filter((x) => x.skillId === id).every((x) => x.mode === 'try');
            skills[id] = { ...prev, rating: prev.attempts === 0 || onlyPlacement ? rating : prev.rating };
          }
          set({ skills });
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
          const next = { ...profile, ...patch };
          set({ profile: next, plan: buildPlan(next, get().skills, Date.now()) });
        },
        saveOnDevice: () => {
          set({ account: { mode: 'device', savedAt: Date.now() } });
          track('plan_saved', { mode: 'device' });
        },
        setTriedPuzzle: (triedPuzzle) => set({ triedPuzzle }),

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
              const due = dueReviews(s.skills, now).slice(0, 8);
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
          if (slots.length === 0) return { ok: false, reason: 'empty' };

          const tracks = [...new Set(slots.map((x) => SKILL_BY_ID[x.skillId]?.track))].filter(Boolean) as TrackId[];
          const counted = COUNTED_MODES.includes(mode) && !runsAreUnlimited(tracks, s.entitlements, now);
          if (counted && runsLeftToday(runs.used, runs.bonus) <= 0) {
            set({ runs });
            track('runs_exhausted', { mode });
            return { ok: false, reason: 'no-runs' };
          }
          const active: ActiveSession = {
            id: `${now}`,
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
          track('session_started', { mode, items: slots.length });
          return { ok: true };
        },

        currentItem: () => {
          const a = get().active;
          const slot = a?.slots[a.index];
          return slot ? generateItem(slot.templateId, slot.level, slot.seed) : undefined;
        },

        recordAnswer: (item, r) => {
          const a = get().active;
          // Each slot is graded once. After a resume the same item may be on screen again.
          if (a && a.results.length > a.index) return a.results[a.index];
          const outcome = applyOne(item, r, a?.mode ?? 'journey');
          const result: SessionResult = {
            itemId: item.id,
            skillId: item.skillId,
            templateId: item.templateId,
            correct: r.correct,
            hint: r.hint,
            ms: r.ms,
            transfer: item.transfer,
            from: outcome.from,
            to: outcome.to,
          };
          if (!a) return result;
          const next: ActiveSession = { ...a, results: [...a.results, result] };
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
          set({ active: next });
          return result;
        },

        advance: () => {
          const a = get().active;
          if (!a) return { done: true };
          const index = a.index + 1;
          set({ active: { ...a, index } });
          return { done: index >= a.slots.length };
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

          const plan = s.plan;
          const nextTargets = todaysTargets(plan, s.skills, now);
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

          const sessionsCompleted = s.sessionsCompleted + (results.length > 0 && !early ? 1 : 0);
          set({
            active: undefined,
            lastRecap: recap,
            sessionsCompleted,
            tokens: s.tokens + tokens,
            streak: results.length > 0 ? bumpStreak(s.streak, now) : s.streak,
            ladderBest,
            checkpoints: a.mode === 'checkpoint' ? [...s.checkpoints, { at: now, correct, total: results.length }] : s.checkpoints,
          });
          track('session_completed', { mode: a.mode, correct, total: results.length, early });
          if (s.sessionsCompleted === 0 && results.length > 0) track('mission_activated', {});
          void get().syncNow();
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

        recordStandalone: (item, r, mode) => {
          applyOne(item, r, mode);
        },

        recordDaily: (day, item, r) => {
          const s = get();
          if (s.daily[day]) return;
          if (s.profile) applyOne(item, { correct: r.correct, hint: r.hints > 0, ms: r.ms }, 'daily');
          set({
            daily: { ...get().daily, [day]: { correct: r.correct, ms: r.ms, hints: r.hints } },
            tokens: get().tokens + TOKEN_REWARDS.dailyPuzzle,
            streak: bumpStreak(get().streak, Date.now()),
          });
          track('daily_answered', { correct: r.correct, hints: r.hints });
          void get().syncNow();
        },

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
          set({ tokens: s.tokens - TOKEN_COSTS.bonusRun, runs: { ...runs, bonus: runs.bonus + 1 } });
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
          set({ reports: [...get().reports, { itemId: item.id, contentVersion: item.contentVersion, reason, at: Date.now() }] });
          track('content_reported', { item: item.id, reason });
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
          set({ ...INITIAL });
          return { ok: true };
        },

        connectCloud: async (email, userId) => {
          try {
            const remote = await cloud.pullState(userId);
            const local = get();
            const remoteSkills = (remote?.state.skills ?? {}) as States;
            const restored = !!remote && progressCount(remoteSkills) > progressCount(local.skills);
            if (restored && remote) {
              // The account has more progress than this device: adopt it.
              set({ ...(remote.state as Partial<Data>) });
            }
            set({
              account: {
                mode: 'cloud',
                email,
                userId,
                savedAt: Date.now(),
                // Counters carry over only when it's the same account signing back in.
                syncedAttemptAt: restored ? Date.now() : local.account.email === email ? (local.account.syncedAttemptAt ?? 0) : 0,
                reportsSynced: local.account.email === email ? (local.account.reportsSynced ?? 0) : 0,
              },
            });
            await get().syncNow();
            track('plan_saved', { mode: 'cloud', restored });
            return { ok: true, restored };
          } catch (e) {
            return { ok: false, restored: false, error: e instanceof Error ? e.message : 'Sync failed' };
          }
        },

        syncNow: async () => {
          const s = get();
          const acct = s.account;
          if (acct.mode !== 'cloud' || !acct.userId || !s.profile) return;
          try {
            const snapshot: Record<string, unknown> = {};
            for (const k of SYNCED_KEYS) snapshot[k] = s[k];
            const syncedAttemptAt = await cloud.pushState(acct.userId, s.profile.ageBand, snapshot, progressCount(s.skills), s.attempts, acct.syncedAttemptAt ?? 0);
            const pending = s.reports.slice(acct.reportsSynced ?? 0);
            await cloud.pushReports(acct.userId, pending);
            set({ account: { ...get().account, lastSyncAt: Date.now(), syncedAttemptAt, reportsSynced: s.reports.length, syncError: undefined } });
          } catch (e) {
            set({ account: { ...get().account, syncError: e instanceof Error ? e.message : 'Sync failed' } });
          }
        },

        disconnectCloud: async () => {
          try {
            await cloud.signOut();
          } finally {
            const prev = get().account;
            set({ account: { mode: 'device', email: prev.email, savedAt: Date.now(), syncedAttemptAt: prev.syncedAttemptAt, reportsSynced: prev.reportsSynced } });
          }
        },
      };
    },
    {
      name: 'rulesmith-v1',
      version: 1,
      storage: createJSONStorage(storageBackend),
      partialize: ({ hydrated, ...rest }) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) if (typeof v !== 'function') out[k] = v;
        return out as Partial<AppState>;
      },
      onRehydrateStorage: () => () => {
        useApp.setState({ hydrated: true });
      },
    },
  ),
);

/** Ads switched on (remote flag), or previewed by a developer. */
export const adsLive = (s: Pick<AppState, 'settings'>) => config.adsEnabled || (config.devTools && s.settings.previewAds);

export { dailySlot, displayStatus };

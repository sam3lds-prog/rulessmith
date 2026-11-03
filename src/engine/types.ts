import type { ExamId } from '../content/curriculum';
import type { Response } from '../content/types';

export type AgeBand = 'under13' | '13to17' | '18plus';

export type Role = 'high-school' | 'college' | 'grad-applicant' | 'working-adult' | 'parent' | 'tutor';

/** Only Quant exists. Other subjects are added here when they ship, not before. */
export type Subject = 'quant';

export interface Profile {
  ageBand: AgeBand;
  role: Role;
  /** Empty means general skills, no exam. */
  exams: ExamId[];
  /** ISO date (YYYY-MM-DD), or undefined if not booked. */
  testDate?: string;
  /** A note for the learner. The planner does not read it, and the app never promises a score. */
  goal: { kind: 'score'; target: string } | { kind: 'skill'; text: string };
  currentLevel: { kind: 'score'; value: string } | { kind: 'self'; rating: 1 | 2 | 3 | 4 | 5 };
  minutesPerDay: number;
  daysPerWeek: number;
  subjects: Subject[];
  /** `reminders` came from v1 onboarding and is ignored: reminders are not built yet. */
  style: { timed: boolean; reminders?: boolean };
  createdAt: number;
  /** Last edit. Two devices keep the newer profile. */
  updatedAt?: number;
}

export type MasteryStatus = 'new' | 'learning' | 'practicing' | 'secure';
/** What the learner sees: a secure skill whose review date has passed shows as "review". */
export type DisplayStatus = MasteryStatus | 'review';

export type Band = 'learn' | 'practice' | 'challenge';

export type SessionMode =
  | 'journey'
  | 'skill'
  | 'review'
  | 'ladder'
  | 'challenge'
  | 'checkpoint'
  | 'daily'
  | 'try'
  /** A mission of a chapter (a game round, transfer or recall set). */
  | 'quest'
  /** A concept check: fresh items, rule hidden, explanations after the set. */
  | 'check'
  /** A mixed exam drill across mapped skills. */
  | 'drill'
  /** A short guided repair after a missed check. */
  | 'repair'
  /** A game chosen on a topic page: that skill's puzzles in one board style. */
  | 'game'
  /** Guided practice on one topic: the rule stays on screen, feedback after each answer. */
  | 'practice';

/**
 * How an item is shown.
 * - guided: the rule is on screen. A correct answer moves the learner toward Practicing, never to Secure.
 * - independent: the rule is hidden. Opening it counts as a hint. Only these answers can prove Secure.
 */
export type Support = 'guided' | 'independent';

/**
 * One answered puzzle. This is the permanent learning record: it syncs by `id`,
 * and skill states can be rebuilt from it (sync/merge.ts `rebuildSkills`).
 */
export interface Attempt {
  /** Stable id made on the device when the answer is graded. Sync merges by it. */
  id: string;
  /** `${templateId}@${level}#${seed}`. Replay needs `templateVersion` too. */
  itemId: string;
  templateId: string;
  /** The template version that produced the puzzle. 0 = unknown (answered before versions were recorded). */
  templateVersion: number;
  contentVersion: string;
  skillId: string;
  family: string;
  level: number;
  transfer: boolean;
  support: Support;
  correct: boolean;
  /** A hint, or opening a hidden rule, before the first answer. Makes the attempt practice, not evidence. */
  hintBeforeAnswer: boolean;
  hintsUsed: number;
  /** The rule was on screen when the learner answered (guided, or revealed). */
  ruleShown: boolean;
  /** What the learner answered. Missing only on attempts recorded before responses were stored. */
  response?: Response;
  /** Named misconception behind a wrong choice, from the checker. */
  misconception?: string;
  /** Active time on the puzzle (app in the foreground), in milliseconds. */
  ms: number;
  /** When the puzzle first appeared. */
  firstSeenAt?: number;
  at: number;
  mode: SessionMode;
  sessionId?: string;
}

export interface EvidenceEntry {
  correct: boolean;
  /** Guided answers count toward Practicing only. */
  support: Support;
  family: string;
  transfer: boolean;
  day: string;
  level: number;
  /** Timestamp of the attempt (used to ignore evidence from before a demotion). */
  at?: number;
}

export interface SkillState {
  skillId: string;
  /** Elo-style learner rating for this skill. */
  rating: number;
  attempts: number;
  /** Most recent unaided first attempts, newest last (capped). */
  evidence: EvidenceEntry[];
  status: MasteryStatus;
  secureAt?: number;
  reviewStage: number;
  nextReviewAt?: number;
  /** When a Secure skill was demoted; only evidence after this counts toward re-securing it. */
  demotedAt?: number;
  /** Rolling average time for unaided correct answers. Fluency, tracked separately from understanding. */
  fluencyMs?: number;
  lastSeenAt?: number;
}

export interface Slot {
  skillId: string;
  templateId: string;
  /** Template version when the slot was made. A newer app version regenerates the slot rather than serving a different puzzle under the same id. */
  version: number;
  level: number;
  seed: number;
  band: Band;
  support: Support;
  reason:
    | 'target'
    | 'review'
    | 'stretch'
    | 'checkpoint'
    | 'challenge'
    | 'ladder'
    | 'daily'
    | 'placement'
    | 'try'
    | 'quest'
    | 'check'
    | 'drill'
    | 'recall'
    | 'repair'
    | 'game'
    | 'practice'
    /** A fresh guided puzzle added after a wrong answer, from the same family. */
    | 'related';
}

export interface PlanWeek {
  index: number;
  /** ISO date of the week's first day. */
  startsOn: string;
  skills: string[];
  newMinutes: number;
  checkpoint: boolean;
  /** Skills expected to reach Secure by the end of the week. */
  secureTargets: string[];
}

export interface JourneyPlan {
  version: 1;
  createdAt: number;
  /** ISO date the journey began. Weekly re-plans keep it, so week numbers keep advancing. */
  startedOn: string;
  exams: ExamId[];
  testDate?: string;
  rolling: boolean;
  weeks: PlanWeek[];
  /** Full prerequisite-respecting order of unsecured skills. */
  order: string[];
  /** Skills left out to fit the calendar (narrower-scope default). */
  dropped: string[];
  sessionsPerWeek: number;
  minutesPerSession: number;
  fits: boolean;
  alternatives: PlanAlternative[];
  summary: string;
}

export type PlanAlternative =
  | { kind: 'more-time'; minutesPerDay: number }
  | { kind: 'narrower'; keep: number }
  | { kind: 'later-date'; date: string };

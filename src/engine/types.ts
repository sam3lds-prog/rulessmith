import type { ExamId } from '../content/curriculum';

export type AgeBand = 'under13' | '13to17' | '18plus';

export type Role = 'high-school' | 'college' | 'grad-applicant' | 'working-adult' | 'parent' | 'tutor';

export type Subject = 'quant' | 'data' | 'verbal' | 'grammar' | 'logic';

export const SUBJECTS: { id: Subject; name: string; available: boolean }[] = [
  { id: 'quant', name: 'Quant', available: true },
  { id: 'data', name: 'Data', available: false },
  { id: 'verbal', name: 'Verbal', available: false },
  { id: 'grammar', name: 'Grammar', available: false },
  { id: 'logic', name: 'Logic', available: false },
];

export interface Profile {
  ageBand: AgeBand;
  role: Role;
  /** Empty means general skills, no exam. */
  exams: ExamId[];
  /** ISO date (YYYY-MM-DD), or undefined if not booked. */
  testDate?: string;
  goal: { kind: 'score'; target: string } | { kind: 'skill'; text: string };
  currentLevel: { kind: 'score'; value: string } | { kind: 'self'; rating: 1 | 2 | 3 | 4 | 5 };
  minutesPerDay: number;
  daysPerWeek: number;
  subjects: Subject[];
  style: { timed: boolean; reminders: boolean };
  createdAt: number;
}

export type MasteryStatus = 'new' | 'learning' | 'practicing' | 'secure';
/** What the learner sees: a secure skill whose review date has passed shows as "review". */
export type DisplayStatus = MasteryStatus | 'review';

export type Band = 'learn' | 'practice' | 'challenge';

export type SessionMode = 'journey' | 'skill' | 'review' | 'ladder' | 'challenge' | 'checkpoint' | 'daily' | 'try';

export interface Attempt {
  itemId: string;
  skillId: string;
  family: string;
  level: number;
  transfer: boolean;
  correct: boolean;
  /** A hint (or opening the rule lens) before the first answer makes this practice, not evidence. */
  hintBeforeAnswer: boolean;
  ms: number;
  at: number;
  mode: SessionMode;
}

export interface EvidenceEntry {
  correct: boolean;
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
  level: number;
  seed: number;
  band: Band;
  reason: 'target' | 'review' | 'stretch' | 'checkpoint' | 'challenge' | 'ladder' | 'daily' | 'placement' | 'try';
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

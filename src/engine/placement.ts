/**
 * Placement check: 8 to 15 adaptive items for Quant. Items are aimed near 60%
 * expected success, where a single answer tells us the most. The result is a
 * starting rating per skill. It is shown as a starting point, never as a
 * predicted exam score.
 */
import type { ExamId } from '../content/curriculum';
import { depthOf, SKILLS } from '../content/curriculum';
import type { Profile } from './types';
import { BASE_RATING, levelForSuccess, ratingFromSelf, updateRating } from './rating';

export const PLACEMENT_MIN = 8;
export const PLACEMENT_MAX = 15;

export interface PlacementAnswer {
  skillId: string;
  level: number;
  correct: boolean;
}

export interface PlacementState {
  theta: number;
  queue: string[];
  answers: PlacementAnswer[];
  recentDeltas: number[];
  done: boolean;
}

export function relevantSkills(exams: ExamId[]): string[] {
  return SKILLS.filter((s) => exams.length === 0 || exams.some((e) => s.weights[e] >= 0.2)).map((s) => s.id);
}

export function startPlacement(profile: Pick<Profile, 'exams' | 'currentLevel'>): PlacementState {
  const theta = profile.currentLevel.kind === 'self' ? ratingFromSelf(profile.currentLevel.rating) : BASE_RATING + 100;
  // Interleave tracks, shallow skills first, so early items calibrate and later ones probe depth.
  const skills = relevantSkills(profile.exams);
  const byTrack = new Map<string, string[]>();
  for (const id of skills.sort((a, b) => depthOf(a) - depthOf(b))) {
    const track = id.split('.')[0];
    byTrack.set(track, [...(byTrack.get(track) ?? []), id]);
  }
  const queue: string[] = [];
  const lists = [...byTrack.values()];
  while (lists.some((l) => l.length)) for (const l of lists) if (l.length) queue.push(l.shift()!);
  return { theta, queue: queue.slice(0, PLACEMENT_MAX), answers: [], recentDeltas: [], done: queue.length === 0 };
}

export function nextPlacementItem(s: PlacementState): { skillId: string; level: number } | null {
  if (s.done) return null;
  const skillId = s.queue[s.answers.length];
  if (!skillId) return null;
  // Deeper skills are a little harder for the same learner.
  const level = levelForSuccess(s.theta - 40 * depthOf(skillId), 0.6);
  return { skillId, level };
}

export function recordPlacement(s: PlacementState, answer: PlacementAnswer): PlacementState {
  const k = Math.max(40, 120 - 10 * s.answers.length);
  // The item was aimed at the learner's effective ability on this skill (theta − 40 × depth),
  // so update that, then convert back.
  const offset = 40 * depthOf(answer.skillId);
  const theta = updateRating(s.theta - offset, answer.level, answer.correct, k) + offset;
  const answers = [...s.answers, answer];
  const recentDeltas = [...s.recentDeltas, Math.abs(theta - s.theta)].slice(-4);
  const settled = answers.length >= PLACEMENT_MIN && recentDeltas.length === 4 && recentDeltas.every((d) => d < 35);
  const done = settled || answers.length >= Math.min(PLACEMENT_MAX, s.queue.length);
  return { theta, queue: s.queue, answers, recentDeltas, done };
}

/** Starting rating per relevant skill. */
export function placementRatings(s: PlacementState, exams: ExamId[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of relevantSkills(exams)) {
    const base = s.theta - 40 * depthOf(id);
    const own = s.answers.find((a) => a.skillId === id);
    const adjusted = own ? base + (own.correct ? 50 : -80) : base;
    out[id] = Math.round(Math.min(1700, Math.max(750, adjusted)));
  }
  return out;
}

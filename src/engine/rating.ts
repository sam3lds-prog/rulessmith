/**
 * Difficulty: an Elo-style learner rating per skill against editorial item
 * difficulty bands (level 1 → 850, level 10 → 1750). Once ~200 eligible attempts
 * from 30+ learners exist per template band, replace itemRating() with
 * calibrated per-template values (see docs/ARCHITECTURE.md).
 */
import type { Band } from './types';

export const BASE_RATING = 1000;

export const itemRating = (level: number) => 750 + 100 * level;

/** Probability the learner answers an item at this level correctly. */
export const expectedSuccess = (rating: number, level: number) => 1 / (1 + 10 ** ((itemRating(level) - rating) / 400));

/** Target success bands from the plan. These are hypotheses to test. */
export const BANDS: Record<Band, [number, number]> = {
  learn: [0.8, 0.9],
  practice: [0.7, 0.85],
  challenge: [0.55, 0.7],
};

export function levelForSuccess(rating: number, p: number): number {
  const d = rating - 400 * Math.log10(p / (1 - p));
  return Math.min(10, Math.max(1, Math.round((d - 750) / 100)));
}

export function levelForBand(rating: number, band: Band): number {
  const [lo, hi] = BANDS[band];
  return levelForSuccess(rating, (lo + hi) / 2);
}

export function updateRating(rating: number, level: number, correct: boolean, k: number): number {
  const e = expectedSuccess(rating, level);
  return rating + k * ((correct ? 1 : 0) - e);
}

/** Estimated mastery in [0, 1]: chance of solving a mid-level (level 5) item. */
export const masteryEstimate = (rating: number) => expectedSuccess(rating, 5);

/** Starting rating from a 1–5 self-rating. */
export function ratingFromSelf(r: 1 | 2 | 3 | 4 | 5): number {
  return [850, 950, 1050, 1200, 1350][r - 1];
}

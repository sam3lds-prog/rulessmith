/**
 * Ad placement rules. One main format: a native ad card on the session recap
 * screen, under the learning recap, never covering the screen, with the
 * learner's own Continue button outside it. Plus a small banner on browse
 * screens and an opt-in rewarded ad. No interstitials, no app-open ads.
 */
import type { AgeBand } from '../engine/types';
import { policyFor } from './age';

/** No session-break card in a learner's first three sessions. */
export const AD_FREE_SESSIONS = 3;

export interface SessionBreakContext {
  adsEnabled: boolean;
  ageBand: AgeBand | undefined;
  premium: boolean;
  /** Sessions completed including the one just finished. */
  completedSessions: number;
  /** The last answer in the session was wrong. */
  endedOnMiss: boolean;
  timedChallenge: boolean;
  /** Already showed a card for this session (at most one per session). */
  alreadyShown: boolean;
}

export function shouldShowSessionBreakAd(c: SessionBreakContext): boolean {
  if (!c.adsEnabled || c.premium || c.alreadyShown) return false;
  if (!policyFor(c.ageBand).canSeeAds) return false;
  if (c.completedSessions <= AD_FREE_SESSIONS) return false;
  if (c.endedOnMiss || c.timedChallenge) return false;
  return true;
}

export type BrowseScreen = 'plan' | 'practice';
/**
 * Banners only on the Plan and Practice browse screens: never on the puzzle
 * board, the explanation, the recap, Play or the Workshop.
 */
const BANNER_SCREENS: BrowseScreen[] = ['plan', 'practice'];

export function shouldShowBanner(screen: string, c: Pick<SessionBreakContext, 'adsEnabled' | 'ageBand' | 'premium'>): boolean {
  return c.adsEnabled && !c.premium && policyFor(c.ageBand).canSeeAds && (BANNER_SCREENS as string[]).includes(screen);
}

/** Rewarded ads are opt-in and only for adults; the reward is a bonus run or tokens, never a hint. */
export function canOfferRewarded(c: Pick<SessionBreakContext, 'adsEnabled' | 'ageBand' | 'premium'>): boolean {
  return c.adsEnabled && !c.premium && policyFor(c.ageBand).canSeeAds;
}

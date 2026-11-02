/**
 * What a learner can do, given what they own. Premium includes every pack.
 * Packs are the ownership path for non-subscribers. Hints and explanations are
 * never gated.
 */
import { FREE_MAX_LEVEL, FREE_RUNS_PER_DAY, PACK_MAX_LEVEL } from '../config';
import { SKILL_BY_ID, type TrackId } from '../content/curriculum';
import { PRODUCT_BY_ID } from './products';

export interface Entitlements {
  /** Auto-renewing subscription expiry, as reported by the store (via RevenueCat). */
  premiumUntil?: number;
  premiumProduct?: string;
  /** Exam Sprint is non-renewing, so we track its expiry ourselves (and sync it). */
  sprintUntil?: number;
  ownedPacks: string[];
}

export const EMPTY_ENTITLEMENTS: Entitlements = { ownedPacks: [] };

export function isPremium(e: Entitlements, now: number): boolean {
  return (e.premiumUntil ?? 0) > now || (e.sprintUntil ?? 0) > now;
}

export function packTracks(e: Entitlements): Set<TrackId> {
  const out = new Set<TrackId>();
  for (const id of e.ownedPacks) for (const t of PRODUCT_BY_ID[id]?.tracks ?? []) out.add(t);
  return out;
}

export function ownsChallenge(e: Entitlements, now: number): boolean {
  return isPremium(e, now) || e.ownedPacks.includes('pack_challenge_top');
}

/** Highest level served in normal sessions for a skill. */
export function maxLevelFor(skillId: string, e: Entitlements, now: number): number {
  if (isPremium(e, now)) return 10;
  const track = SKILL_BY_ID[skillId]?.track;
  if (track && packTracks(e).has(track)) return PACK_MAX_LEVEL;
  return FREE_MAX_LEVEL;
}

/** Whether a session in these tracks counts against the free daily run limit. */
export function runsAreUnlimited(trackIds: TrackId[], e: Entitlements, now: number): boolean {
  if (isPremium(e, now)) return true;
  const owned = packTracks(e);
  return trackIds.length > 0 && trackIds.every((t) => owned.has(t));
}

export function runsLeftToday(used: number, bonusRuns: number): number {
  return Math.max(0, FREE_RUNS_PER_DAY + bonusRuns - used);
}

/** Apply a completed purchase locally (the store remains the source of truth). */
export function grant(e: Entitlements, productId: string, now: number): Entitlements {
  const p = PRODUCT_BY_ID[productId];
  if (!p) return e;
  switch (p.type) {
    case 'auto_renewable': {
      const days = p.period === 'year' ? 365 : 31;
      return { ...e, premiumUntil: now + days * 86400000, premiumProduct: p.id };
    }
    case 'non_renewing': {
      // Buying again while active extends from the current expiry.
      const from = Math.max(now, e.sprintUntil ?? 0);
      return { ...e, sprintUntil: from + (p.durationDays ?? 90) * 86400000 };
    }
    case 'non_consumable':
      return e.ownedPacks.includes(p.id) ? e : { ...e, ownedPacks: [...e.ownedPacks, p.id] };
  }
}

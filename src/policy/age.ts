/**
 * Age band decides the legal route. The app launches for adults; minors get a
 * restricted experience until the parent/teen route ships (plan Phase 7).
 *
 * Not legal advice: have a lawyer review this against COPPA, the Utah App Store
 * Accountability Act (Utah Code 13-76-202, developer duties from May 6, 2027) and
 * Texas law before launch.
 */
import type { AgeBand } from '../engine/types';

export interface AgePolicy {
  /** Can practice in the app at all. */
  canPractice: boolean;
  /** Can create a synced account. Under-13s need verifiable parental consent first. */
  canCreateAccount: boolean;
  canSeeAds: boolean;
  canPurchase: boolean;
  /** Personalized ads need an adult who allowed tracking (iOS ATT). */
  personalizedAdsAllowed: boolean;
  /** Analytics may use a persistent identifier. */
  analyticsIdentifiers: boolean;
  note?: string;
}

export function policyFor(band: AgeBand | undefined): AgePolicy {
  switch (band) {
    case '18plus':
      return {
        canPractice: true,
        canCreateAccount: true,
        canSeeAds: true,
        canPurchase: true,
        personalizedAdsAllowed: false,
        analyticsIdentifiers: true,
      };
    case '13to17':
      return {
        canPractice: true,
        canCreateAccount: false,
        canSeeAds: false,
        canPurchase: false,
        personalizedAdsAllowed: false,
        analyticsIdentifiers: false,
        note: 'Progress stays on this device. Parent accounts, with purchases a parent approves, are coming.',
      };
    case 'under13':
      return {
        canPractice: false,
        canCreateAccount: false,
        canSeeAds: false,
        canPurchase: false,
        personalizedAdsAllowed: false,
        analyticsIdentifiers: false,
        note: 'This app is for learners 13 and older for now. A parent account for younger learners is on the way.',
      };
    default:
      // Before the learner has answered (the no-sign-up first puzzle): play only, nothing else.
      return {
        canPractice: true,
        canCreateAccount: false,
        canSeeAds: false,
        canPurchase: false,
        personalizedAdsAllowed: false,
        analyticsIdentifiers: false,
      };
  }
}

/**
 * Where the age band comes from. On iOS and Android this should prefer the
 * app store's age signal (Apple's Declared Age Range API, Google Play's Age
 * Signals API) and fall back to the learner's answer. Wired in Phase 4; until
 * then every platform uses the self-declared band.
 */
export interface AgeSignal {
  source: 'app_store' | 'self_declared';
  band?: AgeBand;
}

export async function readStoreAgeSignal(): Promise<AgeSignal> {
  return { source: 'self_declared' };
}

/** The store signal wins over a self-declared answer when they disagree. */
export function resolveAgeBand(store: AgeSignal, declared: AgeBand | undefined): AgeBand | undefined {
  if (store.source === 'app_store' && store.band) return store.band;
  return declared;
}

import { describe, expect, it } from 'vitest';
import { canOfferRewarded, shouldShowBanner, shouldShowSessionBreakAd } from '../policy/ads';
import { policyFor, resolveAgeBand } from '../policy/age';
import { EMPTY_ENTITLEMENTS, grant, isPremium, maxLevelFor, ownsChallenge, runsAreUnlimited, runsLeftToday } from './entitlements';
import { PRODUCTS } from './products';

const NOW = Date.UTC(2026, 10, 2);
const DAY = 86400000;

describe('entitlements', () => {
  it('free learners get levels 1 to 3 and three runs a day', () => {
    expect(maxLevelFor('div.digit-sum', EMPTY_ENTITLEMENTS, NOW)).toBe(3);
    expect(runsLeftToday(0, 0)).toBe(3);
    expect(runsLeftToday(3, 1)).toBe(1);
    expect(runsAreUnlimited(['div'], EMPTY_ENTITLEMENTS, NOW)).toBe(false);
  });

  it('a topic pack unlocks its tracks to level 7 with unlimited runs, forever', () => {
    const e = grant(EMPTY_ENTITLEMENTS, 'pack_number_properties', NOW);
    expect(maxLevelFor('div.digit-sum', e, NOW)).toBe(7);
    expect(maxLevelFor('pf.primes', e, NOW)).toBe(7);
    expect(maxLevelFor('rem.basics', e, NOW)).toBe(3);
    expect(runsAreUnlimited(['div', 'pf'], e, NOW)).toBe(true);
    expect(runsAreUnlimited(['div', 'rem'], e, NOW)).toBe(false);
    expect(maxLevelFor('div.digit-sum', e, NOW + 1000 * DAY)).toBe(7);
  });

  it('Premium includes everything; Exam Sprint lasts 90 days and extends if bought again', () => {
    const p = grant(EMPTY_ENTITLEMENTS, 'premium_annual', NOW);
    expect(isPremium(p, NOW)).toBe(true);
    expect(maxLevelFor('rem.cycles', p, NOW)).toBe(10);
    expect(ownsChallenge(p, NOW)).toBe(true);

    const s1 = grant(EMPTY_ENTITLEMENTS, 'exam_sprint_90d', NOW);
    expect(isPremium(s1, NOW + 89 * DAY)).toBe(true);
    expect(isPremium(s1, NOW + 91 * DAY)).toBe(false);
    const s2 = grant(s1, 'exam_sprint_90d', NOW + 10 * DAY);
    expect(isPremium(s2, NOW + 179 * DAY)).toBe(true);
  });

  it('catalog matches the plan price ladder', () => {
    const price = Object.fromEntries(PRODUCTS.map((p) => [p.id, p.price]));
    expect(price.premium_monthly).toBe('$9.99');
    expect(price.premium_annual).toBe('$59.99');
    expect(price.exam_sprint_90d).toBe('$29.99');
    expect(PRODUCTS.find((p) => p.id === 'premium_annual')?.trialDays).toBe(14);
  });
});

describe('age policy', () => {
  it('adults get everything; teens practise without ads or purchases; under-13s wait for parent accounts', () => {
    expect(policyFor('18plus')).toMatchObject({ canPractice: true, canSeeAds: true, canPurchase: true });
    expect(policyFor('13to17')).toMatchObject({ canPractice: true, canSeeAds: false, canPurchase: false, canCreateAccount: false });
    expect(policyFor('under13')).toMatchObject({ canPractice: false, canSeeAds: false });
    expect(policyFor('18plus').personalizedAdsAllowed).toBe(false);
  });

  it('an app-store age signal overrides the self-declared band', () => {
    expect(resolveAgeBand({ source: 'app_store', band: '13to17' }, '18plus')).toBe('13to17');
    expect(resolveAgeBand({ source: 'self_declared' }, '18plus')).toBe('18plus');
  });
});

describe('ad rules', () => {
  const base = {
    adsEnabled: true,
    ageBand: '18plus' as const,
    premium: false,
    completedSessions: 5,
    endedOnMiss: false,
    timedChallenge: false,
    alreadyShown: false,
  };

  it('shows one session-break card to free adults after their first three sessions', () => {
    expect(shouldShowSessionBreakAd(base)).toBe(true);
    expect(shouldShowSessionBreakAd({ ...base, completedSessions: 3 })).toBe(false);
    expect(shouldShowSessionBreakAd({ ...base, alreadyShown: true })).toBe(false);
  });

  it('never after a miss, in a timed challenge, for Premium, for minors, or while switched off', () => {
    expect(shouldShowSessionBreakAd({ ...base, endedOnMiss: true })).toBe(false);
    expect(shouldShowSessionBreakAd({ ...base, timedChallenge: true })).toBe(false);
    expect(shouldShowSessionBreakAd({ ...base, premium: true })).toBe(false);
    expect(shouldShowSessionBreakAd({ ...base, ageBand: '13to17' })).toBe(false);
    expect(shouldShowSessionBreakAd({ ...base, ageBand: 'under13' })).toBe(false);
    expect(shouldShowSessionBreakAd({ ...base, adsEnabled: false })).toBe(false);
  });

  it('banners only on browse screens; rewarded only for free adults', () => {
    expect(shouldShowBanner('topics', base)).toBe(true);
    expect(shouldShowBanner('session', base)).toBe(false);
    expect(shouldShowBanner('recap', base)).toBe(false);
    expect(canOfferRewarded(base)).toBe(true);
    expect(canOfferRewarded({ ...base, ageBand: '13to17' })).toBe(false);
  });
});

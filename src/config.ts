/**
 * App-wide configuration. Anything that may change without an app release
 * (ads switch, kill switches, prices under test) should eventually come from
 * remote config; for now it reads EXPO_PUBLIC_* environment variables with
 * safe defaults.
 */

/** Working name. Math Whizz is someone else's registered trademark; see docs/ROADMAP.md. */
export const APP_NAME = 'Rulesmith';
export const APP_TAGLINE = 'Learn the rule. Make the move.';

// Expo inlines EXPO_PUBLIC_* variables at build time, but only when each one is
// written out as a literal `process.env.EXPO_PUBLIC_NAME`. Do not read them dynamically.
export const config = {
  /**
   * Ads ship built but switched off. The plan turns them on for adults 4 to 8
   * weeks after launch, once baseline retention has been measured.
   */
  adsEnabled: process.env.EXPO_PUBLIC_ADS_ENABLED === 'true',
  /** Supabase sync is optional; without it, progress stays on the device. */
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  /** RevenueCat public SDK keys, wired in Phase 4. */
  revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  /** Show developer tools (ad placement preview, reset). */
  devTools: process.env.EXPO_PUBLIC_DEV_TOOLS === 'true' || (typeof __DEV__ !== 'undefined' && __DEV__),
};

export const FREE_RUNS_PER_DAY = 3;
export const FREE_MAX_LEVEL = 3;
export const PACK_MAX_LEVEL = 7;

declare const __DEV__: boolean;

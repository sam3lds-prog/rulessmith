# Monetization

## The price ladder (in `src/monetization/products.ts`)

| Product id | Store type | Price | What it does |
| --- | --- | --- | --- |
| `premium_annual` | auto-renewable subscription, 14-day trial | $59.99/yr | Everything |
| `premium_monthly` | auto-renewable subscription | $9.99/mo | Everything |
| `exam_sprint_90d` | non-renewing subscription | $29.99 | Premium for 90 days; extends if bought again |
| `pack_number_properties` | non-consumable | $4.99 | Divisibility + primes and factors: levels 1 to 7, unlimited runs |
| `pack_remainders` | non-consumable | $4.99 | Remainders: levels 1 to 7, unlimited runs |
| `pack_challenge_top` | non-consumable | $6.99 | "Hardest Levels Challenge": Challenge mode at levels 8 to 10 |

Free: the daily puzzle, 3 runs a day, levels 1 to 3 of every track, every hint and explanation. Paths, concept checks, repairs, reviews and practising one mistake never use a run; today's session, games, guided practice on a topic, ladders, challenges and the mixed drill do. Premium includes every pack.

**Tokens** are earned: 5 per finished session, 3 per daily puzzle, 10 for a weekly goal. They buy one more session (10) on a day the free ones are used. They are never sold and never touch mastery. (The workshop shop that briefly spent them on objects was removed; those spends were refunded in the v4 migration.)

Keep $7.99 / $49.99 as the comparison arm once traffic allows a price test.

The hardest-levels pack was called "700+ Challenge" (`pack_challenge_700`). That read like a score guarantee, and 700 is on the old GMAT scale, so it was renamed before any store product existed. Saved purchases are mapped to the new id (`RENAMED_PRODUCTS`). Product names describe difficulty, never a score.

**First paid test (per the Nov 2026 review):** sell monthly and yearly Premium only. Packs and Exam Sprint wait until interviews ask for them; ads stay off until their effect on return has been measured. Earned tokens for an extra run are fine; nothing bought may change mastery.

## Connecting real purchases (Phase 4)

The app only talks to `PurchaseProvider` (`src/monetization/purchases.ts`). Today that is the test provider.

1. Create the products above, with these exact ids, in App Store Connect and Google Play Console. Join Apple's Small Business Program (15% commission).
2. In RevenueCat: one entitlement `premium` attached to the two subscriptions and Exam Sprint; one entitlement per pack. Add the public SDK keys to `.env`.
3. `npx expo install react-native-purchases` and add a `revenueCatProvider` implementing `PurchaseProvider`: `Purchases.configure()` with the platform key and the Supabase user id as `appUserID`; `purchase()` → `Purchases.purchaseStoreProduct()`; `restore()` → `Purchases.restorePurchases()` mapped to product ids. Map active entitlements to the store's `Entitlements` shape. Swap it in where `createTestProvider` is used in `state/store.ts`.
4. Add a RevenueCat webhook (a Supabase Edge Function using the service role) that writes the `entitlements` table, including `sprint_until` for the non-renewing Exam Sprint, so every device agrees.
5. This requires a development build; it does not run in a browser. Keep the test provider on web.

**Web checkout.** In the US, apps may currently link out to web checkout; Apple has asked to charge a fee on those purchases and the rules may change. Launch with in-app purchase only; add an adults-only web checkout for the annual plan once there are paying users.

## Ads (Phase 4, switched on 4 to 8 weeks after launch)

Rules live in `src/policy/ads.ts` and are tested. The placements are already in the app as placeholders (`src/ads/AdSlots.tsx`), shown only when `EXPO_PUBLIC_ADS_ENABLED=true` or a developer turns on the preview.

| Placement | Where | Format |
| --- | --- | --- |
| Session-break card | recap screen, under the learning recap, at most ~40% of the screen; the learner's own Continue button sits outside it | AdMob native (`NativeAdView`), with the "Ad" badge and AdChoices icon; nothing overlaps it |
| Banner | bottom of the My plan and Practice tabs only (never Today, Progress, a puzzle or a recap) | AdMob adaptive banner |
| Rewarded | "Watch a short ad for a bonus run", only when the learner taps | AdMob rewarded; grant only on the earned-reward callback |

Never: interstitials, app-open ads, ads on the puzzle board, mid-session, after a miss, during a timed challenge, in the first three sessions, for anyone under 18, or for Premium. Non-personalized by default; personalized only if the learner allows tracking on iOS.

To wire: `npx expo install react-native-google-mobile-ads`, add the config plugin with app ids to `app.json`, replace the placeholder components with platform-specific `.native.tsx` files (keep the placeholders for web).

## Unit economics (from the plan)

At $9.99 / $59.99 with 75% choosing annual: about $6.25 gross per payer per month, $5.31 after a 15% store fee. Ads: roughly $0.045 per free user per month; a top-up, not the business.

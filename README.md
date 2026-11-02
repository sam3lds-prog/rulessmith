# Rulesmith

*Learn the rule. Make the move.*

A puzzle app where each math rule becomes a move you make. It starts with number properties for adult GMAT and GRE learners: divisibility, primes and factors, and remainders. One codebase runs on iOS, Android and the web.

**Name.** Rulesmith is the working name from the build plan. *Math Whizz* is a registered US trademark of Whizz Education, so the app does not launch under it. The name lives in one constant (`APP_NAME` in `src/config.ts`) plus `app.json`, so it is a two-line change once the trademark search is done.

## What is built

This is the foundation from Phases 1 to 3 of the plan, with the Phase 4 money and compliance logic built and tested but not yet connected to real stores.

| Plan area | Status |
| --- | --- |
| Puzzle boards: Sort, Construct, Refute, plus choice and numeric | Built, tap-only (no dragging) |
| Content engine: 18 micro-skills, 54 template families, levels 1 to 10 | Built. Every answer is graded by an independent brute-force checker |
| Content audit: checker agrees with every generator across levels and seeds | Built (`npm run content:audit`) |
| Learning engine: skill graph, Elo difficulty, mastery evidence, spaced review | Built and unit tested |
| Session mixer (60% target, 30% review, 10% stretch) | Built |
| Try-a-puzzle, profile questions, placement check (8 to 15 items) | Built |
| Journey planner: weekly plan, milestones, checkpoints, weekly re-plan, "doesn't fit" alternatives | Built |
| Today, Topics, Progress, You; skill detail; endless ladder; challenge builder; daily puzzle with spoiler-free share | Built |
| Session recap with the session-break ad slot | Built (placeholder ad, switched off by default) |
| Premium, Exam Sprint, packs, free limits, earned tokens | Rules built and tested; purchases use a **test provider** (no money moves) |
| Ad rules (adults only, never mid-puzzle, after a miss, or in the first 3 sessions) | Built and tested; AdMob not yet wired |
| Age bands: adults full, teens no ads or purchases, under-13s wait for parent accounts | Built and tested; store age signals not yet wired |
| Supabase schema with row-level security, email-code sign-in, sync, account deletion | Built; needs a Supabase project to run |
| Content reports with item, version and seed; same-day template kill switch | Built (reports sync when signed in) |

Not built yet (by design, per the plan's gates): Android and iOS store billing (RevenueCat), AdMob, native age-signal APIs, the parent/teen route, verbal and grammar tracks, GMAT Data Insights, and tutor dashboards. See `docs/ROADMAP.md`.

## Run it

Requires Node 22.13+ (or 24.3+).

```bash
npm install
npm run web          # opens in the browser; the fastest way to try it
npm test             # engine, content audit, monetization and policy tests
npm run typecheck
```

On a phone: Expo SDK 58 is not in Expo Go yet, so use a development build.

```bash
npx eas-cli@latest build --profile development --platform ios     # or android
npx expo start --dev-client
```

On a Mac with Xcode you can instead run `npx expo run:ios`.

### Content tools

```bash
npm run content:audit              # every template, every level, 25 seeds each
SEEDS=200 npm run content:audit    # a deeper pass before a content release
npm run content:sample             # prints one item per template for a human reviewer
```

### Web build (the free daily puzzle)

```bash
npm run build:web    # static site in dist/; deploy to any static host
```

`/daily` works without an account, which is the shareable growth loop from the launch plan.

## Configuration

Copy `.env.example` to `.env`. Everything is optional: with no values the app runs fully on the device, ads stay off, and purchases use the test provider.

- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`: cloud sync. Apply `supabase/migrations/` to your project (`supabase db push`), deploy the account-deletion function (`supabase functions deploy delete-account`), and add `{{ .Token }}` to the Magic Link email template so sign-in emails carry a 6-digit code.
- `EXPO_PUBLIC_ADS_ENABLED`: leave `false` until 4 to 8 weeks after launch.
- `EXPO_PUBLIC_REVENUECAT_*`: wired in Phase 4 (`docs/MONETIZATION.md`).

## Where things live

```
src/
  app/            screens (Expo Router): welcome, onboarding/*, (tabs)/*, session, recap, daily, premium, ...
  content/        the content engine: templates, generators, the independent checker, the audit
  engine/         the learning engine: rating, mastery, review, mixer, placement, planner, daily
  monetization/   products, entitlements, tokens, purchase provider
  policy/         age bands and ad placement rules
  state/          the app store (local-first, persisted)
  data/           optional Supabase sync
  boards/         the puzzle boards and the item screen
  ads/            ad slots (placeholders until AdMob)
  ui/             design tokens and components
supabase/migrations/   database schema with row-level security
docs/                  architecture, content factory, monetization, roadmap
```

Start with `docs/ARCHITECTURE.md`.

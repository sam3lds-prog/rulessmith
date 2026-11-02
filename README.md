# Rulesmith

*Learn the rule. Make the move.*

A puzzle app where each math rule becomes a move you make. It starts with number properties for adult GMAT and GRE learners: divisibility, primes and factors, and remainders. Every rule you figure out adds something to your *workshop of ideas*. One codebase runs on iOS, Android and the web.

**Name.** Rulesmith is the working name from the build plan. *Math Whizz* is a registered US trademark of Whizz Education, so the app does not launch under it. The name lives in one constant (`APP_NAME` in `src/config.ts`) plus `app.json`, so it is a two-line change once the trademark search is done.

## What is built

This is the foundation from Phases 1 to 3 of the plan, with the Phase 4 money and compliance logic built and tested but not yet connected to real stores.

| Plan area | Status |
| --- | --- |
| Puzzle boards: Sort, Construct, Refute, Factor and Rail, plus choice and numeric | Built, tap-only (no dragging) |
| Five games over those boards: Number Gates, Number Forge, Rule Breaker, Factor Factory, Remainder Rails | Built (`src/games`) |
| Chapters and missions: "Light the Gatehouse" (6 missions), Factor Foundry and Clockwork Harbor (2 each) | Built and tested (`src/quests`) |
| Workshop of ideas: scene, companion, 18 objects earned by missions, milestones or Workshop Coins; current project; weekly goal | Built and tested (`src/world`, `src/rewards`) |
| Concept checks with results at the end, repair missions, mixed exam drill, recall | Built and tested (`src/quizzes`) |
| Exam map with honest coverage and the official outline for GMAT, GRE, SAT and ACT | Built (`src/exams`); domain mapping needs review |
| Sound, vibration, reduce motion and Focus settings | Built (`src/feel`) |
| Content engine: 18 micro-skills, 58 template families, levels 1 to 10 | Built. Every answer is graded by an independent brute-force checker |
| Content audit: checker agrees with every generator across levels and seeds | Built (`npm run content:audit`) |
| Learning engine: skill graph, Elo difficulty, mastery evidence, spaced review | Built and unit tested |
| Guided practice vs independent checks: Secure counts only answers given with the rule hidden and no hints, at every level including the free ones | Built and tested |
| Learning record: every answer stored with its response, misconception, template and content version, support mode, hints and active time; puzzles in progress survive refresh and force-close | Built and tested |
| Session mixer (60% target, 30% review, 10% stretch) | Built |
| Try-a-puzzle, profile questions, placement check (8 to 15 items) | Built |
| Journey planner: weekly plan, milestones, checkpoints, weekly re-plan, "doesn't fit" alternatives | Built |
| Play, Plan, Practice and Workshop tabs; settings from the header; topic cards; endless ladder; challenge builder; daily puzzle with spoiler-free share | Built |
| Session recap with the session-break ad slot | Built (placeholder ad, switched off by default) |
| Premium, Exam Sprint, packs, free limits, earned Workshop Coins | Rules built and tested; purchases use a **test provider** (no money moves) |
| Ad rules (adults only, never mid-puzzle, after a miss, or in the first 3 sessions) | Built and tested; AdMob not yet wired |
| Age bands: adults full, teens no ads or purchases, under-13s wait for parent accounts | Built and tested; store age signals not yet wired |
| Accounts: one storage bucket per learner (sign-out never leaves the last learner on screen), guest import only by choice, attempt outbox, merge by id across devices | Built and tested; needs a Supabase project to run |
| Supabase schema with row-level security, email-code sign-in, account deletion | Built; access rules checked on Postgres (`supabase/checks`) |
| Remote kill switch (`disabled_templates`), cached offline, enforced on every path that serves a puzzle | Built and tested; needs a Supabase project to run |
| Analytics: persistent event queue uploaded to Supabase (`events`), no identifiers for minors | Built and tested |
| Content reports with item, version and seed | Built (reports sync when signed in) |
| Human review worksheets for all 58 families at low, middle and high levels, and a version-pinned sign-off ledger | Built; the review itself is a person's job (`docs/review/README.md`) |

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
npm run content:worksheet          # writes docs/review/*.md: every family at low, middle and high level
npm run content:signoff            # which families are signed off, stale or missing
REQUIRE_SIGNOFF=1 npm test         # fails until every family is signed off (use before the beta)
```

### Web build (the free daily puzzle)

```bash
npm run build:web    # static site in dist/; deploy to any static host
```

`/daily` works without an account, which is the shareable growth loop from the launch plan.

## Configuration

Copy `.env.example` to `.env`. Everything is optional: with no values the app runs fully on the device, ads stay off, and purchases use the test provider.

- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`: accounts, sync, the remote kill switch and analytics. Apply `supabase/migrations/` to your project (`supabase db push`; both files, in order), deploy the account-deletion function (`supabase functions deploy delete-account`), and add `{{ .Token }}` to the Magic Link email template so sign-in emails carry a 6-digit code. To switch a puzzle family off for everyone: `insert into public.disabled_templates (template_id, reason) values ('<template id>', '<why>');`. Read analytics with the service role (the app can only write them).
- `EXPO_PUBLIC_ADS_ENABLED`: leave `false` until 4 to 8 weeks after launch.
- `EXPO_PUBLIC_REVENUECAT_*`: wired in Phase 4 (`docs/MONETIZATION.md`).

## Where things live

```
src/
  app/            screens (Expo Router): welcome, onboarding/*, (tabs)/play|plan|practice|workshop, mission/[id], session, recap, ...
  content/        the content engine: templates, generators, the independent checker, the audit
  engine/         the learning engine: rating, mastery, review, mixer, placement, planner, daily
  monetization/   products, entitlements, Workshop Coins (tokens.ts), purchase provider
  games/          the five game skins and which board each wraps
  quests/         chapters and missions
  quizzes/        concept checks, drills, recall and repair
  rewards/        workshop grants, coin purchases, the weekly goal
  world/          workshop districts and objects
  exams/          exam blueprints and honest coverage
  feel/           feedback events (pure) and the sound and haptics director
  policy/         age bands and ad placement rules
  state/          the app store, saved data types, migrations, per-learner storage buckets
  sync/           merging two copies of a learner's data; Supabase row mapping
  data/           Supabase client, remote kill switch
  boards/         the puzzle boards and the item screen
  ads/            ad slots (placeholders until AdMob)
  ui/             design tokens, components, the workshop scene and companion
supabase/migrations/   database schema with row-level security
supabase/checks/       access-rule checks for the schema, runnable on plain Postgres
docs/                  architecture, content factory, monetization, roadmap
docs/review/           content review worksheets and how to use them
```

Start with `docs/ARCHITECTURE.md`.

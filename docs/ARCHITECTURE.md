# Architecture

## Shape of the system

```
 ┌────────────── app (Expo Router screens, src/app) ──────────────┐
 │ welcome → onboarding/about → onboarding/placement → onboarding/plan │
 │ (tabs): today · topics · progress · you                         │
 │ session → recap        daily        premium   skill/[id]  challenge │
 └──────────────┬──────────────────────────────────────────────────┘
                │ reads/writes
        ┌───────▼────────┐        optional        ┌──────────────┐
        │ state/store.ts │ ─────── sync ─────────▶ │  Supabase    │
        │ (zustand,      │                         │  (RLS, email │
        │  persisted)    │                         │   code auth) │
        └──┬─────┬────┬──┘                         └──────────────┘
           │     │    │
   engine/ │     │ content/            monetization/ + policy/
   rating  │     │ templates           products, entitlements, tokens,
   mastery │     │ generators          age bands, ad rules
   mixer   │     │ checker (brute force)
   planner │     │ audit
   placement     │
```

Everything below the store is pure TypeScript and unit-tested in Node.

## The learning engine (`src/engine`)

One shared skill graph (`content/curriculum.ts`) feeds three separate systems, kept apart so a learner who is slow, used a hint, or keeps seeing one format is never labelled as having mastered a skill.

| System | File | What it does |
| --- | --- | --- |
| Difficulty | `rating.ts` | Elo-style learner rating per skill. Item difficulty is editorial for now: level L has rating 750 + 100L. `levelForBand()` picks the level whose expected success lands in the target band: Learn 80 to 90%, Practice 70 to 85%, Challenge 55 to 70%. |
| Evidence and mastery | `mastery.ts` | New → Learning → Practicing → Secure. Secure = 8 of the last 10 unaided first attempts, across 3+ item families and 2+ days, including a transfer item. A hint (or opening the rule lens above level 4) before answering makes the attempt practice, not evidence. Speed is tracked separately as fluency. |
| Review | `mastery.ts`, `mixer.ts` | Secure skills come back at 1, 3, 7 and 21 days. A correct review extends the interval; a miss drops the skill to Practicing. |
| Session mixer | `mixer.ts` | 60% target topic, 30% due review, 10% stretch. Picks unproven families first and brings in a transfer item once a skill is Practicing. |
| Placement | `placement.ts` | 8 to 15 adaptive items aimed at ~60% expected success. Produces a starting rating per skill. Shown as a starting point, never as an exam score. |
| Journey planner | `planner.ts` | Deterministic. Priority = exam weight × gap × unlock bonus; prerequisite order; poured into weeks with 25% kept for review and 10% for checkpoints; milestones; checkpoints every 3 weeks; re-plans when a week has passed. If it doesn't fit, it says so and offers more time, narrower scope or a later date. |
| Daily puzzle | `daily.ts` | Same puzzle for everyone on a date; spoiler-free share text. |

**Tuning points** (all marked in code): the Practicing threshold, `minutesForGap()` in the planner, review intervals, band targets, the 60/30/10 mix. Replace the editorial `itemRating()` with calibrated per-template difficulty once a template band has ~200 eligible attempts from 30+ learners (the `family_quality` view in the schema is the starting point).

## The content engine (`src/content`)

- `types.ts`: an item's payload is **structured**: a predicate (`NumPredicate`), a claim (`Claim`), or a value to compute (`ValueSpec`), plus the text.
- `skills/*.ts`: one template per item family. A template generates `(level, rng) → ItemDraft` using the shortcut rules it teaches (digit sums, exponent formulas, cycles), which is also how it writes explanations.
- `evaluate.ts` + `check.ts`: the **independent checker**. It evaluates the structure by brute force (trial division, stepping multiples, enumerating digit fills, BigInt powers). It is the only grading path.
- `content.test.ts`: the audit. For every template, level and seed: the generator's key must pass the checker, choice items must have exactly one correct option, sort boards need both yes and no numbers, refute candidates must be valid, and no text may contain `undefined` or `NaN`.
- `index.ts`: the registry, `CONTENT_VERSION`, and `DISABLED_TEMPLATES` (the same-day kill switch).

Details of the content workflow are in `CONTENT.md`.

## State and persistence (`src/state/store.ts`)

Local-first. One zustand store, persisted to AsyncStorage (localStorage on web). It holds the profile, plan, skill states, attempt log, active session, recap, runs, tokens, entitlements, daily results, streak, reports and account. Every session can be resumed after the app is killed because the active session is persisted too.

With Supabase configured and an adult account, the store pushes a snapshot plus new attempts after each session and daily puzzle (`data/cloud.ts`). On sign-in, whichever side has more answered puzzles wins.

## Backend (`supabase/migrations`)

| Table | Written by | Purpose |
| --- | --- | --- |
| `learner_state` | the app | Snapshot of profile, plan and progress, with `age_band` |
| `attempts` | the app | Every answer: the quality loop and difficulty calibration |
| `content_reports` | the app | "Report a problem", with item id and content version |
| `entitlements` | the server only (RevenueCat webhook) | Source of truth for what a learner owns |
| `delete_my_account()` | the app | In-app account deletion (App Store requirement) |
| `family_quality` view | analysts | Success rate, hint rate, median time and reports per family and level |

Row-level security on every table: learners reach only their own rows.

## Monetization and policy

`monetization/` holds the product catalog (matching the plan's price ladder), entitlement rules and tokens. `policy/` holds age-band rules and ad placement rules. Both are pure functions with tests in `monetization/monetization.test.ts`. The app talks to purchases only through `PurchaseProvider` (`monetization/purchases.ts`); the test provider is in use until RevenueCat is wired. See `MONETIZATION.md`.

## UI

Tokens in `ui/theme.ts`: cool grey-green paper, graphite ink, cobalt for actions, brass for proof of mastery, verdigris and brick for right and wrong. Archivo for headings, Atkinson Hyperlegible for body and numerals (chosen for unambiguous digits). The number tile (`boards/Tile.tsx`) is a keycap that sinks when pressed; it is the one bold element. Every board is tap-only.

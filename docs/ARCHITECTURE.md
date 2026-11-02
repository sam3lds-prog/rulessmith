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
        │ state/store.ts │ ── outbox + merge ────▶ │  Supabase    │
        │ (zustand, one  │ ◀── pull by receipt ─── │  (RLS, email │
        │ bucket/learner)│                         │   code auth) │
        └──┬─────┬────┬──┘                         └──────────────┘
           │     │    │
   engine/ │     │ content/            monetization/ + policy/
   rating  │     │ templates           products, entitlements, tokens,
   mastery │     │ generators          age bands, ad rules
   mixer   │     │ checker (brute force)
   planner │     │ audit
   placement     │
```

Everything below the store is pure TypeScript and unit-tested in Node. So are `state/types.ts`, `state/migrate.ts`, `state/buckets.ts` and `sync/*`; the store itself is tested end to end with React Native, storage and Supabase faked (`state/store.test.ts`).

## The learning engine (`src/engine`)

One shared skill graph (`content/curriculum.ts`) feeds three separate systems, kept apart so a learner who is slow, used a hint, saw the rule, or keeps seeing one format is never labelled as having mastered a skill.

| System | File | What it does |
| --- | --- | --- |
| Difficulty | `rating.ts` | Elo-style learner rating per skill. Item difficulty is editorial for now: level L has rating 750 + 100L. `levelForBand()` picks the level whose expected success lands in the target band: Learn 80 to 90%, Practice 70 to 85%, Challenge 55 to 70%. |
| Support | `mixer.ts` `supportFor` | Every slot is **guided** (rule on screen) or **independent** (rule hidden; opening it counts as a hint). Target and stretch items are guided while the skill is New or Learning and independent once it is Practicing; the switch happens mid-session too (`advance`). Reviews, checkpoints, ladders, challenges, the daily puzzle and placement are always independent. Support does not depend on level, so free learners (levels 1 to 3) get real independent checks. |
| Evidence and mastery | `mastery.ts` | New → Learning → Practicing → Secure. Practicing = 4 of the last 6 unhinted answers, guided or independent. Secure = 8 of the last 10 **independent** first attempts, across 3+ item families and 2+ days, including a transfer item. A guided answer can never create Secure. A hint, or revealing a hidden rule, before answering makes the attempt practice only. Speed (fluency) is measured on independent answers only. |
| Review | `mastery.ts`, `mixer.ts` | Secure skills come back at 1, 3, 7 and 21 days. A correct review extends the interval; a miss drops the skill to Practicing. |
| Session mixer | `mixer.ts` | 60% target topic, 30% due review, 10% stretch. Picks unproven families first and brings in a transfer item once a skill is Practicing. |
| Placement | `placement.ts` | 8 to 15 adaptive items aimed at ~60% expected success. Produces a starting rating per skill. Shown as a starting point, never as an exam score. The check in progress is saved, so it resumes after a restart. |
| Journey planner | `planner.ts` | Deterministic. Priority = exam weight × gap × unlock bonus; prerequisite order; poured into weeks with 25% kept for review and 10% for checkpoints; milestones; checkpoints every 3 weeks; re-plans when a week has passed. If it doesn't fit, it says so and offers more time, narrower scope or a later date. |
| Daily puzzle | `daily.ts` | Same puzzle for everyone on a date; spoiler-free share text. If the day's family is switched off, the next one in the rotation is used, so everyone still gets the same puzzle. |

**Tuning points** (all marked in code): the Practicing threshold, `minutesForGap()` in the planner, review intervals, band targets, the 60/30/10 mix. Replace the editorial `itemRating()` with calibrated per-template difficulty once a template band has ~200 eligible attempts from 30+ learners (the `family_quality` view in the schema is the starting point).

## The content engine (`src/content`)

- `types.ts`: an item's payload is **structured**: a predicate (`NumPredicate`), a claim (`Claim`), or a value to compute (`ValueSpec`), plus the text.
- `skills/*.ts`: one template per item family. A template generates `(level, rng) → ItemDraft` using the shortcut rules it teaches (digit sums, exponent formulas, cycles), which is also how it writes explanations.
- `evaluate.ts` + `check.ts`: the **independent checker**. It evaluates the structure by brute force (trial division, stepping multiples, enumerating digit fills, BigInt powers). It is the only grading path.
- `content.test.ts`: the audit. For every template, level and seed: the generator's key must pass the checker, choice items must have exactly one correct option, sort boards need both yes and no numbers, refute candidates must be valid, and no text may contain `undefined` or `NaN`.
- `index.ts`: the registry, `CONTENT_VERSION`, and the kill switch. `generateItem(template, level, seed, { version })` refuses a switched-off template and a version mismatch (`TemplateUnavailableError`), so a resumed or replayed slot can never silently become a different puzzle. `serveItem(slot)` returns null instead of throwing; the store then swaps in a like-for-like slot (`mixer.ts` `replacementSlot`). Tools that must rebuild a known puzzle pass `allowDisabled`.
- `signoff.ts`: the human sign-off ledger, pinned to template versions (docs/review/README.md).

Details of the content workflow are in `CONTENT.md`.

## State and persistence (`src/state`)

Local-first. One zustand store (`store.ts`) holds the open learner's data (`types.ts` `Data`): profile, plan, skill states, the attempt log, the outbox, ledgers, the active session and the puzzle in progress, placement in progress, daily results, reports and account.

**One bucket per learner** (`buckets.ts`). The guest on this device and each signed-in account are saved under separate keys; `rulesmith:owner` says which is open. Signing out closes the account's bucket and opens the guest's, so the previous learner never stays on screen; signing in does the reverse. Only device-level keys (`runs`, `entitlements`, `settings`) cross over. A guest's progress joins an account only when the learner chooses "Add it to my account" at sign-in (`sync/merge.ts` `importGuest`); the guest bucket is then emptied so it can't be imported twice. Saves are coalesced (300 ms) and flushed when the app goes to the background and before any switch; the attempt log is written to its own key only when it changes.

**The attempt log is the learning record.** Each graded answer is an `Attempt` with a stable id, the response, the misconception from the checker, the template and content versions, support mode, hints, whether the rule was shown, first-seen time and active (foreground) time. It is not capped. Skill states are updated live from each attempt and can be rebuilt by replaying the log (`rebuildSkills`), which gives exactly the live result.

**Nothing is lost on interruption.** The puzzle on screen saves its board draft, hints, a revealed rule, first-seen time and active time as the learner works (`ItemProgress`: in the active session, the placement check and the daily puzzle). After a refresh, background or force-close it comes back exactly as it was, so a hint opened before the crash is still a hint. A slot is graded once; a resumed, answered slot is skipped.

**Migrations** (`migrate.ts`). v1 saved everything under `rulesmith-v1`. At first launch it moves into the right bucket. Answers at levels 1 to 4, where v1 showed the rule openly, become guided; a Secure status that rested on them goes back to Practicing.

## Sync (`src/sync`, `src/data/cloud.ts`)

Only for signed-in adults with Supabase configured. Each sync (after a session, a daily puzzle, at launch and on returning to the foreground):

1. Checks the saved Supabase session belongs to the open bucket's account; if not, it stops and asks the learner to sign in again.
2. Pulls the snapshot (`learner_state`) and attempts received since the last pull (`received_at`, stamped by the server, with a 10-minute overlap so a late commit is never skipped).
3. Merges by id (`mergeRemote`): attempts are a union; tokens and sessions are ledgers (balance, session count and streak are recomputed from them); daily results, checkpoints and placement runs merge by key; ladder bests keep the maximum; profile and plan keep the newer copy. If attempts arrived from elsewhere, skills are rebuilt from the whole log. No side "wins" by having more puzzles.
4. Uploads the outbox (attempts and reports not yet acknowledged). Ids leave the outbox only after the server has them; uploads are idempotent (`on conflict do nothing`).
5. Pushes the merged snapshot back.

Two devices on one account converge: each keeps its own entries until the server has them, and every merge is a union.

## Kill switch (`src/data/flags.ts`)

The `disabled_templates` table lists switched-off template ids. The app reads it at launch and on returning to the foreground (at most every 5 minutes), caches it for offline use, and applies it in `generateItem`, which every path goes through: new sessions, resumed sessions, the next ladder or challenge puzzle, the daily puzzle, placement and the first puzzle. A puzzle switched off while on screen is replaced at once.

## Analytics (`src/analytics`)

`track()` queues events; `pipeline.ts` saves the queue on the device and uploads it in batches through the `log_events()` database function (at launch, every minute, on background, after a session). Events leave the queue only when the server accepts them. The queue is capped at 2,000 and reports what it drops. Install and user ids are attached only for adults (`policyFor(...).analyticsIdentifiers`).

## Backend (`supabase/migrations`)

| Table | Written by | Purpose |
| --- | --- | --- |
| `learner_state` | the app | Snapshot of profile, plan and ledgers (`v: 2`), merged before every push |
| `attempts` | the app | The learning record: every answer with its response, versions and support, keyed by `(user_id, attempt_id)`; `received_at` is the pull cursor |
| `content_reports` | the app | "Report a problem", keyed by `(user_id, report_id)`, with item id and content version |
| `events` | the app, via `log_events()` only | Analytics. The app can't read it |
| `disabled_templates` | you (dashboard or SQL) | The kill switch. The app reads it, signed in or not |
| `entitlements` | the server only (RevenueCat webhook) | Source of truth for what a learner owns |
| `functions/delete-account` | the app (Edge Function, service role) | In-app account deletion (App Store requirement); rows cascade |
| `family_quality` view | analysts | Per family, level and template version: independent and guided success rates, hint rate, median time, reports |
| `misconception_counts` view | analysts | Which wrong answers learners choose, per family and level |

Row-level security on every table: learners reach only their own rows. `supabase/checks/access.sql` exercises these rules as the app's roles.

## Monetization and policy

`monetization/` holds the product catalog (matching the plan's price ladder), entitlement rules and tokens. `policy/` holds age-band rules and ad placement rules. Both are pure functions with tests in `monetization/monetization.test.ts`. The app talks to purchases only through `PurchaseProvider` (`monetization/purchases.ts`); the test provider is in use until RevenueCat is wired. See `MONETIZATION.md`.

## UI

The item screen shows which mode a puzzle is in ("Practice with the rule" or "On your own"); on independent puzzles the rule sits behind "Show the rule (counts as a hint)".

Tokens in `ui/theme.ts`: cool grey-green paper, graphite ink, cobalt for actions, brass for proof of mastery, verdigris and brick for right and wrong. Archivo for headings, Atkinson Hyperlegible for body and numerals (chosen for unambiguous digits). The number tile (`boards/Tile.tsx`) is a keycap that sinks when pressed; it is the one bold element. Every board is tap-only.

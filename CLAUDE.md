# Working in this repo

Rulesmith (repo `sam3lds-prog/rulessmith`, formerly `mathwhiz`): an Expo SDK 58 + TypeScript puzzle app for learning math rules. iOS, Android and web from one codebase. Read `AGENTS.md` for Expo-specific rules (it came with the Expo template), and `docs/ARCHITECTURE.md` before changing the engine or content.

## Commands

```bash
npm run web              # dev server in the browser
npm test                 # all unit tests (vitest, plain Node)
npm run typecheck        # tsc --noEmit
npm run content:audit    # SEEDS=200 for a deep pass
npm run content:sample   # print items for human review
npm run build:web        # static export to dist/
```

Install packages with `npx expo install <pkg>`. In this sandbox the Expo API is unreachable, so prefix with `EXPO_OFFLINE=1`.

Run typecheck and tests before declaring work done. If you touch content, run the audit and regenerate the review worksheets (`npm run content:worksheet`). If you touch `supabase/migrations`, run `supabase/checks` (see its README).

## Rules that matter

- **`src/content`, `src/engine`, `src/monetization`, `src/policy` are pure TypeScript.** No React Native imports, so they run in vitest under Node. Keep them that way.
- **Grading never trusts the generator.** `checkItem()` evaluates the item's structured payload by brute force (`content/evaluate.ts`). `item.key` exists only for the audit. Never grade with it, and never make the checker call the shortcut rules in `content/numbers.ts`.
- **Every skill needs 3+ families, 2+ board types and 1+ transfer family**, or the Secure rule can never be met. The audit enforces this.
- **Items are deterministic** from `(templateId, level, seed)`. If you change what a template produces, bump its `version`.
- **Secure needs independent answers.** A puzzle is guided (rule on screen) or independent (rule hidden; revealing it is a hint), set per slot by `supportFor` in `engine/mixer.ts`. Guided answers may reach Practicing, never Secure. Don't tie support to level.
- **One learner per storage bucket** (`state/buckets.ts`). Never copy data between buckets except device-level keys and an explicit guest import. Merge synced data by id (`sync/merge.ts`); never pick a side by counts.
- **Attempts are the record.** Don't cap or rewrite the attempt log. If you change mastery rules, skills can be rebuilt with `rebuildSkills`.
- **Kill switch:** serve puzzles through `generateItem`/`serveItem` with the slot's `version`, so switched-off and changed templates are never served. Bump a template's `version` when its output changes.
- **Hints and explanations are never gated** behind payment or tokens. Tokens are earned, never sold.
- **Ads**: follow `policy/ads.ts`. Never on the puzzle board, mid-session, after a miss, for minors, or for Premium. No interstitials or app-open ads.
- **Minors**: follow `policy/age.ts`. No ads, purchases or accounts for under-18s at launch.

## Expo SDK 58 gotchas found while building this

- `EXPO_PUBLIC_*` variables are inlined only when written as literal `process.env.EXPO_PUBLIC_NAME`. Never read them dynamically.
- The web export is static (`app.json` → `web.output: "static"`), so screens render once in Node. Anything touching `window` or `localStorage` at import or render time must be guarded (see `canStore` in `state/store.ts`, and `bootstrapStore`, which runs only on the client).
- A custom `src/app/+html.tsx` in the old style dropped all script tags from the export. Don't add one without checking `dist/*.html` contains `<script` tags.
- JS tabs come from `expo-router/js-tabs`. `Stack` comes from `expo-router`.
- Ref types are strict in RN 0.88: use `ScrollViewInstance`, not `ScrollView`, for refs.

## Copy style

Sentence case, plain verbs, the learner's language (not system terms). Buttons say what happens ("Start session", "Save my plan"). Errors say what went wrong and what to do. No all-caps labels.

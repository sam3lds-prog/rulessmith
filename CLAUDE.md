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
npm run lint             # expo lint (no errors allowed; warnings are reviewed)
```

Install packages with `npx expo install <pkg>`. In this sandbox the Expo API is unreachable, so prefix with `EXPO_OFFLINE=1`.

Run typecheck and tests before declaring work done. If you touch content, run the audit and regenerate the review worksheets (`npm run content:worksheet`). If you touch `supabase/migrations`, run `supabase/checks` (see its README).

## Rules that matter

- **`src/content`, `src/engine`, `src/monetization`, `src/policy`, `src/coach`, `src/review`, `src/games`, `src/quests`, `src/quizzes`, `src/rewards`, `src/exams`, `src/state/work.ts` and `src/feel/events.ts` are pure TypeScript.** No React Native imports, so they run in vitest under Node. Keep them that way. `src/feel/director.ts` is the one React Native part of `feel`.
- **Grading never trusts the generator.** `checkItem()` evaluates the item's structured payload by brute force (`content/evaluate.ts`). `item.key` exists only for the audit. Never grade with it, and never make the checker call the shortcut rules in `content/numbers.ts`.
- **Every skill needs 3+ families, 2+ board types and 1+ transfer family**, or the Secure rule can never be met. The audit enforces this.
- **Items are deterministic** from `(templateId, level, seed)`. If you change what a template produces, bump its `version`.
- **Secure needs independent answers.** A puzzle is guided (rule on screen) or independent (rule hidden; revealing it is a hint), set per slot by `supportFor` in `engine/mixer.ts`. Guided answers may reach Practicing, never Secure. Don't tie support to level.
- **One learner per storage bucket** (`state/buckets.ts`). Never copy data between buckets except device-level keys and an explicit guest import. Merge synced data by id (`sync/merge.ts`); never pick a side by counts.
- **Attempts are the record.** Don't cap or rewrite the attempt log. If you change mastery rules, skills can be rebuilt with `rebuildSkills`.
- **Kill switch:** serve puzzles through `generateItem`/`serveItem` with the slot's `version`, so switched-off and changed templates are never served. Bump a template's `version` when its output changes.
- **Hints and explanations are never gated** behind payment or tokens. Tokens are earned, never sold, and nothing they buy touches mastery.
- **Help is never gated, and always counts.** The Help tray (a hint, the rule, a worked example from `coach/example.ts`) is free for everyone; any of it makes the answer helped. A worked example is never a puzzle whose answer, as shown, matches the one on screen.
- **Moving on by itself is opt-in and stoppable.** Only `settings.explain` of `mistakes` or `skip` advances without a tap, only with immediate feedback, never with a detected screen reader, and always with "Stay on this one". Explanations stay one tap away, and in the recap and mistakes.
- **Coaching never grades.** `coach/explain.ts` explains an answer from the item's structure and the response; verdicts come from the checker's evaluator, numbers are computed, and it never reads `item.key`. If it can't explain an answer specifically, it falls back to the item's audited explanation. Misconception notes appear only for checker-tagged answers with a reviewed note, phrased as a common slip.
- **Mistakes review never shows a different puzzle.** It rebuilds the exact item or shows an honest fallback (`review/mistakes.ts`), and never regrades the recorded answer.
- **Checks hold the verdict until the end.** In `feedback: 'after-set'` sessions, boards get no result: no verdict, no coaching, no right/wrong colours, neutral progress, only neutral feel events. Every board must treat a missing `result` as "not judged", never as wrong.
- **Never discard work silently.** An open session with an answer, hint, revealed rule or anything on the board can't be replaced (`state/work.ts`); screens use `ui/useStart.tsx` to ask. A related problem is a new guided slot; the wrong answer stays as recorded.
- **Token entries have stable ids** (`session-<id>`, `daily-<day>`, `weekly:<monday>`) so replays, reloads and sync merges never pay twice. Path steps complete only when every slot was answered and the session wasn't ended early. There is no workshop or cosmetic collection (removed in v4, with its data).
- **Ads**: follow `policy/ads.ts`. Never on the puzzle board, mid-session, after a miss, for minors, or for Premium. Banners only on the My plan and Practice tabs. No interstitials or app-open ads.
- **Minors**: follow `policy/age.ts`. No ads, purchases or accounts for under-18s at launch.

## Expo SDK 58 gotchas found while building this

- `EXPO_PUBLIC_*` variables are inlined only when written as literal `process.env.EXPO_PUBLIC_NAME`. Never read them dynamically.
- The web export is static (`app.json` → `web.output: "static"`), so screens render once in Node. Anything touching `window` or `localStorage` at import or render time must be guarded (see `canStore` in `state/store.ts`, and `bootstrapStore`, which runs only on the client).
- A custom `src/app/+html.tsx` in the old style dropped all script tags from the export. Don't add one without checking `dist/*.html` contains `<script` tags.
- JS tabs come from `expo-router/js-tabs`. `Stack` comes from `expo-router`.
- Dynamic routes (`mission/[id]`, `skill/[id]`) export `generateStaticParams` so the static export has a page per id; without it a direct link hydrates against the not-found page (React error 418).
- Ref types are strict in RN 0.88: use `ScrollViewInstance`, not `ScrollView`, for refs.
- Lint includes the React Compiler purity rules: never call `Date.now()` or `Math.random()` during render (use `ui/useNow.ts` or a `useState` initialiser), and never write a ref during render.

## Copy style

Sentence case, plain verbs, the learner's language (not system terms). Buttons say what happens ("Start session", "Save my plan"). Errors say what went wrong and what to do. No all-caps labels.

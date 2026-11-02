# The content factory

Math practice grows by adding **template families**, not by writing questions one at a time. Each family generates unlimited instances across levels 1 to 10.

## What exists today

18 micro-skills in three tracks, 58 families (at least three per skill, at least one a transfer family):

- **Divisibility** (8): last-digit rules, digit sums, last digits for 4 and 8, two rules at once (6, 15, 18), the rule for 11, combining rules (12, 24, 36, 45, 72), sums and products, build to spec.
- **Primes and factors** (5): spotting primes, prime factorization, counting factors, GCD and LCM, squares and cubes.
- **Remainders** (5): basics, remainders from digits, remainder arithmetic, cycles and units digits, working backwards.

Four families feed the games: `div.digit-sum/refute` (Rule Breaker claims about 3 and 9), `pf.factorize/tree` (Factor Factory), `rem.basics/rail` and `rem.cycles/rail` (Remainder Rails). Chapter missions name templates and levels in `src/quests/chapters.ts`; if you change or retire a template a mission uses, update the mission and bump its `version`.

The skill list is a draft for the content reviewer (a Phase 0 task in the plan). Exam weights in `src/content/curriculum.ts` are editorial estimates and should be checked against the official GMAC, ETS, College Board and ACT outlines.

## The difficulty ladder

Every family maps levels 1 to 10 onto these knobs (see each template for specifics):

| Knob | Easier | Harder |
| --- | --- | --- |
| Number size | 2 to 3 digits | 6 to 8 digits |
| Constraints | one | several that interact |
| Direction | check a claim, fill one blank | build from scratch, find every answer, count the answers |
| Representation | bare numbers | word problems, unfamiliar framings |
| Wrong answers | random | built from named misconceptions |
| Support | guided: rule on screen (New and Learning skills) | independent: rule behind a tap that counts as a hint (Practicing and up, and every review or check). Set per slot, not per level |

## Adding a template family

1. **Spec it.** Objective, prerequisites, common misconceptions, three to five hand-written example problems.
2. **Write the generator** in `src/content/skills/<track>.ts`. Express the question as structure: a `NumPredicate`, a `Claim`, or a `ValueSpec`. If you need a new kind of question, add a brute-force evaluator for it in `evaluate.ts` first. Use the builders in `builders.ts` for the common shapes.
3. **Name the misconceptions** on every distractor (`misconception: 'composite-base'`). They show up in analytics.
4. **Write explanations from the item**, not generic text: "The known digits add to 11, so the blank can be 1, 4 or 7."
5. **Register it** in the track's exported list. Mark `transfer: true` if it is an unfamiliar framing of the skill.
6. **Run the audit:** `SEEDS=200 npm run content:audit`. It must pass at every level.
7. **Human review.** Run `npm run content:worksheet` and have the reviewer work through the family's entry (low, middle and high level) as described in `docs/review/README.md`, sampling more seeds with `npm run content:sample` where needed. Record the sign-off in `src/content/signoff.ts`.
8. **Bump `CONTENT_VERSION`** in `src/content/index.ts` and ship. Before a beta or release, `REQUIRE_SIGNOFF=1 npm test` must pass.

## Using AI for drafting (offline)

Use Claude for wording variants, word-problem contexts, hints, explanations, and misconception-based distractors, then encode the result as a template. AI never grades and never ships text without the checker and a human reviewer. Don't copy questions from official exam materials or textbooks (OpenStax is licensed non-commercial only); use official outlines only to map skills.

## When something is wrong

- Every result screen has **Report a problem**. A report carries the item id (`template@level#seed`) and the content version (which includes the template version), so `generateItem(template, level, seed, { allowDisabled: true })` rebuilds the exact puzzle, as long as the template version still matches. Every attempt stores the same, plus the learner's response.
- **Same-day shutoff:** insert the template id into the Supabase `disabled_templates` table (`insert into public.disabled_templates (template_id, reason) values ('div.sums/refute', 'Wrong key at level 9');`). Apps pick it up at launch or on returning to the foreground (at most 5 minutes later), and the list is cached for offline use. It is enforced inside `generateItem`, so queued, resumed, daily, ladder, challenge and placement puzzles are all covered; a puzzle switched off on screen is replaced at once. Delete the row to switch it back on. `DISABLED_TEMPLATES` in `src/content/index.ts` is only for a template that must stay off in every build.
- **Changing a template:** bump its `version`. Saved slots and replays carry the version they were made with, and `generateItem` refuses a mismatch, so a puzzle in progress is replaced rather than silently turning into a different puzzle under the same id. The sign-off goes stale until someone reviews the new version.
- **Quality loop:** the `family_quality` view (Supabase) shows, per family, level and template version, the independent success rate (rule hidden, no hints), the guided success rate, hint rate, median time and reports. Compare the independent rate with the band the level predicts. `misconception_counts` shows which wrong answers learners actually choose. Flag families that are far off or draw repeated reports; fix or retire them.

## Verbal and logic (later)

Arguments and passages can't be generated infinitely from templates. Plan reviewed item banks instead (300 to 500 per verbal skill), with four gates: a written answer-key rationale, two independent AI solves that both match the key, a human reviewer, and live data that flags items where strong learners disagree with the key. The profile, planner, skill graph, mastery rules, review scheduler, billing and ads carry over unchanged.

# The content factory

Math practice grows by adding **template families**, not by writing questions one at a time. Each family generates unlimited instances across levels 1 to 10.

## What exists today

18 micro-skills in three tracks, 54 families (three per skill, at least one a transfer family):

- **Divisibility** (8): last-digit rules, digit sums, last digits for 4 and 8, two rules at once (6, 15, 18), the rule for 11, combining rules (12, 24, 36, 45, 72), sums and products, build to spec.
- **Primes and factors** (5): spotting primes, prime factorization, counting factors, GCD and LCM, squares and cubes.
- **Remainders** (5): basics, remainders from digits, remainder arithmetic, cycles and units digits, working backwards.

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
| Support | rule shown openly (levels 1 to 4) | rule behind a tap that counts as a hint |

## Adding a template family

1. **Spec it.** Objective, prerequisites, common misconceptions, three to five hand-written example problems.
2. **Write the generator** in `src/content/skills/<track>.ts`. Express the question as structure: a `NumPredicate`, a `Claim`, or a `ValueSpec`. If you need a new kind of question, add a brute-force evaluator for it in `evaluate.ts` first. Use the builders in `builders.ts` for the common shapes.
3. **Name the misconceptions** on every distractor (`misconception: 'composite-base'`). They show up in analytics.
4. **Write explanations from the item**, not generic text: "The known digits add to 11, so the blank can be 1, 4 or 7."
5. **Register it** in the track's exported list. Mark `transfer: true` if it is an unfamiliar framing of the skill.
6. **Run the audit:** `SEEDS=200 npm run content:audit`. It must pass at every level.
7. **Human review.** Run `npm run content:sample` (and `ALL_LEVELS=1` for easy levels too) and have the reviewer check explanations, fairness and accessibility for each family, sampling instances.
8. **Bump `CONTENT_VERSION`** in `src/content/index.ts` and ship.

## Using AI for drafting (offline)

Use Claude for wording variants, word-problem contexts, hints, explanations, and misconception-based distractors, then encode the result as a template. AI never grades and never ships text without the checker and a human reviewer. Don't copy questions from official exam materials or textbooks (OpenStax is licensed non-commercial only); use official outlines only to map skills.

## When something is wrong

- Every result screen has **Report a problem**. A report carries the item id (`template@level#seed`) and the content version, so `generateItem(template, level, seed)` rebuilds the exact puzzle.
- **Same-day shutoff:** add the template id to `DISABLED_TEMPLATES` in `src/content/index.ts`. Before launch, move that list to remote config so it applies without an app release.
- **Quality loop:** the `family_quality` view (Supabase) shows success rate, hint rate, median time and reports per family and level. Flag families whose success rate is far from what their level predicts, or that draw repeated reports; fix or retire them.

## Verbal and logic (later)

Arguments and passages can't be generated infinitely from templates. Plan reviewed item banks instead (300 to 500 per verbal skill), with four gates: a written answer-key rationale, two independent AI solves that both match the key, a human reviewer, and live data that flags items where strong learners disagree with the key. The profile, planner, skill graph, mastery rules, review scheduler, billing and ads carry over unchanged.

# Content review

The content audit (`npm run content:audit`) proves that every generator and the independent checker agree. It cannot tell whether a puzzle reads clearly, whether a hint gives the answer away, or whether a wrong answer is a mistake real learners make. A person has to check that, once per family, before adults use the app in the beta.

## The worksheets

`div.md`, `pf.md` and `rem.md` show every template family at a low, middle and high level (its minimum level, the middle, and 10), with the prompt, the rule, the board, each wrong answer's misconception tag, the checker's answer, the hints and the explanation. Regenerate them after changing a template:

```bash
npm run content:worksheet
```

The seed is fixed, so the worksheet only changes when content changes, and a diff shows exactly what a template edit did.

## How to review a family

Allow about 45 minutes per family. For each of the three levels:

1. Solve it yourself first, without reading the answer or the rule.
2. Read the prompt. Is there only one reasonable reading?
3. Read the hints in order. Does each one help? Does any one give the answer away?
4. For choice puzzles, read each wrong answer. Is it a mistake a real learner makes? Does its misconception tag name that mistake? (Tags feed misconception repair later, so a wrong tag teaches the wrong fix.)
5. Read the explanation. Is it correct, and is it about this puzzle rather than the topic in general?
6. Compare the three levels. Does difficulty rise? Is the top level fair?
7. Nothing should depend on color alone, dragging, or reading speed.

If something is wrong at one level, sample a few more seeds at that level with `npm run content:sample` (add `ALL_LEVELS=1` for easy levels).

## Recording the verdict

- **Approve:** add the family to `SIGNOFFS` in `src/content/signoff.ts` with the version shown in the worksheet heading, your name and the date.
- **Fix:** open an issue or note with the item id (`template@level#seed`), what is wrong and the fix. After the fix, bump the template's `version`, regenerate the worksheet and review again.
- **Retire:** switch it off for everyone today with a row in the Supabase `disabled_templates` table, then remove it in the next release.

`npm run content:signoff` lists what is signed, stale (the template changed since it was signed) and missing. Before the beta, `REQUIRE_SIGNOFF=1 npm test` must pass.

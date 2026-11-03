# Roadmap

Phases and gates follow the build plan (Nov 1, 2026). Dates assume 15 to 20 hours a week. Each gate is a go, revise or stop decision based on evidence, not features shipped.

## Status

| Phase | Plan dates | Status |
| --- | --- | --- |
| Review fixes (milestones 1 and 2) | Nov 2026 | **Built:** guided vs independent items (Secure only from independent answers, free levels included); puzzles in progress survive restarts; attempts store response, misconception, versions and support; per-learner storage buckets with explicit guest import; attempt outbox and merge by id; remote kill switch; persistent analytics pipeline; review worksheets and sign-off ledger; honest onboarding (no goal, reminder or locked-subject claims); "700+" pack renamed. **Still yours:** create the Supabase project and apply both migrations, the human review of all 54 families, then the 12-adult beta |
| 0. Set up and discover | Nov 2026 | Repo and app scaffold done. **Still yours:** trademark search on the five names, employment agreement IP check, Apple developer account, 10 GMAT/GRE interviews, competitor teardown, review the 8 divisibility micro-skills |
| 1. Divisibility prototype | Dec 2026 to Jan 2027 | **Built:** Sort, Construct and Refute boards with tap alternatives; full solution-set checkers; worked explanations, hints, transfer items; local skill model; second-session review; shareable web build |
| Gate A | Jan 24, 2027 | Of 12 testers: 8 finish a mission unaided, 6 choose an extra run, 4 return within a week |
| 2. Profile, journey, closed beta | Feb to Mar 2027 | **Built:** profile, placement, journey planner, Today screen, spaced review, three tracks (divisibility, primes and factors, remainders), Supabase sign-in and sync. **To do:** create the Supabase project, TestFlight beta with 30 to 50 adults, human content review of all 58 families |
| 3. Learning pilot, six tracks | Apr to May 2027 | **To do:** pilot with pre-test, unseen post-test and one-week delayed test; fractions and decimals, ratios and rates, percentages via the content factory |
| Gate B | May 23, 2027 | Measurable improvement on unseen, non-game questions |
| 4. Payments, ads, compliance | late May to early Jul 2027 | **Rules built and tested.** To do: RevenueCat + store products, AdMob, native age signals (Utah duties start May 6, 2027), privacy policy and terms (legal review), App Store review |
| Launch | Jul 6, 2027 | US iOS and web |
| Gate C | ~Aug 29, 2027 | At least 10 genuine purchases and day-7 return near 20% |
| 5. Android, GRE, packs | Jul to Dec 2027 | Android, GRE Quant mapping, GMAT Data Insights and Critical Reasoning, a new pack each month, tutor pilot |
| 6. Teen SAT and ACT route | H1 2028 | Algebra and graph boards, sentence surgery, parent accounts with weekly summaries, teen-safe defaults |

## Decisions taken (defaults from the plan; revisit with evidence)

| Decision | Default used here |
| --- | --- |
| First paid audience | Adults preparing for GMAT and GRE |
| Name | Rulesmith, pending a trademark search (`APP_NAME` in `src/config.ts`, `name` in `app.json`) |
| Platforms | iOS and web first; Android after launch (the code already runs there) |
| Price | $9.99/mo, $59.99/yr with 14-day trial |
| Packs and Premium | Premium includes every pack; packs are for non-subscribers |
| Ads | Built, switched off; on for adults 4 to 8 weeks after launch |
| Tokens | Earned only, spent on an extra session |
| Business setup | Not code: form an LLC and business bank account before taking payments |

## Launch checklist (not code)

- [ ] USPTO search (classes 9 and 41), both app stores, domain and handles for the chosen name
- [ ] Lawyer review: privacy policy, terms, trademark, minors (COPPA, Utah, Texas). `src/app/privacy.tsx` is a plain-language draft only
- [ ] One or two contract content reviewers (about 45 minutes per family; 54 families now)
- [ ] App icon, splash and store screenshots (the current icons are Expo defaults)
- [x] Analytics pipeline behind `src/analytics/track.ts` (Supabase `events`); no identifiers for under-18s
- [ ] Weekly cohort queries over `events` (activation, day-7 return, week-4 use)
- [x] Remote kill switch (`disabled_templates` table, cached offline)
- [ ] Remote switch for ads (still a build-time variable)
- [ ] Human sign-off of all 54 families (`REQUIRE_SIGNOFF=1 npm test` passes)
- [ ] Bundle identifier and package name in `app.json`, then `eas build`

## Weekly cohort dashboard (targets are hypotheses)

Activation (70% finish a mission and its recap), day-7 return (20%), week-4 use (15%), download-to-paid by day 35, refunds, content defects. The events behind these are listed in `src/analytics/track.ts`.

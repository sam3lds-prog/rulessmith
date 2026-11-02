/**
 * The skill graph: tracks, micro-skills, prerequisites and exam weights.
 *
 * Exam weights (0–1) are editorial estimates of how much each official exam
 * outline leans on the skill. They drive the journey planner's priorities and
 * should be reviewed against the GMAC, ETS, College Board and ACT outlines
 * before launch.
 */

export type ExamId = 'gmat' | 'gre' | 'sat' | 'act';

export const EXAMS: { id: ExamId; name: string }[] = [
  { id: 'gmat', name: 'GMAT' },
  { id: 'gre', name: 'GRE' },
  { id: 'sat', name: 'SAT' },
  { id: 'act', name: 'ACT' },
];

export type TrackId = 'div' | 'pf' | 'rem' | 'frac' | 'ratio' | 'pct';

export interface Track {
  id: TrackId;
  name: string;
  blurb: string;
  available: boolean;
}

export const TRACKS: Track[] = [
  { id: 'div', name: 'Divisibility', blurb: 'Test any number for 2 through 72 without dividing.', available: true },
  { id: 'pf', name: 'Primes and factors', blurb: 'Factor, count factors, and work with GCD, LCM and powers.', available: true },
  { id: 'rem', name: 'Remainders', blurb: 'Find remainders of huge numbers, powers and sums.', available: true },
  { id: 'frac', name: 'Fractions and decimals', blurb: 'Coming in a later pack.', available: false },
  { id: 'ratio', name: 'Ratios and rates', blurb: 'Coming in a later pack.', available: false },
  { id: 'pct', name: 'Percentages', blurb: 'Coming in a later pack.', available: false },
];

export interface Skill {
  id: string;
  track: TrackId;
  name: string;
  /** One line a learner sees in the topic list. */
  summary: string;
  prereqs: string[];
  weights: Record<ExamId, number>;
}

const w = (gmat: number, gre: number, sat: number, act: number): Record<ExamId, number> => ({ gmat, gre, sat, act });

export const SKILLS: Skill[] = [
  // Divisibility
  { id: 'div.last-digit', track: 'div', name: 'Last-digit rules', summary: 'Divisible by 2, 5 and 10 at a glance', prereqs: [], weights: w(0.6, 0.6, 0.3, 0.4) },
  { id: 'div.digit-sum', track: 'div', name: 'Digit sums', summary: 'Divisible by 3 and 9 from the digits', prereqs: [], weights: w(0.8, 0.7, 0.3, 0.5) },
  { id: 'div.last-two', track: 'div', name: 'Last digits for 4 and 8', summary: 'Why 4 needs two digits and 8 needs three', prereqs: ['div.last-digit'], weights: w(0.7, 0.6, 0.2, 0.4) },
  { id: 'div.two-rules', track: 'div', name: 'Two rules at once', summary: 'Divisible by 6, 15 and 18', prereqs: ['div.last-digit', 'div.digit-sum'], weights: w(0.8, 0.7, 0.3, 0.5) },
  { id: 'div.eleven', track: 'div', name: 'The rule for 11', summary: 'Alternating digit sums', prereqs: ['div.digit-sum'], weights: w(0.4, 0.3, 0.1, 0.2) },
  { id: 'div.combined', track: 'div', name: 'Combining rules', summary: 'Divisible by 12, 24, 36, 45 and 72', prereqs: ['div.two-rules', 'div.last-two'], weights: w(0.9, 0.8, 0.2, 0.4) },
  { id: 'div.sums', track: 'div', name: 'Sums and products', summary: 'What must divide a + b or a × b', prereqs: ['div.two-rules'], weights: w(1.0, 0.8, 0.3, 0.4) },
  { id: 'div.build', track: 'div', name: 'Build to spec', summary: 'Make numbers that meet several conditions', prereqs: ['div.combined'], weights: w(0.7, 0.5, 0.2, 0.3) },
  // Primes and factors
  { id: 'pf.primes', track: 'pf', name: 'Spotting primes', summary: 'Test for primes up to √n', prereqs: ['div.digit-sum', 'div.last-digit'], weights: w(0.9, 0.9, 0.4, 0.6) },
  { id: 'pf.factorize', track: 'pf', name: 'Prime factorization', summary: 'Break any number into primes', prereqs: ['pf.primes'], weights: w(1.0, 0.9, 0.4, 0.6) },
  { id: 'pf.divisor-count', track: 'pf', name: 'Counting factors', summary: '(a + 1)(b + 1) and why it works', prereqs: ['pf.factorize'], weights: w(0.8, 0.7, 0.2, 0.4) },
  { id: 'pf.gcd-lcm', track: 'pf', name: 'GCD and LCM', summary: 'Shared factors and common multiples', prereqs: ['pf.factorize'], weights: w(0.9, 0.9, 0.5, 0.7) },
  { id: 'pf.powers', track: 'pf', name: 'Squares and cubes', summary: 'Make any number a perfect power', prereqs: ['pf.factorize'], weights: w(0.8, 0.7, 0.4, 0.5) },
  // Remainders
  { id: 'rem.basics', track: 'rem', name: 'Remainder basics', summary: 'n = d × q + r, and what r can be', prereqs: [], weights: w(0.8, 0.8, 0.4, 0.5) },
  { id: 'rem.digit-rules', track: 'rem', name: 'Remainders from digits', summary: 'Remainders of huge numbers without dividing', prereqs: ['rem.basics', 'div.digit-sum', 'div.last-two'], weights: w(0.7, 0.6, 0.2, 0.3) },
  { id: 'rem.arithmetic', track: 'rem', name: 'Remainder arithmetic', summary: 'Remainders of sums and products', prereqs: ['rem.basics'], weights: w(0.9, 0.7, 0.2, 0.3) },
  { id: 'rem.cycles', track: 'rem', name: 'Cycles and units digits', summary: 'Units digits of huge powers', prereqs: ['rem.arithmetic'], weights: w(0.9, 0.8, 0.2, 0.4) },
  { id: 'rem.reverse', track: 'rem', name: 'Working backwards', summary: 'Find numbers from their remainders', prereqs: ['rem.basics'], weights: w(0.8, 0.7, 0.2, 0.3) },
];

export const SKILL_BY_ID: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export const skillName = (id: string) => SKILL_BY_ID[id]?.name ?? id;

/** Skills that list this skill as a prerequisite. */
export function dependentsOf(id: string): string[] {
  return SKILLS.filter((s) => s.prereqs.includes(id)).map((s) => s.id);
}

/** Longest prerequisite chain below a skill (0 for skills with no prerequisites). */
export function depthOf(id: string, memo: Record<string, number> = {}): number {
  if (memo[id] !== undefined) return memo[id];
  const s = SKILL_BY_ID[id];
  const d = s && s.prereqs.length ? 1 + Math.max(...s.prereqs.map((p) => depthOf(p, memo))) : 0;
  memo[id] = d;
  return d;
}

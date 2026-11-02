/**
 * Exam blueprints: the official math domains of each exam, which of them the
 * app covers today, and honest coverage numbers. Versioned and source-linked.
 *
 * The domain list comes from each exam's official outline (checked on the date
 * below). Which skills belong to which domain, and how much each matters, is an
 * editorial mapping that needs review; it is not an official frequency
 * estimate. Nothing here predicts a score.
 */
import { SKILLS, type ExamId, type TrackId } from '../content/curriculum';
import { displayStatus } from '../engine/mastery';
import type { States } from '../engine/mixer';

export const BLUEPRINT_VERSION = '2026-11';

export interface ExamDomain {
  name: string;
  /** Official share where the outline gives one. */
  share?: string;
  summary: string;
  /** foundations: released tracks practise part of it. planned: curriculum not built yet. outside: not covered by this app. */
  status: 'foundations' | 'planned' | 'outside';
  tracks: TrackId[];
}

export interface ExamBlueprint {
  id: ExamId;
  name: string;
  section: string;
  source: { title: string; url: string; checkedOn: string };
  domains: ExamDomain[];
  /** One honest sentence about what the app does for this exam. */
  scope: string;
}

const FOUNDATION_TRACKS: TrackId[] = ['div', 'pf', 'rem'];

export const BLUEPRINTS: Record<ExamId, ExamBlueprint> = {
  gmat: {
    id: 'gmat',
    name: 'GMAT',
    section: 'Quantitative Reasoning: 21 questions, 45 minutes',
    source: { title: 'GMAT exam structure (mba.com)', url: 'https://www.mba.com/exams/gmat-exam/about/exam-structure', checkedOn: '2026-11-02' },
    domains: [
      { name: 'Arithmetic and number properties', summary: 'Divisibility, primes, factors and remainders are here; fractions, ratios and percentages come next.', status: 'foundations', tracks: FOUNDATION_TRACKS },
      { name: 'Elementary algebra', summary: 'Equations, inequalities and expressions.', status: 'planned', tracks: [] },
      { name: 'Data Insights', summary: 'A separate section with its own question types.', status: 'outside', tracks: [] },
    ],
    scope: 'Number-property foundations for GMAT Quant. Fractions, ratios, percentages and algebra come later; this is not complete GMAT preparation.',
  },
  gre: {
    id: 'gre',
    name: 'GRE',
    section: 'Quantitative Reasoning',
    source: { title: 'Preparing for the Quantitative Reasoning measure (ETS)', url: 'https://www.ets.org/gre/test-takers/general-test/transcript/preparing-for-the-quantitative-reasoning-measure.html', checkedOn: '2026-11-02' },
    domains: [
      { name: 'Arithmetic', summary: 'Properties of integers (divisibility, odd and even, primes) are here; percents, ratios and rates come next.', status: 'foundations', tracks: FOUNDATION_TRACKS },
      { name: 'Algebra', summary: 'Expressions, equations and inequalities.', status: 'planned', tracks: [] },
      { name: 'Geometry', summary: 'Lines, angles, shapes, area and volume.', status: 'planned', tracks: [] },
      { name: 'Data analysis', summary: 'Statistics, probability and interpreting data.', status: 'planned', tracks: [] },
    ],
    scope: 'Integer-property foundations for GRE Quant. Algebra, geometry and data analysis come later.',
  },
  sat: {
    id: 'sat',
    name: 'SAT',
    section: 'Math',
    source: { title: 'SAT Suite math alignment (College Board)', url: 'https://satsuite.collegeboard.org/k12-educators/about/alignment/math/psat-10-psat-nmsqt-sat', checkedOn: '2026-11-02' },
    domains: [
      { name: 'Algebra', share: 'about 35%', summary: 'Linear equations, inequalities and systems.', status: 'planned', tracks: [] },
      { name: 'Advanced Math', share: 'about 35%', summary: 'Nonlinear equations and functions.', status: 'planned', tracks: [] },
      { name: 'Problem-Solving and Data Analysis', share: 'about 15%', summary: 'Ratios, rates, percentages and data.', status: 'planned', tracks: ['ratio', 'pct'] },
      { name: 'Geometry and Trigonometry', share: 'about 15%', summary: 'Area, volume, angles, triangles and circles.', status: 'planned', tracks: [] },
    ],
    scope: 'Number properties support SAT math, but none of its four domains is built yet. Treat this as foundations practice.',
  },
  act: {
    id: 'act',
    name: 'ACT',
    section: 'Mathematics',
    source: { title: 'Description of the ACT math test (ACT)', url: 'https://act.org/content/act/en/products-and-services/the-act/test-preparation/description-of-math-test.html', checkedOn: '2026-11-02' },
    domains: [
      { name: 'Number and Quantity', share: '10 to 12%', summary: 'Part of Preparing for Higher Math. Number properties are here.', status: 'foundations', tracks: FOUNDATION_TRACKS },
      { name: 'Algebra and Functions', share: '34 to 40%', summary: 'Part of Preparing for Higher Math.', status: 'planned', tracks: [] },
      { name: 'Geometry', share: '17 to 20%', summary: 'Part of Preparing for Higher Math.', status: 'planned', tracks: [] },
      { name: 'Statistics and Probability', share: '12 to 15%', summary: 'Part of Preparing for Higher Math.', status: 'planned', tracks: [] },
      { name: 'Integrating Essential Skills', share: '20%', summary: 'Rates, percentages, proportions and multi-step problems.', status: 'planned', tracks: ['ratio', 'pct'] },
    ],
    scope: 'Divisibility is one supporting skill for ACT math, not the whole plan. Algebra, functions, geometry and statistics come later.',
  },
};

/** Skills that count for an exam (weight above zero), or every released skill with no exam. */
export function examSkills(exams: ExamId[]): string[] {
  if (exams.length === 0) return SKILLS.map((s) => s.id);
  return SKILLS.filter((s) => exams.some((e) => s.weights[e] > 0)).map((s) => s.id);
}

export interface Coverage {
  released: number;
  secure: number;
  practicing: number;
  started: number;
  /** "6 of 18 released skills secure". Never a readiness percentage. */
  label: string;
}

export function coverage(exams: ExamId[], states: States, now: number): Coverage {
  const ids = examSkills(exams);
  let secure = 0;
  let practicing = 0;
  let started = 0;
  for (const id of ids) {
    const s = displayStatus(states[id], now);
    if (s === 'secure' || s === 'review') secure++;
    else if (s === 'practicing') practicing++;
    if (s !== 'new') started++;
  }
  return { released: ids.length, secure, practicing, started, label: `${secure} of ${ids.length} released skills secure` };
}

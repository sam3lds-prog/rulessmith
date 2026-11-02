/**
 * Journey planner. Deterministic code, not an AI chat: cheap to run, testable,
 * and explainable to a learner or parent.
 *
 *  1. Select skills mapped to the chosen exams, with their exam weights.
 *  2. Score need = exam weight × gap (1 − estimated mastery) × unlock bonus.
 *  3. Order by prerequisites; never schedule a skill before its prerequisites.
 *  4. Fit to the calendar: weeks to the test × weekly minutes, with 25% kept for
 *     review and 10% for checkpoints. If it does not fit, say so and offer
 *     more time, narrower scope, or a later date.
 *  5. Set weekly milestones and checkpoints every three weeks.
 *  6. Re-plan weekly from current evidence (replanIfDue).
 */
import { dependentsOf, EXAMS, SKILL_BY_ID, SKILLS, TRACKS } from '../content/curriculum';
import { masteryEstimate } from './rating';
import { stateOf, type States } from './mixer';
import { addCalendarDays, dayKey, parseDay, startOfDay, wholeDays } from './time';
import type { JourneyPlan, PlanAlternative, PlanWeek, Profile } from './types';

export const REVIEW_SHARE = 0.25;
export const CHECKPOINT_SHARE = 0.1;
const NEW_SHARE = 1 - REVIEW_SHARE - CHECKPOINT_SHARE;
const CHECKPOINT_EVERY = 3;

export function examWeight(skillId: string, exams: Profile['exams']): number {
  const s = SKILL_BY_ID[skillId];
  if (!s) return 0;
  if (exams.length === 0) return 0.6;
  return Math.max(...exams.map((e) => s.weights[e]));
}

/**
 * Minutes of new learning a skill needs, from its gap. Reaching Secure takes
 * roughly 3 to 5 short sessions; this estimate should be recalibrated from real
 * time-to-Secure data after the learning pilot.
 */
export const minutesForGap = (gap: number) => Math.round(10 + 25 * gap);

export function selectSkills(exams: Profile['exams']): string[] {
  const available = new Set(TRACKS.filter((t) => t.available).map((t) => t.id));
  const chosen = new Set(SKILLS.filter((s) => available.has(s.track) && examWeight(s.id, exams) >= 0.2).map((s) => s.id));
  // Prerequisites always come along, even if the exam weights them low.
  const add = (id: string) => {
    for (const p of SKILL_BY_ID[id].prereqs) if (!chosen.has(p)) {
      chosen.add(p);
      add(p);
    }
  };
  [...chosen].forEach(add);
  return SKILLS.map((s) => s.id).filter((id) => chosen.has(id));
}

export function needScore(skillId: string, exams: Profile['exams'], states: States, among: Set<string>): number {
  const gap = 1 - masteryEstimate(stateOf(states, skillId).rating);
  const unlocks = dependentsOf(skillId).filter((d) => among.has(d)).length;
  return Math.max(0.05, examWeight(skillId, exams)) * gap * (1 + 0.25 * unlocks);
}

/** Prerequisite-respecting order, highest need first among the skills that are ready. */
export function orderSkills(ids: string[], exams: Profile['exams'], states: States): string[] {
  const among = new Set(ids);
  const placed = new Set<string>();
  const out: string[] = [];
  const pending = new Set(ids);
  while (pending.size) {
    const ready = [...pending].filter((id) => SKILL_BY_ID[id].prereqs.every((p) => !among.has(p) || placed.has(p)));
    if (ready.length === 0) throw new Error('orderSkills: prerequisite cycle');
    ready.sort((a, b) => needScore(b, exams, states, among) - needScore(a, exams, states, among));
    const next = ready[0];
    out.push(next);
    placed.add(next);
    pending.delete(next);
  }
  return out;
}

function trackLabel(skillIds: string[]): string {
  if (skillIds.length === 0) return 'reviews and checkpoints';
  const tracks = [...new Set(skillIds.map((id) => SKILL_BY_ID[id].track))];
  const names = tracks.map((t) => TRACKS.find((x) => x.id === t)!.name.toLowerCase());
  return names.length === 1 ? `${names[0]} foundations` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Build (or rebuild) the plan. Pass the original start date when re-planning so
 * week numbers continue and checkpoints stay on their three-week rhythm.
 */
export function buildPlan(profile: Profile, states: States, now: number, startedOn?: string): JourneyPlan {
  const selected = selectSkills(profile.exams);
  const open = selected.filter((id) => stateOf(states, id).status !== 'secure');
  const order = orderSkills(open, profile.exams, states);

  const weeklyNew = Math.max(10, profile.minutesPerDay * profile.daysPerWeek * NEW_SHARE);
  const today = startOfDay(now);
  const origin = startedOn ? parseDay(startedOn) : today;
  const offset = startedOn ? Math.max(0, Math.floor(wholeDays(origin, today) / 7)) : 0;
  const rolling = !profile.testDate;
  const weeksAvailable = rolling ? Infinity : Math.max(1, Math.floor(wholeDays(today, parseDay(profile.testDate!)) / 7));

  const need = Object.fromEntries(order.map((id) => [id, minutesForGap(1 - masteryEstimate(stateOf(states, id).rating))]));
  const totalNeed = order.reduce((a, id) => a + need[id], 0);

  // Narrower-scope default when the full order does not fit before the test.
  let kept = order;
  let dropped: string[] = [];
  const capacity = weeksAvailable * weeklyNew;
  if (totalNeed > capacity) {
    let used = 0;
    kept = [];
    for (const id of order) {
      if (used + need[id] > capacity) continue;
      if (SKILL_BY_ID[id].prereqs.some((p) => order.includes(p) && !kept.includes(p))) continue;
      kept.push(id);
      used += need[id];
    }
    dropped = order.filter((id) => !kept.includes(id));
  }

  // Pour skills into weeks; a skill that does not fit carries into the next week.
  const weeks: PlanWeek[] = [];
  let week: PlanWeek | null = null;
  const openWeek = () => {
    const index = offset + weeks.length;
    week = { index, startsOn: dayKey(addCalendarDays(origin, 7 * index)), skills: [], newMinutes: 0, checkpoint: false, secureTargets: [] };
    weeks.push(week);
  };
  openWeek();
  for (const id of kept) {
    let left = need[id];
    while (left > 0) {
      const w = week! as PlanWeek;
      const room = weeklyNew - w.newMinutes;
      if (room <= 0.5) {
        openWeek();
        continue;
      }
      const take = Math.min(room, left);
      if (!w.skills.includes(id)) w.skills.push(id);
      w.newMinutes += take;
      left -= take;
      if (left <= 0) w.secureTargets.push(id);
    }
  }
  if (weeks.length > 1 && weeks[weeks.length - 1].skills.length === 0) weeks.pop();
  weeks.forEach((w, i) => {
    w.newMinutes = Math.round(w.newMinutes);
    w.checkpoint = (w.index + 1) % CHECKPOINT_EVERY === 0 || (i === weeks.length - 1 && w.index > 0);
  });

  const fits = dropped.length === 0;
  const alternatives: PlanAlternative[] = [];
  if (!fits && Number.isFinite(weeksAvailable)) {
    const perDay = Math.ceil(totalNeed / (weeksAvailable * profile.daysPerWeek * NEW_SHARE) / 5) * 5;
    alternatives.push({ kind: 'more-time', minutesPerDay: perDay });
    alternatives.push({ kind: 'narrower', keep: kept.length });
    const weeksNeeded = Math.ceil(totalNeed / weeklyNew);
    alternatives.push({ kind: 'later-date', date: dayKey(addCalendarDays(today, 7 * weeksNeeded)) });
  }

  const examLabel = profile.exams.length ? profile.exams.map((e) => EXAMS.find((x) => x.id === e)!.name).join(' and ') + ' ' : '';
  const first = weeks[0]?.skills ?? [];
  const totalWeeks = offset + weeks.length;
  const summary = order.length === 0
    ? `Every skill in your plan is Secure. Keep them fresh with reviews and checkpoints.`
    : rolling
      ? `Your rolling ${examLabel}Quant plan: ${profile.daysPerWeek} sessions a week, ${profile.minutesPerDay} minutes each, with new goals each month. Week ${offset + 1}: ${trackLabel(first)}.`
      : `Your ${totalWeeks}-week ${examLabel}Quant plan: ${profile.daysPerWeek} sessions a week, ${profile.minutesPerDay} minutes each. Week ${offset + 1}: ${trackLabel(first)}.`;

  return {
    version: 1,
    createdAt: now,
    startedOn: dayKey(origin),
    exams: profile.exams,
    testDate: profile.testDate,
    rolling,
    weeks,
    order,
    dropped,
    sessionsPerWeek: profile.daysPerWeek,
    minutesPerSession: profile.minutesPerDay,
    fits,
    alternatives,
    summary,
  };
}

export function currentWeek(plan: JourneyPlan, now: number): PlanWeek | undefined {
  if (plan.weeks.length === 0) return undefined;
  const start = parseDay(plan.startedOn ?? plan.weeks[0].startsOn);
  const idx = Math.floor(wholeDays(start, now) / 7);
  const exact = plan.weeks.find((w) => w.index === idx);
  if (exact) return exact;
  return idx < plan.weeks[0].index ? plan.weeks[0] : plan.weeks[plan.weeks.length - 1];
}

/** Week number of the plan's final week (1-based). */
export const lastWeekNumber = (plan: JourneyPlan) => (plan.weeks.length ? plan.weeks[plan.weeks.length - 1].index + 1 : 0);

/** Today's target skills: this week's unsecured skills, else the next unsecured skill in order. */
export function todaysTargets(plan: JourneyPlan | undefined, states: States, now: number): string[] {
  if (!plan) return [];
  const w = currentWeek(plan, now);
  const open = (w?.skills ?? []).filter((id) => stateOf(states, id).status !== 'secure');
  if (open.length) return open;
  return plan.order.filter((id) => stateOf(states, id).status !== 'secure').slice(0, 2);
}

/** Missed days stretch the plan; fast progress pulls later topics forward. */
export function replanIfDue(plan: JourneyPlan | undefined, profile: Profile, states: States, now: number): JourneyPlan | undefined {
  if (!plan) return plan;
  if (wholeDays(plan.createdAt, now) < 7) return plan;
  return buildPlan(profile, states, now, plan.startedOn ?? plan.weeks[0]?.startsOn);
}

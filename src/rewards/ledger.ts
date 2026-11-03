/**
 * Tokens and the weekly goal. Tokens are the one spendable balance (a ledger in
 * state, so two devices add up instead of overwriting each other). They are
 * earned by finishing sessions, the daily puzzle and a weekly goal, and spent
 * only on bonus runs. Nothing here touches learning evidence (engine/mastery.ts).
 *
 * Every entry has a stable id derived from the event that earned it, so a retry,
 * a restart or two devices syncing can never pay twice. Pure: unit-tested.
 */
import { DAY_MS, dayKey } from '../engine/time';
import type { TokenEntry } from '../state/types';

export const tokenBalance = (ledger: TokenEntry[]) => ledger.reduce((n, e) => n + e.delta, 0);

// ------------------------------------------------------------------ weekly goal

/** Days with learning in a week (Monday to Sunday) count toward a forgiving weekly goal. */
export const WEEKLY_TARGET_DAYS = 4;
export const WEEKLY_REWARD = 10;

/** The Monday that starts the week containing `ts`, as YYYY-MM-DD. Weeks are keyed by it. */
export function weekKey(ts: number): string {
  const d = new Date(ts);
  d.setHours(12, 0, 0, 0);
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return dayKey(d.getTime());
}

export function weeklyProgress(activityDays: Iterable<string>, now: number, target = WEEKLY_TARGET_DAYS) {
  const key = weekKey(now);
  const days = new Set<string>();
  for (const day of activityDays) {
    const [y, m, dd] = day.split('-').map(Number);
    if (weekKey(new Date(y, m - 1, dd, 12).getTime()) === key) days.add(day);
  }
  return { week: key, days: days.size, target, met: days.size >= target, daysLeft: 7 - Math.round((now - new Date(`${key}T00:00:00`).getTime()) / DAY_MS) };
}

/** Every week (by its Monday) with at least `target` learning days. */
export function weeksMet(activityDays: Iterable<string>, target = WEEKLY_TARGET_DAYS): string[] {
  const byWeek = new Map<string, Set<string>>();
  for (const day of activityDays) {
    const [y, m, dd] = day.split('-').map(Number);
    const week = weekKey(new Date(y, m - 1, dd, 12).getTime());
    byWeek.set(week, (byWeek.get(week) ?? new Set()).add(day));
  }
  return [...byWeek].filter(([, days]) => days.size >= target).map(([week]) => week).sort();
}

/** Token entry for meeting a week's goal; its id makes it once per week, on any number of devices. */
export const weeklyRewardEntry = (week: string, at: number): TokenEntry => ({ id: `weekly:${week}`, delta: WEEKLY_REWARD, reason: 'weekly', at });

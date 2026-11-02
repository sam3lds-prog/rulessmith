/**
 * Rewards. Three kinds of progress stay separate:
 * - learning evidence (engine/mastery.ts): the only thing that says what a learner knows;
 * - the cosmetic collection (grants here): objects in the workshop;
 * - Workshop Coins (the token ledger in state): the one spendable balance.
 *
 * Every grant has a stable id derived from the event that earned it, so a
 * retry, a restart, a migration or two devices syncing can never grant twice.
 * Pure: unit-tested.
 */
import { DAY_MS, dayKey } from '../engine/time';
import type { TokenEntry } from '../state/types';
import { CATALOG_VERSION, ITEM_BY_ID, ITEMS, type WorkshopItem } from '../world/catalog';

export interface Grant {
  /** `item:<itemId>`: an object is granted at most once, whatever earned it. */
  id: string;
  itemId: string;
  /** The event that earned it, e.g. `mission:gate-1`, `purchase`, `weekly:2026-W45`. */
  source: string;
  at: number;
  catalogVersion: number;
}

export const grantId = (itemId: string) => `item:${itemId}`;

export const owned = (grants: Grant[]) => new Set(grants.map((g) => g.itemId));

/** Add a grant unless the object is already owned. Returns the same array when nothing changed. */
export function grantOnce(grants: Grant[], itemId: string, source: string, at: number): Grant[] {
  if (!ITEM_BY_ID[itemId] || grants.some((g) => g.id === grantId(itemId))) return grants;
  return [...grants, { id: grantId(itemId), itemId, source, at, catalogVersion: CATALOG_VERSION }];
}

export const coinBalance = (ledger: TokenEntry[]) => ledger.reduce((n, e) => n + e.delta, 0);

/**
 * Buy an object with coins. The spend has a stable id (`buy:<itemId>`), so two
 * devices buying the same object spend once. Returns null if it can't be bought.
 */
export function buy(
  ledger: TokenEntry[],
  grants: Grant[],
  itemId: string,
  now: number,
): { ledger: TokenEntry[]; grants: Grant[] } | null {
  const item = ITEM_BY_ID[itemId];
  if (!item || item.earn.kind !== 'coins') return null;
  if (owned(grants).has(itemId)) return null;
  if (coinBalance(ledger) < item.earn.cost) return null;
  const spend: TokenEntry = { id: `buy:${itemId}`, delta: -item.earn.cost, reason: 'purchase', at: now };
  return { ledger: ledger.some((e) => e.id === spend.id) ? ledger : [...ledger, spend], grants: grantOnce(grants, itemId, 'purchase', now) };
}

/** Objects whose earn rule is now met but not yet granted (milestones that follow from missions or weekly goals). */
export function milestoneGrants(grants: Grant[], missionsDone: number, weeklyGoalsMet: number, now: number): Grant[] {
  let out = grants;
  for (const item of ITEMS) {
    if (item.earn.kind === 'missions' && missionsDone >= item.earn.count) out = grantOnce(out, item.id, `missions:${item.earn.count}`, now);
    if (item.earn.kind === 'weekly' && weeklyGoalsMet > 0) out = grantOnce(out, item.id, 'weekly', now);
  }
  return out;
}

/** Progress toward an object, for the "current project" card. */
export function projectProgress(
  item: WorkshopItem,
  ctx: { grants: Grant[]; coins: number; missionsDone: number; missionDone: (id: string) => boolean; weeklyGoalsMet: number },
): { done: number; of: number; text: string; earned: boolean } {
  const earned = owned(ctx.grants).has(item.id);
  switch (item.earn.kind) {
    case 'mission':
      return { done: earned ? 1 : 0, of: 1, text: earned ? 'Earned' : 'Finish its mission', earned };
    case 'missions': {
      const done = Math.min(item.earn.count, ctx.missionsDone);
      return { done, of: item.earn.count, text: `${done} of ${item.earn.count} missions`, earned };
    }
    case 'weekly':
      return { done: ctx.weeklyGoalsMet > 0 ? 1 : 0, of: 1, text: earned ? 'Earned' : 'Reach your weekly goal', earned };
    case 'coins': {
      const done = Math.min(item.earn.cost, Math.max(0, ctx.coins));
      return { done, of: item.earn.cost, text: earned ? 'Yours' : `${done} of ${item.earn.cost} coins`, earned };
    }
  }
}

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

/** Coin entry for meeting a week's goal; its id makes it once per week, on any number of devices. */
export const weeklyRewardEntry = (week: string, at: number): TokenEntry => ({ id: `weekly:${week}`, delta: WEEKLY_REWARD, reason: 'weekly', at });

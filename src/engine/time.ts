export const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as local midnight. */
export function parseDay(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export const addDays = (ts: number, days: number) => ts + days * DAY_MS;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Add calendar days (safe across daylight-saving changes, unlike adding milliseconds). */
export function addCalendarDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Whole calendar days from a to b, rounded so a daylight-saving hour never loses a day. */
export const wholeDays = (a: number, b: number) => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);

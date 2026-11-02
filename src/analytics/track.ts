/**
 * Analytics events for the weekly cohort dashboard (activation, day-7 return,
 * week-4 use, download-to-paid, refunds, content defects). Events are queued in
 * memory and logged in development. Connect a provider in Phase 4; send no
 * identifiers for anyone under 18 (policyFor(...).analyticsIdentifiers).
 */
export type EventName =
  | 'try_puzzle_answered'
  | 'profile_completed'
  | 'placement_completed'
  | 'placement_skipped'
  | 'plan_created'
  | 'plan_saved'
  | 'session_started'
  | 'item_answered'
  | 'session_completed'
  | 'mission_activated'
  | 'skill_secured'
  | 'daily_answered'
  | 'paywall_viewed'
  | 'purchase_completed'
  | 'restore_completed'
  | 'ad_slot_rendered'
  | 'content_reported'
  | 'runs_exhausted';

type Props = Record<string, string | number | boolean | undefined>;

const queue: { name: EventName; props: Props; at: number }[] = [];

declare const __DEV__: boolean;

export function track(name: EventName, props: Props = {}) {
  queue.push({ name, props, at: Date.now() });
  if (queue.length > 200) queue.shift();
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.log(`[track] ${name}`, props);
}

export const recentEvents = () => [...queue];

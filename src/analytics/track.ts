/**
 * Analytics events for the weekly cohort dashboard (activation, day-7 return,
 * week-4 use, download-to-paid, refunds, content defects).
 *
 * Events wait in a queue that is saved on the device (analytics/pipeline.ts)
 * and uploaded in batches to the Supabase `events` table. An event leaves the
 * queue only after the server accepts it. Pure: storage and upload are plugged
 * in, so the queue is unit-tested.
 *
 * Identifiers (install id, user id) are attached only when the age policy
 * allows them (policyFor(...).analyticsIdentifiers): never for anyone under 18,
 * and never before the learner has said they are an adult.
 */
import { CONTENT_VERSION } from '../content';
import { newId } from '../engine/ids';
import type { AgeBand } from '../engine/types';
import { policyFor } from '../policy/age';

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
  | 'runs_exhausted'
  | 'slot_replaced'
  | 'quest_started'
  | 'quest_completed'
  | 'quiz_started'
  | 'quiz_submitted'
  | 'quiz_review_opened'
  | 'game_variant_played'
  | 'first_meaningful_action'
  | 'support_revealed'
  | 'project_selected'
  | 'project_revealed'
  | 'review_returned'
  | 'guest_imported'
  | 'signed_out'
  | 'events_dropped';

type Props = Record<string, string | number | boolean | undefined>;

export interface QueuedEvent {
  id: string;
  name: EventName;
  props: Props;
  at: number;
  ageBand?: AgeBand;
  installId?: string;
  userId?: string;
  contentVersion: string;
}

/** The queue never grows past this. Oldest events go first, and the loss is itself reported. */
export const QUEUE_CAP = 2000;
export const BATCH_SIZE = 100;

let queue: QueuedEvent[] = [];
let dropped = 0;
let context: { ageBand?: AgeBand; userId?: string; installId?: string } = {};
let onChange: ((q: QueuedEvent[]) => void) | null = null;

declare const __DEV__: boolean;

/** Who the events are about. Identifiers are kept only if the age policy allows them. */
export function setAnalyticsContext(patch: Partial<typeof context>) {
  context = { ...context, ...patch };
}

/** Called by the pipeline with the saved queue at launch; events tracked before loading are kept after it. */
export function loadQueue(saved: QueuedEvent[]) {
  const ids = new Set(queue.map((e) => e.id));
  queue = [...saved.filter((e) => !ids.has(e.id)), ...queue].slice(-QUEUE_CAP);
}

export function onQueueChange(cb: ((q: QueuedEvent[]) => void) | null) {
  onChange = cb;
}

export function track(name: EventName, props: Props = {}) {
  const allowIds = policyFor(context.ageBand).analyticsIdentifiers;
  queue.push({
    id: newId(),
    name,
    props,
    at: Date.now(),
    ageBand: context.ageBand,
    installId: allowIds ? context.installId : undefined,
    userId: allowIds ? context.userId : undefined,
    contentVersion: CONTENT_VERSION,
  });
  if (queue.length > QUEUE_CAP) {
    dropped += queue.length - QUEUE_CAP;
    queue = queue.slice(-QUEUE_CAP);
  }
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.log(`[track] ${name}`, props);
  onChange?.(queue);
}

export const recentEvents = () => [...queue];
export const queuedCount = () => queue.length;

/** Remove events (after "Delete my data", for example). */
export function discardEvents(pred: (e: QueuedEvent) => boolean) {
  queue = queue.filter((e) => !pred(e));
  onChange?.(queue);
}

let flushing: Promise<number> | null = null;

/**
 * Upload queued events in batches. `send` must resolve only when the server
 * has stored the batch; on failure the batch stays queued for next time.
 * Returns how many events were accepted.
 */
export function flushEvents(send: (batch: QueuedEvent[]) => Promise<void>): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    if (dropped > 0) {
      const n = dropped;
      dropped = 0;
      track('events_dropped', { count: n });
    }
    while (queue.length) {
      const batch = queue.slice(0, BATCH_SIZE);
      try {
        await send(batch);
      } catch {
        break;
      }
      const ids = new Set(batch.map((e) => e.id));
      queue = queue.filter((e) => !ids.has(e.id));
      sent += batch.length;
      onChange?.(queue);
    }
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Test hook. */
export function resetQueueForTests() {
  queue = [];
  dropped = 0;
  context = {};
  onChange = null;
  flushing = null;
}

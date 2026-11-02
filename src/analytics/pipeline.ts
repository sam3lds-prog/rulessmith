/**
 * Wires the event queue (analytics/track.ts) to the device and the server:
 * the queue is saved to AsyncStorage on every change (coalesced) and uploaded
 * to Supabase in batches at launch, every minute, when the app goes to the
 * background, and after a session. Without Supabase configured the queue still
 * persists (capped), so nothing is lost before the backend exists.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { cloudConfigured, sendEvents } from '../data/cloud';
import { newId } from '../engine/ids';
import { flushEvents, loadQueue, onQueueChange, recentEvents, setAnalyticsContext, type QueuedEvent } from './track';

const QUEUE_KEY = 'rulesmith:events';
const INSTALL_KEY = 'rulesmith:install-id';

let started = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let latest: QueuedEvent[] = [];

const canStore = () => !(Platform.OS === 'web' && typeof window === 'undefined');

function saveSoon(q: QueuedEvent[]) {
  latest = q;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(latest)).catch(() => undefined);
  }, 500);
}

export async function startAnalytics() {
  if (started || !canStore()) return;
  started = true;
  try {
    let installId = await AsyncStorage.getItem(INSTALL_KEY);
    if (!installId) {
      installId = newId();
      await AsyncStorage.setItem(INSTALL_KEY, installId);
    }
    setAnalyticsContext({ installId });
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (raw) loadQueue(JSON.parse(raw) as QueuedEvent[]);
  } catch {
    // A damaged queue is dropped; tracking carries on.
  }
  latest = recentEvents();
  onQueueChange(saveSoon);
  // Events tracked before the saved queue loaded are part of it now; save them.
  saveSoon(latest);
  setInterval(() => void uploadEvents(), 60_000);
  void uploadEvents();
}

/** Send what is queued. Safe to call often; concurrent calls share one upload. */
export async function uploadEvents() {
  if (!started || !cloudConfigured()) return 0;
  return flushEvents(sendEvents);
}

/** Write the queue now (app going to the background). */
export function saveEventsNow() {
  if (!started) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  void AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(latest)).catch(() => undefined);
}

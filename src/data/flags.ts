/**
 * The remote kill switch. A template id in the Supabase `disabled_templates`
 * table is never served, from the next refresh on, without an app release.
 *
 * The list is cached on the device, so it still applies offline and from the
 * first frame after launch. It is refreshed at launch and when the app comes
 * back to the foreground (at most every few minutes).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { remoteDisabledTemplates, setRemoteDisabledTemplates } from '../content';
import { cloudConfigured, fetchDisabledTemplates } from './cloud';

const KEY = 'rulesmith:disabled-templates';
const MIN_REFRESH_MS = 5 * 60 * 1000;
let lastFetch = 0;

const canStore = () => !(Platform.OS === 'web' && typeof window === 'undefined');

/** Apply the cached list. Returns true when it changed what is served. */
export async function loadCachedFlags(): Promise<boolean> {
  if (!canStore()) return false;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return false;
    const { ids } = JSON.parse(raw) as { ids: string[] };
    return apply(ids);
  } catch {
    return false;
  }
}

/** Fetch the list. Returns true when it changed what is served. Offline or unconfigured: keeps the cached list. */
export async function refreshFlags(force = false): Promise<boolean> {
  if (!cloudConfigured() || !canStore()) return false;
  if (!force && Date.now() - lastFetch < MIN_REFRESH_MS) return false;
  lastFetch = Date.now();
  try {
    const ids = await fetchDisabledTemplates();
    await AsyncStorage.setItem(KEY, JSON.stringify({ ids, fetchedAt: Date.now() }));
    return apply(ids);
  } catch {
    return false;
  }
}

function apply(ids: string[]): boolean {
  const before = remoteDisabledTemplates().sort().join(',');
  setRemoteDisabledTemplates(ids);
  return before !== [...ids].sort().join(',');
}

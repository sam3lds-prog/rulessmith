/**
 * Storage buckets. Each learner's data is saved under its own keys:
 *
 *   rulesmith:owner              which bucket is open: "guest" or an account's user id
 *   rulesmith:guest              the guest on this device (no account)
 *   rulesmith:user:<id>          one signed-in account
 *   ...:attempts                 that bucket's attempt log, saved separately because it is the big part
 *
 * Signing out closes the account's bucket and opens the guest's; signing in
 * does the reverse. Nothing carries between buckets except device-level keys
 * (state/types.ts DEVICE_KEYS) and, only when the learner chooses it, a guest
 * import (sync/merge.ts importGuest).
 *
 * Pure: storage is passed in, so this is unit-tested with an in-memory store.
 */
import type { Attempt } from '../engine/types';
import { migrateData, STATE_VERSION } from './migrate';
import { pickData, type Data } from './types';

export interface KV {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const GUEST = 'guest';
export const OWNER_KEY = 'rulesmith:owner';
/** The single key v1 saved everything under (zustand persist). */
export const LEGACY_KEY = 'rulesmith-v1';

export const bucketKey = (owner: string) => (owner === GUEST ? 'rulesmith:guest' : `rulesmith:user:${owner}`);
export const attemptsKey = (owner: string) => `${bucketKey(owner)}:attempts`;

/** The bucket without its attempt log, in the saved format. */
export function encodeState(d: Data): string {
  const { attempts: _attempts, ...rest } = pickData(d);
  return JSON.stringify({ version: STATE_VERSION, state: rest });
}

export const encodeAttempts = (attempts: Attempt[]) => JSON.stringify({ version: STATE_VERSION, attempts });

/** Parse and migrate a saved bucket. Undefined when nothing (or nothing readable) is saved. */
export function decodeBucket(stateRaw: string | null, attemptsRaw: string | null): Data | undefined {
  if (!stateRaw) return undefined;
  let parsed: { version?: number; state?: Record<string, unknown> };
  try {
    parsed = JSON.parse(stateRaw);
  } catch {
    return undefined;
  }
  if (!parsed?.state) return undefined;
  const version = typeof parsed.version === 'number' ? parsed.version : 1;
  const state: Record<string, unknown> = { ...parsed.state };
  if (attemptsRaw) {
    try {
      const a = JSON.parse(attemptsRaw);
      if (Array.isArray(a?.attempts)) state.attempts = a.attempts;
    } catch {
      // A damaged attempt log leaves skills (already derived) intact; the server copy restores it on the next sync.
    }
  }
  return migrateData(state, version);
}

export async function readBucket(kv: KV, owner: string): Promise<Data | undefined> {
  const [s, a] = await Promise.all([kv.getItem(bucketKey(owner)), kv.getItem(attemptsKey(owner))]);
  return decodeBucket(s, a);
}

export async function writeBucket(kv: KV, owner: string, d: Data, opts: { attempts?: boolean } = {}) {
  await kv.setItem(bucketKey(owner), encodeState(d));
  if (opts.attempts !== false) await kv.setItem(attemptsKey(owner), encodeAttempts(d.attempts));
}

export async function clearBucket(kv: KV, owner: string) {
  await kv.removeItem(bucketKey(owner));
  await kv.removeItem(attemptsKey(owner));
}

/**
 * Open the right bucket at launch. A v1 install is moved into a bucket first:
 * an account that was signed in goes to that account's bucket, anything else to the guest's.
 */
export async function openAtLaunch(kv: KV): Promise<{ owner: string; data?: Data }> {
  const owner = await kv.getItem(OWNER_KEY);
  if (owner) return { owner, data: await readBucket(kv, owner) };
  const legacy = await kv.getItem(LEGACY_KEY);
  if (!legacy) {
    await kv.setItem(OWNER_KEY, GUEST);
    return { owner: GUEST };
  }
  const data = decodeBucket(legacy, null);
  const legacyOwner = data && data.account.mode === 'cloud' && data.account.userId ? data.account.userId : GUEST;
  if (data) await writeBucket(kv, legacyOwner, data);
  await kv.setItem(OWNER_KEY, legacyOwner);
  await kv.removeItem(LEGACY_KEY);
  return { owner: legacyOwner, data };
}

/**
 * Coalesces saves. The store calls `schedule` on every change; the bucket is
 * written at most every `delayMs`, and `flush` writes immediately (on
 * background, before switching learner). The target bucket is read when the
 * write happens, together with the state, so a write can never land in another
 * learner's bucket.
 */
export function createSaver(kv: KV, read: () => { owner: string | null; data: Data }, delayMs = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let lastAttempts: { owner: string; ref: Attempt[] } | null = null;
  const writeNow = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const { owner, data } = read();
    if (!owner) return chain;
    const attemptsChanged = !lastAttempts || lastAttempts.owner !== owner || lastAttempts.ref !== data.attempts;
    lastAttempts = { owner, ref: data.attempts };
    chain = chain.then(() => writeBucket(kv, owner, data, { attempts: attemptsChanged })).catch(() => undefined);
    return chain;
  };
  return {
    schedule() {
      if (!timer) timer = setTimeout(writeNow, delayMs);
    },
    flush: writeNow,
    /** Forget which attempt log was last written (after a bucket is cleared). */
    reset() {
      lastAttempts = null;
    },
  };
}

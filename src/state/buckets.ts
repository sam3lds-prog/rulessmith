/**
 * Storage buckets. Each learner's data is saved under its own keys:
 *
 *   rulesmith:owner              which bucket is open: "guest" or an account's user id
 *   rulesmith:guest              the guest on this device (no account)
 *   rulesmith:user:<id>          one signed-in account
 *   ...:attempts                 that bucket's attempt log and its upload outbox, saved together
 *                                in one write, separately from the rest because it is the big part
 *
 * Signing out closes the account's bucket and opens the guest's; signing in
 * does the reverse. Nothing carries between buckets except device-level keys
 * (state/types.ts DEVICE_KEYS) and, only when the learner chooses it, a guest
 * import (sync/merge.ts importGuest).
 *
 * Pure: storage is passed in, so this is unit-tested with an in-memory store.
 */
import type { Attempt } from '../engine/types';
import { rebuildSkills } from '../sync/merge';
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

/**
 * The bucket without its attempt log, in the saved format. `attemptCount`
 * records how many attempts the skill states reflect, so a launch after a
 * half-finished save can tell they are behind and rebuild them.
 */
export function encodeState(d: Data): string {
  const { attempts: _attempts, ...rest } = pickData(d);
  return JSON.stringify({ version: STATE_VERSION, attemptCount: d.attempts.length, state: rest });
}

/** The attempt log with its upload outbox: one write, so an attempt and its place in the outbox are never saved apart. */
export const encodeAttempts = (d: Pick<Data, 'attempts' | 'outbox'>) => JSON.stringify({ version: STATE_VERSION, attempts: d.attempts, outbox: d.outbox.attempts });

/** Parse and migrate a saved bucket. Undefined when nothing (or nothing readable) is saved. */
export function decodeBucket(stateRaw: string | null, attemptsRaw: string | null): Data | undefined {
  if (!stateRaw) return undefined;
  let parsed: { version?: number; attemptCount?: number; state?: Record<string, unknown> };
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
      if (Array.isArray(a?.outbox)) state.outbox = { ...((state.outbox as object) ?? {}), attempts: a.outbox };
    } catch {
      // A damaged attempt log leaves skills (already derived) intact; the server copy restores it on the next sync.
    }
  }
  const data = migrateData(state, version);
  // The attempt log was saved but the rest wasn't (the app stopped between the two writes): bring skills up to date.
  if (typeof parsed.attemptCount === 'number' && parsed.attemptCount !== data.attempts.length) {
    data.skills = rebuildSkills(data.attempts, data.placementRuns, data.baseline);
  }
  return data;
}

export async function readBucket(kv: KV, owner: string): Promise<Data | undefined> {
  const [s, a] = await Promise.all([kv.getItem(bucketKey(owner)), kv.getItem(attemptsKey(owner))]);
  return decodeBucket(s, a);
}

/** Attempts (with the outbox) first, then the rest. If the first write fails the second is not attempted. */
export async function writeBucket(kv: KV, owner: string, d: Data, opts: { attempts?: boolean } = {}) {
  if (opts.attempts !== false) await kv.setItem(attemptsKey(owner), encodeAttempts(d));
  await kv.setItem(bucketKey(owner), encodeState(d));
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
 *
 * A write that fails is reported through `onError` and retried at the next
 * save: the attempt log is only marked written once the write succeeded, and
 * the rest of the bucket is not written after a failed attempt-log write.
 */
export function createSaver(
  kv: KV,
  read: () => { owner: string | null; data: Data },
  opts: { delayMs?: number; onError?: (e: unknown) => void } = {},
) {
  const delayMs = opts.delayMs ?? 300;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let written: { owner: string; attempts: Attempt[]; outbox: string[] } | null = null;
  const writeNow = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const { owner, data } = read();
    if (!owner) return chain;
    chain = chain.then(async () => {
      const attemptsChanged = !written || written.owner !== owner || written.attempts !== data.attempts || written.outbox !== data.outbox.attempts;
      try {
        await writeBucket(kv, owner, data, { attempts: attemptsChanged });
        if (attemptsChanged) written = { owner, attempts: data.attempts, outbox: data.outbox.attempts };
        opts.onError?.(undefined);
      } catch (e) {
        opts.onError?.(e);
      }
    });
    return chain;
  };
  return {
    schedule() {
      if (!timer) timer = setTimeout(writeNow, delayMs);
    },
    flush: writeNow,
    /** Forget which attempt log was last written (after a bucket is cleared). */
    reset() {
      written = null;
    },
  };
}

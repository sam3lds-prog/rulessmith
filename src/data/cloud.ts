/**
 * Optional cloud sync with Supabase. The app is local-first: without
 * EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY nothing here runs,
 * and progress stays on the device.
 *
 * Sign-in is a 6-digit email code (no deep links). In the Supabase dashboard,
 * edit the "Magic Link" email template to include {{ .Token }}.
 *
 * Sync model (see sync/merge.ts and state/store.ts `syncNow`):
 * - attempts upload from an outbox and are acknowledged by id; they are never
 *   overwritten or dropped, and pulls fetch only rows received since the last pull;
 * - the snapshot (profile, plan, ledgers) is pulled, merged and pushed back, so
 *   two devices converge instead of one overwriting the other.
 * Minors never get an account (policy/age.ts).
 */
import './polyfills';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import type { QueuedEvent } from '../analytics/track';
import { config } from '../config';
import type { Attempt } from '../engine/types';
import { SNAPSHOT_VERSION, type Synced } from '../sync/merge';
import { fromAttemptRow, pullFrom, toAttemptRow, toReportRow, type AttemptRow } from '../sync/rows';
import type { ContentReport } from '../state/types';

let client: SupabaseClient | null = null;

export const cloudConfigured = () => Boolean(config.supabaseUrl && config.supabaseAnonKey);

function supabase(): SupabaseClient {
  if (!cloudConfigured()) throw new Error('Cloud sync is not configured');
  if (Platform.OS === 'web' && typeof window === 'undefined') throw new Error('Cloud sync runs in the browser only');
  if (!client) {
    client = createClient(config.supabaseUrl!, config.supabaseAnonKey!, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    });
  }
  return client;
}

export async function sendCode(email: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function verifyCode(email: string, token: string): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const { data, error } = await supabase().auth.verifyOtp({ email, token, type: 'email' });
  if (error || !data.user) return { ok: false, error: error?.message ?? 'That code did not work. Request a new one.' };
  return { ok: true, userId: data.user.id };
}

/** The user id of the saved Supabase session, if any. */
export async function sessionUserId(): Promise<string | undefined> {
  const { data } = await supabase().auth.getSession();
  return data.session?.user.id;
}

export async function signOut() {
  await supabase().auth.signOut({ scope: 'local' });
}

// ------------------------------------------------------------------ snapshot

export interface RemoteSnapshot {
  state: Record<string, unknown>;
  /** Compare-and-set token: pass it back to pushSnapshot. */
  version: number;
}

export async function pullSnapshot(userId: string): Promise<RemoteSnapshot | null> {
  const { data, error } = await supabase().from('learner_state').select('state, version').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { state: data.state as Record<string, unknown>, version: Number(data.version ?? 0) };
}

/**
 * Store the merged snapshot, but only if nobody else has since the pull
 * (`expected` is the version pulled, or null if there was no row). Resolves
 * false on a conflict: pull, merge and try again.
 */
export async function pushSnapshot(userId: string, ageBand: string, snapshot: Synced, attemptCount: number, expected: number | null): Promise<boolean> {
  const row = {
    user_id: userId,
    age_band: ageBand,
    state: { v: SNAPSHOT_VERSION, ...snapshot },
    attempt_count: attemptCount,
    updated_at: new Date().toISOString(),
    version: (expected ?? 0) + 1,
  };
  if (expected === null) {
    const { error } = await supabase().from('learner_state').insert(row);
    if (error?.code === '23505') return false;
    if (error) throw new Error(error.message);
    return true;
  }
  const { data, error } = await supabase().from('learner_state').update(row).eq('user_id', userId).eq('version', expected).select('version');
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

// ------------------------------------------------------------------ attempts

const PAGE = 1000;

/** Attempts received by the server since `cursor` (with an overlap), oldest first. Returns the new cursor. */
export async function pullAttempts(userId: string, cursor: string | undefined): Promise<{ attempts: Attempt[]; cursor: string | undefined }> {
  const from = pullFrom(cursor);
  const out: Attempt[] = [];
  let newest = cursor;
  for (let page = 0; ; page++) {
    let q = supabase().from('attempts').select('*').eq('user_id', userId);
    if (from) q = q.gte('received_at', from);
    const { data, error } = await q.order('received_at', { ascending: true }).order('attempt_id').range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as AttemptRow[];
    for (const r of rows) {
      out.push(fromAttemptRow(r));
      if (r.received_at && (!newest || r.received_at > newest)) newest = r.received_at;
    }
    if (rows.length < PAGE) break;
  }
  return { attempts: out, cursor: newest };
}

/** Upload attempts. Resolves with the ids the server now holds (new or already there). */
export async function pushAttempts(userId: string, attempts: Attempt[]): Promise<string[]> {
  const acked: string[] = [];
  for (let i = 0; i < attempts.length; i += 500) {
    const chunk = attempts.slice(i, i + 500);
    const { error } = await supabase()
      .from('attempts')
      .upsert(chunk.map((a) => toAttemptRow(userId, a)), { onConflict: 'user_id,attempt_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    acked.push(...chunk.map((a) => a.id));
  }
  return acked;
}

// ------------------------------------------------------------------ reports, events, kill switch

export async function pushReports(userId: string, reports: ContentReport[]): Promise<string[]> {
  if (!reports.length) return [];
  const { error } = await supabase()
    .from('content_reports')
    .upsert(reports.map((r) => toReportRow(userId, r)), { onConflict: 'user_id,report_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return reports.map((r) => r.id);
}

/**
 * Store a batch of analytics events through the `log_events` database function
 * (idempotent by event id). Works signed out (anon key); the server keeps a
 * user_id only when it is the caller's.
 */
export async function sendEvents(batch: QueuedEvent[]) {
  const { error } = await supabase().rpc('log_events', {
    batch: batch.map((e) => ({
      id: e.id,
      name: e.name,
      props: e.props,
      occurred_at: new Date(e.at).toISOString(),
      install_id: e.installId ?? null,
      user_id: e.userId ?? null,
      age_band: e.ageBand ?? null,
      content_version: e.contentVersion,
    })),
  });
  if (error) throw new Error(error.message);
}

/** The remote kill-switch list. Readable without an account. */
export async function fetchDisabledTemplates(): Promise<string[]> {
  const { data, error } = await supabase().from('disabled_templates').select('template_id');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.template_id as string);
}

/** Deletes the auth user server-side (supabase/functions/delete-account); rows cascade. */
export async function deleteAccount() {
  const { error } = await supabase().functions.invoke('delete-account', { method: 'POST' });
  if (error) throw new Error(error.message);
  await supabase().auth.signOut({ scope: 'local' });
}

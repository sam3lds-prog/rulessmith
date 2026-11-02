/**
 * Optional cloud sync with Supabase. The app is local-first: without
 * EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY nothing here runs,
 * and progress stays on the device.
 *
 * Sign-in is a 6-digit email code (no deep links). In the Supabase dashboard,
 * edit the "Magic Link" email template to include {{ .Token }}.
 *
 * Sync model: the device writes a snapshot of its state plus the attempt log.
 * On sign-in, whichever side has more answered puzzles wins; after that the
 * device pushes after each session. Minors never get an account (policy/age.ts).
 */
import './polyfills';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { config } from '../config';
import type { Attempt } from '../engine/types';
import type { ContentReport } from '../state/store';

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

export async function signOut() {
  await supabase().auth.signOut();
}

export interface RemoteState {
  state: Record<string, unknown>;
  attemptCount: number;
  updatedAt: string;
}

export async function pullState(userId: string): Promise<RemoteState | null> {
  const { data, error } = await supabase().from('learner_state').select('state, attempt_count, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { state: data.state as Record<string, unknown>, attemptCount: data.attempt_count as number, updatedAt: data.updated_at as string };
}

export async function pushState(
  userId: string,
  ageBand: string,
  state: Record<string, unknown>,
  progress: number,
  attempts: Attempt[],
  since: number,
) {
  const db = supabase();
  const fresh = attempts.filter((a) => a.at > since);
  const { error } = await db.from('learner_state').upsert({
    user_id: userId,
    age_band: ageBand,
    state,
    attempt_count: progress,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  if (fresh.length) {
    const rows = fresh.map((a) => ({
      user_id: userId,
      item_id: a.itemId,
      skill_id: a.skillId,
      family: a.family,
      level: a.level,
      transfer: a.transfer,
      correct: a.correct,
      hint_before_answer: a.hintBeforeAnswer,
      ms: Math.round(a.ms),
      mode: a.mode,
      answered_at: new Date(a.at).toISOString(),
    }));
    const { error: e2 } = await db.from('attempts').upsert(rows, { onConflict: 'user_id,item_id,answered_at', ignoreDuplicates: true });
    if (e2) throw new Error(e2.message);
  }
  return fresh.length ? Math.max(...fresh.map((a) => a.at)) : since;
}

export async function pushReports(userId: string, reports: ContentReport[]) {
  if (!reports.length) return;
  const { error } = await supabase()
    .from('content_reports')
    .upsert(
      reports.map((r) => ({ user_id: userId, item_id: r.itemId, content_version: r.contentVersion, reason: r.reason, created_at: new Date(r.at).toISOString() })),
      { onConflict: 'user_id,item_id,created_at', ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}

/** Deletes the auth user server-side (supabase/functions/delete-account); rows cascade. */
export async function deleteAccount() {
  const { error } = await supabase().functions.invoke('delete-account', { method: 'POST' });
  if (error) throw new Error(error.message);
  await supabase().auth.signOut({ scope: 'local' });
}

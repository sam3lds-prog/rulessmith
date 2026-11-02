-- Rulesmith initial schema.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
-- Every table has row-level security: a signed-in learner can only ever reach
-- their own rows. Entitlements are written only by the server (RevenueCat
-- webhook, using the service role), never by the app.

-- ------------------------------------------------------------------ learner state
-- One row per learner: a snapshot of the app's local-first state (profile,
-- plan, skill states, streak, tokens). The app is the writer; this is the copy
-- that follows the learner to a new device.
create table if not exists public.learner_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  age_band text not null check (age_band in ('18plus', '13to17', 'under13')),
  state jsonb not null,
  attempt_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.learner_state enable row level security;

create policy "learner reads own state" on public.learner_state
  for select using (auth.uid() = user_id);
create policy "learner inserts own state" on public.learner_state
  for insert with check (auth.uid() = user_id);
create policy "learner updates own state" on public.learner_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------------ attempts
-- Every answered puzzle. Feeds the quality loop (success rate, time, hint use
-- and report rate per template family) and item-difficulty calibration.
create table if not exists public.attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null,
  skill_id text not null,
  family text not null,
  level smallint not null check (level between 1 and 10),
  transfer boolean not null default false,
  correct boolean not null,
  hint_before_answer boolean not null default false,
  ms integer not null check (ms >= 0),
  mode text not null,
  answered_at timestamptz not null,
  unique (user_id, item_id, answered_at)
);

create index if not exists attempts_family_idx on public.attempts (family, level);
create index if not exists attempts_user_idx on public.attempts (user_id, answered_at desc);

alter table public.attempts enable row level security;

create policy "learner reads own attempts" on public.attempts
  for select using (auth.uid() = user_id);
create policy "learner inserts own attempts" on public.attempts
  for insert with check (auth.uid() = user_id);

-- ------------------------------------------------------------------ content reports
-- The "Report a problem" button. item_id encodes template, level and seed, so
-- the exact puzzle can be regenerated; content_version pins the release.
create table if not exists public.content_reports (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  item_id text not null,
  content_version text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists content_reports_item_idx on public.content_reports (item_id);

alter table public.content_reports enable row level security;

create policy "learner files reports" on public.content_reports
  for insert with check (auth.uid() = user_id);
create policy "learner reads own reports" on public.content_reports
  for select using (auth.uid() = user_id);

-- ------------------------------------------------------------------ entitlements
-- Server-side truth for what a learner owns. Written by the RevenueCat webhook
-- (service role bypasses RLS). Exam Sprint is a non-renewing purchase, so its
-- expiry is tracked here and synced to every device.
create table if not exists public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  premium_until timestamptz,
  premium_product text,
  sprint_until timestamptz,
  owned_packs text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;

create policy "learner reads own entitlements" on public.entitlements
  for select using (auth.uid() = user_id);

-- ------------------------------------------------------------------ account deletion
-- Required by the App Store: learners can delete their account from inside the app.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  delete from public.attempts where user_id = uid;
  delete from public.learner_state where user_id = uid;
  delete from public.entitlements where user_id = uid;
  update public.content_reports set user_id = null where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- ------------------------------------------------------------------ quality loop view
-- Per-family, per-level stats for the weekly content review. Auto-flag families
-- whose success rate is far from the band their level predicts, or that draw reports.
create or replace view public.family_quality as
select
  a.family,
  a.level,
  count(*) as attempts,
  round(avg(case when a.correct then 1 else 0 end)::numeric, 3) as success_rate,
  round(avg(case when a.hint_before_answer then 1 else 0 end)::numeric, 3) as hint_rate,
  percentile_cont(0.5) within group (order by a.ms) as median_ms,
  (select count(*) from public.content_reports r where split_part(r.item_id, '@', 1) = a.family) as reports
from public.attempts a
group by a.family, a.level;

revoke all on public.family_quality from anon, authenticated;

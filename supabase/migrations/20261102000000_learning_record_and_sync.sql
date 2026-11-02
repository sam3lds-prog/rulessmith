-- Learning record and safe sync (milestones 1 and 2 of the Nov 2026 review).
-- Apply after 20261101000000_init.sql: `supabase db push`.
--
-- 1. attempts become the permanent learning record: a stable id from the
--    device, the learner's response, template and content versions, whether
--    the rule was on screen, and a server receipt time for incremental pulls.
-- 2. content reports get stable ids.
-- 3. events: the analytics pipeline, written only through log_events().
-- 4. disabled_templates: the remote kill switch (read-only from the app).
-- 5. Quality views split guided practice from independent checks.

-- ------------------------------------------------------------------ attempts

alter table public.attempts
  add column if not exists attempt_id text,
  add column if not exists template_id text,
  add column if not exists template_version integer not null default 0,
  add column if not exists content_version text not null default '',
  add column if not exists support text,
  add column if not exists hints_used smallint not null default 0,
  add column if not exists rule_shown boolean,
  add column if not exists response jsonb,
  add column if not exists misconception text,
  add column if not exists first_seen_at timestamptz,
  add column if not exists session_id text,
  add column if not exists received_at timestamptz not null default now();

-- Rows uploaded before ids existed get the id the app gives the same attempt
-- (state/migrate.ts legacyAttemptId), so a device re-uploading one is a no-op.
-- v1 showed the rule openly at levels 1 to 4 without counting it as help, so
-- those rows are guided; at 5 and up the rule was hidden.
update public.attempts
set
  attempt_id = 'legacy-' || floor(extract(epoch from answered_at) * 1000)::bigint || '-' || item_id,
  template_id = split_part(item_id, '@', 1),
  support = case when level <= 4 then 'guided' else 'independent' end,
  rule_shown = (level <= 4 or hint_before_answer),
  hints_used = case when hint_before_answer then 1 else 0 end
where attempt_id is null;

alter table public.attempts
  alter column attempt_id set not null,
  alter column template_id set not null,
  alter column support set not null,
  alter column rule_shown set not null;

do $$
begin
  alter table public.attempts add constraint attempts_support_check check (support in ('guided', 'independent'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.attempts add constraint attempts_hints_used_check check (hints_used >= 0);
exception when duplicate_object then null;
end $$;

-- The app merges by attempt id. The old (user, item, time) key could reject a
-- distinct attempt and is replaced.
alter table public.attempts drop constraint if exists attempts_user_id_item_id_answered_at_key;

do $$
begin
  alter table public.attempts add constraint attempts_user_attempt_key unique (user_id, attempt_id);
exception when duplicate_object or duplicate_table then null;
end $$;

create index if not exists attempts_received_idx on public.attempts (user_id, received_at);

-- received_at is the pull cursor, so only the server sets it.
create or replace function public.stamp_received_at() returns trigger
language plpgsql as $$
begin
  new.received_at := now();
  return new;
end $$;

drop trigger if exists attempts_stamp_received_at on public.attempts;
create trigger attempts_stamp_received_at before insert on public.attempts
  for each row execute function public.stamp_received_at();

-- ------------------------------------------------------------------ content reports

alter table public.content_reports add column if not exists report_id text;
update public.content_reports set report_id = 'legacy-report-' || id where report_id is null;
alter table public.content_reports alter column report_id set not null;

drop index if exists public.content_reports_dedupe_idx;

do $$
begin
  alter table public.content_reports add constraint content_reports_user_report_key unique (user_id, report_id);
exception when duplicate_object or duplicate_table then null;
end $$;

-- ------------------------------------------------------------------ events
-- Analytics events, sent signed in or not (anon key) through log_events()
-- below. Nobody reads them from the app; analysts use the service role or the
-- dashboard. user_id and install_id are present only for adults (policy/age.ts).

create table if not exists public.events (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 64),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 4096),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  install_id text check (install_id is null or char_length(install_id) <= 64),
  user_id uuid references auth.users (id) on delete cascade,
  age_band text check (age_band is null or age_band in ('18plus', '13to17', 'under13')),
  content_version text check (content_version is null or char_length(content_version) <= 64)
);

create index if not exists events_name_time_idx on public.events (name, occurred_at);
create index if not exists events_install_idx on public.events (install_id, occurred_at);
create index if not exists events_user_idx on public.events (user_id, occurred_at);

-- Row-level security on, with no policies: the app cannot read or write the
-- table directly. A plain insert policy is not enough, because a retried
-- upload needs ON CONFLICT DO NOTHING, and Postgres checks SELECT policies for
-- that, which would mean letting the app read events.
alter table public.events enable row level security;
drop policy if exists "app sends events" on public.events;

-- Stores a batch of events. Idempotent by event id, so a retried upload is
-- harmless. A user_id that is not the caller's is dropped (the event is kept
-- without it), so a queue recorded before a sign-out can still be delivered.
create or replace function public.log_events(batch jsonb) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  stored integer;
begin
  if jsonb_typeof(batch) is distinct from 'array' or jsonb_array_length(batch) > 200 then
    raise exception 'log_events takes an array of at most 200 events';
  end if;
  insert into public.events (id, name, props, occurred_at, install_id, user_id, age_band, content_version)
  select
    (e ->> 'id')::uuid,
    e ->> 'name',
    coalesce(e -> 'props', '{}'::jsonb),
    (e ->> 'occurred_at')::timestamptz,
    e ->> 'install_id',
    case when auth.uid() is not null and (e ->> 'user_id') = auth.uid()::text then auth.uid() end,
    e ->> 'age_band',
    e ->> 'content_version'
  from jsonb_array_elements(batch) as e
  on conflict (id) do nothing;
  get diagnostics stored = row_count;
  return stored;
end $$;

revoke all on function public.log_events(jsonb) from public;
grant execute on function public.log_events(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------ kill switch
-- A template listed here is not served from the app's next refresh on (launch,
-- or returning to the foreground). Delete the row to switch it back on.
--   insert into public.disabled_templates (template_id, reason) values ('div.sums/refute', 'Wrong key at level 9');

create table if not exists public.disabled_templates (
  template_id text primary key,
  reason text not null,
  disabled_at timestamptz not null default now()
);

alter table public.disabled_templates enable row level security;

drop policy if exists "anyone reads the disabled list" on public.disabled_templates;
create policy "anyone reads the disabled list" on public.disabled_templates
  for select to anon, authenticated using (true);

-- ------------------------------------------------------------------ quality views
-- Independent success (rule hidden, no hints) is the number to compare with a
-- level's expected band. Guided and hinted answers are shown separately.

drop view if exists public.family_quality;
create view public.family_quality as
select
  a.family,
  a.level,
  a.template_version,
  count(*) as attempts,
  count(*) filter (where a.support = 'independent' and not a.hint_before_answer) as independent_attempts,
  round((avg(case when a.correct then 1 else 0 end) filter (where a.support = 'independent' and not a.hint_before_answer))::numeric, 3) as independent_success_rate,
  round((avg(case when a.correct then 1 else 0 end) filter (where a.support = 'guided' and not a.hint_before_answer))::numeric, 3) as guided_success_rate,
  round(avg(case when a.hint_before_answer then 1 else 0 end)::numeric, 3) as hint_rate,
  percentile_cont(0.5) within group (order by a.ms) as median_ms,
  (select count(*) from public.content_reports r where split_part(r.item_id, '@', 1) = a.family) as reports
from public.attempts a
group by a.family, a.level, a.template_version;

revoke all on public.family_quality from anon, authenticated;

-- Which wrong answers learners pick, per family and level: the input to
-- misconception repair (milestone 3).
drop view if exists public.misconception_counts;
create view public.misconception_counts as
select a.family, a.level, a.template_version, a.misconception, count(*) as times
from public.attempts a
where a.misconception is not null
group by a.family, a.level, a.template_version, a.misconception;

revoke all on public.misconception_counts from anon, authenticated;

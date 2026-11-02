-- Access checks for the migrations, run as the app's roles. Each step says what to expect;
-- the ERROR lines that say "expect" are the point (a write the app must not be able to make).
-- See supabase/checks/README.md.

\set ON_ERROR_STOP 0
\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\pset tuples_only on

\echo '--- 1. learner A uploads an attempt (client tries to set received_at)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'A', true) \g /dev/null
insert into public.attempts (user_id, attempt_id, item_id, template_id, template_version, content_version, skill_id, family, level, transfer, support, correct, hint_before_answer, hints_used, rule_shown, response, ms, mode, answered_at, received_at)
values (:'A', 'a-1', 'div.digit-sum/sort@3#7', 'div.digit-sum/sort', 1, '2026.11.0', 'div.digit-sum', 'div.digit-sum/sort', 3, false, 'independent', true, false, 0, false, '{"kind":"sort","yes":[0,2]}', 2500, 'skill', now(), '2000-01-01')
on conflict (user_id, attempt_id) do nothing;
commit;

\echo '--- 2. the same upload again is a no-op, not an error'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'A', true) \g /dev/null
insert into public.attempts (user_id, attempt_id, item_id, template_id, template_version, content_version, skill_id, family, level, transfer, support, correct, hint_before_answer, hints_used, rule_shown, ms, mode, answered_at)
values (:'A', 'a-1', 'div.digit-sum/sort@3#7', 'div.digit-sum/sort', 1, '2026.11.0', 'div.digit-sum', 'div.digit-sum/sort', 3, false, 'independent', true, false, 0, false, 2500, 'skill', now())
on conflict (user_id, attempt_id) do nothing;
select 'rows for a-1: ' || count(*) from public.attempts where attempt_id = 'a-1';
select 'server stamped received_at: ' || (min(received_at) > '2001-01-01') from public.attempts where attempt_id = 'a-1';
commit;

\echo '--- 3. learner A cannot write an attempt as learner B (expect RLS error)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'A', true) \g /dev/null
insert into public.attempts (user_id, attempt_id, item_id, template_id, skill_id, family, level, support, correct, rule_shown, ms, mode, answered_at)
values (:'B', 'a-2', 'x@1#1', 'x', 's', 'x', 1, 'guided', true, true, 1, 'skill', now()) on conflict (user_id, attempt_id) do nothing;
rollback;

\echo '--- 4. learner B sees none of A''s attempts'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'B', true) \g /dev/null
select 'B can see: ' || count(*) from public.attempts;
commit;

\echo '--- 5. signed-out app sends an anonymous event through log_events (expect 1)'
begin; set local role anon;
select 'stored: ' || public.log_events('[{"id":"00000000-0000-0000-0000-0000000000a1","name":"item_answered","props":{"correct":true},"occurred_at":"2026-11-02T03:00:00Z","content_version":"2026.11.0"}]');
commit;

\echo '--- 6. anon cannot attach a user id: the event is kept, the id dropped (expect 1, then null user)'
begin; set local role anon;
select 'stored: ' || public.log_events(jsonb_build_array(jsonb_build_object('id','00000000-0000-0000-0000-0000000000a2','name','x','occurred_at','2026-11-02T03:00:00Z','user_id', :'A')));
commit;
select 'user on a2: ' || coalesce(user_id::text, 'null') from public.events where id = '00000000-0000-0000-0000-0000000000a2';

\echo '--- 7. a signed-in adult sends an event with their own id (expect 1, then their id); the app reads back nothing'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'A', true) \g /dev/null
select 'stored: ' || public.log_events(jsonb_build_array(jsonb_build_object('id','00000000-0000-0000-0000-0000000000a3','name','session_completed','occurred_at','2026-11-02T03:00:00Z','user_id', :'A','install_id','inst-1','age_band','18plus')));
select 'events the app can read back: ' || count(*) from public.events;
commit;
select 'user on a3: ' || user_id from public.events where id = '00000000-0000-0000-0000-0000000000a3';

\echo '--- 8. a retried batch is ignored (expect 0) and the table cannot be written directly (expect RLS error)'
begin; set local role anon;
select 'stored on retry: ' || public.log_events('[{"id":"00000000-0000-0000-0000-0000000000a1","name":"item_answered","occurred_at":"2026-11-02T03:00:00Z"}]');
insert into public.events (id, name, occurred_at) values (gen_random_uuid(), 'x', now());
rollback;

\echo '--- 9. anon reads the kill-switch list but cannot change it (expect one row, then an error)'
insert into public.disabled_templates (template_id, reason) values ('div.sums/refute', 'test');
begin; set local role anon;
select 'disabled: ' || template_id from public.disabled_templates;
insert into public.disabled_templates values ('x', 'y');
rollback;

\echo '--- 10. reports upload by id, twice'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'A', true) \g /dev/null
insert into public.content_reports (user_id, report_id, item_id, content_version, reason, created_at) values (:'A', 'r-1', 'div.sums/refute@3#1', 'v', 'x', now()) on conflict (user_id, report_id) do nothing;
insert into public.content_reports (user_id, report_id, item_id, content_version, reason, created_at) values (:'A', 'r-1', 'div.sums/refute@3#1', 'v', 'x', now()) on conflict (user_id, report_id) do nothing;
select 'reports r-1: ' || count(*) from public.content_reports where report_id = 'r-1';
commit;

\echo '--- 11. quality views are closed to the app (expect permission error)'
begin; set local role authenticated;
select * from public.family_quality;
rollback;

\echo '--- 12a. snapshot compare-and-set: a stale version updates nothing (expect 0, then 1, then version 2)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'A', true) \g /dev/null
insert into public.learner_state (user_id, age_band, state, version) values (:'A', '18plus', '{"v":2}', 1);
with u as (update public.learner_state set state = '{"v":2,"stale":true}', version = 1 where user_id = :'A' and version = 0 returning 1) select 'rows updated with a stale version: ' || count(*) from u;
with u as (update public.learner_state set state = '{"v":2}', version = 2 where user_id = :'A' and version = 1 returning 1) select 'rows updated with the current version: ' || count(*) from u;
select 'version now: ' || version from public.learner_state where user_id = :'A';
commit;

\echo '--- 12b. learner B cannot see or change A''s snapshot (expect 0, then 0)'
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'B', true) \g /dev/null
select 'B sees snapshots: ' || count(*) from public.learner_state;
with u as (update public.learner_state set version = 99 where user_id = :'A' returning 1) select 'B updated: ' || count(*) from u;
commit;

\echo '--- 12. analyst view'
\pset tuples_only off
select family, level, template_version, attempts, independent_attempts, independent_success_rate, guided_success_rate, hint_rate, reports from public.family_quality order by 1, 2;

\echo '--- 13. deleting the auth user cascades (expect 0 attempts, 0 identified events, 0 owned reports, 0 snapshots)'
delete from auth.users where id = :'A';
select (select count(*) from public.attempts) as attempts, (select count(*) from public.events where user_id is not null) as identified_events, (select count(*) from public.content_reports where user_id is not null) as owned_reports, (select count(*) from public.learner_state) as snapshots;

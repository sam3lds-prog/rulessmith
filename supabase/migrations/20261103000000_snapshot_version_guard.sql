-- ------------------------------------------------------------------ learner state: no downgrades
-- The snapshot's shape is versioned by `state->>'v'` (sync/merge.ts SNAPSHOT_VERSION).
-- An older app only knows the keys of its own version, so if it pushed its
-- merged copy back it would drop newer keys (missions, workshop objects, check
-- results) from the server. Refuse any update that lowers `v`: the older app's
-- push fails, it keeps its data on the device and retries, and nothing on the
-- server is lost. Once the learner updates the app, its next sync succeeds.

create or replace function public.learner_state_no_downgrade()
returns trigger
language plpgsql
as $$
begin
  if coalesce((new.state ->> 'v')::int, 0) < coalesce((old.state ->> 'v')::int, 0) then
    raise exception 'snapshot version % is older than the stored version %; update the app to sync',
      coalesce((new.state ->> 'v')::int, 0), coalesce((old.state ->> 'v')::int, 0)
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists learner_state_no_downgrade on public.learner_state;
create trigger learner_state_no_downgrade before update on public.learner_state
  for each row execute function public.learner_state_no_downgrade();

# Database checks

`access.sql` exercises the migrations as the app's own roles (`anon`, `authenticated`): a learner can only write and read their own attempts, a retried upload is a no-op, events can only arrive through `log_events()`, the kill-switch list is read-only, quality views are closed to the app, an older app can't overwrite a newer snapshot shape, and deleting an account cascades.

On plain Postgres 15 or newer (no Supabase needed):

```bash
createdb rulesmith_check
psql -d rulesmith_check -f supabase/checks/shim.sql
psql -d rulesmith_check -f supabase/migrations/20261101000000_init.sql
psql -d rulesmith_check -f supabase/migrations/20261102000000_learning_record_and_sync.sql
psql -d rulesmith_check -f supabase/migrations/20261103000000_snapshot_version_guard.sql
psql -d rulesmith_check -f supabase/checks/access.sql
dropdb rulesmith_check
```

Compare the output with the `expect` note on each step. On a local Supabase (`supabase start`), skip `shim.sql`; the checks insert two users into `auth.users`, so use a throwaway database.

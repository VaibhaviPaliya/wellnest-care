# Row-level security checks

48 checks that the Cloud tables only let each person see and change what they should
(senior, linked family, unlinked family, another senior, admin, signed-out).

Run against a throwaway local PostgreSQL 16 (not the live project):

```sh
createdb wellnest_rls_test
psql -d wellnest_rls_test -f drizzle/tests/supabase_stub.sql      # minimal Supabase auth + roles
psql -d wellnest_rls_test -f drizzle/migrations/0000_profiles_and_roles.sql
psql -d wellnest_rls_test -f drizzle/migrations/0001_care_data_in_cloud.sql
PGDATABASE=wellnest_rls_test node drizzle/tests/rls.test.mjs
```

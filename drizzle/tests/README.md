# Row-level security checks

48 checks that the Cloud tables only let each person see and change what they should
(senior, linked family, unlinked family, another senior, admin, signed-out).

Run against a throwaway local PostgreSQL 16 (not the live project):

```sh
createdb wellnest_rls_test
psql -d wellnest_rls_test -f drizzle/tests/supabase_stub.sql      # minimal Supabase auth + roles
psql -d wellnest_rls_test -f drizzle/migrations/0000_profiles_and_roles.sql
psql -d wellnest_rls_test -f drizzle/migrations/0001_care_data_in_cloud.sql
psql -d wellnest_rls_test -f drizzle/migrations/0003_partners_and_pincodes.sql
psql -d wellnest_rls_test -f drizzle/migrations/0004_riders_dispatch_tracking.sql
psql -d wellnest_rls_test -f drizzle/migrations/0005_phone_verification.sql
PGDATABASE=wellnest_rls_test node drizzle/tests/rls.test.mjs
PGDATABASE=wellnest_rls_test node drizzle/tests/partners.test.mjs   # 34 partner + pincode checks
PGDATABASE=wellnest_rls_test node drizzle/tests/riders.test.mjs     # 67 rider, Aadhaar, dispatch + tracking checks
PGDATABASE=wellnest_rls_test node drizzle/tests/phone.test.mjs      # 7 verified-mobile + secrets checks (after 0005)
```

// Verified mobile numbers and locked secrets (migration 0005).
import postgres from 'postgres';
const sql = postgres({ onnotice: () => {} });
const U = '00000000-0000-0000-0000-000000000201', V = '00000000-0000-0000-0000-000000000202';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
async function as(uid, fn) {
  try { return await sql.begin(async t => { await t`select set_config('request.jwt.claim.sub', ${uid ?? ''}, true)`; await t.unsafe('set local role authenticated'); return { ok: true, v: await fn(t) }; }); }
  catch (e) { return { ok: false, err: e.message }; }
}
await sql`truncate auth.users cascade`;
for (const u of [U, V]) await sql`insert into auth.users (id, email) values (${u}, ${u + '@x.test'})`;
await sql`update profiles set phone = '9000000601', name = 'U' where id = ${U}`;
ok(!(await as(U, t => t`update profiles set phone = '9000000699' where id = ${U}`)).ok, 'a user cannot change their own mobile number directly');
ok((await as(U, t => t`update profiles set name = 'New name', phone = '9000000601' where id = ${U}`)).ok, 'other profile edits still work (same number re-sent)');
ok((await as(U, t => t`update profiles set name = 'Again' where id = ${U}`)).ok, 'edits without the phone column work');
ok(!(await as(V, t => t`update profiles set phone = '9000000602' where id = ${V}`)).ok, 'a new user cannot add an unverified number');
await sql`update profiles set phone = '9000000699' where id = ${U}`; // the server (no signed-in user) after an SMS check
ok((await sql`select phone from profiles where id = ${U}`)[0].phone === '9000000699', 'the server can save a verified number');
await sql`insert into app_secrets (name, value) values ('twilio_account_sid', 'ACtest') on conflict (name) do update set value = excluded.value`;
ok(!(await as(U, t => t`select * from app_secrets`)).ok, 'signed-in users cannot read app secrets');
ok(!(await as(null, t => t`select * from app_secrets`)).ok, 'signed-out visitors cannot read app secrets');
console.log(`${pass} passed, ${fail} failed`);
await sql.end(); process.exit(fail ? 1 : 0);

// Batch 5 (0010): trip started / arrived / completed alerts for the senior and family.
import postgres from 'postgres';
const sql = postgres({ onnotice: () => {} });
const id = n => `00000000-0000-0000-0000-0000000010${String(n).padStart(2, '0')}`;
const K = id(1), A = id(2), C = id(3), O = id(4), Z = id(5);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
async function as(uid, fn) {
  try { return await sql.begin(async t => { await t`select set_config('request.jwt.claim.sub', ${uid ?? ''}, true)`; await t.unsafe('set local role authenticated'); return { ok: true, v: await fn(t) }; }); }
  catch (e) { return { ok: false, err: e.message }; }
}
await sql`truncate auth.users cascade`; await sql`delete from catalog`; await sql`delete from bookings`; await sql`delete from notices`;
for (const [u, r] of [[K, 'senior'], [A, 'family'], [C, 'partner'], [O, 'partner'], [Z, 'family']]) {
  await sql`insert into auth.users (id, email) values (${u}, ${u + '@x.test'})`;
  await sql`insert into user_roles (user_id, role) values (${u}, ${r})`;
}
await sql`update profiles set pincode = '560011' where id = ${K}`;
await sql`insert into family_links (family_id, senior_id) values (${A}, ${K})`;
await sql`insert into catalog (kind, id, data) values
  ('coach', 'co-1', ${sql.json({ id: 'co-1', name: 'Meera', verified: true, ownerId: C, servicePincodes: ['560011'], price: 500 })}),
  ('coach', 'co-2', ${sql.json({ id: 'co-2', name: 'Other', verified: true, ownerId: O, servicePincodes: ['560011'], price: 500 })})`;
const at = h => new Date(Date.now() + h * 3600e3).toISOString();
const mk = (bid, extra) => sql`insert into bookings (id, senior_id, booked_by, data) values (${bid}, ${K}, ${K}, ${sql.json({ id: bid, type: 'fitness', partnerId: 'co-1', partnerName: 'Meera', status: 'confirmed', title: 'Yoga · Home visit', ...extra })})`;
await mk('soon', { when: at(1) }); await mk('later', { when: at(30) }); await mk('online', { when: at(1), videoUrl: 'https://meet.example/x' });
const notes = async (u) => (await sql`select data from notices where user_id = ${u} order by created_at`).map(r => r.data.title);

ok(!(await as(O, t => t`select partner_start_trip('soon')`)).ok, "another coach cannot start this trip");
ok(!(await as(K, t => t`select partner_start_trip('soon')`)).ok, 'the customer cannot start it');
ok(!(await as(C, t => t`select partner_start_trip('later')`)).ok, 'a trip starts at most 3 hours before');
ok(!(await as(C, t => t`select partner_start_trip('online')`)).ok, 'online classes have no trip');
ok((await as(C, t => t`select partner_start_trip('soon')`)).ok, 'the coach starts the trip');
ok((await notes(K)).includes('Meera is on the way') && (await notes(A)).includes('Meera is on the way'), 'senior and family are told the coach is on the way');
ok(!(await notes(Z)).length, 'unlinked family hear nothing');
await as(C, t => t`select partner_start_trip('soon')`);
ok((await notes(A)).filter(x => x === 'Meera is on the way').length === 1, 'starting again does not alert twice');
ok(!(await as(K, t => t`update bookings set data = data || '{"tripStartedAt": "2020-01-01"}' where id = 'later'`)).ok, 'customers cannot fake a trip start');
ok(!(await as(C, t => t`select n from (select notify_senior_circle(${K}, 'x', 'y', null)) q(n)`)).ok, 'the alert helper is not callable by users');

ok((await as(C, t => t`select partner_update_status('soon', 'in_progress')`)).ok, 'the coach arrives');
ok((await notes(A)).includes('Meera has arrived'), 'family are told the coach arrived');
ok((await as(C, t => t`select partner_update_status('soon', 'completed')`)).ok, 'the coach completes');
ok((await notes(K)).some(x => x.startsWith('Session completed')), 'senior is told the session is done');
ok((await as(C, t => t`select partner_update_status('online', 'in_progress')`)).ok && (await notes(A)).some(x => x.startsWith('Class started')), 'online class start is announced');
const [n] = await sql`select data from notices where user_id = ${A} and data->>'title' = 'Meera has arrived'`;
ok(n.data.who?.kind === 'coach' && n.data.who?.id === 'co-1', 'alerts carry who sent them');

console.log(`${pass} passed, ${fail} failed`);
await sql.end(); process.exit(fail ? 1 : 0);

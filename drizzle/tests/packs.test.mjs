// Batch 3 (0008): coach packs, server-only purchases, credit rules.
import postgres from 'postgres';
const sql = postgres({ onnotice: () => {} });
const id = n => `00000000-0000-0000-0000-0000000005${String(n).padStart(2, '0')}`;
const K = id(1), A = id(2), C = id(3), U = id(4), C2 = id(5);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
async function as(uid, fn) {
  try { return await sql.begin(async t => { await t`select set_config('request.jwt.claim.sub', ${uid ?? ''}, true)`; await t.unsafe('set local role authenticated'); return { ok: true, v: await fn(t) }; }); }
  catch (e) { return { ok: false, err: e.message }; }
}
await sql`truncate auth.users cascade`; await sql`delete from catalog`;
for (const [u, r] of [[K, 'senior'], [A, 'family'], [C, 'partner'], [U, 'partner'], [C2, 'partner']]) {
  await sql`insert into auth.users (id, email) values (${u}, ${u + '@x.test'})`;
  await sql`insert into user_roles (user_id, role) values (${u}, ${r})`;
}
await sql`update profiles set pincode = '560011' where id = ${K}`;
await sql`insert into family_links (family_id, senior_id) values (${A}, ${K})`;
await sql`insert into catalog (kind, id, data) values
  ('coach', 'co-1', ${sql.json({ id: 'co-1', name: 'Meera', verified: true, ownerId: C, servicePincodes: ['560011'], price: 500 })}),
  ('coach', 'co-2', ${sql.json({ id: 'co-2', name: 'Other', verified: true, ownerId: C2, servicePincodes: ['560011'], price: 500 })}),
  ('coach', 'co-p', ${sql.json({ id: 'co-p', name: 'Pending', verified: false, ownerId: U })})`;
const packs = [{ title: '8 sessions', sessions: 8, days: 30, price: 3400 }, { title: '12 sessions', sessions: 12, days: 45, price: 4800 }];

const r = await as(C, t => t`select coach_save_packs(${t.json(packs)}) p`);
ok(r.ok && r.v[0].p.length === 2 && /^pk-/.test(r.v[0].p[0].id), 'an approved coach publishes packs with server ids');
ok(!(await as(U, t => t`select coach_save_packs(${t.json(packs)})`)).ok, 'an unapproved coach cannot');
ok(!(await as(K, t => t`select coach_save_packs(${t.json(packs)})`)).ok, 'a senior cannot');
ok(!(await as(C, t => t`select coach_save_packs(${t.json([{ ...packs[0], price: 0 }])})`)).ok, 'price must be at least ₹1');
ok(!(await as(C, t => t`select coach_save_packs(${t.json([{ ...packs[0], sessions: 2.5 }])})`)).ok, 'whole sessions only');
ok(!(await as(C, t => t`select coach_save_packs(${t.json(Array(6).fill(packs[0]))})`)).ok, 'at most 5 packs');

// Customers cannot create subscriptions themselves
const sub = (sid, extra = {}) => ({ id: sid, seniorId: K, planId: '', coachId: 'co-1', packId: 'pk-x', title: '8 sessions', sessions: 8, remaining: 8, price: 3400,
  starts: new Date(Date.now() - 3600e3).toISOString(), ends: new Date(Date.now() + 20 * 86400e3).toISOString(), cancelled: false, ...extra });
ok(!(await as(K, t => t`insert into care_items (id, kind, senior_id, data) values ('s-fake', 'subscription', ${K}, ${t.json(sub('s-fake'))})`)).ok, 'a senior cannot give themselves a pack');
ok(!(await as(A, t => t`insert into care_items (id, kind, senior_id, data) values ('s-fake2', 'subscription', ${K}, ${t.json(sub('s-fake2'))})`)).ok, 'family cannot either');
ok((await as(K, t => t`insert into care_items (id, kind, senior_id, data) values ('r1', 'reminder', ${K}, ${t.json({ id: 'r1' })})`)).ok, 'other care items still work');
await sql`insert into care_items (id, kind, senior_id, data) values ('s1', 'subscription', ${K}, ${sql.json(sub('s1'))})`; // the server after payment

// Credits
const upd = (u, patch) => as(u, t => t`update care_items set data = data || ${t.json(patch)} where id = 's1'`);
ok(!(await upd(K, { remaining: 20 })).ok, 'credits cannot be topped up');
ok(!(await upd(K, { remaining: 5 })).ok, 'credits change one at a time');
ok(!(await upd(K, { ends: new Date(Date.now() + 365 * 86400e3).toISOString() })).ok, 'the end date cannot be extended');
ok(!(await upd(K, { coachId: 'co-2' })).ok, 'a pack cannot be moved to another coach');
ok(!(await as(K, t => t`delete from care_items where id = 's1'`)).v?.count, 'a pack cannot be deleted by the customer');
ok((await upd(K, { remaining: 7 })).ok, 'using one credit is allowed');
ok((await upd(A, { remaining: 8 })).ok, 'returning one credit (timely cancellation) is allowed');
ok(!(await upd(K, { remaining: 9 })).ok, 'credits never exceed the pack size');

// Booking with credits
const when = new Date(Date.now() + 2 * 86400e3).toISOString();
const book = (bid, extra) => as(K, t => t`insert into bookings (id, senior_id, booked_by, data) values (${bid}, ${K}, ${K}, ${t.json({ id: bid, type: 'fitness', partnerId: 'co-1', status: 'confirmed', when, title: 'Yoga', ...extra })})`);
ok(!(await book('b1', { subscriptionId: 's1', amount: 500 })).ok, 'a credit booking must cost ₹0');
ok(!(await book('b2', { subscriptionId: 's-none', amount: 0 })).ok, 'an unknown pack is refused');
ok(!(await as(K, t => t`insert into bookings (id, senior_id, booked_by, data) values ('b3', ${K}, ${K}, ${t.json({ id: 'b3', type: 'fitness', partnerId: 'co-2', status: 'confirmed', when, subscriptionId: 's1', amount: 0 })})`)).ok, "a pack can't be used with another coach");
ok((await book('b4', { subscriptionId: 's1', amount: 0 })).ok, 'a valid credit booking is accepted');
await sql`update care_items set data = data || '{"cancelled": true}' where id = 's1'`;
ok(!(await book('b5', { subscriptionId: 's1', amount: 0, when: new Date(Date.now() + 3 * 86400e3).toISOString() })).ok, 'a cancelled pack cannot be used');
ok(!(await upd(K, { cancelled: false })).ok, 'a cancelled pack cannot be reactivated');

console.log(`${pass} passed, ${fail} failed`);
await sql.end(); process.exit(fail ? 1 : 0);

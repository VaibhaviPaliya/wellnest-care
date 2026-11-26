// Partner self-registration, admin verification and pincode rules (migration 0003). Run after rls.test.mjs setup:
//   psql -f drizzle/migrations/0003_partners_and_pincodes.sql && node drizzle/tests/partners.test.mjs
import postgres from 'postgres';
const sql = postgres({ onnotice: () => {} });
const K = '00000000-0000-0000-0000-00000000000a', H = '00000000-0000-0000-0000-00000000000b', A = '00000000-0000-0000-0000-00000000000c',
  AD = '00000000-0000-0000-0000-00000000000e', P = '00000000-0000-0000-0000-0000000000f1', Q = '00000000-0000-0000-0000-0000000000f2';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
async function as(uid, fn) {
  try { return await sql.begin(async t => { await t`select set_config('request.jwt.claim.sub', ${uid ?? ''}, true)`; await t.unsafe('set local role authenticated'); return { ok: true, v: await fn(t) }; }); }
  catch (e) { return { ok: false, err: e.message }; }
}
const day = n => new Date(Date.now() + n * 86400000).toISOString();

await sql`truncate auth.users cascade`; await sql`delete from catalog`;
for (const [id, ph] of [[K, '9876543210'], [H, '9876500001'], [A, '9123456789'], [AD, '9999999999'], [P, '9000000101'], [Q, '9000000102']]) {
  await sql`insert into auth.users (id, email) values (${id}, ${ph + '@phone.wellnest.app'})`;
  await sql`update profiles set phone = ${ph}, name = ${'P' + ph} where id = ${id}`;
}
for (const [id, r] of [[K, 'senior'], [H, 'senior'], [A, 'family'], [AD, 'admin']]) await sql`insert into user_roles (user_id, role) values (${id}, ${r})`;
await sql`update profiles set consent_at = now(), health = ${sql.json({ conditions: [] })}, address = '12, 4th Cross', pincode = '560011' where id = ${K}`;
await sql`update profiles set pincode = '160022' where id = ${H}`;
await sql`insert into family_links (family_id, senior_id) values (${A}, ${K})`;

// Registration as a partner
ok((await as(P, t => t`select choose_role('partner')`)).ok, 'a new account can register as a partner');
ok(!(await as(P, t => t`select choose_role('admin')`)).ok, 'nobody can register as admin');
ok(!(await as(K, t => t`select submit_partner('pharmacy', ${t.json({ name: 'X', licence: 'L', servicePincodes: ['560011'] })})`)).ok, 'a senior cannot submit a partner listing');

const app = { name: 'Sri Sai Medicals', licence: 'KA-B-12345', servicePincodes: ['560011', '560041'], verified: true, status: 'approved', ownerId: K };
const sub = await as(P, t => t`select submit_partner('pharmacy', ${t.json(app)}) id`);
ok(sub.ok, 'partner submits a pharmacy application');
const pid = sub.v?.[0]?.id;
const row = (await sql`select data from catalog where kind = 'pharmacy' and id = ${pid}`)[0]?.data;
ok(row && row.verified === false && row.status === 'pending' && row.ownerId === P, 'submission is forced to pending, unverified and owned by the submitter');
ok(!(await as(P, t => t`select submit_partner('pharmacy', ${t.json({ ...app, servicePincodes: ['012345'] })})`)).ok, 'invalid pincodes are refused');
ok(!(await as(P, t => t`select submit_partner('pharmacy', ${t.json({ ...app, servicePincodes: [] })})`)).ok, 'at least one service pincode is required');
ok(!(await as(P, t => t`select submit_partner('kitchen', ${t.json(app)})`)).ok, 'one account cannot hold a second listing of another type');
ok(!(await as(P, t => t`update catalog set data = data || '{"verified":true}' where id = ${pid}`)).v?.count, 'a partner cannot approve their own listing directly');
ok((await sql`select (data->>'verified')::boolean v from catalog where id = ${pid}`)[0].v === false, '… and it stays unverified');

// Who sees the pending listing
const sees = async (uid, id) => ((await as(uid, t => t`select id from catalog where id = ${id}`)).v ?? []).length === 1;
ok(await sees(P, pid), 'the partner sees their own pending listing');
ok(!(await sees(K, pid)), 'customers do not see a pending listing');
ok(!(await sees(Q, pid)), 'other accounts do not see a pending listing');
ok(await sees(AD, pid), 'the admin sees the pending listing');

// Bookings before approval are refused
const bk = (id, senior, by, partner, type = 'medicine', extra = {}) => ({ id, senior_id: senior, booked_by: by, data: { type, partnerId: partner, when: day(1), status: 'pending_review', title: 'Order', ...extra } });
const ins = (t, b) => t`insert into bookings (id, senior_id, booked_by, data) values (${b.id}, ${b.senior_id}, ${b.booked_by}, ${t.json(b.data)})`;
ok(!(await as(K, t => ins(t, bk('m0', K, K, pid)))).ok, 'an unapproved partner cannot be booked');

// Admin approves
ok((await as(AD, t => t`update catalog set data = data || '{"verified":true,"status":"approved"}' where kind = 'pharmacy' and id = ${pid}`)).ok, 'admin approves the listing');
ok(await sees(K, pid), 'customers see the approved listing');

// Pincode rule on bookings
ok((await as(K, t => ins(t, bk('m1', K, K, pid)))).ok, 'a senior in a served pincode can order');
ok(!(await as(H, t => ins(t, bk('m2', H, H, pid)))).ok, 'a senior outside the service area is refused');
await sql`update profiles set pincode = null where id = ${H}`;
ok(!(await as(H, t => ins(t, bk('m3', H, H, pid)))).ok, 'a senior without a pincode is refused');
await sql`insert into catalog (kind, id, data) values ('coach', 'co-online', ${sql.json({ name: 'Online coach', verified: true, servicePincodes: [] })})`;
ok((await as(H, t => ins(t, bk('f1', H, H, 'co-online', 'fitness', { videoUrl: 'https://meet.jit.si/x', status: 'confirmed' })))).ok, 'online classes need no pincode match');
ok(!(await as(H, t => ins(t, bk('f2', H, H, 'co-online', 'fitness', { status: 'confirmed', when: day(2) })))).ok, 'home visits outside the service area are refused');

// Partner sees their orders and the customer's name, but not health or address for a delivery
ok(((await as(P, t => t`select id from bookings`)).v ?? []).map(r => r.id).join(',') === 'm1', 'the partner sees only orders placed with them');
ok(((await as(Q, t => t`select id from bookings`)).v ?? []).length === 0, 'other accounts see no orders');
const ppl = (await as(P, t => t`select id, name, health, address, pincode, phone from visible_people()`)).v ?? [];
const k = ppl.find(r => r.id === K);
ok(k && k.name && k.health === null && k.address === null && k.pincode === null && k.phone === null, 'the partner sees the customer name only (no health, address or phone for a delivery)');
ok(!ppl.some(r => r.id === H), 'the partner does not see customers who never booked them');

// Kitchen dishes
await as(Q, t => t`select choose_role('partner')`);
const kq = (await as(Q, t => t`select submit_partner('kitchen', ${t.json({ name: 'Ghar Ka Khana', licence: 'FSSAI-1', servicePincodes: ['560011'] })}) id`)).v?.[0]?.id;
ok(!(await as(Q, t => t`select partner_save_dish(${t.json({ name: 'Khichdi', price: 120, diet: 'veg' })})`)).ok, 'a pending kitchen cannot add dishes');
await sql`update catalog set data = data || '{"verified":true,"status":"approved"}' where id = ${kq}`;
const dsh = await as(Q, t => t`select partner_save_dish(${t.json({ name: 'Khichdi', price: 120, diet: 'veg', tags: ['low_sugar'], kitchenId: 'k1' })}) id`);
ok(dsh.ok, 'an approved kitchen adds a dish');
const drow = (await sql`select data from catalog where kind = 'dish' and id = ${dsh.v?.[0]?.id}`)[0]?.data;
ok(drow && drow.kitchenId === kq && drow.tags.length === 0, 'the dish belongs to their kitchen and health tags are left to the admin');
ok(!(await as(P, t => t`select partner_delete_dish(${dsh.v?.[0]?.id})`)).ok, 'another partner cannot delete it');
ok((await as(Q, t => t`select partner_delete_dish(${dsh.v?.[0]?.id})`)).ok, 'the kitchen can delete its own dish');

// Family updates the senior's location
ok((await as(A, t => t`select save_senior_location(${K}, '560041', 'Bengaluru', 'Karnataka')`)).ok, 'linked family updates the senior pincode');
ok(!(await as(Q, t => t`select save_senior_location(${K}, '560041', 'Bengaluru', 'Karnataka')`)).ok, 'others cannot change it');
ok(!(await as(A, t => t`select save_senior_location(${K}, '056004', 'Bengaluru', 'Karnataka')`)).ok, 'invalid pincode refused');

console.log(`${pass} passed, ${fail} failed`);
await sql.end();
process.exit(fail ? 1 : 0);

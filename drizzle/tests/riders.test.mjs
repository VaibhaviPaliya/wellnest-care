// Delivery partners, masked Aadhaar, dispatch and live tracking (migration 0004).
//   psql -f 0003… -f 0004…; node drizzle/tests/riders.test.mjs
import postgres from 'postgres';
const sql = postgres({ onnotice: () => {} });
const id = n => `00000000-0000-0000-0000-0000000001${String(n).padStart(2, '0')}`;
const K = id(1), A = id(2), S = id(3), R1 = id(4), R2 = id(5), X = id(6), AD = id(7), C = id(8), S2 = id(9);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
async function as(uid, fn) {
  try { return await sql.begin(async t => { await t`select set_config('request.jwt.claim.sub', ${uid ?? ''}, true)`; await t.unsafe('set local role authenticated'); return { ok: true, v: await fn(t) }; }); }
  catch (e) { return { ok: false, err: e.message }; }
}
const hrs = h => new Date(Date.now() + h * 3600000).toISOString();
const DOC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

await sql`truncate auth.users cascade`; await sql`delete from catalog`; await sql`delete from live_presence`;
const people = [[K, '9876543210', 'senior'], [A, '9123456789', 'family'], [S, '9000000201', 'partner'], [R1, '9000000301', 'delivery'],
  [R2, '9000000302', 'delivery'], [X, '9000000401', 'family'], [AD, '9999999999', 'admin'], [C, '9000000501', 'partner'], [S2, '9000000202', 'partner']];
for (const [u, ph, role] of people) {
  await sql`insert into auth.users (id, email) values (${u}, ${ph + '@phone.wellnest.app'})`;
  await sql`update profiles set phone = ${ph}, name = ${'P' + ph} where id = ${u}`;
  if (role !== 'delivery') await sql`insert into user_roles (user_id, role) values (${u}, ${role})`;
}
await sql`update profiles set consent_at = now(), health = ${sql.json({ conditions: [] })}, address = '12, 4th Cross', city = 'Bengaluru', pincode = '560011', home_lat = 12.93, home_lng = 77.58 where id = ${K}`;
await sql`insert into family_links (family_id, senior_id) values (${A}, ${K})`;
await sql`insert into catalog (kind, id, data) values
  ('pharmacy', 'ph-s', ${sql.json({ id: 'ph-s', name: 'Ramesh Medicals', verified: true, status: 'approved', ownerId: S, servicePincodes: ['560011'], address: { city: 'Bengaluru' } })}),
  ('kitchen', 'kt-2', ${sql.json({ id: 'kt-2', name: 'Other Kitchen', verified: true, status: 'approved', ownerId: S2, servicePincodes: ['560011'] })}),
  ('coach', 'co-c', ${sql.json({ id: 'co-c', name: 'Coach Meera', verified: true, status: 'approved', ownerId: C, mode: ['home'], servicePincodes: ['560011'] })}),
  ('pharmacy', 'p1', ${sql.json({ id: 'p1', name: 'Apollo', verified: true, servicePincodes: ['560011'] })})`;
const order = (bid, partner = 'ph-s', type = 'medicine', extra = {}) => ({ id: bid, data: { id: bid, type, partnerId: partner, partnerName: 'Ramesh Medicals', when: hrs(5), status: type === 'medicine' ? 'pending_review' : 'confirmed', title: 'Order', amount: 125, ...extra } });
const place = (uid, o) => as(uid, t => t`insert into bookings (id, senior_id, booked_by, data) values (${o.id}, ${K}, ${uid}, ${t.json(o.data)})`);
const bk = async bid => (await sql`select data from bookings where id = ${bid}`)[0]?.data;
const online = (uid, lat = 12.94, lng = 77.59) => as(uid, t => t`select set_presence(true, ${lat}, ${lng}, 15)`);

// Registration and listing
ok((await as(R1, t => t`select choose_role('delivery')`)).ok, 'a rider registers with the delivery role');
await as(R2, t => t`select choose_role('delivery')`);
ok(!(await as(K, t => t`select partner_save_rider(${t.json({ name: 'Ravi', phone: '9000000301', vehicle: 'Motorbike' })})`)).ok, 'customers cannot add delivery partners');
ok(!(await as(S, t => t`select partner_save_rider(${t.json({ name: 'Ravi', phone: '12345', vehicle: 'Motorbike' })})`)).ok, 'invalid mobile refused');
const r1 = (await as(S, t => t`select partner_save_rider(${t.json({ name: 'Ravi', phone: '9000000301', vehicle: 'Motorbike', aadhaarName: 'Ravi Kumar' })}) id`)).v?.[0]?.id;
ok(!!r1, 'the store lists a rider by mobile number');
ok(!(await as(S, t => t`select partner_save_rider(${t.json({ name: 'Dup', phone: '9000000301', vehicle: 'Scooter' })})`)).ok, 'the same mobile cannot be listed twice by one store');
ok((await sql`select rider_user from rider_private where delivery_id = ${r1}`)[0].rider_user === R1, 'an existing rider account is linked automatically by mobile');
const r2 = (await as(S, t => t`select partner_save_rider(${t.json({ name: 'Salma', phone: '9000000302', vehicle: 'Scooter' })}) id`)).v?.[0]?.id;
ok((await as(R2, t => t`select claim_rider() n`)).v?.[0]?.n === 0, 'claim_rider is a no-op once linked');

// Masked Aadhaar
ok(!(await as(X, t => t`select rider_upload_aadhaar(${DOC}, 'X')`)).ok, 'someone not listed by any store cannot upload');
ok(!(await as(R1, t => t`select rider_upload_aadhaar('data:text/html;base64,PGgxPg==', 'Ravi Kumar')`)).ok, 'only JPG/PNG/WebP/PDF documents are accepted');
ok((await as(R1, t => t`select rider_upload_aadhaar(${DOC}, 'Ravi Kumar')`)).ok, 'the rider uploads a masked Aadhaar');
await as(R2, t => t`select rider_upload_aadhaar(${DOC}, 'Salma Begum')`);
ok(!(await as(S, t => t`select aadhaar_doc from rider_private`)).ok, 'the store cannot read the Aadhaar document column');
ok(((await as(S, t => t`select phone from rider_private`)).v ?? []).length === 2, 'the store sees its riders’ mobile numbers');
ok(((await as(K, t => t`select phone from rider_private`)).v ?? []).length === 0, 'customers see no rider private data');
ok(((await as(S2, t => t`select phone from rider_private`)).v ?? []).length === 0, 'another store sees none either');
ok((await as(AD, t => t`select rider_document(${r1}) d`)).v?.[0]?.d === DOC, 'the admin can open the document');
ok(!(await as(S, t => t`select rider_document(${r1})`)).ok, 'the store cannot open the document');
ok(((await as(K, t => t`select id from catalog where kind = 'delivery'`)).v ?? []).length === 0, 'customers do not see unverified riders');
ok(((await as(R1, t => t`select id from catalog where kind = 'delivery'`)).v ?? []).map(r => r.id).join() === r1, 'a rider sees their own listing');

// Before approval nothing is dispatched to them
await online(R1);
await place(K, order('b0'));
ok(!(await bk('b0')).offer, 'unverified riders get no offers');
ok(!(await as(R1, t => t`select rider_respond('b0', true)`)).ok, '… and cannot accept');
await sql`update catalog set data = data || '{"verified":true,"status":"approved"}' where kind = 'delivery'`; // admin approval (admin catalog rights tested in rls tests)
await sql`update live_presence set online = false`;

// Order → dispatch
ok((await place(K, order('b1', 'ph-s', 'medicine', { deliveryId: 'dp-fake', deliveryName: 'Fake' }))).ok, 'customer places an order');
let b = await bk('b1');
ok(!b.deliveryId, 'the browser cannot pick the rider for a store with its own riders');
ok(!b.offer, 'no offer while every rider is offline');
await online(R2, 12.99, 77.70); // far
await online(R1, 12.94, 77.59); // near the pickup
b = await bk('b1');
ok(!!b.offer, 'going online picks up the waiting order');
await sql`update catalog set data = data || '{"pickupLat":12.935,"pickupLng":77.585}' where id = 'ph-s'`;
await place(K, order('b2'));
ok((await bk('b2')).offer?.riderId === r1, 'the nearest, least-busy rider gets the offer');
const feed = (await as(R1, t => t`select * from rider_feed()`)).v ?? [];
const off = feed.find(f => f.booking_id === 'b2');
ok(off?.kind === 'offer' && off.data.pincode === '560011' && !('seniorId' in off.data) && !('items' in off.data), 'an offer shows the pincode but not the customer');
ok(!(await as(R1, t => t`select * from job_details('b2')`)).ok, 'no customer details before accepting');
ok(!(await as(R2, t => t`select rider_respond('b2', true)`)).ok, 'another rider cannot take someone else’s offer');
ok(!(await as(R2, t => t`select rider_update_status('b2', 'out_for_delivery')`)).ok, 'a rider cannot move an order that is not theirs');
ok(!(await as(X, t => t`select * from track_booking('b2')`)).ok, 'strangers cannot track an unassigned order');

// Customers cannot tamper
ok(!(await as(K, t => t`update bookings set data = data || ${t.json({ deliveryId: r2 })} where id = 'b2'`)).ok, 'customers cannot assign a rider');
ok(!(await as(K, t => t`update bookings set data = data || '{"status":"completed"}' where id = 'b2'`)).ok, 'customers cannot mark an order delivered');

// Decline → next rider
ok((await as(R1, t => t`select rider_respond('b2', false)`)).ok, 'rider declines');
ok((await bk('b2')).offer?.riderId === r2, 'the offer moves to the next rider');
// Ignore → next rider
await sql`update bookings set data = jsonb_set(data, '{offer,offeredAt}', to_jsonb(now() - interval '2 minutes')) where id = 'b2'`;
await as(R1, t => t`select * from rider_feed()`);
ok((await bk('b2')).offer?.riderId === r1, 'an ignored offer moves on after 60 seconds (new round)');
ok((await as(R1, t => t`select rider_respond('b2', true)`)).ok, 'rider accepts');
b = await bk('b2');
ok(b.deliveryId === r1 && b.deliveryName === 'Ravi' && !b.offer, 'the order is assigned to them');
ok(((await as(R1, t => t`select * from rider_feed()`)).v ?? []).find(f => f.booking_id === 'b2')?.kind === 'job', 'it shows as their job');
const jd = (await as(R1, t => t`select * from job_details('b2')`)).v?.[0];
ok(jd?.address === '12, 4th Cross' && jd?.phone === '9876543210' && jd?.home_lat === 12.93, 'the assigned rider gets the address, phone and home pin');
ok(!(await as(R2, t => t`select * from job_details('b2')`)).ok, 'other riders do not');
ok(!(await as(X, t => t`select * from job_details('b2')`)).ok, 'strangers do not');
ok((await as(S, t => t`select * from job_details('b2')`)).ok, 'the store sees details of its active order');

// Progress
ok(!(await as(R1, t => t`select rider_update_status('b2', 'out_for_delivery')`)).ok, 'cannot pick up before the pharmacist confirms the prescription');
ok(!(await as(R1, t => t`select partner_update_status('b2', 'confirmed')`)).ok, 'riders cannot confirm prescriptions');
ok((await as(S, t => t`select partner_update_status('b2', 'confirmed')`)).ok, 'the store confirms the prescription');
ok((await as(R1, t => t`select rider_update_status('b2', 'out_for_delivery')`)).ok, 'rider marks it picked up');

// Tracking
const tr = (await as(K, t => t`select * from track_booking('b2')`)).v?.[0];
ok(tr?.lat === 12.94 && tr?.who === 'Ravi' && tr?.status === 'out_for_delivery' && tr?.home_lat === 12.93, 'the customer sees the rider’s live location');
ok((await as(A, t => t`select * from track_booking('b2')`)).v?.[0]?.lat === 12.94, 'linked family sees it too');
ok((await as(S, t => t`select * from track_booking('b2')`)).v?.[0]?.lat === 12.94, 'the store sees it');
ok(!(await as(X, t => t`select * from track_booking('b2')`)).ok, 'strangers cannot track');
ok(((await as(K, t => t`select * from live_presence`)).v ?? []).length === 0, 'nobody reads the raw location table');
await as(R1, t => t`select set_presence(false, null, null, null)`);
ok((await as(K, t => t`select * from track_booking('b2')`)).v?.[0]?.lat === null, 'going offline hides the location');
await online(R1);
ok((await as(R1, t => t`select rider_update_status('b2', 'completed')`)).ok, 'rider marks it delivered');
ok(((await as(K, t => t`select * from track_booking('b2')`)).v ?? []).length === 0, 'tracking ends when delivered');
ok(!(await as(R1, t => t`select * from job_details('b2')`)).ok, 'and the rider loses access to the address');

// Store reassigns and removes riders
await place(K, order('b3'));
ok(!(await as(S2, t => t`select partner_assign_rider('b3', ${r2})`)).ok, 'another store cannot reassign');
ok((await as(S, t => t`select partner_assign_rider('b3', ${r2})`)).ok, 'the store reassigns to another rider');
ok((await bk('b3')).deliveryId === r2, '… which takes effect');
ok((await as(S, t => t`select partner_remove_rider(${r2})`)).ok, 'the store removes a rider');
b = await bk('b3');
ok(!b.deliveryId && b.offer?.riderId === r1, 'their open order goes back to dispatch');
ok(!(await as(S, t => t`select partner_set_pickup(51.5, -0.12)`)).ok, 'pickup outside India refused');

// Customer can still cancel
await sql`update bookings set data = jsonb_set(data, '{when}', to_jsonb(${hrs(48)}::text)) where id = 'b3'`;
ok((await as(K, t => t`update bookings set data = data || '{"status":"cancelled"}' where id = 'b3'`)).ok, 'customers can still cancel');

// Stores without their own riders keep the old behaviour
ok((await place(K, order('b4', 'p1', 'medicine', { deliveryId: 'dp1', deliveryName: 'Ravi Kumar' }))).ok && (await bk('b4')).deliveryId === 'dp1', 'stores without riders keep WellNest’s delivery pool');

// Coach home visit
await as(C, t => t`select set_presence(true, 12.95, 77.60, 20)`);
await place(K, order('f1', 'co-c', 'fitness', { when: hrs(2), partnerName: 'Coach Meera' }));
await place(K, order('f2', 'co-c', 'fitness', { when: hrs(30), partnerName: 'Coach Meera' }));
ok((await as(K, t => t`select * from track_booking('f1')`)).v?.[0]?.lat === 12.95, 'the customer sees the coach approaching before a visit');
ok((await as(K, t => t`select * from track_booking('f2')`)).v?.[0]?.lat === null, 'but not more than 3 hours before');
ok((await as(C, t => t`select * from job_details('f1')`)).v?.[0]?.address === '12, 4th Cross', 'the coach gets the visit address');
ok((await as(C, t => t`select partner_update_status('f1', 'in_progress')`)).ok, 'the coach marks the visit started');

console.log(`${pass} passed, ${fail} failed`);
await sql.end();
process.exit(fail ? 1 : 0);

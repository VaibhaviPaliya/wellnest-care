// Batch 4 (0009): massage therapists — registration, visibility, booking rules, progress and tracking.
import postgres from 'postgres';
const sql = postgres({ onnotice: () => {} });
const id = n => `00000000-0000-0000-0000-0000000009${String(n).padStart(2, '0')}`;
const K = id(1), A = id(2), T = id(3), U = id(4), X = id(5), ADM = id(6);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
async function as(uid, fn) {
  try { return await sql.begin(async t => { await t`select set_config('request.jwt.claim.sub', ${uid ?? ''}, true)`; await t.unsafe('set local role authenticated'); return { ok: true, v: await fn(t) }; }); }
  catch (e) { return { ok: false, err: e.message }; }
}
await sql`truncate auth.users cascade`; await sql`delete from catalog`; await sql`delete from bookings`;
for (const [u, r] of [[K, 'senior'], [A, 'family'], [T, 'partner'], [U, 'partner'], [X, 'senior'], [ADM, 'admin']]) {
  await sql`insert into auth.users (id, email) values (${u}, ${u + '@x.test'})`;
  await sql`insert into user_roles (user_id, role) values (${u}, ${r})`;
}
await sql`update profiles set pincode = '560011', consent_at = now(), health = ${sql.json({ conditions: ['diabetes'], mobility: 'independent' })} where id = ${K}`;
await sql`update profiles set pincode = '560011', consent_at = now(), health = ${sql.json({ conditions: ['heart'], mobility: 'independent' })} where id = ${X}`;
await sql`insert into family_links (family_id, senior_id) values (${A}, ${K})`;

const app = {
  name: 'Lakshmi Prasad', licence: 'AYU-123', servicePincodes: ['560011'], slots: ['10:00', '16:00'], gender: 'female', bio: 'Gentle', years: 8,
  services: [{ id: 'sv-1', name: 'Full body', minutes: 60, price: 900 }, { id: 'sv-2', name: 'Foot', minutes: 30, price: 500 }],
  verified: true, rating: 5, ratingSummary: { avg: 5, count: 99 },
};
const r = await as(T, t => t`select submit_partner('therapist', ${t.json(app)}) id`);
ok(r.ok && /^th-/.test(r.v[0].id), 'a partner registers as a therapist');
const tid = r.v?.[0].id;
const [row] = await sql`select data from catalog where id = ${tid}`;
ok(row.data.verified === false && row.data.status === 'pending' && row.data.rating === 0, 'the listing starts pending and unverified, whatever the browser sent');
ok(!(await as(U, t => t`select submit_partner('therapist', ${t.json({ ...app, services: [] })})`)).ok, 'at least one service');
ok(!(await as(U, t => t`select submit_partner('therapist', ${t.json({ ...app, services: Array(7).fill(0).map((_, i) => ({ id: 'sv-' + i, name: 'x', minutes: 30, price: 100 })) })})`)).ok, 'at most 6 services');
ok(!(await as(U, t => t`select submit_partner('therapist', ${t.json({ ...app, services: [{ id: 'sv-1', name: 'x', minutes: 5, price: 100 }] })})`)).ok, 'services last 15–120 minutes');
ok(!(await as(U, t => t`select submit_partner('therapist', ${t.json({ ...app, services: [{ id: 'sv-1', name: 'x', minutes: 30, price: 0 }] })})`)).ok, 'services cost at least ₹1');
ok(!(await as(U, t => t`select submit_partner('therapist', ${t.json({ ...app, slots: ['25:00'] })})`)).ok, 'slots must be valid times');
ok(!(await as(U, t => t`select submit_partner('therapist', ${t.json({ ...app, gender: 'other-value' })})`)).ok, 'gender is female, male or blank');
ok(!(await as(K, t => t`select submit_partner('therapist', ${t.json(app)})`)).ok, 'a senior cannot register as a therapist');
ok(!(await as(T, t => t`select submit_partner('coach', ${t.json({ ...app, price: 500 })})`)).ok, 'one account, one listing type');

ok((await as(K, t => t`select id from catalog where kind = 'therapist'`)).v.length === 0, 'customers cannot see an unapproved therapist');
ok((await as(T, t => t`select id from catalog where kind = 'therapist'`)).v.length === 1, 'the therapist sees their own listing');
await sql`update catalog set data = data || '{"verified": true, "status": "approved"}' where id = ${tid}`;
ok((await as(K, t => t`select id from catalog where kind = 'therapist'`)).v.length === 1, 'customers see an approved therapist');
await as(T, t => t`select submit_partner('therapist', ${t.json({ ...app, bio: 'Edited' })})`);
const [after] = await sql`select data from catalog where id = ${tid}`;
ok(after.data.verified === false && after.data.bio === 'Edited', 'editing sends the listing back for review');
await sql`update catalog set data = data || '{"verified": true, "status": "approved"}' where id = ${tid}`;

// Booking rules
const ist = (days, hm) => { const d = new Date(Date.now() + days * 86400e3 + 5.5 * 3600e3).toISOString().slice(0, 10); return new Date(`${d}T${hm}:00+05:30`).toISOString(); };
const when = ist(2, '10:00');
const book = (who, senior, bid, extra = {}) => as(who, t => t`insert into bookings (id, senior_id, booked_by, data) values (${bid}, ${senior}, ${who}, ${t.json({ id: bid, type: 'therapy', partnerId: tid, partnerName: 'Lakshmi', status: 'confirmed', when, title: 'Full body', serviceId: 'sv-1', amount: 900, ...extra })})`);
ok(!(await book(K, K, 'b0', { serviceId: 'sv-x' })).ok, 'an unknown service is refused');
ok(!(await book(K, K, 'b0', { amount: 1 })).ok, 'the price must match the service');
ok(!(await book(K, K, 'b0', { when: ist(2, '11:15') })).ok, 'the time must be one of the therapist\'s slots');
ok(!(await book(K, K, 'b0', { subscriptionId: 's1', amount: 0 })).ok, 'coach pack credits cannot pay for therapy');
ok((await book(A, K, 'b1')).ok, 'family books a valid therapy visit');
ok(!(await book(K, K, 'b2')).ok, 'the same slot cannot be booked twice');
ok(!(await book(X, X, 'b3', { when: ist(2, '16:00') })).ok, 'a senior with a heart condition needs a doctor\'s OK');
ok((await book(X, X, 'b3', { when: ist(2, '16:00'), doctorApproved: true })).ok, '… and can book after confirming it');
await sql`update profiles set pincode = '110001' where id = ${K}`;
ok(!(await book(K, K, 'b4', { when: ist(3, '10:00') })).ok, 'therapists only visit their service pincodes');
await sql`update profiles set pincode = '560011' where id = ${K}`;

// Progress and visibility for the therapist
ok((await as(T, t => t`select id from bookings`)).v.length === 2, 'the therapist sees their bookings');
ok((await as(T, t => t`select * from job_details('b1')`)).ok, 'the therapist sees the customer address for an active visit');
ok(!(await as(K, t => t`select partner_update_status('b1', 'in_progress')`)).ok, 'the customer cannot start the visit');
ok(!(await as(T, t => t`select partner_update_status('b1', 'completed')`)).ok, 'a visit must start before it completes');
ok((await as(T, t => t`select partner_update_status('b1', 'in_progress')`)).ok, 'the therapist starts the visit');
ok((await as(T, t => t`select partner_update_status('b1', 'completed')`)).ok, 'the therapist completes the visit');
ok(!(await as(U, t => t`select partner_update_status('b3', 'in_progress')`)).ok, 'another partner cannot update it');

// Tracking
const tr = await as(A, t => t`select * from track_booking('b3')`);
ok(!tr.ok, 'family of another senior cannot track this visit');
const tr2 = await as(X, t => t`select * from track_booking('b3')`);
ok(tr2.ok && tr2.v[0]?.role === 'therapist' && tr2.v[0]?.lat == null, 'the senior can track, and the location stays hidden until 3 hours before');

// Detailed review on therapy
const rv = (score) => as(A, t => t`update bookings set data = data || ${t.json({ review: { rating: 5, punctuality: score, safety: 5, explanation: 5, text: 'Kind' } })} where id = 'b1'`);
ok(!(await rv(null)).ok, 'therapy reviews need every sub-score');
ok((await rv(4)).ok, 'family leaves a detailed therapy review');
const [sum] = await sql`select data->'ratingSummary' s from catalog where id = ${tid}`;
ok(sum.s?.count === 1, 'the therapist\'s rating summary updates');

console.log(`${pass} passed, ${fail} failed`);
await sql.end(); process.exit(fail ? 1 : 0);

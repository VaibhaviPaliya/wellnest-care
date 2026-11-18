import postgres from 'postgres';
const sql = postgres({ onnotice: () => {} }); // uses PGHOST / PGPORT / PGUSER / PGDATABASE
const K = '00000000-0000-0000-0000-00000000000a', H = '00000000-0000-0000-0000-00000000000b', A = '00000000-0000-0000-0000-00000000000c', X = '00000000-0000-0000-0000-00000000000d', AD = '00000000-0000-0000-0000-00000000000e';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
async function as(uid, fn) {
  try { return await sql.begin(async t => { await t`select set_config('request.jwt.claim.sub', ${uid ?? ''}, true)`; await t.unsafe('set local role authenticated'); return { ok: true, v: await fn(t) }; }); }
  catch (e) { return { ok: false, err: e.message }; }
}
const fut = new Date(Date.now() + 86400000).toISOString(), past = new Date(Date.now() - 86400000).toISOString();
const bk = (id, senior, by, partner = 'c1', when = fut) => ({ id, senior, by, data: { type: 'fitness', partnerId: partner, when, status: 'confirmed', title: 'Yoga' } });
const ins = (t, b) => t`insert into bookings (id, senior_id, booked_by, data) values (${b.id}, ${b.senior}, ${b.by}, ${t.json(b.data)})`;

await sql`truncate auth.users cascade`; await sql`delete from catalog`;
for (const [id, ph] of [[K, '9876543210'], [H, '9876500001'], [A, '9123456789'], [X, '9000000001'], [AD, '9999999999']]) {
  await sql`insert into auth.users (id, email) values (${id}, ${ph + '@phone.wellnest.app'})`;
  await sql`update profiles set phone = ${ph}, name = ${'P' + ph} where id = ${id}`;
}
for (const [id, r] of [[K, 'senior'], [H, 'senior'], [A, 'family'], [X, 'family'], [AD, 'admin']]) await sql`insert into user_roles (user_id, role) values (${id}, ${r})`;
await sql`update profiles set consent_at = now(), health = ${sql.json({ conditions: ['diabetes'] })}, address = 'Jayanagar' where id = ${K}`;
await sql`insert into catalog (kind, id, data) values ('coach','c1',${sql.json({ name: 'Meera', verified: true })}), ('coach','c5',${sql.json({ name: 'Sunil', verified: false })}), ('meta','demo_seeded',${sql.json({})})`;

// linking
ok(!(await as(K, t => t`select link_senior('9876543210')`)).ok, 'a senior cannot use link_senior');
ok(!(await as(A, t => t`select link_senior('9000000099')`)).ok, 'unknown number is rejected');
ok((await as(A, t => t`select link_senior('9876543210')`)).ok, 'family links to senior by phone');
ok(!(await as(A, t => t`select link_senior('9876543210')`)).ok, 'duplicate link rejected');
ok((await sql`select count(*)::int c from notices where user_id = ${K}`)[0].c === 1, 'senior is alerted when a family member links');

// bookings
ok((await as(K, t => ins(t, bk('b1', K, K)))).ok, 'senior books for self');
ok((await as(A, t => ins(t, bk('b2', K, A, 'c1', new Date(Date.now() + 2 * 86400000).toISOString())))).ok, 'linked family books for senior');
ok(!(await as(X, t => ins(t, bk('b3', K, X)))).ok, 'unlinked family cannot book for senior');
ok(!(await as(A, t => ins(t, bk('b4', H, A)))).ok, 'family cannot book for a senior they are not linked to');
ok(!(await as(K, t => ins(t, bk('b5', K, K, 'c5', new Date(Date.now() + 3 * 86400000).toISOString())))).ok, 'BR1: unverified coach rejected');
ok(!(await as(K, t => ins(t, bk('b6', K, K, 'c1', past)))).ok, 'BR5: past time rejected');
ok(!(await as(H, t => ins(t, bk('b7', H, H, 'c1', fut)))).ok, 'BR5: same coach slot cannot be double-booked');
ok(!(await as(A, t => ins(t, bk('b8', K, K, 'c1', new Date(Date.now() + 4 * 86400000).toISOString())))).ok, 'booked_by cannot be spoofed');
const seen = async uid => (await as(uid, t => t`select id from bookings order by id`)).v?.map(r => r.id).join(',');
ok(await seen(A) === 'b1,b2', 'family sees the linked senior’s bookings');
ok(await seen(X) === '', 'unlinked family sees nothing');
ok(await seen(H) === '', 'another senior sees nothing');
ok(await seen(AD) === 'b1,b2', 'admin sees all bookings');
ok((await as(AD, t => t`update bookings set data = jsonb_set(data, '{status}', '"in_progress"') where id = 'b1' returning id`)).v?.length === 1, 'admin can update a booking status');
ok(!(await as(K, t => t`update bookings set data = jsonb_set(data, '{when}', ${JSON.stringify(past)}::jsonb) where id = 'b1'`)).ok, 'time of a booking cannot be changed');
ok((await as(X, t => t`update bookings set data = '{}' where id = 'b1' returning id`)).v?.length === 0, 'unlinked user cannot edit a booking');

// notices
const nt = (t, id, user, senior) => t`insert into notices (id, user_id, senior_id, data) values (${id}, ${user}, ${senior}, ${t.json({ title: 't' })})`;
ok((await as(K, t => nt(t, 'n1', A, K))).ok, 'senior alerts linked family');
ok((await as(AD, t => nt(t, 'n2', K, K))).ok, 'admin alerts senior on status change');
ok(!(await as(X, t => nt(t, 'n3', K, K))).ok, 'unlinked user cannot alert the senior');
ok(!(await as(K, t => nt(t, 'n4', X, K))).ok, 'cannot alert someone who is not linked');
ok((await as(A, t => t`select id from notices`)).v?.map(r => r.id).join(',') === 'n1', 'family reads only their own alerts');

// people + health
const people = async uid => (await as(uid, t => t`select id, health, consent_at, role, linked_senior_ids from visible_people()`)).v;
const pa = await people(A);
ok(pa.length === 2 && pa.find(p => p.id === K)?.health?.conditions?.[0] === 'diabetes', 'family sees linked senior incl. health');
ok(pa.find(p => p.id === A)?.linked_senior_ids?.[0] === K, 'family sees own links');
const pad = await people(AD);
ok(pad.length === 5 && pad.find(p => p.id === K).health === null, 'admin sees everyone but no health data');
ok((await people(X)).length === 1, 'unlinked family sees only themselves');
ok((await people(K)).some(p => p.id === A), 'senior sees family members linked to them');
ok(!(await as(H, t => t`update profiles set health = ${t.json({ conditions: [] })} where id = ${H}`)).ok, 'BR3: health cannot be saved without consent');
ok((await as(A, t => t`select save_senior_profile(${K}, ${t.json({ conditions: ['high_bp'] })}, 'New address')`)).ok, 'linked family edits senior health');
ok(!(await as(X, t => t`select save_senior_profile(${K}, ${t.json({ conditions: [] })}, 'x')`)).ok, 'unlinked family cannot edit senior health');
ok((await as(K, t => t`update profiles set health = null, consent_at = null where id = ${K} returning id`)).v?.length === 1, 'senior deletes own health data and consent');

// care items
const ci = (t, id, kind, senior) => t`insert into care_items (id, kind, senior_id, data) values (${id}, ${kind}, ${senior}, ${t.json({ label: 'x' })})`;
ok((await as(A, t => ci(t, 'r1', 'reminder', K))).ok, 'family adds a reminder for the senior');
ok(!(await as(X, t => ci(t, 'r2', 'reminder', K))).ok, 'unlinked family cannot add reminders');
ok((await as(K, t => ci(t, 'q1', 'request', K))).ok, 'senior raises a review request');
ok((await as(AD, t => t`update care_items set data = '{"status":"approved"}' where id = 'q1' returning id`)).v?.length === 1, 'admin records a review decision');
ok((await as(AD, t => t`update care_items set data = '{}' where id = 'r1' returning id`)).v?.length === 0, 'admin cannot edit a reminder');

// catalogue
ok((await as(K, t => t`update catalog set data = '{"verified":true}' where id = 'c5' returning id`)).v?.length === 0, 'senior cannot verify partners');
ok((await as(AD, t => t`update catalog set data = jsonb_set(data, '{verified}', 'true') where id = 'c5' returning id`)).v?.length === 1, 'admin verifies a partner');
ok((await as(K, t => t`select id from catalog`)).v?.every(r => r.id !== 'demo_seeded'), 'internal markers hidden from users');

// co-family: a second family member linked to the same senior is visible (for alerts), without health
await sql`insert into family_links (family_id, senior_id) values (${X}, ${K})`;
const px = await people(X);
ok(px.some(p => p.id === A && p.health === null && p.linked_senior_ids.includes(K)), 'co-family member visible with shared link, no health');
{ const r = await as(A, t => nt(t, 'n5', X, K)); if (!r.ok) console.log(r.err); ok(r.ok, 'family alerts the other family member of the same senior'); }
await sql`delete from family_links where family_id = ${X}`;

// links removal
ok((await as(X, t => t`delete from family_links returning family_id`)).v?.length === 0, 'unlinked user cannot remove a link');
ok((await as(K, t => t`delete from family_links where family_id = ${A} returning family_id`)).v?.length === 1, 'senior removes family access');
ok(await seen(A) === '', 'after unlinking, family no longer sees bookings');
ok(!(await as(null, t => t`select * from bookings`)).ok || (await as(null, t => t`select * from bookings`)).v.length === 0, 'signed-out requests see nothing');

console.log(`\n${pass} passed, ${fail} failed`); await sql.end(); process.exit(fail ? 1 : 0);

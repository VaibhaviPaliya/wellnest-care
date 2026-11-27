// Batch 2 (0007): verified detailed reviews, rating summaries, certificates.
import postgres from 'postgres';
const sql = postgres({ onnotice: () => {} });
const id = n => `00000000-0000-0000-0000-0000000004${String(n).padStart(2, '0')}`;
const K = id(1), A = id(2), X = id(3), C = id(4), AD = id(5), S = id(6);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
async function as(uid, fn) {
  try { return await sql.begin(async t => { await t`select set_config('request.jwt.claim.sub', ${uid ?? ''}, true)`; await t.unsafe('set local role authenticated'); return { ok: true, v: await fn(t) }; }); }
  catch (e) { return { ok: false, err: e.message }; }
}
await sql`truncate auth.users cascade`; await sql`delete from catalog`;
for (const [u, r] of [[K, 'senior'], [A, 'family'], [X, 'family'], [C, 'partner'], [AD, 'admin'], [S, 'partner']]) {
  await sql`insert into auth.users (id, email) values (${u}, ${u + '@x.test'})`;
  await sql`insert into user_roles (user_id, role) values (${u}, ${r})`;
}
await sql`update profiles set name = 'Kamala Iyer', pincode = '560011' where id = ${K}`;
await sql`insert into family_links (family_id, senior_id) values (${A}, ${K})`;
await sql`insert into catalog (kind, id, data) values
  ('coach', 'co-1', ${sql.json({ id: 'co-1', name: 'Meera', verified: true, ownerId: C, servicePincodes: ['560011'] })}),
  ('pharmacy', 'ph-1', ${sql.json({ id: 'ph-1', name: 'Apollo', verified: true, ownerId: S, servicePincodes: ['560011'] })})`;
const mk = async (bid, type, partner, status) => sql`insert into bookings (id, senior_id, booked_by, data) values (${bid}, ${K}, ${K}, ${sql.json({ id: bid, type, partnerId: partner, status, when: new Date(Date.now() - 86400000).toISOString() })})`;
await mk('f1', 'fitness', 'co-1', 'completed'); await mk('f2', 'fitness', 'co-1', 'completed'); await mk('f3', 'fitness', 'co-1', 'confirmed'); await mk('m1', 'medicine', 'ph-1', 'completed');
const rev = (u, bid, r) => as(u, t => t`update bookings set data = data || ${t.json({ review: r })} where id = ${bid}`);
const full = { rating: 4, text: 'Kind and on time', punctuality: 5, safety: 4, explanation: 4 };

ok(!(await rev(K, 'f3', full)).ok, 'cannot review before completion');
ok(!(await rev(K, 'f1', { rating: 4, text: '' })).ok, 'coach sessions need the three detailed scores');
ok(!(await rev(K, 'f1', { ...full, safety: 7 })).ok, 'scores must be 1–5');
ok(!(await rev(K, 'f1', { ...full, text: 'x'.repeat(501) })).ok, 'text limited to 500 characters');
ok(!((await rev(X, 'f1', full)).v?.count), 'an unlinked family member cannot review (row not visible)');
ok(!(await rev(C, 'f1', full)).ok || !((await rev(C, 'f1', full)).v?.count), 'the coach cannot review their own session');
ok((await rev(K, 'f1', full)).ok, 'the senior reviews a completed session');
ok(!(await rev(K, 'f1', { ...full, rating: 5 })).ok, 'a review cannot be changed or repeated');
ok((await rev(A, 'f2', { rating: 2, text: '', punctuality: 1, safety: 3, explanation: 2 })).ok, 'linked family can review too');
ok((await rev(K, 'm1', { rating: 5, text: '' })).ok, 'orders need only an overall rating');
let s = (await sql`select data->'ratingSummary' s from catalog where id='co-1'`)[0].s;
ok(s && s.count === 2 && Number(s.avg) === 3 && Number(s.punctuality) === 3, 'the coach rating summary is recalculated by the server');
const pr = (await as(X, t => t`select * from partner_reviews('co-1')`)).v ?? [];
ok(pr.length === 2 && pr.every(r => r.reviewer === 'Kamala') && !('senior_id' in pr[0]), 'anyone signed in sees verified reviews with first names only');
ok(!(await as(K, t => t`select admin_hide_review('f2', true)`)).ok, 'only admins hide reviews');
ok((await as(AD, t => t`select admin_hide_review('f2', true)`)).ok, 'the admin hides an abusive review');
s = (await sql`select data->'ratingSummary' s from catalog where id='co-1'`)[0].s;
ok(s.count === 1 && Number(s.avg) === 4, 'hidden reviews drop out of the summary');
ok(((await as(X, t => t`select * from partner_reviews('co-1')`)).v ?? []).length === 1, 'and are not shown to customers');

// Certificates
const DOC = 'data:application/pdf;base64,JVBERi0xLjQK';
ok(!(await as(K, t => t`select partner_upload_certificate('Yoga', 'AYUSH', ${DOC})`)).ok, 'seniors cannot upload certificates');
ok(!(await as(S, t => t`select partner_upload_certificate('Yoga', 'AYUSH', ${DOC})`)).ok, 'pharmacies cannot either');
ok(!(await as(C, t => t`select partner_upload_certificate('Yoga', 'AYUSH', 'data:text/html;base64,PGgxPg==')`)).ok, 'only image/PDF files');
const cid = (await as(C, t => t`select partner_upload_certificate('Yoga Instructor 200h', 'Yoga Certification Board', ${DOC}) id`)).v?.[0]?.id;
ok(!!cid, 'the coach uploads a certificate');
ok(!(await as(C, t => t`select doc from partner_certificates`)).ok, 'nobody reads the file column directly');
ok(((await as(C, t => t`select id, status from partner_certificates`)).v ?? [])[0]?.status === 'pending', 'the coach sees it as pending');
ok(((await as(K, t => t`select id from partner_certificates`)).v ?? []).length === 0, 'customers see no certificates table rows');
ok(!(await as(C, t => t`select certificate_document(${cid})`)).ok, 'only admins open the file');
ok((await as(AD, t => t`select certificate_document(${cid}) d`)).v?.[0]?.d === DOC, 'the admin opens it');
ok(!(await as(AD, t => t`select review_certificate(${cid}, false, '')`)).ok, 'rejecting needs a reason');
ok((await as(AD, t => t`select review_certificate(${cid}, true, '')`)).ok, 'the admin approves it');
const certs = (await sql`select data->'certifications' c from catalog where id='co-1'`)[0].c;
ok(certs?.[0]?.name === 'Yoga Instructor 200h' && !JSON.stringify(certs).includes('base64'), 'the listing shows the name only, never the file');
await as(C, t => t`select submit_partner('coach', ${t.json({ name: 'Meera Nair', licence: 'L1', servicePincodes: ['560011'], price: 500 })})`);
const after = (await sql`select data from catalog where id='co-1'`)[0].data;
ok(after.certifications?.length === 1 && after.ratingSummary?.count === 1, 'resubmitting details keeps certificates and ratings');
ok((await as(C, t => t`select partner_delete_certificate(${cid})`)).ok && !(await sql`select data->'certifications' c from catalog where id='co-1'`)[0].c, 'deleting a certificate removes the badge');

console.log(`${pass} passed, ${fail} failed`);
await sql.end(); process.exit(fail ? 1 : 0);

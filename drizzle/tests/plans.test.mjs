// Batch 1 (0006): coach-made plans, reports, moderation.
import postgres from 'postgres';
const sql = postgres({ onnotice: () => {} });
const id = n => `00000000-0000-0000-0000-0000000003${String(n).padStart(2, '0')}`;
const C = id(1), C2 = id(2), K = id(3), A = id(4), K2 = id(5), AD = id(6), U = id(7);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
async function as(uid, fn) {
  try { return await sql.begin(async t => { await t`select set_config('request.jwt.claim.sub', ${uid ?? ''}, true)`; await t.unsafe('set local role authenticated'); return { ok: true, v: await fn(t) }; }); }
  catch (e) { return { ok: false, err: e.message }; }
}
await sql`truncate auth.users cascade`; await sql`delete from catalog`;
for (const [u, r] of [[C, 'partner'], [C2, 'partner'], [K, 'senior'], [A, 'family'], [K2, 'senior'], [AD, 'admin'], [U, 'partner']]) {
  await sql`insert into auth.users (id, email) values (${u}, ${u + '@x.test'})`;
  await sql`insert into user_roles (user_id, role) values (${u}, ${r})`;
}
await sql`insert into catalog (kind, id, data) values
  ('coach', 'co-1', ${sql.json({ id: 'co-1', name: 'Meera', verified: true, ownerId: C })}),
  ('coach', 'co-2', ${sql.json({ id: 'co-2', name: 'Pending', verified: false, ownerId: U })})`;
const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day, i) => ({ day, title: i < 6 ? 'Chair yoga' : '', minutes: i < 6 ? 15 : 0, ...(i === 0 ? { videoUrl: 'https://youtu.be/dQw4w9WgXcQ' } : {}) }));
const plan = { name: 'Chair yoga week', description: 'Gentle', intensity: 'gentle', mobility: ['assisted'], notFor: ['heart'], days };
const save = (u, p) => as(u, t => t`select coach_save_plan(${t.json(p)}) id`);

const r1 = await save(C, plan);
ok(r1.ok, 'an approved coach publishes a plan');
const pid = r1.v?.[0]?.id;
const row = (await sql`select data from catalog where kind='plan' and id=${pid}`)[0]?.data;
ok(row?.coachId === 'co-1' && row?.ownerId === C && row?.published === true, 'it is owned by the coach and live');
ok(!(await save(U, plan)).ok, 'an unapproved coach cannot publish');
ok(!(await save(K, plan)).ok, 'a senior cannot publish');
ok(!(await save(C, { ...plan, days: days.map((d, i) => (i === 1 ? { ...d, videoUrl: 'https://vimeo.com/1' } : d)) })).ok, 'non-YouTube links are refused');
ok(!(await save(C, { ...plan, days: days.slice(0, 6) })).ok, 'a plan needs all 7 days');
ok(!(await save(C, { ...plan, mobility: ['flying'] })).ok, 'unknown mobility refused');
ok(!(await save(C, { ...plan, days: days.map((d, i) => (i === 0 ? { ...d, minutes: 90 } : d)) })).ok, 'minutes over 60 refused');
ok(!(await save(C2, { ...plan, id: pid })).ok, 'another account cannot edit it');
ok(!(await as(C2, t => t`select coach_delete_plan(${pid})`)).ok, 'another account cannot delete it');
ok(!(await as(C, t => t`update catalog set data = data || '{"hidden":false}' where id = ${pid}`)).v?.count, 'coaches cannot edit plan rows directly');

// Reports
ok(!(await as(C, t => t`select report_plan(${pid}, 'bad stuff')`)).ok, 'coaches cannot report plans');
ok((await as(K, t => t`select report_plan(${pid}, 'Too hard for me') r`)).v?.[0]?.r === false, 'a senior reports it (not hidden yet)');
await as(K, t => t`select report_plan(${pid}, 'again')`);
ok((await sql`select count(*)::int n from plan_reports where plan_id=${pid}`)[0].n === 1, 'one report per person');
ok((await as(A, t => t`select report_plan(${pid}, 'Video does not match') r`)).v?.[0]?.r === true, 'a second reporter hides it');
const seen = async u => ((await as(u, t => t`select id from catalog where kind='plan' and id=${pid}`)).v ?? []).length === 1;
ok(!(await seen(K2)), 'customers no longer see the hidden plan');
ok(await seen(C), 'the coach still sees it');
ok(await seen(AD), 'the admin sees it');
ok(((await as(K, t => t`select * from plan_reports`)).v ?? []).length === 0, 'customers cannot read reports');
ok(((await as(AD, t => t`select * from plan_reports`)).v ?? []).length === 2, 'the admin reads the reports');
await save(C, { ...plan, id: pid, name: 'Renamed' });
ok((await sql`select (data->>'hidden')::boolean h from catalog where id=${pid}`)[0].h === true, 'editing does not un-hide it');

// Moderation
ok(!(await as(C, t => t`select admin_set_plan_hidden(${pid}, false)`)).ok, 'coaches cannot restore');
ok((await as(AD, t => t`select admin_set_plan_hidden(${pid}, false)`)).ok, 'the admin restores it');
ok(await seen(K2) && (await sql`select count(*)::int n from plan_reports where plan_id=${pid}`)[0].n === 0, 'restored plans are visible again with reports cleared');
ok((await as(AD, t => t`select admin_set_plan_hidden(${pid}, true)`)).ok && !(await seen(K2)), 'the admin hides it');

// Limit
for (let i = 0; i < 9; i++) await save(C, { ...plan, name: `Plan ${i}` });
ok(!(await save(C, { ...plan, name: 'Eleventh' })).ok, 'a coach can keep at most 10 plans');
ok((await as(C, t => t`select coach_delete_plan(${pid})`)).ok, 'the coach deletes their own plan');

console.log(`${pass} passed, ${fail} failed`);
await sql.end(); process.exit(fail ? 1 : 0);

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const db = new DatabaseSync(':memory:');
db.exec("attach database ':memory:' as public; create table public.app_users(id text,status text); create table public.celebrities(id text,slug text); create table public.fan_reactions(app_user_id text,celebrity_id text,business_status text,completed_at text); create table public.fan_product_events(id text,app_user_id text,event_name text,source text,properties text,occurred_at text,created_at text);");
const event = db.prepare('insert into public.fan_product_events values(?,?,?,?,?,?,?)');
const at=n=>`2026-11-13T07:${String(n).padStart(2,'0')}:00.000Z`;
for (const id of ['new','old','unknown']) db.prepare('insert into public.app_users values(?,?)').run(id,'active');
db.prepare('insert into public.celebrities values(?,?)').run('event','x-mission-1113');
for(const [id,kol,minute,start] of [['new','kol01',10,0],['new','kol02',20,0],['old','kol01',10,0],['unknown','kol02',10,null]]) event.run(`${id}-${minute}`,id,'creator_page_view','x_mission.identified',JSON.stringify({source:'x',medium:'kol',campaign:'kol-1113',kol,flowStartedAt:start===null?null:at(start)}),at(minute),at(minute));
event.run('signup-new','new','account_created','server.commit_projection','{}',at(5),at(5));
event.run('signup-old','old','account_created','server.commit_projection','{}','2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z');
for(const [id,minute] of [['new',15],['old',5],['unknown',15]]) db.prepare('insert into public.fan_reactions values(?,?,?,?)').run(id,'event','completed',at(minute));
// The only PostgreSQL syntax adaptation is the ISO timestamp cast; fixture timestamps are canonical UTC strings.
const sql = readFileSync(new URL('../../../../supabase/reports/x-mission-kol-report.sql',import.meta.url),'utf8').replaceAll('::timestamptz','');
const rows=db.prepare(sql).all().map(row=>({...row}));
assert.deepEqual(rows,[{kol:'kol01',identified_members:2,confirmed_new_signups:1,liked_members:1,confirmed_new_signups_liked:1},{kol:'kol02',identified_members:1,confirmed_new_signups:0,liked_members:1,confirmed_new_signups_liked:0}]);
console.log('SQL fixture passed: first-touch, repeat member, old account/old like excluded, missing flow remains unconfirmed');
db.close();

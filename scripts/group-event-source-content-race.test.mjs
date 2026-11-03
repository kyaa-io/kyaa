import{createRequire}from'node:module';
import{randomUUID}from'node:crypto';
import assert from'node:assert/strict';
const{Client}=createRequire(new URL('../apps/web/package.json',import.meta.url))('pg');
const a=new Client(),b=new Client(),actor=randomUUID(),creator=randomUUID(),page=randomUUID(),mission=randomUUID(),event=randomUUID(),slug='event-content-race-'+creator;
let fixture=false,fanWrite;
try{
 await a.connect();await b.connect();
 for(const client of[a,b]){const{rows:[scope]}=await client.query('select current_database()as db,inet_server_addr()as address');assert.equal(scope.db,'byus_clean');assert.equal(scope.address,null);await client.query("set statement_timeout='15s'");}
 const{rows:[release]}=await a.query('select enabled from public.group_content_release where singleton');assert.equal(release.enabled,true);
 await a.query('begin');
 await a.query('insert into public.app_users(id,privy_user_id,verified_email)values($1,$2,$3)',[actor,'did:privy:event-content-race-'+actor,actor+'@example.test']);
 await a.query("insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values($1,$2,'published','/fixture.webp',now(),'{creator}','creator')",[creator,slug]);
 await a.query("insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values($1,'ko','경합 검증','경합 검증','검증 이미지'),($1,'en','Race fixture','Race fixture','Fixture image')",[creator]);
 await a.query("insert into public.group_pages(id,kind,celebrity_id,name)values($1,'fan',$2,'Event/fan write race')",[page,creator]);
 await a.query("insert into public.group_memberships(page_id,app_user_id,role)values($1,$2,'owner')",[page,actor]);
 await a.query("insert into public.group_missions(id,page_id,title,instructions,state)values($1,$2,'Linked mission','Published instructions','published')",[mission,page]);
 await a.query("insert into public.group_events(id,page_id,title,description,starts_at,ends_at,opens_at,closes_at,location,capacity,requires_approval,state,created_by)values($1,$2,'Concurrent event','Original',now()+interval'1 day',now()+interval'2 day',now()-interval'1 day',now()+interval'1 hour','Park',10,false,'published',$3)",[event,page,actor]);
 await a.query('commit');fixture=true;
 await a.query('begin');await a.query('select public.fan_web_lock_active_user($1)',[actor]);
 const{rows:[{pid:eventPid}]}=await a.query('select pg_backend_pid()as pid');const{rows:[{pid:fanPid}]}=await b.query('select pg_backend_pid()as pid');
 await b.query('begin');
 // The real fan-write path holds groups-page and waits for the same actor's existing user lock.
 fanWrite=b.query("select public.save_fan_post($1,$2,null,'Independent fan content','public','{}'::uuid[],null,$3)as result",[actor,slug,randomUUID()]).then(result=>({ok:true,result:result.rows[0].result}),error=>({ok:false,message:error.message}));
 const deadline=Date.now()+10000;let blocked=false;while(Date.now()<deadline){const{rows:[state]}=await a.query('select $1::integer=any(pg_blocking_pids($2::integer))as blocked',[eventPid,fanPid]);if(state.blocked){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}assert.equal(blocked,true,'real fan write must be waiting for this actor');
 const{rows:[{payload}]}=await a.query("select jsonb_build_object('requestId',$2::text,'expectedRevision',revision,'title',title,'description',description,'imageUrl',image_url,'startsAt',starts_at,'endsAt',ends_at,'opensAt',opens_at,'closesAt',closes_at,'location',location,'capacity',capacity,'requiresApproval',requires_approval,'state','cancelled','linkedMissionId',$3::text,'cancellationReason','Concurrent optional reason')as payload from public.group_events where id=$1",[event,randomUUID(),mission]);
 const{rows:[saved]}=await a.query("select public.group_activities_dispatch('event-save',$1,$2,$3,null,$4::jsonb)as result",[actor,page,event,JSON.stringify(payload)]);
 assert.equal(saved.result.event.cancellationReason,'Concurrent optional reason');assert.equal(saved.result.event.linkedMissionId,mission);
 await a.query('rollback');const fanResult=await fanWrite;assert.equal(fanResult.ok,true,fanResult.message);assert.ok(fanResult.result.id);await b.query('rollback');
 const{rows:[unchanged]}=await a.query('select state,revision,linked_mission_id,cancellation_reason from public.group_events where id=$1',[event]);assert.deepEqual(unchanged,{state:'published',revision:1,linked_mission_id:null,cancellation_reason:null});
 console.log('PASS actual save_fan_post and event-save share one actor without a groups-page/user lock cycle; both writes rolled back');
}finally{
 await a.query('rollback').catch(()=>{});if(fanWrite)await fanWrite.catch(()=>{});await b.query('rollback').catch(()=>{});
 if(fixture){await a.query('begin');await a.query('delete from public.group_events where id=$1',[event]);await a.query('delete from public.group_missions where id=$1',[mission]);await a.query('delete from public.group_memberships where page_id=$1',[page]);await a.query('delete from public.group_pages where id=$1',[page]);
 // Only synthetic rows on the guarded disposable DB; published content/signup cleanup must bypass immutable delete triggers.
 await a.query("set local session_replication_role='replica'");await a.query("delete from public.fan_product_events where app_user_id=$1 and event_name='account_created'",[actor]);await a.query('delete from public.celebrity_localizations where celebrity_id=$1',[creator]);await a.query('delete from public.celebrities where id=$1',[creator]);await a.query("set local session_replication_role='origin'");await a.query('delete from public.app_users where id=$1',[actor]);await a.query('commit');console.log('PASS isolated committed fan-write race fixtures cleaned');}
 await b.end().catch(()=>{});await a.end().catch(()=>{});
}

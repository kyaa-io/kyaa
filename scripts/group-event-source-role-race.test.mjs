import{createRequire}from'node:module';
import{randomUUID}from'node:crypto';
import assert from'node:assert/strict';
const{Client}=createRequire(new URL('../apps/web/package.json',import.meta.url))('pg');
const a=new Client(),b=new Client(),owner=randomUUID(),manager=randomUUID(),page=randomUUID(),mission=randomUUID(),event=randomUUID(),roleRequest=randomUUID(),saveRequest=randomUUID();
let fixture=false,save;
try{
 await a.connect();await b.connect();
 for(const client of[a,b]){const{rows:[scope]}=await client.query("select current_database()as db,inet_server_addr()as address");assert.equal(scope.db,'byus_clean');assert.equal(scope.address,null);await client.query("set statement_timeout='15s'");}
 await a.query('begin');
 await a.query('insert into public.app_users(id,privy_user_id,verified_email)values($1,$2,$3),($4,$5,$6)',[owner,'did:privy:event-role-race-'+owner,owner+'@example.test',manager,'did:privy:event-role-race-'+manager,manager+'@example.test']);
 await a.query("insert into public.group_pages(id,kind,name)values($1,'hobby','Event source role race')",[page]);
 await a.query("insert into public.group_memberships(page_id,app_user_id,role)values($1,$2,'owner'),($1,$3,'manager')",[page,owner,manager]);
 await a.query("insert into public.group_missions(id,page_id,title,instructions,state)values($1,$2,'Race mission','Published instructions','published')",[mission,page]);
 await a.query("insert into public.group_events(approval_status,id,page_id,title,description,starts_at,ends_at,opens_at,closes_at,location,capacity,requires_approval,state,created_by)values('approved',$1,$2,'Race event','Original',now()+interval'1 day',now()+interval'2 day',now()-interval'1 day',now()+interval'1 hour','Park',10,false,'published',$3)",[event,page,owner]);
 await a.query('commit');fixture=true;
 await a.query('begin');
 // Hold the real role-change lock plus activity lock while the second session reads the old committed manager role.
 await a.query("select public.groups_dispatch('role',$1,$2,null,$3::jsonb)",[owner,page,JSON.stringify({appUserId:manager,role:'member',requestId:roleRequest})]);
 await a.query("select pg_advisory_xact_lock(hashtextextended('group-activity-page:'||$1::text,0))",[page]);
 const{rows:[{pid:rolePid}]}=await a.query('select pg_backend_pid()as pid');
 const{rows:[{pid:savePid}]}=await b.query('select pg_backend_pid()as pid');
 const{rows:[{payload}]}=await a.query("select jsonb_build_object('requestId',$2::text,'expectedRevision',revision,'title',title,'description',description,'imageUrl',image_url,'startsAt',starts_at,'endsAt',ends_at,'opensAt',opens_at,'closesAt',closes_at,'location',location,'capacity',capacity,'requiresApproval',requires_approval,'state','cancelled','linkedMissionId',$3::text,'cancellationReason','Must not be stored after revocation')as payload from public.group_events where id=$1",[event,saveRequest,mission]);
 await b.query('begin');
 save=b.query("select public.group_activities_dispatch('event-save',$1,$2,$3,null,$4::jsonb)",[manager,page,event,JSON.stringify(payload)]).then(()=>({accepted:true}),error=>({accepted:false,message:error.message}));
 const deadline=Date.now()+10000;let blocked=false;
 while(Date.now()<deadline){const{rows:[state]}=await a.query('select $1::integer=any(pg_blocking_pids($2::integer))as blocked',[rolePid,savePid]);if(state.blocked){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
 assert.equal(blocked,true,'event-save must be blocked behind the role transaction');
 await a.query('commit');
 const result=await save;await b.query('rollback');
 assert.equal(result.accepted,false,'revoked manager must not save using a role read before the wait');assert.equal(result.message,'GROUP_ACTIVITY_FORBIDDEN');
 const{rows:[state]}=await a.query('select state,revision,linked_mission_id,cancellation_reason from public.group_events where id=$1',[event]);
 assert.deepEqual(state,{state:'published',revision:1,linked_mission_id:null,cancellation_reason:null});
 const{rows:[{count}]}=await a.query('select count(*)::integer as count from public.group_activity_receipts where actor_id=$1 and request_id=$2',[manager,saveRequest]);assert.equal(count,0);
 console.log('PASS deterministic two-connection role revocation blocks event-save; no event/source-field/receipt mutation');
}finally{
 await a.query('rollback').catch(()=>{});if(save)await save.catch(()=>{});await b.query('rollback').catch(()=>{});
 if(fixture){await a.query('begin');await a.query('delete from public.group_action_receipts where actor_id=$1 and request_id=$2',[owner,roleRequest]);await a.query('delete from public.group_events where id=$1',[event]);await a.query('delete from public.group_missions where id=$1',[mission]);await a.query('delete from public.group_memberships where page_id=$1',[page]);await a.query('delete from public.group_pages where id=$1',[page]);// Disposable synthetic signup rows are immutable; disable their delete trigger only inside this cleanup transaction.
 await a.query("set local session_replication_role='replica'");await a.query("delete from public.fan_product_events where app_user_id=any($1::uuid[])and event_name='account_created'",[[owner,manager]]);await a.query("set local session_replication_role='origin'");await a.query('delete from public.app_users where id=any($1::uuid[])',[[owner,manager]]);await a.query('commit');console.log('PASS isolated committed role-race fixtures cleaned');}
 await b.end().catch(()=>{});await a.end().catch(()=>{});
}

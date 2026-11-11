import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { DataClient } from '../data/client';
import { ingestLocalSources } from './local-store';
import { candidates } from './local';
vi.mock('next/headers',()=>({cookies:async()=>new Map()}));
import { refreshLocalSignupEvent } from './refresh';
afterEach(()=>vi.unstubAllEnvs());
it('refreshes signup and original attendance/post sources using only selects',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'signup-refresh-'));
 try {
 const path=join(folder,'local.json');vi.stubEnv('KYAA_SIGNUP_EVENT_LOCAL','1');vi.stubEnv('KYAA_SIGNUP_EVENT_SNAPSHOT',path);
 const id='00000000-0000-4000-8000-000000000001';
 await ingestLocalSources({app_users:[],fan_action_occurrences:[],activityNamespaces:{attendance:'group_creator_attendance',post:'fan_posts'},shareRecords:[],draftWeights:{'share-click':0,'referral-signup':0,attendance:2,post:3}});
 const from=vi.fn((table:string)=>{
  const chain={select:vi.fn(()=>chain),eq:vi.fn(()=>chain),gte:vi.fn(()=>chain),lt:vi.fn(()=>chain),is:vi.fn(()=>chain),order:vi.fn(()=>chain),range:vi.fn(async()=>({data:[{id:`${table}-1`,app_user_id:id,created_at:'2026-11-11T02:00:00Z'}],error:null})),single:vi.fn(async()=>({data:{id,created_at:'2026-11-11T01:00:00Z'},error:null}))};
  return chain;
 });
 const db={from} as unknown as Pick<DataClient,'from'>;
 await refreshLocalSignupEvent(db,id);await refreshLocalSignupEvent(db,id);
 expect(candidates(JSON.parse(await readFile(path,'utf8')))).toEqual([{userId:id,entries:6}]);
 expect(from.mock.calls.map(call=>call[0])).toEqual(['app_users','group_creator_attendance','fan_posts','app_users','group_creator_attendance','fan_posts']);
 }finally{await rm(folder,{recursive:true,force:true});}
});
it('does not touch data clients when the local event is disabled',async()=>{
 vi.stubEnv('KYAA_SIGNUP_EVENT_LOCAL','');const from=vi.fn();await refreshLocalSignupEvent({from} as unknown as Pick<DataClient,'from'>,'unused');expect(from).not.toHaveBeenCalled();
});

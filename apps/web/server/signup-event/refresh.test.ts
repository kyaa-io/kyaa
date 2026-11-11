import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach,expect,it,vi } from 'vitest';
import type { DataClient } from '../data/client';
import { ingestLocalSources } from './local-store';
import { candidates } from './local';
import { refreshLocalSignupEvent } from './refresh';
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
it('connects entry, verified passport/membership, comment and attendance SELECTs for an existing member',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'raffle-refresh-'));
 try {
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-11T01:00:00Z'));
 const path=join(folder,'local.json');vi.stubEnv('KYAA_SIGNUP_EVENT_LOCAL','1');vi.stubEnv('KYAA_SIGNUP_EVENT_SNAPSHOT',path);
 const id='00000000-0000-4000-8000-000000000001';
 await ingestLocalSources({app_users:[],fan_action_occurrences:[],activityNamespaces:{attendance:'attendance',comment:'comment'}});
 const from=vi.fn((table:string)=>{
  const chain={select:vi.fn(()=>chain),eq:vi.fn(()=>chain),gte:vi.fn(()=>chain),lte:vi.fn(()=>chain),is:vi.fn(()=>chain),order:vi.fn(()=>chain),limit:vi.fn(async()=>({data:[{id:'proof'}],error:null})),range:vi.fn(async()=>({data:[{id:`${table}-1`,created_at:'2026-11-11T02:00:00Z'}],error:null})),single:vi.fn(async()=>({data:{id,created_at:'2025-01-01T00:00:00Z'},error:null}))};return chain;
 });
 const db={from} as unknown as Pick<DataClient,'from'>;
 expect(await refreshLocalSignupEvent(db,id,true)).toBe(true);await refreshLocalSignupEvent(db,id,true);
 expect(candidates(JSON.parse(await readFile(path,'utf8')))).toEqual([{userId:id,entries:4}]);
 expect(new Set(from.mock.calls.map(call=>call[0]))).toEqual(new Set(['app_users','fan_passports','group_memberships','group_creator_attendance','fan_post_comments','group_comments']));
 }finally{await rm(folder,{recursive:true,force:true});}
});
it('does not touch data clients while disabled',async()=>{vi.stubEnv('KYAA_SIGNUP_EVENT_LOCAL','');const from=vi.fn();await refreshLocalSignupEvent({from} as unknown as Pick<DataClient,'from'>,'unused');expect(from).not.toHaveBeenCalled();});

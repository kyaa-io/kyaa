import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach,expect,it,vi } from 'vitest';
import { ingestLocalSources } from './local-store';
import { candidates } from './local';
afterEach(()=>vi.unstubAllEnvs());
it('preserves one entry on retries, immutable signup time and replaces removed activity',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'raffle-'));
 try {
 const path=join(folder,'local.json');vi.stubEnv('KYAA_SIGNUP_EVENT_LOCAL','1');vi.stubEnv('KYAA_SIGNUP_EVENT_SNAPSHOT',path);
 const id='00000000-0000-4000-8000-000000000001';
 const source={app_users:[{id,created_at:'2025-01-01T00:00:00Z',passportReceived:true,communityJoined:true}],fan_action_occurrences:[{app_user_id:id,source_namespace:'comment',canonical_source_key:'comment-1',source_occurred_at:'2026-11-11T02:00:00Z'}],activityNamespaces:{attendance:'attendance',comment:'comment'},entries:[{userId:id,enteredAt:'2026-11-11T01:00:00Z'}]};
 await ingestLocalSources(source);await ingestLocalSources(source);
 let saved=JSON.parse(await readFile(path,'utf8'));expect(saved.entries).toHaveLength(1);expect(candidates(saved)[0].entries).toBe(2);
 await expect(ingestLocalSources({...source,app_users:[{...source.app_users[0],created_at:'2026-11-12T01:00:00Z'}]})).rejects.toThrow('SIGNUP_EVENT_SOURCE_CONFLICT');
 expect(JSON.parse(await readFile(path,'utf8'))).toEqual(saved);
 await ingestLocalSources({...source,fan_action_occurrences:[]},true);saved=JSON.parse(await readFile(path,'utf8'));expect(candidates(saved)[0].entries).toBe(1);
 }finally{await rm(folder,{recursive:true,force:true});}
});

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ingestLocalSources } from './local-store';
import { candidates } from './local';
afterEach(()=>vi.unstubAllEnvs());
it('ingests signup, activity and sharing into isolated local storage and safely retries',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'signup-event-'));
 try {
 const path=join(folder,'local.json');vi.stubEnv('KYAA_SIGNUP_EVENT_LOCAL','1');vi.stubEnv('KYAA_SIGNUP_EVENT_SNAPSHOT',path);
 const id='00000000-0000-4000-8000-000000000001';
 const source={app_users:[{id,created_at:'2026-11-11T01:00:00Z'}],fan_action_occurrences:[{app_user_id:id,source_namespace:'post',canonical_source_key:'post-1',source_occurred_at:'2026-11-11T02:00:00Z'}],activityNamespaces:{attendance:'attendance',post:'post'},shareRecords:[],draftWeights:{'share-click':0,'referral-signup':0,attendance:0,post:2}};
 await ingestLocalSources(source);await ingestLocalSources(source);
 const saved=JSON.parse(await readFile(path,'utf8'));expect(saved.users).toHaveLength(1);expect(saved.actions).toHaveLength(1);expect(candidates(saved)[0].entries).toBe(3);
 await expect(ingestLocalSources({...source,app_users:[{id,created_at:'2026-11-12T01:00:00Z'}]})).rejects.toThrow('SIGNUP_EVENT_SOURCE_CONFLICT');
 expect(JSON.parse(await readFile(path,'utf8'))).toEqual(saved);
 } finally {await rm(folder,{recursive:true,force:true});}
});

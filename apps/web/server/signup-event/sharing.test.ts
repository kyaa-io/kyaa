import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ingestLocalSources } from './local-store';
import { candidates } from './local';
import { createLocalShareLink, recordLocalReferral, recordLocalShareClick } from './sharing';
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
it('connects a server issued share link, deduplicated click and subsequent new signup',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'signup-sharing-'));
 try {
 const path=join(folder,'local.json');vi.stubEnv('KYAA_SIGNUP_EVENT_LOCAL','1');vi.stubEnv('KYAA_SIGNUP_EVENT_SNAPSHOT',path);
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-11T03:00:00Z'));
 const owner='00000000-0000-4000-8000-000000000001',visitor='00000000-0000-4000-8000-000000000002';
 await ingestLocalSources({app_users:[{id:owner,created_at:'2026-11-11T01:00:00Z'}],fan_action_occurrences:[],activityNamespaces:{attendance:'group_creator_attendance',post:'fan_posts'},shareRecords:[],draftWeights:{'share-click':2,'referral-signup':3,attendance:1,post:1}});
 const token=await createLocalShareLink(owner);
 await recordLocalShareClick(token,visitor);await recordLocalShareClick(token,visitor);
 await recordLocalReferral(token,visitor,'2026-11-11T04:00:00Z');await recordLocalReferral(token,visitor,'2026-11-11T04:00:00Z');
 await recordLocalReferral(token,owner,'2026-11-11T01:00:00Z');
 const snapshot=JSON.parse(await readFile(path,'utf8'));
 expect(candidates(snapshot)).toEqual([{userId:owner,entries:6},{userId:visitor,entries:1}]);
 expect(snapshot.actions).toHaveLength(2);
 } finally {await rm(folder,{recursive:true,force:true});}
});

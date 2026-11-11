import { expect, it } from 'vitest';
import { projectSources } from './source-adapter';
import { candidates } from './local';
it('connects original signup, canonical activity and verified share records without rewarding unrelated events',()=>{
 const userId='00000000-0000-4000-8000-000000000001';
 const row={app_user_id:userId,canonical_source_key:'one',source_occurred_at:'2026-11-11T02:00:00Z'};
 const input={app_users:[{id:userId,created_at:'2026-11-11T01:00:00Z'}],fan_action_occurrences:[{...row,source_namespace:'attendance'},{...row,source_namespace:'attendance'},{...row,source_namespace:'post'},{...row,source_namespace:'like'}],activityNamespaces:{attendance:'attendance',post:'post'},shareRecords:[{id:'00000000-0000-4000-8000-000000000002',owner_id:userId,occurred_at:'2026-11-11T02:00:00Z',kind:'share-click',verified:true}],draftWeights:{'share-click':1,'referral-signup':1,attendance:1,post:1}};
 expect(candidates(projectSources(input))).toEqual([{userId,entries:4}]);
 expect(()=>projectSources({...input,shareRecords:[{...input.shareRecords[0],verified:false}]})).toThrow();
});

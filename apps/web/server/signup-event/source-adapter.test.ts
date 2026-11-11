import { expect,it } from 'vitest';
import { projectSources } from './source-adapter';
import { candidates } from './local';
it('maps verified comments and attendance, excluding unrelated activity',()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const row={app_user_id:id,canonical_source_key:'one',source_occurred_at:'2026-11-11T02:00:00Z'};
 const input={app_users:[{id,created_at:'2025-01-01T00:00:00Z',passportReceived:true,communityJoined:true}],fan_action_occurrences:['attendance','comment','post','share-click'].map(source_namespace=>({...row,source_namespace})),activityNamespaces:{attendance:'attendance',comment:'comment'},entries:[{userId:id,enteredAt:'2026-11-11T01:00:00Z'}]};
 expect(candidates(projectSources(input))).toEqual([{userId:id,entries:3}]);
});

import { expect,it } from 'vitest';
import { candidates,drawLocal,localSnapshotSchema,maskedCsv,localSignupEnabled } from './local';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const enteredAt='2026-11-11T01:00:00Z';
const fixture=()=>localSnapshotSchema.parse({users:[a,b].map(id=>({id,createdAt:'2025-01-01T00:00:00Z',passportReceived:true,communityJoined:true})),actions:[],entries:[a,b].map(userId=>({userId,enteredAt}))});
it('accepts existing members only after entry, passport and community completion',()=>{
 const data=fixture();expect(candidates(data)).toEqual([{userId:a,entries:1},{userId:b,entries:1}]);
 expect(candidates({...data,entries:[]})).toEqual([]);expect(candidates({...data,users:data.users.map(user=>({...user,passportReceived:false}))})).toEqual([]);
 expect(candidates({...data,users:data.users.map(user=>({...user,communityJoined:false}))})).toEqual([]);
});
it('counts only unique comments and attendance after entry, with separate daily caps in the configured timezone',()=>{
 const data=fixture();data.policy.dailyCaps={comment:1,attendance:1};
 const action={userId:a,kind:'comment' as const,sourceId:'one',occurredAt:'2026-11-11T14:59:00Z'};
 data.actions=[action,action,{...action,sourceId:'two'},{...action,sourceId:'next-day',occurredAt:'2026-11-11T15:01:00Z'},{...action,kind:'attendance',sourceId:'checkin'},{...action,kind:'share-click'},{...action,kind:'referral-signup'},{...action,kind:'post'},{...action,sourceId:'before-entry',occurredAt:'2026-11-11T00:00:00Z'},{...action,sourceId:'late',occurredAt:'2026-12-01T00:00:00Z'}];
 expect(candidates(data)[0].entries).toBe(4);
 data.policy.timeZone='UTC';expect(candidates(data)[0].entries).toBe(3);
 data.policy.dailyCaps={comment:null,attendance:null};data.policy.weights={comment:2,attendance:3};expect(candidates(data)[0].entries).toBe(10);
 data.policy.dailyCaps={comment:0,attendance:0};expect(candidates(data)[0].entries).toBe(1);
});
it('deduplicates entries, masks identifiers and selects distinct members with stable retries',()=>{
 const data=fixture();data.entries.push(data.entries[0]);expect(candidates(data)).toHaveLength(2);
 expect(drawLocal(data,2,'retry')).toEqual(drawLocal(data,2,'retry'));expect(new Set(drawLocal(data,2,'retry').map(row=>row.userId)).size).toBe(2);
 const csv=maskedCsv(drawLocal(data,2,'retry'));expect(csv).not.toContain(a);expect(csv).not.toContain(b);expect(()=>drawLocal(data,3)).toThrow('INVALID_WINNER_QUANTITY');
});
it('requires explicit opt-in in every environment',()=>{expect(localSignupEnabled({})).toBe(false);expect(localSignupEnabled({NODE_ENV:'production',KYAA_FEATURE_SIGNUP_RAFFLE:'true'})).toBe(true);expect(localSignupEnabled({NODE_ENV:'production',KYAA_FEATURE_SIGNUP_RAFFLE:'false'})).toBe(false);});

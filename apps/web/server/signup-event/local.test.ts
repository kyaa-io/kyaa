import { expect,it } from 'vitest';
import { candidates,drawLocal,localSnapshotSchema,maskedCsv,localSignupEnabled,raffleChances } from './local';
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
 data.actions=[action,action,{...action,sourceId:'two'},{...action,sourceId:'next-day',occurredAt:'2026-11-11T15:01:00Z'},{...action,kind:'attendance',sourceId:'checkin'},{...action,kind:'share-click'},{...action,kind:'post'},{...action,sourceId:'before-entry',occurredAt:'2026-11-11T00:00:00Z'},{...action,sourceId:'late',occurredAt:'2026-12-01T00:00:00Z'}];
 expect(candidates(data)[0].entries).toBe(4);
 data.policy.timeZone='UTC';expect(candidates(data)[0].entries).toBe(3);
 data.policy.dailyCaps={comment:null,attendance:null};data.policy.weights={comment:2,attendance:3,referral:3};expect(candidates(data)[0].entries).toBe(10);
 data.policy.dailyCaps={comment:0,attendance:0};expect(candidates(data)[0].entries).toBe(1);
});
it('deduplicates entries, masks identifiers and selects distinct members with stable retries',()=>{
 const data=fixture();data.entries.push(data.entries[0]);expect(candidates(data)).toHaveLength(2);
 expect(drawLocal(data,2,'retry')).toEqual(drawLocal(data,2,'retry'));expect(new Set(drawLocal(data,2,'retry').map(row=>row.userId)).size).toBe(2);
 const csv=maskedCsv(drawLocal(data,2,'retry'));expect(csv).not.toContain(a);expect(csv).not.toContain(b);expect(()=>drawLocal(data,3)).toThrow('INVALID_WINNER_QUANTITY');
});
it('requires explicit opt-in in every environment',()=>{expect(localSignupEnabled({})).toBe(false);expect(localSignupEnabled({NODE_ENV:'production',KYAA_FEATURE_SIGNUP_RAFFLE:'true'})).toBe(true);expect(localSignupEnabled({NODE_ENV:'production',KYAA_FEATURE_SIGNUP_RAFFLE:'false'})).toBe(false);});
it('adds 3 chances per invited friend once, with no daily cap and regardless of my own entry time',()=>{
 const data=fixture();
 const friend=(sourceId:string,occurredAt:string,referredUserId?:string)=>({userId:a,kind:'referral-signup' as const,sourceId,occurredAt,...(referredUserId?{referredUserId}:{})});
 // 같은 날 친구 4명(하루 상한 없음), 그중 한 명은 내 응모 전에 응모한 친구
 data.actions=[friend('r1','2026-11-11T00:30:00Z'),friend('r2','2026-11-11T02:00:00Z'),friend('r3','2026-11-11T02:00:01Z'),friend('r4','2026-11-11T02:00:02Z')];
 expect(candidates(data)).toEqual([{userId:a,entries:13},{userId:b,entries:1}]);
 // 같은 행 반복·같은 친구의 다른 행·본인은 세지 않는다
 data.actions=[friend('r1','2026-11-11T02:00:00Z'),friend('r1','2026-11-11T02:00:00Z'),friend('x','2026-11-11T02:00:00Z',b),friend('y','2026-11-11T03:00:00Z',b),friend('self','2026-11-11T03:00:00Z',a)];
 expect(candidates(data)[0].entries).toBe(7);
 // 기간 밖은 세지 않고, 댓글 하루 상한은 그대로다
 data.actions=[friend('late','2026-12-01T00:00:00Z'),friend('early','2026-11-10T14:59:59Z'),...[0,1,2,3].map(n=>({userId:a,kind:'comment' as const,sourceId:`c${n}`,occurredAt:`2026-11-11T02:00:0${n}Z`}))];
 expect(candidates(data)[0].entries).toBe(4);
 data.policy.weights.referral=0;data.actions=[friend('r1','2026-11-11T02:00:00Z')];expect(candidates(data)[0].entries).toBe(1);
});
it('counts chances and friends for every entrant while the draw keeps its eligibility filter',()=>{
 const data=fixture();data.users[1].passportReceived=false;
 data.actions=[{userId:b,kind:'referral-signup',sourceId:'r1',occurredAt:'2026-11-11T02:00:00Z'}];
 expect(raffleChances(data)).toEqual([{userId:a,entries:1,friends:0,eligible:true},{userId:b,entries:4,friends:1,eligible:false}]);
 expect(candidates(data)).toEqual([{userId:a,entries:1}]);
});

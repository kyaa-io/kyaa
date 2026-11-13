import { afterEach,expect,it,vi } from 'vitest';
import { AuthError } from '@/features/auth/domain/auth-errors';
const mocks=vi.hoisted(()=>({authorize:vi.fn(),refresh:vi.fn(),read:vi.fn(),client:vi.fn(),rpc:vi.fn(),stored:vi.fn()}));
vi.mock('@/server/fanpage/dependencies',()=>({createFanpageDependencies:()=>({authorize:mocks.authorize,rpc:mocks.rpc})}));
vi.mock('@/server/data/client',()=>({createClient:mocks.client}));
vi.mock('@/server/config/env',()=>({loadServerEnv:()=>({})}));
vi.mock('@/server/signup-event/database',()=>({createSignupRaffleDatabase:()=>'stored-client',readSignupRaffleStored:mocks.stored}));
vi.mock('@/server/signup-event/refresh',()=>({refreshLocalSignupEvent:mocks.refresh}));
vi.mock('@/server/signup-event/local',async original=>({...await original<typeof import('@/server/signup-event/local')>(),readLocalSnapshot:mocks.read}));
import { GET, POST } from './route';
const owner='00000000-0000-4000-8000-000000000001',enteredAt='2026-11-11T01:00:00Z';
const snapshot=(actions:unknown[]=[])=>({users:[{id:owner,createdAt:'2026-11-01T00:00:00Z',passportReceived:false,communityJoined:true}],entries:[{userId:owner,enteredAt}],actions});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
it('blocks production and unauthenticated entry before source writes',async()=>{
 vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE','true');vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE','false');expect((await POST(new Request('http://localhost'))).status).toBe(404);expect(mocks.authorize).not.toHaveBeenCalled();
 vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE','true');mocks.authorize.mockRejectedValue(new AuthError('AUTHENTICATION_REQUIRED',401,'required'));
 expect((await POST(new Request('http://localhost'))).status).toBe(401);expect(mocks.refresh).not.toHaveBeenCalled();
});
it('uses the authenticated owner and ignores client eligibility claims',async()=>{
 vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE','true');mocks.authorize.mockResolvedValue({appUserId:owner});mocks.client.mockReturnValue('read-only-client');mocks.refresh.mockResolvedValue(true);mocks.read.mockResolvedValue(snapshot());
 const response=await POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({userId:'other',passportReceived:true,chances:99})}));
 expect(response.status).toBe(200);expect(mocks.refresh).toHaveBeenCalledWith('read-only-client',owner,true);expect(mocks.rpc).not.toHaveBeenCalled();
 expect(await response.json()).toEqual({entered:true,passportReceived:false,communityJoined:true,chances:1,friends:0});
});
it('registers a friend invite code through the existing referral after the entry, without failing the entry',async()=>{
 vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE','true');mocks.authorize.mockResolvedValue({appUserId:owner});mocks.refresh.mockResolvedValue(true);mocks.read.mockResolvedValue(snapshot());
 const post=(invite:unknown)=>POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({invite})}));
 mocks.rpc.mockResolvedValue({state:'registered_pending_fan_verification'});
 expect(await (await post('ab2300000000000000000001')).json()).toMatchObject({entered:true,invite:'registered'});
 expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('redeem_community_stamp_invite',{p_app_user_id:owner,p_code:'AB2300000000000000000001'});
 expect(mocks.refresh.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0]);
 mocks.rpc.mockRejectedValue(new Error('COMMUNITY_STAMP_SELF_INVITE'));
 const refused=await post('AB2300000000000000000001');expect(refused.status).toBe(200);expect(await refused.json()).toMatchObject({entered:true,invite:'refused'});
 mocks.rpc.mockRejectedValue(new Error('COMMUNITY_STAMP_WALLET_NOT_READY'));
 expect(await (await post('AB2300000000000000000001')).json()).toMatchObject({entered:true,invite:'pending'});
 mocks.rpc.mockClear();
 for(const bad of ['short',"AB23'; drop table",123,null]){const body=await (await post(bad)).json();expect(body.invite).toBeUndefined();}
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it('reads my chances from the server snapshot: 1 + community 1 + capped comments + 3 per invited friend',async()=>{
 vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE','true');mocks.authorize.mockResolvedValue({appUserId:owner});
 mocks.read.mockResolvedValue(snapshot([
  ...[0,1,2,3].map(n=>({userId:owner,kind:'comment',sourceId:`c${n}`,occurredAt:`2026-11-11T02:00:0${n}Z`})),
  {userId:owner,kind:'referral-signup',sourceId:'referral:a',occurredAt:'2026-11-10T16:00:00Z'},
  {userId:owner,kind:'referral-signup',sourceId:'referral:b',occurredAt:'2026-11-12T16:00:00Z'},
  {userId:owner,kind:'community',sourceId:'community:group_memberships',occurredAt:'2026-11-10T15:00:00Z'},
 ]));
 const response=await GET(new Request('http://localhost'));
 expect(response.status).toBe(200);expect(mocks.read).toHaveBeenCalledWith(owner);expect(mocks.refresh).not.toHaveBeenCalled();
 expect(await response.json()).toEqual({entered:true,passportReceived:false,communityJoined:true,chances:11,friends:2});
 mocks.read.mockResolvedValue({users:[],entries:[],actions:[]});
 expect(await (await GET(new Request('http://localhost'))).json()).toEqual({entered:false,passportReceived:false,communityJoined:false,chances:0,friends:0});
 mocks.authorize.mockRejectedValue(new AuthError('AUTHENTICATION_REQUIRED',401,'required'));
 expect((await GET(new Request('http://localhost'))).status).toBe(401);
 vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE','false');expect((await GET(new Request('http://localhost'))).status).toBe(404);
});
it('does not report successful entry when the window is closed or local storage fails',async()=>{
 vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE','true');mocks.authorize.mockResolvedValue({appUserId:owner});mocks.refresh.mockResolvedValue(false);
 expect((await POST(new Request('http://localhost'))).status).toBe(409);expect(mocks.read).not.toHaveBeenCalled();
});
it('adds everyone else\'s stored chances to my fresh count for the page total, and omits the total when it cannot be read',async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-20T00:00:00Z'));
 const other='00000000-0000-4000-8000-000000000002';
 vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE','true');mocks.authorize.mockResolvedValue({appUserId:owner});
 mocks.read.mockResolvedValue(snapshot([{userId:owner,kind:'comment',sourceId:'c1',occurredAt:'2026-11-11T02:00:00Z'}]));
 // 저장 값의 내 행은 아직 1회(오래됨): 합계에는 방금 센 내 값(2)을 쓴다. 다른 회원은 응모 1 + 커뮤니티 1 = 2
 mocks.stored.mockResolvedValue({users:[{id:owner,createdAt:enteredAt},{id:other,createdAt:enteredAt}],entries:[{userId:owner,enteredAt},{userId:other,enteredAt}],actions:[{userId:other,kind:'community',sourceId:'community:x',occurredAt:'2026-11-11T03:00:00Z'}]});
 expect(await (await GET(new Request('http://localhost'))).json()).toEqual({entered:true,passportReceived:false,communityJoined:true,chances:2,friends:0,totalChances:4});
 expect(mocks.stored).toHaveBeenCalledWith('stored-client');
 // 1분 안의 다음 요청은 저장 값을 다시 읽지 않는다
 await GET(new Request('http://localhost'));expect(mocks.stored).toHaveBeenCalledTimes(1);
 vi.setSystemTime(new Date('2026-11-20T00:02:00Z'));mocks.stored.mockRejectedValue(new Error('SIGNUP_RAFFLE_READ_FAILED'));
 expect(await (await GET(new Request('http://localhost'))).json()).toEqual({entered:true,passportReceived:false,communityJoined:true,chances:2,friends:0});
 vi.useRealTimers();
});

import { afterEach,expect,it,vi } from 'vitest';
import { AuthError } from '@/features/auth/domain/auth-errors';
const mocks=vi.hoisted(()=>({authorize:vi.fn(),refresh:vi.fn(),read:vi.fn(),client:vi.fn(),rpc:vi.fn()}));
vi.mock('@/server/fanpage/dependencies',()=>({createFanpageDependencies:()=>({authorize:mocks.authorize,rpc:mocks.rpc})}));
vi.mock('@/server/data/client',()=>({createClient:mocks.client}));
vi.mock('@/server/config/env',()=>({loadServerEnv:()=>({})}));
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
it('reads my chances from the server snapshot: 1 + capped comments + 3 per invited friend',async()=>{
 vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE','true');mocks.authorize.mockResolvedValue({appUserId:owner});
 mocks.read.mockResolvedValue(snapshot([
  ...[0,1,2,3].map(n=>({userId:owner,kind:'comment',sourceId:`c${n}`,occurredAt:`2026-11-11T02:00:0${n}Z`})),
  {userId:owner,kind:'referral-signup',sourceId:'referral:a',occurredAt:'2026-11-10T16:00:00Z'},
  {userId:owner,kind:'referral-signup',sourceId:'referral:b',occurredAt:'2026-11-12T16:00:00Z'},
 ]));
 const response=await GET(new Request('http://localhost'));
 expect(response.status).toBe(200);expect(mocks.read).toHaveBeenCalledWith(owner);expect(mocks.refresh).not.toHaveBeenCalled();
 expect(await response.json()).toEqual({entered:true,passportReceived:false,communityJoined:true,chances:10,friends:2});
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

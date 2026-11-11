import { afterEach,expect,it,vi } from 'vitest';
import { AuthError } from '@/features/auth/domain/auth-errors';
const mocks=vi.hoisted(()=>({authorize:vi.fn(),refresh:vi.fn(),read:vi.fn(),client:vi.fn()}));
vi.mock('@/server/fanpage/dependencies',()=>({createFanpageDependencies:()=>({authorize:mocks.authorize})}));
vi.mock('@/server/data/client',()=>({createClient:mocks.client}));
vi.mock('@/server/config/env',()=>({loadServerEnv:()=>({})}));
vi.mock('@/server/signup-event/refresh',()=>({refreshLocalSignupEvent:mocks.refresh}));
vi.mock('@/server/signup-event/local',async original=>({...await original<typeof import('@/server/signup-event/local')>(),readLocalSnapshot:mocks.read}));
import { POST } from './route';
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
it('blocks production and unauthenticated entry before source writes',async()=>{
 vi.stubEnv('KYAA_SIGNUP_EVENT_LOCAL','1');vi.stubEnv('NODE_ENV','production');expect((await POST(new Request('http://localhost'))).status).toBe(404);expect(mocks.authorize).not.toHaveBeenCalled();
 vi.stubEnv('NODE_ENV','test');mocks.authorize.mockRejectedValue(new AuthError('AUTHENTICATION_REQUIRED',401,'required'));
 expect((await POST(new Request('http://localhost'))).status).toBe(401);expect(mocks.refresh).not.toHaveBeenCalled();
});
it('uses the authenticated owner and ignores client eligibility claims',async()=>{
 vi.stubEnv('KYAA_SIGNUP_EVENT_LOCAL','1');mocks.authorize.mockResolvedValue({appUserId:'owner'});mocks.client.mockReturnValue('read-only-client');mocks.refresh.mockResolvedValue(true);mocks.read.mockResolvedValue({users:[{id:'owner',passportReceived:false,communityJoined:true}]});
 const response=await POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({userId:'other',passportReceived:true})}));
 expect(response.status).toBe(200);expect(mocks.refresh).toHaveBeenCalledWith('read-only-client','owner',true);expect(await response.json()).toEqual({entered:true,passportReceived:false,communityJoined:true});
});
it('does not report successful entry when the window is closed or local storage fails',async()=>{
 vi.stubEnv('KYAA_SIGNUP_EVENT_LOCAL','1');mocks.authorize.mockResolvedValue({appUserId:'owner'});mocks.refresh.mockResolvedValue(false);
 expect((await POST(new Request('http://localhost'))).status).toBe(409);expect(mocks.read).not.toHaveBeenCalled();
});

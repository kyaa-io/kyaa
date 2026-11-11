import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { AuthError } from '@/features/auth/domain/auth-errors';
const { authorize, read } = vi.hoisted(() => ({ authorize: vi.fn(), read: vi.fn() }));
vi.mock('@/server/signup-event/local-admin', () => ({authorizeLocalAdmin:authorize}));
vi.mock('@/server/signup-event/local', async importOriginal => ({...await importOriginal<typeof import('@/server/signup-event/local')>(),readLocalSnapshot:read}));
import { GET, POST } from './route';
beforeEach(()=>{vi.stubEnv('KYAA_SIGNUP_EVENT_LOCAL','1');authorize.mockReset();read.mockReset();});
it('requires admin authorization before reading local participant data', async()=>{
 authorize.mockRejectedValue(new AuthError('AUTHENTICATION_REQUIRED',401,'required'));
 expect((await GET(new Request('http://localhost/api/admin/signup-event'))).status).toBe(401);
 expect(read).not.toHaveBeenCalled();
});
it('viewers cannot draw', async()=>{
 authorize.mockResolvedValue({role:'viewer'});
 expect((await POST(new Request('http://localhost/api/admin/signup-event',{method:'POST',body:'{}'}))).status).toBe(403);
 expect(read).not.toHaveBeenCalled();
});
it('rejects production before authorization or source access',async()=>{
 vi.stubEnv('NODE_ENV','production');
 expect((await GET(new Request('http://localhost/api/admin/signup-event'))).status).toBe(404);
 expect(authorize).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
 vi.stubEnv('NODE_ENV','test');
});
it('exports only masked participant and winner data for an authorized local admin',async()=>{
 authorize.mockResolvedValue({role:'admin'});
 read.mockResolvedValue({users:[{id:'00000000-0000-4000-8000-000000000001',createdAt:'2026-11-11T01:00:00Z'}],actions:[],draftWeights:{'share-click':0,'referral-signup':0,attendance:0,post:0}});
 const participants=await GET(new Request('http://localhost/api/admin/signup-event'));
 expect(participants.status).toBe(200);
 const csv=await participants.text();expect(csv).not.toContain('00000000');expect(csv).toContain(',1');
 const result=await POST(new Request('http://localhost/api/admin/signup-event',{method:'POST',body:JSON.stringify({quantity:1,requestId:'00000000-0000-4000-8000-000000000002'})}));
 expect(result.status).toBe(200);expect(await result.text()).toBe(csv);
});

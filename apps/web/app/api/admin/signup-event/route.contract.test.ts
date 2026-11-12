import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { AuthError } from '@/features/auth/domain/auth-errors';
const { authorize, read, record, lookup } = vi.hoisted(() => ({ authorize: vi.fn(), read: vi.fn(), record: vi.fn(), lookup: vi.fn() }));
vi.mock('@/server/signup-event/local-admin', () => ({authorizeLocalAdmin:authorize}));
vi.mock('@/server/signup-event/local', async importOriginal => ({...await importOriginal<typeof import('@/server/signup-event/local')>(),readLocalSnapshot:read}));
vi.mock('@/server/signup-event/database', () => ({createSignupRaffleDatabase:()=>({}),recordSignupRaffleDraw:record,readSignupRaffleDraw:lookup,signupRaffleAliasKey:()=>Buffer.alloc(32,7)}));
import { GET, POST } from './route';
const afterClose=new Date('2026-12-01T00:00:00+09:00'),beforeClose=new Date('2026-11-30T23:59:00+09:00');
const admin={role:'admin',appUserId:'00000000-0000-4000-8000-0000000000a1',allowlistId:'00000000-0000-4000-8000-0000000000a2'};
const seventeen=()=>Array.from({length:17},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,createdAt:'2025-01-01T00:00:00Z',passportReceived:true,communityJoined:true}));
const draw=(requestId:string)=>POST(new Request('http://localhost/api/admin/signup-event',{method:'POST',body:JSON.stringify({quantity:17,requestId})}));
afterEach(()=>{vi.useRealTimers();});
beforeEach(()=>{vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE','true');authorize.mockReset();read.mockReset();record.mockReset();lookup.mockReset();lookup.mockResolvedValue(null);});
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
 vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE','false');
 expect((await GET(new Request('http://localhost/api/admin/signup-event'))).status).toBe(404);
 expect(authorize).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
 vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE','true');
});
it('exports only masked participant and winner data for an authorized local admin',async()=>{
 vi.useFakeTimers({toFake:['Date'],now:afterClose});
 authorize.mockResolvedValue(admin);
 const users=seventeen();
 read.mockResolvedValue({users,actions:[],entries:users.map(user=>({userId:user.id,enteredAt:'2026-11-11T01:00:00Z'}))});
 record.mockImplementation(async(_database,input)=>({created:true,seedSha256:'0'.repeat(64),drawnAt:'2026-12-01T00:00:00Z',winners:input.winners}));
 const participants=await GET(new Request('http://localhost/api/admin/signup-event'));
 expect(participants.status).toBe(200);
 const csv=await participants.text();expect(csv).not.toContain('00000000');expect(csv).toContain(',1');
 const result=await draw('00000000-0000-4000-8000-000000000002');
 expect(result.status).toBe(200);const winners=await result.text();expect(winners).not.toContain('00000000');expect(winners.match(/US\$100/g)).toHaveLength(1);expect(winners.match(/US\$50/g)).toHaveLength(2);expect(winners.match(/US\$25/g)).toHaveLength(4);expect(winners.match(/US\$10(?:\r|$)/g)).toHaveLength(10);
});
it('refuses a draw before the event closes without reading members or storing anything',async()=>{
 vi.useFakeTimers({toFake:['Date'],now:beforeClose});
 authorize.mockResolvedValue(admin);
 expect((await draw('00000000-0000-4000-8000-000000000002')).status).toBe(409);
 expect(read).not.toHaveBeenCalled();expect(record).not.toHaveBeenCalled();
});
it('answers 409 when the database clock says the event is still open',async()=>{
 vi.useFakeTimers({toFake:['Date'],now:afterClose});
 authorize.mockResolvedValue(admin);
 const users=seventeen();
 read.mockResolvedValue({users,actions:[],entries:users.map(user=>({userId:user.id,enteredAt:'2026-11-11T01:00:00Z'}))});
 record.mockRejectedValue(new Error('SIGNUP_RAFFLE_NOT_CLOSED'));
 expect((await draw('00000000-0000-4000-8000-000000000002')).status).toBe(409);
});
it('never seeds the draw from the request and always answers with the stored winners',async()=>{
 vi.useFakeTimers({toFake:['Date'],now:afterClose});
 authorize.mockResolvedValue(admin);
 const users=seventeen();
 read.mockResolvedValue({users,actions:[],entries:users.map(user=>({userId:user.id,enteredAt:'2026-11-11T01:00:00Z'}))});
 // The store keeps the first draw; later calls get it back whatever they computed.
 let kept:{userId:string;entries:number}[]|undefined;
 lookup.mockImplementation(async()=>kept?{created:false,seedSha256:'0'.repeat(64),drawnAt:'2026-12-01T00:00:00Z',winners:kept}:null);
 record.mockImplementation(async(_database,input)=>{const created=!kept;kept??=input.winners;return{created,seedSha256:'0'.repeat(64),drawnAt:'2026-12-01T00:00:00Z',winners:kept};});
 const same='00000000-0000-4000-8000-000000000002';
 const first=await (await draw(same)).text(),second=await (await draw(same)).text(),third=await (await draw('00000000-0000-4000-8000-000000000003')).text();
 expect(second).toBe(first);expect(third).toBe(first);
 // Only the first request draws; the two repeats are answered from the stored draw without reading participants again.
 expect(record).toHaveBeenCalledTimes(1);expect(read).toHaveBeenCalledTimes(1);
 const inputs=record.mock.calls.map(call=>call[1]);
 for(const input of inputs){expect(input.seed).toMatch(/^[a-f0-9]{64}$/);expect(input.actor).toBe(admin.appUserId);expect(input.allowlistId).toBe(admin.allowlistId);expect(input.candidates).toHaveLength(17);expect(input.closesAt).toBe('2026-11-30T23:59:59.999+09:00');}
 expect(inputs[0].seed).not.toContain(same.replaceAll('-',''));
});
it('keeps answering with the first winners when participants later drop below 17 or cannot be read',async()=>{
 vi.useFakeTimers({toFake:['Date'],now:afterClose});
 authorize.mockResolvedValue(admin);
 const users=seventeen();
 read.mockResolvedValue({users,actions:[],entries:users.map(user=>({userId:user.id,enteredAt:'2026-11-11T01:00:00Z'}))});
 let kept:{userId:string;entries:number}[]|undefined;
 lookup.mockImplementation(async()=>kept?{created:false,seedSha256:'0'.repeat(64),drawnAt:'2026-12-01T00:00:00Z',winners:kept}:null);
 record.mockImplementation(async(_database,input)=>{kept=input.winners;return{created:true,seedSha256:'0'.repeat(64),drawnAt:'2026-12-01T00:00:00Z',winners:kept};});
 const first=await draw('00000000-0000-4000-8000-000000000002');
 expect(first.status).toBe(200);const winners=await first.text();
 // Sixteen participants left: a fresh draw of 17 would be refused with 400.
 read.mockResolvedValue({users:users.slice(1),actions:[],entries:users.slice(1).map(user=>({userId:user.id,enteredAt:'2026-11-11T01:00:00Z'}))});
 const shrunk=await draw('00000000-0000-4000-8000-000000000003');
 expect(shrunk.status).toBe(200);expect(await shrunk.text()).toBe(winners);
 // Participant read fails: a fresh draw would answer 503.
 read.mockRejectedValue(new Error('SIGNUP_RAFFLE_READ_FAILED'));
 const unreadable=await draw('00000000-0000-4000-8000-000000000004');
 expect(unreadable.status).toBe(200);expect(await unreadable.text()).toBe(winners);
 expect(record).toHaveBeenCalledTimes(1);expect(read).toHaveBeenCalledTimes(1);
});
it('answers with the stored winners even before the close time of the current policy',async()=>{
 vi.useFakeTimers({toFake:['Date'],now:beforeClose});
 authorize.mockResolvedValue(admin);
 lookup.mockResolvedValue({created:false,seedSha256:'0'.repeat(64),drawnAt:'2026-12-01T00:00:00Z',winners:seventeen().map(user=>({userId:user.id,entries:1}))});
 const result=await draw('00000000-0000-4000-8000-000000000002');
 expect(result.status).toBe(200);expect(read).not.toHaveBeenCalled();expect(record).not.toHaveBeenCalled();
});
it('fails closed when the stored draw cannot be looked up',async()=>{
 vi.useFakeTimers({toFake:['Date'],now:afterClose});
 authorize.mockResolvedValue(admin);
 lookup.mockRejectedValue(new Error('SIGNUP_RAFFLE_DRAW_FAILED'));
 expect((await draw('00000000-0000-4000-8000-000000000002')).status).toBe(503);
 expect(read).not.toHaveBeenCalled();expect(record).not.toHaveBeenCalled();
});

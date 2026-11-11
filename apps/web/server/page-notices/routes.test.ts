import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {createPageNoticeHandler} from './routes';
import {AuthError} from '@/features/auth/domain/auth-errors';
describe('round notice history',()=>{
 it('uses only the authenticated owner and validates the round key',async()=>{
  const rpc=vi.fn().mockResolvedValue(true),authorize=vi.fn().mockResolvedValue({appUserId:'owner'}),handler=createPageNoticeHandler({rpc,authorize});
  const url='https://x/api/me/page-notices?key=raffle-results:elina:2026-11-11T12:00:00Z';
  expect(await (await handler(new Request(url))).json()).toEqual({seen:true});
  expect(rpc).toHaveBeenLastCalledWith('page_notice_seen',{p_app_user_id:'owner',p_key:'raffle-results:elina:2026-11-11T12:00:00Z',p_mark:false});
  await handler(new Request(url,{method:'POST'}));expect(rpc).toHaveBeenLastCalledWith('page_notice_seen',expect.objectContaining({p_mark:true}));
  rpc.mockClear();expect((await handler(new Request('https://x?key=bad'))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
  expect((await handler(new Request(url+'&key=another'))).status).toBe(400);
 });
 it('never reads or writes history without authorization',async()=>{
  const rpc=vi.fn(),handler=createPageNoticeHandler({rpc,authorize:vi.fn().mockRejectedValue(new AuthError('AUTHENTICATION_REQUIRED',401,'required'))});
  expect((await handler(new Request('https://x?key=raffle-results:elina:1',{method:'POST'}))).status).toBe(401);expect(rpc).not.toHaveBeenCalled();
 });
});

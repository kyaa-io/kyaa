import {describe,it,expect,vi} from 'vitest';
import {createGetWaveAnalyticsHandler} from './wave-analytics-route';
import {AuthError} from '@/features/auth/domain/auth-errors';
vi.mock('server-only',()=>({}));
const admin={email:'admin@example.com',role:'admin' as const,appUserId:'11111111-1111-4111-8111-111111111111',allowlistId:'22222222-2222-4222-8222-222222222222'};
describe('wave analytics admin read',()=>{
 it('requires existing administrator authorization before reading',async()=>{
  const read=vi.fn();const handler=createGetWaveAnalyticsHandler({authorize:async()=>{throw new AuthError('AUTHENTICATION_REQUIRED',401,'login');},read});
  expect((await handler(new Request('https://kyaa.io/api/admin/analytics/wave'))).status).toBe(401);expect(read).not.toHaveBeenCalled();
 });
 it('validates fixed periods and reauthorizes the database read with both admin ids',async()=>{
  const read=vi.fn().mockResolvedValue([{channel:'google',event:'inquiry_accepted',event_count:2,session_count:1}]);
  const handler=createGetWaveAnalyticsHandler({authorize:async()=>admin,read});
  const result=await handler(new Request('https://kyaa.io/api/admin/analytics/wave?days=30'));
  expect(result.status).toBe(200);expect(result.headers.get('cache-control')).toBe('private, no-store');expect(result.headers.get('vary')).toBe('Authorization');
  expect(read).toHaveBeenCalledWith({appUserId:admin.appUserId,allowlistId:admin.allowlistId,days:30});
  expect((await result.json()).rows[0].event).toBe('inquiry_accepted');
  for(const query of ['days=1','days=30&days=7','email=private@example.com']) expect((await handler(new Request('https://kyaa.io/api/admin/analytics/wave?'+query))).status).toBe(400);
 });
 it('fails closed on unexpected database rows',async()=>{
  const handler=createGetWaveAnalyticsHandler({authorize:async()=>admin,read:async()=>[{channel:'email@example.com',event:'inquiry_accepted',event_count:1,session_count:1}]});
  expect((await handler(new Request('https://kyaa.io/api/admin/analytics/wave'))).status).toBe(503);
 });
});

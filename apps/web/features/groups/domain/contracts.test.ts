import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {AuthError} from '@/features/auth/domain/auth-errors';
import {createGroupHandler} from '@/server/groups/routes';
import {groupListSchema,groupRoomsSchema} from './contracts';
const actor='10000000-0000-4000-8000-000000000001',page='20000000-0000-4000-8000-000000000001';
describe('room list contract',()=>{
 it('preserves server-supplied default keys and management capability while accepting old responses',()=>{
  const data=groupRoomsSchema.parse({canManage:false,items:[{id:actor,name:'자유 소통방',defaultKey:'free',minimumTier:null,status:'open',canEnter:true}]});
  expect(data.canManage).toBe(false);expect(data.items[0].defaultKey).toBe('free');expect(data.items[0].minimumTier).toBeNull();
  expect(groupRoomsSchema.parse({items:[]}).canManage).toBeUndefined();expect(()=>groupRoomsSchema.parse({items:[{id:actor,name:'x',defaultKey:'other',minimumTier:'Gold',status:'open',canEnter:true}]})).toThrow();
 });
 it('requires a real authenticated actor and forwards page scope to the existing rooms handler',async()=>{
  const rpc=vi.fn().mockResolvedValue({canManage:false,items:[]});const authorize=vi.fn(async(h:string|null)=>{if(h!=='Bearer valid')throw new AuthError('AUTHENTICATION_REQUIRED',401,'Login');return {appUserId:actor};});
  const handler=createGroupHandler({rpc,authorize,authorizeAdmin:vi.fn()});
  const call=(auth?:string)=>handler('rooms',new Request('https://kyaa.test/api/groups/'+page+'/rooms',{headers:auth?{authorization:auth}:{}}),{id:page});
  expect((await call()).status).toBe(401);expect(rpc).not.toHaveBeenCalled();const response=await call('Bearer valid');expect(response.status).toBe(200);expect(await response.json()).toEqual({canManage:false,items:[]});expect(rpc).toHaveBeenCalledWith('groups_content_dispatch',expect.objectContaining({p_operation:'rooms',p_actor:actor,p_page_id:page}));
 });
});

describe('visited group list contract',()=>{
 const group={id:page,kind:'fan',celebrityId:null,slug:null,name:'A',description:'B',imageUrl:null,question:null,memberCount:1};
 it('preserves UUID or bounded opaque cursors and optional nullable last visit',()=>{
  expect(groupListSchema.parse({items:[group],nextCursor:actor}).nextCursor).toBe(actor);
  expect(groupListSchema.parse({items:[{...group,lastSeenAt:'2026-11-03T10:00:00+09:00'}],nextCursor:'eyJ2IjoxfQ'}).items[0].lastSeenAt).toBe('2026-11-03T10:00:00+09:00');
  expect(groupListSchema.parse({items:[{...group,lastSeenAt:null}],nextCursor:null}).items[0].lastSeenAt).toBeNull();
  expect(()=>groupListSchema.parse({items:[group],nextCursor:'x'.repeat(513)})).toThrow();
  expect(()=>groupListSchema.parse({items:[group],nextCursor:'a/b'})).toThrow();
  expect(()=>groupListSchema.parse({items:[{...group,lastSeenAt:'yesterday'}],nextCursor:null})).toThrow();
 });
});

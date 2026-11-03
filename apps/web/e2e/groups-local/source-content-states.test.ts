import {afterEach,expect,it,vi} from 'vitest';
import {sourceContentStateResponse,sourceContentStateFailure,SOURCE_CONTENT_STATE_NODES} from './source-content-states';
import {groupDetailSchema,groupPostsSchema} from '@/features/groups/domain/contracts';
import {postSchema,commentPageSchema} from '@/features/fan-posts/domain/content';
import {groupEventDetailSchema,groupMissionDetailSchema,groupCollectionsSchema,groupMissionsSchema,groupCheckInSchema} from '@/server/group-activities/domain';
import {activityFixture} from './activity-fixtures';
import {contentFixture} from './content-fixtures';
const id='e9200000-0000-4000-8000-000000000001',base=`/api/groups/${id}`;
const url=(path:string)=>new URL(path,'http://localhost');
const project=(body:unknown,path:string,node:string,method='GET')=>sourceContentStateResponse(Response.json(body),url(path),method,node);
const activity=(path:string)=>activityFixture(path,'GET',null)!;
afterEach(()=>vi.useRealTimers());
it('only handles known nodes and matching paths, keeping original responses readable',async()=>{
 const original=Response.json({value:1});
 expect(await sourceContentStateResponse(original,url('/api/unrelated'),'GET','yF1U1')).toBe(original);
 expect(await sourceContentStateResponse(original,url(`${base}/posts`),'GET','unknown')).toBe(original);
 expect(await original.json()).toEqual({value:1});
 const nodes=Object.values(SOURCE_CONTENT_STATE_NODES).flat();expect(new Set(nodes).size).toBe(nodes.length);
});
it('empties board lists and comments without discarding feed-specific fields',async()=>{
 const empty=await (await project({items:[{id}],nextCursor:id,unavailableSources:['chzzk']},'/api/celebrities/nchive/feed','yF1U1')).json();
 expect(empty).toEqual({items:[],nextCursor:null,unavailableSources:['chzzk']});
 const page=commentPageSchema.parse(await (await project({items:[],nextCursor:id},`/api/posts/${id}/comments`,'rviuM')).json());expect(page.nextCursor).toBeNull();
 const post={id,celebritySlug:'nchive',body:'Original title\nOriginal body',visibility:'public',revision:1,author:{nickname:'Original author',avatarUrl:'/images/avatars/star-pink.webp'},assets:[],createdAt:'2026-11-01T10:00:00Z',updatedAt:'2026-11-01T10:00:00Z',isOwner:true,likeCount:2,liked:false,commentCount:3};
 const detail=await (await project({post},`/api/posts/${id}`,'rviuM')).json();expect(postSchema.parse(detail.post)).toMatchObject({body:post.body,commentCount:0});
});
it.each([['Z6ErKw',`${base}/posts`,503],['D0ZIq',`${base}/posts/${id}`,403],['CqipF',`/api/posts/${id}/comments`,503],['kgWAV',`${base}/collections`,503]] as const)('projects read failure %s only on its requested resource',async(node,path,status)=>{
 expect((await project({},path,node)).status).toBe(status);
 const original=Response.json({ok:true});expect(await sourceContentStateResponse(original,url('/api/me/wallet'),'GET',node)).toBe(original);
});
it('anonymizes group identity fields while preserving original titles and bodies and never consumes its input',async()=>{
 const path=`${base}/posts`,original=contentFixture(url(path),'GET',null,null)!;
 const projected=await sourceContentStateResponse(original,url(path),'GET','source-L3N3DQ');
 const before=await original.json(),after=groupPostsSchema.parse(await projected.json());
 expect(after.items.map(item=>item.title)).toEqual(before.items.map((item:{title:string})=>item.title));
 expect(after.items.every(item=>item.anonymous&&item.profileId===null&&item.nickname==='익명'&&item.avatarUrl===null)).toBe(true);
 expect(before.items[0].anonymous).toBe(false);
 const group={page:{id,kind:'fan',celebrityId:id,slug:'nchive',name:'엔카이브',description:'Original description',imageUrl:null,question:null,memberCount:1280},membership:{role:'member',joinedAt:'2026-11-01'},bookmarked:false};
 expect(groupDetailSchema.parse(await (await project(group,base,'L3N3DQ')).json()).page.anonymous).toBe(true);
 expect(groupDetailSchema.parse(await (await project(group,base,'tijFm')).json()).membership).toBeNull();
});
it.each([['MY9YB',`${base}/posts`,'POST',503],['MY9YB','/api/celebrities/nchive/posts','POST',503],['TZ546',`${base}/events/${id}/applications`,'POST',503],['bWeEa',`${base}/events/${id}/check-in`,'POST',400],['dhhrY',`${base}/collections/${id}`,'PATCH',503],['H5mg5',`/api/posts/${id}/comments`,'POST',401],['tijFm',`${base}/posts/${id}/comments`,'POST',403]] as const)('preflights %s writes before a mutable fixture is invoked',async(node,path,method,status)=>{
 let writes=0;
 const failure=sourceContentStateFailure(url(path),method,node);
 const result=failure??(()=>{writes++;return Response.json({id});})();
 expect(result.status).toBe(status);expect(writes).toBe(0);
 expect(sourceContentStateFailure(url('/api/me/wallet/exchange'),method,node)).toBeUndefined();
});
it.each(['jn589','teuy6','b97Jl','bWeEa','QABMA','uONGB','cpRNM','Q8M9AR','XIfOn','HNDKv'])('keeps the strict event contract for %s',async node=>{
 const path=`${base}/events/${id}`,before=groupEventDetailSchema.parse(activity(path)),after=groupEventDetailSchema.parse(await (await project(before,path,node)).json());
 expect(after.event.title).toBe(before.event.title);
 if(node==='HNDKv')expect(after).toMatchObject({participation:{status:'pending'},event:{ticketAvailable:false}});
 if(node==='teuy6')expect(after).toMatchObject({participation:{status:'confirmed'},canApply:false});
 if(node==='Q8M9AR')expect(after.event.state).toBe('cancelled');
 if(node==='XIfOn')expect(after).toMatchObject({event:{state:'ended'},canApply:false});
 if(node==='cpRNM')expect(after.participation.checkedInAt).not.toBeNull();
});
it('preserves the check-in receipt while distinguishing an already checked-in ticket',async()=>{
 const receipt={status:'checked_in',registrationId:id,checkedInAt:'2026-11-07T09:00:00Z',alreadyCheckedIn:false,replayed:false};
 const projected=groupCheckInSchema.parse(await (await project(receipt,`${base}/events/${id}/check-in`,'QABMA','POST')).json());
 expect(projected).toEqual({...receipt,alreadyCheckedIn:true});
});
it.each([['mDaVG','pending'],['L9zSo','rejected'],['VTA0g','completed']] as const)('preserves mission detail and list contracts for %s',async(node,status)=>{
 const path=`${base}/missions/${id}`,detail=groupMissionDetailSchema.parse(await (await project(activity(path),path,node)).json());
 expect(detail.mission.status).toBe(status);expect(detail.submission?.status).toBe(status);
 expect(detail.canSubmit).toBe(status==='rejected');
 if(status==='rejected')expect(detail.submission?.reason).toContain('사진을 보완');
 const list=groupMissionsSchema.parse(await (await project(activity(`${base}/missions`),`${base}/missions`,node)).json());
 expect(list.missions[0].status).toBe(status);expect(list.missions[1].title).toBe('오늘의 설문');
});
it.each([['g5X3vW','hidden'],['f1AE6v','sold_out']] as const)('preserves product fields when projecting %s',async(node,status)=>{
 const path=`${base}/collections`,before=groupCollectionsSchema.parse(activity(path)),after=groupCollectionsSchema.parse(await (await project(before,path,node)).json());
 expect(after.items.every(item=>item.status===status)).toBe(true);
 expect(after.items[0].externalUrl).toBe(before.items[0].externalUrl);
 if(status==='hidden')expect(after.canManage).toBe(true);
});
it('caps an explicitly requested loading delay at 1200ms and leaves unrelated requests immediate',async()=>{
 vi.useFakeTimers();let resolved=false;
 const pending=project({items:[],nextCursor:null},`${base}/posts?fixtureDelayMs=999999`,'W0Xri').then(value=>{resolved=true;return value;});
 await vi.advanceTimersByTimeAsync(1199);expect(resolved).toBe(false);
 await vi.advanceTimersByTimeAsync(1);expect(resolved).toBe(true);expect((await pending).ok).toBe(true);
 const original=Response.json({ok:true});expect(await sourceContentStateResponse(original,url('/api/me/wallet?fixtureDelayMs=999999'),'GET','W0Xri')).toBe(original);
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { sourceStateResponse, sourceStateFailure, sourceStateResolved, SOURCE_STATE_NODES } from './source-state-fixtures';
import { walletSchema, historySchema } from '@/server/group-wallet/domain';
import { groupRaffleDetailSchema, entryReceiptSchema } from '@/features/group-raffle/domain';
import { capsuleResultSchema } from '@/features/group-capsule/domain';
import { groupDetailSchema, applicationReceiptSchema } from '@/features/groups/domain/contracts';
import { liveEventResponseSchema } from '@/features/live/domain/live-event';
import { legacyVisualFixture } from './legacy-visual-fixtures';
const id='e9200000-0000-4000-8000-000000000001';
const wallet={sequence:1,points:240,hearts:2,tickets:12,policyVersion:'group-wallet-v1',pointCost:100,writeFenced:false,attendance:{date:'2026-11-07',checkedIn:false,streak:6,nextBonusIn:1,days:[{date:'2026-11-01',points:10}]}};
const raffle={raffle:{id,benefitId:null,title:'로컬 예시 경품',summary:'로컬 검증 예시',imageUrl:null,winnerQuantity:5,status:'open',entryOpensAt:null,entryClosesAt:'2100-11-07T09:00:00Z',resultsPublishedAt:null,fulfillmentMethod:'physical_shipping',perFanTicketLimit:100},enteredTickets:30,winner:null,canManage:false,member:true,canEnter:true,consentVersion:null};
const response=(body:unknown)=>Response.json(body);
const project=async(body:unknown,path:string,node:string|null,method='GET')=>sourceStateResponse(response(body),new URL(path,'http://localhost'),method,node);
afterEach(()=>vi.useRealTimers());
describe('local Pencil source state response projections',()=>{
 it('leaves unknown states and unrelated APIs untouched and readable',async()=>{
  const original=response({value:1});expect(await sourceStateResponse(original,new URL('http://localhost/api/me/wallet'),'GET','unknown')).toBe(original);
  expect(await sourceStateResponse(original,new URL('http://localhost/api/unrelated'),'GET','source-SngLG')).toBe(original);
  expect(await original.json()).toEqual({value:1});expect(new Set(Object.values(SOURCE_STATE_NODES).flat()).size).toBe(Object.values(SOURCE_STATE_NODES).flat().length);
 });
 it.each([['SngLG',true,1],['xAu5O',false,1],['GKoWu',false,0]] as const)('projects source presence %s without changing audience counts',async(node,online,count)=>{
  const schema=z.object({onlineCount:z.number(),todayCount:z.number(),artists:z.array(z.object({profileId:z.uuid(),nickname:z.string(),online:z.boolean(),visitedToday:z.boolean()}))});
  const data=schema.parse(await (await project({onlineCount:12,todayCount:128,artists:[]},`/api/groups/${id}/presence`,node)).json());
  expect(data).toMatchObject({onlineCount:12,todayCount:128});expect(data.artists).toHaveLength(count);if(count)expect(data.artists[0]).toMatchObject({online,visitedToday:true});
 });
 it.each(['onxeg','KdGqe','OWIeU'])('retains a schema-valid LIVE %s in the appropriate catalog bucket',async node=>{
  const url=new URL('http://localhost/api/live-events');const original=legacyVisualFixture(url,'GET','ko','creator')!;
  const data=await (await sourceStateResponse(original,url,'GET',node)).json();expect(data.catalog.liveNow).toEqual([]);
  const live=liveEventResponseSchema.parse((node==='onxeg'?data.catalog.upcoming:data.catalog.replay)[0]);
  expect(live.live.effectiveStatus).toBe(node==='onxeg'?'scheduled':'ended');expect(live.live.watch.available).toBe(node==='KdGqe');if(node==='KdGqe')expect(live.live.watch.mode).toBe('replay');
 });
 it('removes videos for the no-video source and only fails presence saving',async()=>{
  expect(await (await project({items:[{id}],nextCursor:null},'/api/celebrities/nchive/youtube','y4h7Pi')).json()).toEqual({items:[],nextCursor:null});
  expect(await (await project({},'/api/groups/me/presence','ALGft')).json()).toEqual({enabled:true,canConfigure:true});
  expect((await project({},'/api/groups/me/presence','ALGft','PUT')).status).toBe(503);
 });
 it('preserves strict wallet fields for attendance and separates history-only failures',async()=>{
  const done=walletSchema.parse(await (await project(wallet,'/api/me/wallet','u8Qcg')).json());expect(done.attendance).toMatchObject({checkedIn:true,streak:7,nextBonusIn:7});expect(done.attendance.days).toContainEqual({date:'2026-11-07',points:30});
  expect(walletSchema.parse(await (await project(wallet,'/api/me/wallet','viakp')).json()).tickets).toBe(0);
  expect((await project(wallet,'/api/me/wallet','iboGb')).status).toBe(200);expect((await project({entries:[]},'/api/me/wallet/history','iboGb')).status).toBe(503);
  expect(historySchema.parse(await (await project({entries:[]},'/api/me/wallet/history','u8Qcg')).json()).entries).toEqual([]);
 });
 it.each(['PmqiW','bbw1R','DvkSA','okmrJ','i0KaKL','Z3MtE','KzjUJ','cWqGx','dlTRh'])('preserves the raffle detail contract for %s',async node=>{
  const data=groupRaffleDetailSchema.parse(await (await project(raffle,`/api/groups/${id}/raffles/${id}`,node)).json());
  expect(data.raffle.title).toBe(raffle.raffle.title);
  if(node==='bbw1R')expect(data.raffle.status).toBe('cancelled');
  if(node==='DvkSA')expect(data.raffle.resultsPublishedAt).not.toBeNull();
  if(['i0KaKL','okmrJ'].includes(node))expect(data.raffle.resultsPublishedAt).toBeNull();
  if(node==='Z3MtE')expect(data.raffle.perFanTicketLimit).toBe(1);
  if(node==='KzjUJ')expect(data.enteredTickets).toBe(data.raffle.perFanTicketLimit);
 });
 it('echoes wrapper-provided entry quantity and refuses malformed or unaffordable metadata',async()=>{
  const path=`/api/groups/${id}/raffles/${id}/entries`;
  const data=entryReceiptSchema.parse(await (await project({},path+'?fixtureAmount=10','TgOcH','POST')).json());expect(data).toMatchObject({amount:10,enteredTickets:40,tickets:2});
  expect((await project({},path+'?fixtureAmount=13','TgOcH','POST')).status).toBe(409);
 });
 it('keeps count and ordinal identity when projecting all-blank committed capsules',async()=>{
  const result={requestKey:id,campaignId:id,count:10,results:Array.from({length:10},(_,i)=>({index:i+1,prizeId:id,name:'로컬 경품',imageUrl:'/fixture.png'})),tickets:2};
  const data=capsuleResultSchema.parse(await (await project(result,`/api/groups/capsules/${id}/draw`,'hh3j5','POST')).json());expect(data.count).toBe(10);expect(data.results.every(item=>item.prizeId===null&&item.name===null&&item.imageUrl===null)).toBe(true);expect(data.tickets).toBe(2);
  expect((await project({},`/api/me/wallet/capsule-requests/${id}`,'We1zf')).status).toBe(503);
 });
 it('provides incoming friends and DM requests separately and fails only message writes',async()=>{
  const friend={id,profileId:id,nickname:'별빛',avatarUrl:null,status:'friends'};
  expect((await (await project({friendships:[friend]},'/api/me/social/friends','o44v7C')).json()).friendships[0].status).toBe('incoming');
  const chat={...friend,canSend:true,latestMessage:null};
  expect((await (await project({conversations:[chat]},'/api/me/social/conversations','VQfTU')).json()).conversations[0]).toMatchObject({status:'incoming_request',canSend:false});
  const messages=`/api/me/social/conversations/${id}/messages`;
  expect((await project({messages:[]},messages,'DeQ3f')).status).toBe(200);expect((await project({},messages,'DeQ3f','POST')).status).toBe(503);
 });
 it('can reject deterministic failures before a stateful base fixture runs',async()=>{
  const mutation=vi.fn();
  for(const [path,method,node] of [['/api/me/wallet/exchange','POST','QnKkN'],['/api/groups/me/presence','PUT','ALGft'],['/api/groups/applications','POST','HtWDL'],[`/api/groups/${id}/membership`,'POST','LAbTd'],[`/api/me/social/conversations/${id}/messages`,'POST','DeQ3f']]){
   const rejected=sourceStateFailure(new URL(path,'http://localhost'),method,node);if(!rejected)mutation();expect(rejected?.ok).toBe(false);
  }
  expect(mutation).not.toHaveBeenCalled();
  expect(sourceStateFailure(new URL(`/api/groups/capsules/${id}/draw`,'http://localhost'),'POST','es3y5')).toBeUndefined();
  expect(sourceStateFailure(new URL('/api/groups/applications','http://localhost'),'POST','XbwIn')).toBeUndefined();
 });
 it.each([['VQfTU','accept','accepted',true],['JI7Qt','cancel','rejected',false]] as const)('releases %s after its successful conversation mutation',async(initialState,action,status,canSend)=>{
  let state:string|null=initialState;const url=new URL(`/api/me/social/conversations/${id}`,'http://localhost');
  const read=async()=>{const list=new URL('http://localhost/api/me/social/conversations');return (await (await sourceStateResponse(legacyVisualFixture(list,'GET','ko','social')!,list,'GET',state)).json()).conversations[0];};
  expect((await read()).status).toBe(initialState==='VQfTU'?'incoming_request':'outgoing_request');
  const mutation=legacyVisualFixture(url,'PATCH','ko','social',{action})!;
  await sourceStateResponse(mutation,url,'PATCH',state);
  if(sourceStateResolved(mutation,url,'PATCH',state))state=null;
  expect(await read()).toMatchObject({status,canSend});
 });
 it('releases membership null after successful joining while retaining failed and unrelated initial states',async()=>{
  let state:string|null='source-rQ0kj';
  const url=new URL(`/api/groups/${id}/membership?fixtureDelayMs=0`,'http://localhost');
  const detail={page:{id,kind:'hobby',celebrityId:null,slug:null,name:'한강',description:'로컬 예시',imageUrl:null,question:null,memberCount:84},membership:{role:'member',joinedAt:'2026-11-01T00:00:00Z'},bookmarked:false};
  const read=async()=>groupDetailSchema.parse(await (await project(detail,`/api/groups/${id}`,state)).json());
  expect((await read()).membership).toBeNull();
  expect(sourceStateResolved(Response.json({}, {status:503}),url,'POST',state)).toBe(false);
  expect(sourceStateResolved(response({}),url,'GET',state)).toBe(false);
  expect(sourceStateResolved(response({}),new URL('http://localhost/api/groups/applications'),'POST',state)).toBe(false);
  const mutation=response({joined:true});await sourceStateResponse(mutation,url,'POST',state);
  if(sourceStateResolved(mutation,url,'POST',state))state=null;
  expect((await read()).membership).toEqual(detail.membership);
  expect(sourceStateResolved(response({}),new URL(`/api/me/social/conversations/${id}`,'http://localhost'),'PATCH','VQfTU')).toBe(true);
  expect(sourceStateResolved(Response.json({}, {status:409}),new URL(`/api/me/social/conversations/${id}`,'http://localhost'),'PATCH','JI7Qt')).toBe(false);
 });
 it('uses bounded finite delays for application and join loading states',async()=>{
  vi.useFakeTimers();let settled=false;
  const pending=project({},'/api/groups/applications?fixtureDelayMs=99999','XbwIn','POST').then(value=>{settled=true;return value;});
  await vi.advanceTimersByTimeAsync(1199);expect(settled).toBe(false);await vi.advanceTimersByTimeAsync(1);
  expect(applicationReceiptSchema.parse(await (await pending).json()).status).toBe('submitted');
  const detail={page:{id,kind:'hobby',celebrityId:null,slug:null,name:'한강',description:'로컬 예시',imageUrl:null,question:null,memberCount:84},membership:{role:'member',joinedAt:'2026-11-01T00:00:00Z'},bookmarked:false};
  expect(groupDetailSchema.parse(await (await project(detail,`/api/groups/${id}`,'rQ0kj')).json()).membership).toBeNull();
  const joined=project({},`/api/groups/${id}/membership?fixtureDelayMs=1`,'rQ0kj','POST');await vi.advanceTimersByTimeAsync(1);expect(await (await joined).json()).toEqual({joined:true});
  expect((await project({},'/api/groups/applications','HtWDL','POST')).status).toBe(503);expect((await project({},`/api/groups/${id}/membership`,'LAbTd','POST')).status).toBe(503);
 });
});

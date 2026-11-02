import {describe,expect,it} from 'vitest';
import {legacyVisualFixture} from './legacy-visual-fixtures';
import {commentPageSchema,postSchema} from '@/features/fan-posts/domain/content';
import {z} from 'zod';
describe('creator preview fixtures',()=>{
 it('connects rankings to matching detail and comments',async()=>{
  const get=(path:string)=>legacyVisualFixture(new URL(`http://localhost${path}`),'GET','ko','creator-post')!.json();
  const parse=z.object({items:z.array(postSchema)});
  const day=parse.parse(await get('/api/celebrities/elina/popular-posts?period=day'));
  const week=parse.parse(await get('/api/celebrities/elina/popular-posts?period=week'));
  expect(week.items[0]?.id).not.toBe(day.items[0]?.id);
  const id=day.items[0]!.id,post=postSchema.parse((await get(`/api/posts/${id}`)).post);
  const comments=commentPageSchema.parse(await get(`/api/posts/${id}/comments`));
  expect(comments.items).toHaveLength(post.commentCount);
  expect(comments.items.every(item=>item.postId===id)).toBe(true);
 });
});

describe('local friend request mutation',()=>{
 const target='e9200000-0000-4000-8000-000000000002';
 const request=(method:string,body?:Record<string,unknown>,view='profile')=>legacyVisualFixture(new URL('http://localhost/api/me/social/friends'),method,'ko',view,body)!;
 it('rejects a request without the server-required idempotency key',async()=>{
  const response=request('POST',{profileId:target});expect(response.status).toBe(400);expect(await response.json()).toEqual({error:{code:'INVALID_REQUEST'}});
 });
 it('adds the requested actual profile to the outgoing list and replays without duplicates',async()=>{
  const requestId=crypto.randomUUID(),response=request('POST',{profileId:target,requestId});expect(response.status).toBe(200);
  const result=await response.json();expect(result).toMatchObject({id:expect.any(String),status:'pending',replayed:false});
  const rows=(await request('GET',undefined,'social').json()).friendships;
  expect(rows.filter((item:{profileId:string})=>item.profileId===target)).toEqual([expect.objectContaining({id:result.id,profileId:target,nickname:'하늘',status:'outgoing'})]);
  expect(await request('POST',{profileId:target,requestId}).json()).toEqual({...result,replayed:true});
  expect((await request('GET').json()).friendships.filter((item:{profileId:string})=>item.profileId===target)).toHaveLength(1);
  expect(request('POST',{profileId:'e9200000-0000-4000-8000-000000000003',requestId}).status).toBe(409);
 });
});

it('cancels a created request and reflects the relationship on the actual target profile',async()=>{
 const profileId='e9200000-0000-4000-8000-000000000002',call=(path:string,method='GET',body?:Record<string,unknown>)=>legacyVisualFixture(new URL(`http://localhost${path}`),method,'ko','profile',body)!;
 const request=await call('/api/me/social/friends','POST',{profileId,requestId:crypto.randomUUID()}).json();
 const profile=await call(`/api/me/social/profiles/${profileId}`).json();
 expect(profile).toMatchObject({profile:{id:profileId,nickname:'하늘'},relationship:{friendshipId:request.id,status:'outgoing'},capabilities:{canRequestFriend:false}});
 const requestId=crypto.randomUUID(),response=await call(`/api/me/social/friends/${request.id}`,'PATCH',{action:'cancel',requestId}).json();
 expect(response).toEqual({id:request.id,status:'cancelled',requestId});
 expect((await call('/api/me/social/friends').json()).friendships.some((item:{profileId:string})=>item.profileId===profileId)).toBe(false);
 expect(await call(`/api/me/social/profiles/${profileId}`).json()).toMatchObject({profile:{id:profileId},relationship:{friendshipId:null,status:'none'},capabilities:{canRequestFriend:true}});
 expect(await call(`/api/me/social/friends/${request.id}`,'PATCH',{action:'cancel',requestId}).json()).toEqual(response);
});
it('unfriends an existing friend through the same contract and removes its relationship',async()=>{
 const profileId='e9200000-0000-4000-8000-000000000001',call=(path:string,method='GET',body?:Record<string,unknown>)=>legacyVisualFixture(new URL(`http://localhost${path}`),method,'ko','social',body)!;
 const profile=await call(`/api/me/social/profiles/${profileId}`).json();expect(profile.relationship.status).toBe('friends');
 const response=await call(`/api/me/social/friends/${profile.relationship.friendshipId}`,'PATCH',{action:'unfriend',requestId:crypto.randomUUID()}).json();
 expect(response.status).toBe('unfriended');
 expect((await call(`/api/me/social/profiles/${profileId}`).json()).relationship).toEqual({friendshipId:null,status:'none'});
});

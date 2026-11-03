import {describe,it,expect} from 'vitest';
import {feedPageSchema} from '../../features/fan-posts/domain/feed';
import {postSchema} from '../../features/fan-posts/domain/content';
import {pencilArtistFixture} from './pencil-artist-fixture';
describe('Pencil artist local fixture',()=>{
 it('paginates source feed without duplicate rows at mobile and desktop limits',async()=>{const read=async(limit:number,cursor='')=>(await pencilArtistFixture(new URL(`http://localhost/api/celebrities/nchive/feed?limit=${limit}&cursor=${encodeURIComponent(cursor)}`),'GET','ko','creator'))!.json();const a=await read(5),b=await read(5,a.nextCursor);expect(a.items).toHaveLength(5);expect(b.items).toHaveLength(5);expect(new Set([...a.items,...b.items].map(x=>x.id)).size).toBe(10);const desktop=await read(20);expect(desktop.items).toHaveLength(20);expect(desktop.nextCursor).toBeNull();});
 it('provides creator context on mission and collection pages',async()=>{for(const view of ['mission','collections']){const response=await pencilArtistFixture(new URL('http://localhost/api/groups/resolve/nchive'),'GET','ko',view);expect((await response!.json()).page.slug).toBe('nchive');}});
});

it('keeps locally created text posts in the source feed, detail, edit and delete contracts',async()=>{
 const call=async(path:string,method='GET',body?:Record<string,unknown>,view:string|null='creator')=>pencilArtistFixture(new URL(`http://localhost${path}`),method,'ko',view,body);
 const input={body:'새 글\n/elina 원문은 바꾸지 않아요.',visibility:'public',assetIds:[],idempotencyKey:crypto.randomUUID()};
 const response=await call('/api/celebrities/nchive/posts','POST',input,null);expect(response!.status).toBe(201);const created=await response!.json();expect(created).toEqual({id:expect.any(String),revision:1,replayed:false});
 expect(await (await call('/api/celebrities/nchive/posts','POST',input))!.json()).toEqual({...created,replayed:true});
 const feed=feedPageSchema.parse(await (await call('/api/celebrities/nchive/feed?limit=20'))!.json());
 expect(feed.items).toHaveLength(20);expect(feed.nextCursor).toBe('pencil:20');
 expect(feed.items.filter((item:{id:string})=>item.id===created.id)).toHaveLength(1);
 const item=feed.items.find((item:{id:string})=>item.id===created.id);expect(item).toMatchObject({kind:'fan_post',body:input.body,isOwner:true,celebritySlug:'nchive',assets:[]});
 const official=await (await call('/api/celebrities/nchive/feed?source=official'))!.json();expect(official.items.some((item:{id:string})=>item.id===created.id)).toBe(false);
 const detail=await (await call(`/api/posts/${created.id}`,'GET',undefined,null))!.json();postSchema.parse(detail.post);expect(detail.post.body).toBe(input.body);
 expect(await (await call(`/api/posts/${created.id}/comments`))!.json()).toEqual({items:[],nextCursor:null});
 const edited=await call(`/api/posts/${created.id}`,'PATCH',{body:'수정한 글',visibility:'members',assetIds:[],expectedRevision:1});expect(await edited!.json()).toEqual({id:created.id,revision:2,replayed:false});
 const stale=await call(`/api/posts/${created.id}`,'PATCH',{body:'오래된 수정',visibility:'public',assetIds:[],expectedRevision:1});expect(stale!.status).toBe(409);
 const updated=await (await call('/api/celebrities/nchive/feed?source=fans'))!.json();expect(updated.items.find((item:{id:string})=>item.id===created.id)).toMatchObject({body:'수정한 글',revision:2,visibility:'members'});
 expect(await (await call(`/api/posts/${created.id}`,'DELETE'))!.json()).toEqual({removed:true});
 expect((await call(`/api/posts/${created.id}`))!.status).toBe(404);
 const after=await (await call('/api/celebrities/nchive/feed?limit=20'))!.json();expect(after.items.some((item:{id:string})=>item.id===created.id)).toBe(false);expect(after.nextCursor).toBeNull();
});
it('validates the real text-post shape without inventing an upload or widening asset limits',async()=>{
 const call=(body:Record<string,unknown>)=>pencilArtistFixture(new URL('http://localhost/api/celebrities/nchive/posts'),'POST','ko','creator',body);
 expect((await call({body:'내용',visibility:'public',assetIds:[]}))!.status).toBe(400);
 expect((await call({body:'내용',visibility:'public',assetIds:[crypto.randomUUID()],idempotencyKey:crypto.randomUUID()}))!.status).toBe(400);
 expect((await call({body:'내용',visibility:'public',assetIds:[],video:{id:crypto.randomUUID()},idempotencyKey:crypto.randomUUID()}))!.status).toBe(400);
});

it('renders the source no-video home without changing the default feed',async()=>{
 history.replaceState(null,'','/?state=y4h7Pi');
 try{for(const endpoint of ['/api/celebrities/nchive/youtube','/api/live-events']){const value=await(await pencilArtistFixture(new URL(`http://localhost${endpoint}`),'GET','ko','creator'))!.json();if(endpoint.endsWith('youtube'))expect(value.items).toEqual([]);else expect(value.catalog).toEqual({liveNow:[],upcoming:[],replay:[]});}}finally{history.replaceState(null,'','/');}
});

it('keeps the source representative post and comments consistent',async()=>{const base='/api/posts/e9800000-0000-4000-8000-000000000001';const post=postSchema.parse((await(await pencilArtistFixture(new URL('http://localhost'+base),'GET','ko','creator'))!.json()).post);const comments=await(await pencilArtistFixture(new URL('http://localhost'+base+'/comments'),'GET','ko','creator'))!.json();expect(post.body).toContain('가장 좋아하는 무대가 궁금해요\n');expect(post.assets).toHaveLength(3);expect(comments.items).toHaveLength(post.commentCount);expect(comments.items.map((x:{author:{nickname:string}})=>x.author.nickname)).toEqual(['팬 A','팬 B']);});

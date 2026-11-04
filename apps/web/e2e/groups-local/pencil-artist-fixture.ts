// Local I591ou review data; never seeds or writes to the service.
import { fanPageName } from './group-name-locale-fixture';
import {createPostSchema,editPostSchema,type FanPost} from '../../features/fan-posts/domain/content';
import type {AppLocale} from '../../i18n/locales';
import {legacyVisualCreator,legacyVisualFixture} from './legacy-visual-fixtures';
const asset='/images/groups/i591ou/';
// Local text posts share one store across writes, detail reads and the Pencil source feed.
const localPosts=new Map<string,FanPost|null>();
const postRequests=new Map<string,{signature:string;result:{id:string;revision:number;replayed:boolean}}>();
function localPostResponse(url:URL,method:string,body?:Record<string,unknown>):Response|null{
 const json=(data:unknown,status=200)=>Response.json(data,{status}),error=(code:string,status:number)=>json({error:{code}},status),path=url.pathname;
 if(path==='/api/celebrities/nchive/posts'){
  if(method==='GET')return json({items:[...localPosts.values()].filter((post):post is FanPost=>post!==null),nextCursor:null});
  if(method!=='POST')return null;
  const parsed=createPostSchema.safeParse(body);if(!parsed.success)return error('FAN_WEB_INVALID_INPUT',400);
  const {idempotencyKey,...value}=parsed.data;if(value.assetIds.length)return error('FAN_WEB_INVALID_ASSET',400);
  const signature=JSON.stringify(value),previous=postRequests.get(idempotencyKey);if(previous)return previous.signature===signature?json({...previous.result,replayed:true},201):error('FAN_WEB_CONFLICT',409);
  const id=crypto.randomUUID(),createdAt=new Date().toISOString(),post:FanPost={id,celebritySlug:'nchive',body:value.body,visibility:value.visibility,revision:1,author:{nickname:'별빛',avatarUrl:'/images/avatars/star-pink.webp'},assets:[],createdAt,updatedAt:createdAt,isOwner:true,likeCount:0,liked:false,commentCount:0};
  localPosts.set(id,post);const result={id,revision:1,replayed:false};postRequests.set(idempotencyKey,{signature,result});return json(result,201);
 }
 const match=path.match(/^\/api\/posts\/([0-9a-f-]+)(\/comments)?$/);if(!match||!localPosts.has(match[1]!))return null;
 const id=match[1]!,post=localPosts.get(id);if(!post)return error('FAN_WEB_NOT_FOUND',404);
 if(match[2])return method==='GET'?json({items:[],nextCursor:null}):null;
 if(method==='GET')return json({post});
 if(method==='DELETE'){localPosts.set(id,null);return json({removed:true});}
 if(method==='PATCH'){
  const parsed=editPostSchema.safeParse(body);if(!parsed.success)return error('FAN_WEB_INVALID_INPUT',400);
  if(parsed.data.assetIds.length)return error('FAN_WEB_INVALID_ASSET',400);
  if(parsed.data.expectedRevision!==post.revision)return error('FAN_WEB_CONFLICT',409);
  Object.assign(post,{body:parsed.data.body,visibility:parsed.data.visibility,revision:post.revision+1,updatedAt:new Date().toISOString()});return json({id,revision:post.revision,replayed:false});
 }
 return null;
}

export function pencilArtistCreator(locale:AppLocale){
 const base=legacyVisualCreator(locale);
 return {...base,slug:'nchive',name:fanPageName('nchive',locale,'엔카이브 팬페이지'),summary:locale==='ko'?'영상·소식·응원 글':'Videos, news and fan stories',image:{url:asset+'profile.jpg',alt:'NCHIVE',position:'50% 50%'},socialLinks:[{platform:"youtube" as const,url:"https://www.youtube.com/@NCHIVE"},{platform:"instagram" as const,url:"https://www.instagram.com/nchive_official/"},{platform:"tiktok" as const,url:"https://www.tiktok.com/@nchive_official"}]};
}
export async function pencilArtistFixture(url:URL,method:string,locale:AppLocale,view:string|null,body?:Record<string,unknown>){
 const local=localPostResponse(url,method,body);if(local)return local;
 if(method==='GET'&&(url.pathname==='/api/celebrities/nchive/certifications'||url.pathname==='/api/me/celebrities/nchive/certifications')){
  const language=url.searchParams.get('locale')??'ko';if(language!=='ko'&&language!=='en')return Response.json({error:{code:'INVALID_LOCALE'}},{status:400});
  if(url.pathname.startsWith('/api/me/'))return Response.json({error:{code:'LOCAL_HISTORY_UNAVAILABLE'}},{status:503});
  // Public response observed 2026-11-03; private history is deliberately unavailable.
  const en=language==='en';
  return Response.json({certifications:[{id:'616381b2-96f7-4746-87f2-4c060614f125',kind:'quiz',category:en?'Fan Certification':'팬 인증',title:en?'Official Fan Quiz':'Official Fan 인증 퀴즈',description:en?'Pass the quiz to start your Fan Passport.':'퀴즈를 통과하고 Fan Passport를 시작하세요.',status:'available',reward:{scorePoints:1,ticketAmount:0},actionHref:`/c/nchive/verify?locale=${en?'en':'ko'}`}]});
 }
 const mapped=new URL(url);mapped.pathname=mapped.pathname.replaceAll('/nchive','/elina');
 if(/^\/api\/groups\/e9200000-0000-4000-8000-000000000001\/(bookmark|activities)$/.test(mapped.pathname))mapped.pathname=mapped.pathname.replace('e9200000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000002');
 if(mapped.pathname==='/api/celebrities/elina/feed')mapped.searchParams.delete('cursor');
 const response=legacyVisualFixture(mapped,method,locale,['mission','collections'].includes(view??'')?'creator':view,body);
 if(!response)return null;
 const value=await response.json();
 if(mapped.pathname==='/api/groups/resolve/elina'&&value.page?.slug==='elina')Object.assign(value.page,{id:'e9200000-0000-4000-8000-000000000001',celebrityId:'e9200000-0000-4000-8000-000000000001',description:pencilArtistCreator(locale).summary,imageUrl:asset+'profile.jpg'});
 if(mapped.pathname==='/api/posts/e9800000-0000-4000-8000-000000000001')Object.assign(value.post,{body:'가장 좋아하는 무대가 궁금해요\n요즘 예전 무대들을 하나씩 다시 보고 있어요. 같은 곡도 무대마다 분위기가 달라서 새로운 장면이 보이더라고요.\n\n여러분이 가장 좋아하는 엔카이브 무대는 어떤 무대인가요? 특히 좋아하는 부분이나 기억에 남는 순간도 함께 알려주세요!',author:{nickname:'팬 B',avatarUrl:'/images/avatars/heart-pink.webp'},createdAt:'2026-10-29T04:00:00Z',likeCount:7,commentCount:2,assets:[{id:'e9510000-0000-4000-8000-000000000001',width:1080,height:810},{id:'e9510000-0000-4000-8000-000000000002',width:1280,height:720},{id:'e9510000-0000-4000-8000-000000000003',width:1280,height:720}]});
 if(mapped.pathname==='/api/posts/e9800000-0000-4000-8000-000000000001/comments')value.items=value.items.slice(0,2).map((item:Record<string,unknown>,index:number)=>({...item,author:{nickname:index?'팬 B':'팬 A',avatarUrl:index?'/images/avatars/heart-pink.webp':'/images/avatars/star-pink.webp'},body:index?'저도 좋아해요! 같이 보고 싶은 영상도 남겨요.':'저는 처음 봤던 무대가 제일 기억에 남아요. 이 사진도 같이 보고 싶어요!'}));
 const parameters=new URLSearchParams(location.search),role=parameters.get('role');
 if(parameters.get('state')==='y4h7Pi'){if(mapped.pathname==='/api/celebrities/elina/youtube')value.items=[];if(mapped.pathname==='/api/live-events')value.catalog={liveNow:[],upcoming:[],replay:[]};}
 if(mapped.pathname==='/api/groups/resolve/elina'&&value.membership&&role&&['owner','manager','member'].includes(role))value.membership.role=role;
 if(mapped.pathname.endsWith('/presence')&&value.artists)value.artists=[{profileId:'e9200000-0000-4000-8000-000000000001',nickname:'엔카이브',online:true,visitedToday:true}];
 if(mapped.pathname==='/api/celebrities/elina/youtube'){
  value.items=value.items.map((item:Record<string,unknown>,index:number)=>({...item,href:'https://www.youtube.com/watch?v='+(index?'Q7d6ueFBoiQ':'llP16jxxEsU'),title:index?'NCHIVE, Racer (엔카이브, Racer) [THE SHOW 240416]':'엔카이브 (NCHIVE) - Racer Practice Video',image:asset+(index?'stage.jpg':'practice.jpg')}));
 }
 if(mapped.pathname==='/api/live-events')for(const item of value.catalog.liveNow){item.live.heroImage={url:asset+'live.webp',alt:'엔카이브'};item.live.watch.url='https://www.youtube.com/@NCHIVE/live';}
 if(mapped.pathname==='/api/celebrities/elina/feed'&&!mapped.searchParams.has('cursor')&&mapped.searchParams.get('source')!=='official'){
  const extra=['함께 다시 보고 싶은 무대','이번 주에 들은 노래를 나눠요','처음 팬이 된 계기가 궁금해요','기억에 남는 가사를 이야기해요','오늘의 추천 영상','오랜만에 꺼내 본 사진','함께 듣고 싶은 플레이리스트','이번 주 응원 한마디','좋아하는 순간을 나눠요','새로 온 팬에게 추천해요'];
  value.items.push(...extra.map((body,index)=>({...value.items.at(-1),id:`e9600000-0000-4000-8000-${String(index+11).padStart(12,'0')}`,body,replyCount:0})));
 }

 const transform=(item:unknown):unknown=>{
  if(Array.isArray(item))return item.map(transform);
  if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([key,value])=>[key,transform(value)]));
  if(typeof item!=='string')return item;
  if(item==='/images/guest-home/elina-card.jpg')return '/images/groups/nchive-group.webp';
  if(item==='elina')return 'nchive';
  if(item==='엘리나'||item==='Elina')return '엔카이브';
  return item.replaceAll('/elina','/nchive');
 };
 const transformed=transform(value) as typeof value;
 if(mapped.pathname==='/api/celebrities/elina/feed'&&Array.isArray(transformed.items)){
  if(mapped.searchParams.get('source')!=='official'){
   const created=[...localPosts.values()].filter((post):post is FanPost=>post!==null).reverse().map(post=>({...post,kind:'fan_post'}));
   const firstRegular=transformed.items.findIndex((item:{kind:string;pinned?:boolean})=>item.kind!=='notice'||!item.pinned);
   transformed.items.splice(firstRegular<0?transformed.items.length:firstRegular,0,...created);
  }
  const limit=Math.max(1,Math.min(30,Number(url.searchParams.get('limit'))||20)),cursor=url.searchParams.get('cursor')??'',offset=/^pencil:\d+$/.test(cursor)?Number(cursor.slice(7)):0,total=transformed.items.length;
  transformed.items=transformed.items.slice(offset,offset+limit);transformed.nextCursor=offset+limit<total?`pencil:${offset+limit}`:null;
 }
 return Response.json(transformed,{status:response.status});
}

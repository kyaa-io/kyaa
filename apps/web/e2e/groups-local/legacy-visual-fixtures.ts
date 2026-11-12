// Loopback-only fixed visual data. No production seed or external write is performed.
import {z} from 'zod';
import {celebritySlugSchema} from '../../features/fanpage/domain/community';
import type { AppLocale } from '../../i18n/locales';
import { feedbackFixtureResponse,feedbackPublishedCreators,feedbackSummary } from '../lounge-local/feedback-fixture';
import { officialVideoFixture } from '../lounge-local/product-quality-fixture';
import { liveEventResponseSchema } from '../../features/live/domain/live-event';
export const legacyVisualCreator=(locale:AppLocale)=>feedbackPublishedCreators(locale)[0]!;
const id='e9200000-0000-4000-8000-000000000001',now='2026-11-02T00:00:00Z';
type LocalFriend={id:string;profileId:string;nickname:string;avatarUrl:string|null;status:'friends'|'incoming'|'outgoing'};
const socialFriends:LocalFriend[]=[{id,profileId:id,nickname:'별빛',avatarUrl:'/images/avatars/star-pink.webp',status:'friends'}];
const friendInput=z.object({profileId:z.uuid(),requestId:z.uuid(),celebritySlug:celebritySlugSchema.optional()}).strict();
const friendRequests=new Map<string,{signature:string;result:{id:string;status:string;replayed:boolean}}>();
const resolveFriendInput=z.object({action:z.enum(['accept','reject','cancel','unfriend']),requestId:z.uuid()}).strict();
const friendResolutions=new Map<string,{signature:string;result:{id:string;status:string;requestId:string}}>();
const elinaGroupId='e9200000-0000-4000-8000-000000000002';
let creatorBookmarked=false;
let chatStatus:string|null=null,socialMessages=[{id,senderProfileId:id,text:'이번 무대 정말 좋았어요!',createdAt:now,isMine:false},{id:'e9200000-0000-4000-8000-000000000002',senderProfileId:id,text:'저도요. 내일도 함께 응원해요.',createdAt:now,isMine:true}];
let privacy={profileVisible:true,favoriteSlugs:['elina'],dmPolicy:'requests'},blocked:string[]=[];
const popularPosts=['오늘 같이 본 영상 이야기해요','가장 좋아하는 무대가 궁금해요','팬아트와 응원 사진을 나눠요','엔카이브를 처음 알게 된 순간부터 지금까지, 오래 기억하고 싶은 무대와 이야기를 함께 나눠요','다음에 같이 보고 싶은 콘텐츠','오늘도 함께 응원해요','직접 만든 응원 배경화면을 공유해요','입덕한 친구에게 추천할 무대','이번 주에 가장 많이 들은 곡은 무엇인가요','처음 온 팬에게 추천하고 싶은 영상'].map((body,index)=>({id:`e9800000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,celebritySlug:'elina',body,visibility:'public',revision:1,author:{nickname:'팬',avatarUrl:'/images/avatars/star-pink.webp'},assets:[],createdAt:now,updatedAt:now,isOwner:false,likeCount:10-index,viewCount:index===1?2:30,liked:false,commentCount:[3,2,1,6,0,4,2,1,5,2][index]}));
const legacyCheers=['오늘 같이 본 영상 이야기해요','가장 좋아하는 무대가 궁금해요','팬아트와 응원 사진을 나눠요','다음에 같이 보고 싶은 콘텐츠','오늘도 함께 응원해요','직접 만든 응원 배경화면을 공유해요','입덕한 친구에게 추천할 무대','처음 온 팬에게 추천하고 싶은 영상','엔카이브를 처음 알게 된 순간부터 지금까지, 오래 기억하고 싶은 무대와 이야기를 함께 나눠요'].map((body,index)=>({id:`e9600000-0000-4000-8000-${String(index+2).padStart(12,'0')}`,kind:'cheer',body,nickname:index?'팬 B':'팬 A',avatarUrl:'/images/avatars/star-pink.webp',createdAt:now,isOwner:false,clapCount:0,viewerClapped:false,replyCount:index?2:3}));
const legacyCheerNext=legacyCheers.slice(0,2).map((item,index)=>({...item,id:`e9700000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,body:index?'두 번째 페이지의 응원 이야기':'두 번째 페이지의 팬 이야기'}));
export function legacyVisualFixture(url:URL,method:string,locale:AppLocale,view:string|null,body?:Record<string,unknown>):Response|null{
 if(!['quiz-entry','creator','creator-post','my','social','profile'].includes(view??'')&&!(view==='wallet'&&url.pathname==='/api/groups/resolve/elina'))return null;
 const creator=legacyVisualCreator(locale),path=url.pathname,json=(data:unknown)=>Response.json(data);
 // Local-only MY home state switches (synthetic): ?myState=nofavorites|one|long|passporterror|passportloading|summaryerror
 const myState=view==='my'&&method==='GET'?new URLSearchParams(location.search).get('myState'):null;
 if(myState){
  if(path==='/api/me/summary'){
   if(myState==='summaryerror')return Response.json({error:{code:'UNAVAILABLE'}},{status:503});
   const base=feedbackSummary(locale);
   const creators=myState==='nofavorites'?[]:myState==='one'?base.creators.slice(0,1):myState==='long'?base.creators.map((row,index)=>index?row:{...row,celebrity:{...row.celebrity,name:'엘리나 공식 팬클럽 초장문 이름 테스트 ABCDEFGHIJKLMNOPQRSTUVWXYZ 끝까지 함께해요'}}):base.creators;
   return json({summary:{...base,creators}});
  }
 }
 // Local unavailable intro exercises the existing empty state without inventing quiz content.
 const quizSlug=path.match(/^\/api\/public\/celebrities\/(elina|nchive)\/quiz$/)?.[1];
 if(quizSlug&&method==='GET')return json({intro:{celebrity:{slug:quizSlug,name:quizSlug==='nchive'?'엔카이브':creator.name},quiz:{availability:'unavailable',totalQuestions:3,passThreshold:2}}});
 if(path===`/api/groups/resolve/elina`)return json({page:{id:elinaGroupId,kind:'fan',celebrityId:elinaGroupId,slug:'elina',name:creator.name,description:creator.summary,imageUrl:creator.image.url,question:null,memberCount:1200},membership:new URLSearchParams(location.search).get('auth')==='off'?null:{role:'member',joinedAt:now},bookmarked:creatorBookmarked});
 if(path===`/api/groups/${elinaGroupId}/bookmark`&&['PUT','DELETE'].includes(method)){creatorBookmarked=method==='PUT';return json({});}
 if(path===`/api/groups/${elinaGroupId}/activities`)return json({certificationHref:'/elina?tab=certifications',missions:[],events:[],raffles:[]});
 if(path==='/api/groups/me/presence')return json({enabled:false,canConfigure:false});
 if(path.endsWith('/presence'))return json({onlineCount:12,todayCount:128,artists:[]});
 if(path==='/api/community-stamps')return json({today:'2026-11-02',stamps:(['welcome','first_comment','daily_checkin'] as const).map((kind,index)=>({id:'e9200000-0000-4000-8000-00000000001'+(index+1),kind,celebritySlug:kind==='welcome'?null:'elina',issuedAt:now,mint:{status:'queued',txHash:null,tokenId:null}}))});
 if(path==='/api/celebrities/elina/popular-posts'){const period=url.searchParams.get('period');return json({items:period==='week'?[...popularPosts.slice(3),...popularPosts.slice(0,3)]:period==='month'?[...popularPosts].reverse():popularPosts});}
 if(path.startsWith('/api/posts/e9800000-0000-4000-8000-')){const parts=path.split('/'),post=popularPosts.find(item=>item.id===parts[3]);if(!post)return json({error:{code:'NOT_FOUND'}});const comments=Array.from({length:post.commentCount},(_,index)=>({id:`e9900000-0000-4000-8000-${String(Number(post.id.slice(-12))*10+index).padStart(12,'0')}`,postId:post.id,parentId:null,body:['저도 함께 이야기하고 싶어요.','이 순간이 정말 좋았어요.','다음에도 함께해요.'][index%3]!,revision:1,author:{nickname:`팬 ${index+1}`,avatarUrl:'/images/avatars/star-pink.webp'},createdAt:now,isOwner:false,reactions:[]}));return json(parts[4]==='comments'?{items:comments,nextCursor:null}:{post});}
 if(path.startsWith('/api/passports/')){const row=feedbackSummary(locale).creators.find(item=>item.passport.id===path.split('/').at(-1));if(row)return json({passport:{id:row.passport.id,celebrity:{slug:row.celebrity.slug,name:row.celebrity.name},score:{points:row.passport.score,level:row.passport.tier},nextBenefit:null,stamps:[],activities:[],stampSummary:{total:0},firstReaction:null}});}
 if(path.match(/^\/api\/cheers\/([0-9a-f-]+)\/clap$/)&&method==='PUT'){const id=path.split('/')[3],cheer=[...legacyCheers,...legacyCheerNext].find(item=>item.id===id);if(!cheer)return Response.json({}, {status:404});const next=body?.selected===true;cheer.clapCount+=Number(next)-Number(cheer.viewerClapped);cheer.viewerClapped=next;return json({updated:true});}
 const cheerId=path.match(/^\/api\/cheers\/([0-9a-f-]+)(?:\/replies)?$/)?.[1];
 if(cheerId&&method==='GET'){
  const cheer=[...legacyCheers,...legacyCheerNext].find(item=>item.id===cheerId);
  if(!cheer)return Response.json({error:{code:'FANPAGE_NOT_FOUND'}},{status:404});
  if(path.endsWith('/replies'))return json({total:cheer.replyCount,replies:Array.from({length:cheer.replyCount},(_,index)=>({id:`e9900000-0000-4000-8000-${String(Number(cheerId.slice(-12))*10+index).padStart(12,'0')}`,body:['저도 함께 이야기하고 싶어요.','이 순간이 정말 좋았어요.','다음에도 함께해요.'][index%3],nickname:`팬 ${index+1}`,avatarUrl:'/images/avatars/star-pink.webp',createdAt:now,isOwner:false,clapCount:0,viewerClapped:false})),nextCursor:null});
  return json({source:'cheer',id:cheer.id,celebritySlug:'elina',body:cheer.body,clapCount:cheer.clapCount,viewerClapped:cheer.viewerClapped});
 }
 if(path==='/api/celebrities/elina/feed'){const items=[{id:'e9600000-0000-4000-8000-000000000001',kind:'notice',noticeKind:'welcome',slug:'fixture-welcome',title:'처음 오셨다면 여기부터 확인해요',pinned:true,postType:'notice',visibility:'public',revision:1,publishedAt:now,body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'팬페이지에 오신 것을 환영해요.'}]}]},commentCount:0},...legacyCheers];const filtered=items.filter(item=>url.searchParams.get('source')==='official'?item.kind==='notice':url.searchParams.get('source')==='fans'?item.kind!=='notice':true);const second=url.searchParams.get('cursor')==='fixture-next';return json({items:second?legacyCheerNext:filtered,nextCursor:!second&&url.searchParams.get('source')!=='official'?'fixture-next':null,unavailableSources:[]});}
 if(path==='/api/celebrities/elina/youtube')return json({items:officialVideoFixture.items.slice(1,3),nextCursor:null});
 if(path==='/api/celebrities/elina/media')return json({items:[],nextCursor:null});
 if(path==='/api/celebrities/elina/notices')return json({notices:[{slug:'fixture-welcome',title:'처음 오셨다면 여기부터 확인해요',pinned:true,kind:'welcome',publishedAt:now}],nextCursor:null});
 if(path.endsWith('/raffles'))return json({raffles:[]});
 if(path==='/api/celebrities/elina/fans')return json({likeCount:1200,fanCount:1200,publicFanCount:3,fans:[]});
 if(path.endsWith('/reactions'))return json({reaction:null});
 if(path==='/api/live-events'){
  const live=liveEventResponseSchema.parse({live:{id,slug:'fixture-live',liveType:'recurring',effectiveStatus:'live',startsAt:'2026-11-01T00:00:00Z',endsAt:null,reservationOpensAt:'2026-10-01T00:00:00Z',reservationClosesAt:'2026-11-01T00:00:00Z',title:'팬들과 함께하는 LIVE',description:'팬들과 함께하는 시간',productContext:null,heroImage:{url:'/images/celebrities/elina/guide-blue-beret-20260912.webp',alt:'엘리나'},celebrity:{slug:'elina',name:creator.name,image:creator.image.url,fanCount:1200},brand:null,watch:{available:true,mode:'live',provider:'youtube',url:'https://www.youtube.com/watch?v=f3Bm2pB0sLw'}},viewer:{authenticated:true,passport:'active',reservation:null},primaryAction:'watch_live'});return json({catalog:{liveNow:[live],upcoming:[],replay:[]}});
 }
 if(path==='/api/live-events/calendar'){const month=url.searchParams.get('month')??'2026-11',parts=month.split('-').map(Number),days=new Date(Date.UTC(parts[0]!,parts[1]!,0)).getUTCDate();return json({month,timeZone:'Asia/Seoul',days:Array.from({length:days},(_,i)=>({date:`${month}-${String(i+1).padStart(2,'0')}`,events:[]}))});}
 if(path==='/api/schedules')return json({items:[],nextCursor:null});
 if(path==='/api/groups'&&url.searchParams.get('owned')==='1')return json({items:[{id:elinaGroupId,kind:'fan',celebrityId:elinaGroupId,slug:'elina',name:creator.name,description:creator.summary,imageUrl:creator.image.url,question:null,memberCount:1200}],nextCursor:null});
 if(path==='/api/me/social/settings'){if(method==='PATCH')privacy=body as typeof privacy;return json(privacy);}
 if(path==='/api/me/social/blocks'){if(method==='POST')blocked.push(String(body?.profileId));return json({profiles:blocked.map(profileId=>({profileId,nickname:'별빛',avatarUrl:null,blockedAt:now}))});}
 if(path==='/api/me/social/friends'){
  if(method==='POST'){
   const parsed=friendInput.safeParse(body);if(!parsed.success)return Response.json({error:{code:'INVALID_REQUEST'}},{status:400});
   const {profileId,requestId,celebritySlug}=parsed.data,signature=JSON.stringify({profileId,celebritySlug:celebritySlug??null}),previous=friendRequests.get(requestId);
   if(previous)return previous.signature===signature?json({...previous.result,replayed:true}):Response.json({error:{code:'SOCIAL_IDEMPOTENCY_CONFLICT'}},{status:409});
   let friendship=socialFriends.find(item=>item.profileId===profileId);
   if(!friendship){friendship={id:crypto.randomUUID(),profileId,nickname:profileId==='e9200000-0000-4000-8000-000000000002'?'하늘':'별빛',avatarUrl:'/images/avatars/star-pink.webp',status:'outgoing'};socialFriends.push(friendship);}
   const result={id:friendship.id,status:friendship.status==='friends'?'accepted':'pending',replayed:false};friendRequests.set(requestId,{signature,result});return json(result);
  }
  return json({friendships:new URLSearchParams(location.search).get('state')==='empty'?[]:socialFriends});
 }
 const friendshipId=path.match(/^\/api\/me\/social\/friends\/([0-9a-f-]+)$/)?.[1];
 if(friendshipId&&method==='PATCH'){
  const parsed=resolveFriendInput.safeParse(body);if(!parsed.success)return Response.json({error:{code:'INVALID_REQUEST'}},{status:400});
  const {action,requestId}=parsed.data,signature=JSON.stringify({friendshipId,action}),previous=friendResolutions.get(requestId);
  if(previous)return previous.signature===signature?json(previous.result):Response.json({error:{code:'SOCIAL_IDEMPOTENCY_CONFLICT'}},{status:409});
  const index=socialFriends.findIndex(item=>item.id===friendshipId),friendship=socialFriends[index];
  if(!friendship)return Response.json({error:{code:'SOCIAL_NOT_FOUND'}},{status:404});
  if(!((action==='cancel'&&friendship.status==='outgoing')||(action==='unfriend'&&friendship.status==='friends')||(['accept','reject'].includes(action)&&friendship.status==='incoming')))return Response.json({error:{code:'SOCIAL_CONFLICT'}},{status:409});
  if(action==='accept')friendship.status='friends';else socialFriends.splice(index,1);
  const result={id:friendshipId,status:action==='accept'?'accepted':action==='reject'?'rejected':action==='cancel'?'cancelled':'unfriended',requestId};friendResolutions.set(requestId,{signature,result});return json(result);
 }
 if(path.startsWith('/api/me/social/profiles/')){
  const profileId=path.split('/').at(-1)!,friendship=socialFriends.find(item=>item.profileId===profileId);
  return json({profile:{id:profileId,nickname:friendship?.nickname??(profileId==='e9200000-0000-4000-8000-000000000002'?'하늘':'별빛'),avatarUrl:'/images/avatars/star-pink.webp'},relationship:{friendshipId:friendship?.id??null,status:friendship?.status??'none'},dm:{conversationId:null,status:'none',canSend:false},capabilities:{canRequestFriend:!friendship&&!blocked.includes(profileId),canRequestDm:true,canBlock:true},commonFavorites:profileId==='e9200000-0000-4000-8000-000000000003'?[]:[{name:'엔카이브'}]});
 }
 const socialState=new URLSearchParams(location.search).get('state');
 if(path==='/api/me/social/conversations'){
  if(method==='POST'){chatStatus='outgoing_request';socialMessages=[{id:crypto.randomUUID(),senderProfileId:id,text:String(body?.text??''),createdAt:now,isMine:true}];return json({id});}
  if(socialState==='empty')return json({conversations:[]});
  const status=chatStatus??(socialState==='incoming'?'incoming_request':socialState==='outgoing'?'outgoing_request':socialState==='rejected'?'rejected':'accepted');
  return json({conversations:[{id,profileId:id,nickname:'하늘',avatarUrl:'/images/avatars/heart-lavender.webp',status,canSend:status==='accepted'&&socialState!=='denied',latestMessage:'내일 무대 같이 봐요',unreadCount:2},{id:'e9200000-0000-4000-8000-000000000002',profileId:'e9200000-0000-4000-8000-000000000002',nickname:'보라',avatarUrl:'/images/avatars/heart-lavender.webp',status:'incoming_request',canSend:false,latestMessage:null},...((socialState==='X7aUHx'||new URLSearchParams(location.search).get('conversationId')==='e9200000-0000-4000-8000-000000000003')?[{id:'e9200000-0000-4000-8000-000000000003',profileId:'e9200000-0000-4000-8000-000000000003',nickname:'별빛',avatarUrl:'/images/avatars/star-pink.webp',status:'accepted',canSend:true,latestMessage:'안녕하세요! 다음 모임에서 만나요.'}]:[])]});
 }
 if(path===`/api/me/social/conversations/${id}`&&method==='PATCH'){chatStatus=body?.action==='accept'?'accepted':'rejected';return json({id,status:chatStatus});}
 if(path.endsWith('/messages')&&path.startsWith('/api/me/social')){
  if(socialState==='denied')return Response.json({error:{code:'SOCIAL_CONVERSATION_FORBIDDEN'}},{status:403});
  if(method==='POST'){const messageId=crypto.randomUUID();socialMessages.push({id:messageId,senderProfileId:id,text:String(body?.text??''),createdAt:new Date().toISOString(),isMine:true});return json({id:messageId});}
  return json({messages:path.includes('e9200000-0000-4000-8000-000000000003')?[{id,senderProfileId:id,text:'안녕하세요! 다음 모임에서 만나요.',createdAt:now,isMine:false},{id:'e9200000-0000-4000-8000-000000000004',senderProfileId:id,text:'좋아요. 일정 확인하고 예약할게요.',createdAt:now,isMine:true}]:socialMessages});
 }
 return feedbackFixtureResponse(url.href,method,locale);
}

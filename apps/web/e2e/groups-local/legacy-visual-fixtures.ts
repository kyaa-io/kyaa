// Loopback-only fixed visual data. No production seed or external write is performed.
import type { AppLocale } from '../../i18n/locales';
import { feedbackFixtureResponse,feedbackPublishedCreators,feedbackSummary } from '../lounge-local/feedback-fixture';
import { officialVideoFixture } from '../lounge-local/product-quality-fixture';
import { liveEventResponseSchema } from '../../features/live/domain/live-event';
export const legacyVisualCreator=(locale:AppLocale)=>feedbackPublishedCreators(locale)[0]!;
const id='e9200000-0000-4000-8000-000000000001',now='2026-11-02T00:00:00Z';
let creatorBookmarked=false;
let chatStatus:string|null=null,socialMessages=[{id,senderProfileId:id,text:'이번 주말 함께 이야기해요.',createdAt:now,isMine:false}];
let privacy={profileVisible:true,favoriteSlugs:['elina'],dmPolicy:'requests'},blocked:string[]=[];
export function legacyVisualFixture(url:URL,method:string,locale:AppLocale,view:string|null,body?:Record<string,unknown>):Response|null{
 if(!['creator','my','social'].includes(view??'')&&!(view==='wallet'&&url.pathname==='/api/groups/resolve/elina'))return null;
 const creator=legacyVisualCreator(locale),path=url.pathname,json=(data:unknown)=>Response.json(data);
 if(path===`/api/groups/resolve/elina`)return json({page:{id,kind:'fan',celebrityId:id,slug:'elina',name:creator.name,description:creator.summary,imageUrl:creator.image.url,question:null,memberCount:1200},membership:new URLSearchParams(location.search).get('auth')==='off'?null:{role:'member',joinedAt:now},bookmarked:creatorBookmarked});
 if(path===`/api/groups/${id}/bookmark`&&['PUT','DELETE'].includes(method)){creatorBookmarked=method==='PUT';return json({});}
 if(path==='/api/groups/me/presence')return json({enabled:false,canConfigure:false});
 if(path.endsWith('/presence'))return json({onlineCount:12,todayCount:128,artists:[]});
 if(path==='/api/community-stamps')return json({today:'2026-11-02',stamps:(['welcome','first_comment','daily_checkin'] as const).map((kind,index)=>({id:'e9200000-0000-4000-8000-00000000001'+(index+1),kind,celebritySlug:kind==='welcome'?null:'elina',issuedAt:now,mint:{status:'queued',txHash:null,tokenId:null}}))});
 if(path.startsWith('/api/passports/')){const row=feedbackSummary(locale).creators.find(item=>item.passport.id===path.split('/').at(-1));if(row)return json({passport:{id:row.passport.id,celebrity:{slug:row.celebrity.slug,name:row.celebrity.name},score:{points:row.passport.score,level:row.passport.tier},nextBenefit:null,stamps:[],activities:[],stampSummary:{total:0},firstReaction:null}});}
 if(path==='/api/celebrities/elina/feed'){const items=[{id:'e9600000-0000-4000-8000-000000000001',kind:'notice',noticeKind:'welcome',slug:'fixture-welcome',title:'처음 오셨다면 여기부터 확인해요',pinned:true,postType:'notice',visibility:'public',revision:1,publishedAt:now,body:{type:'doc',content:[]},commentCount:0},...['오늘 같이 본 영상 이야기해요','가장 좋아하는 무대가 궁금해요'].map((body,index)=>({id:'e9600000-0000-4000-8000-00000000000'+(index+2),kind:'cheer',body,nickname:index?'팬 B':'팬 A',avatarUrl:'/images/avatars/star-pink.webp',createdAt:now,isOwner:false,clapCount:0,viewerClapped:false,replyCount:index?2:3}))];return json({items:items.filter(item=>url.searchParams.get('source')==='official'?item.kind==='notice':url.searchParams.get('source')==='fans'?item.kind!=='notice':true),nextCursor:null,unavailableSources:[]});}
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
 if(path==='/api/groups'&&url.searchParams.get('owned')==='1')return json({items:[{id,kind:'fan',celebrityId:id,slug:'elina',name:creator.name,description:creator.summary,imageUrl:creator.image.url,question:null,memberCount:1200}],nextCursor:null});
 if(path==='/api/me/social/settings'){if(method==='PATCH')privacy=body as typeof privacy;return json(privacy);}
 if(path==='/api/me/social/blocks'){if(method==='POST')blocked.push(String(body?.profileId));return json({profiles:blocked.map(profileId=>({profileId,nickname:'별빛',avatarUrl:null,blockedAt:now}))});}
 if(path==='/api/me/social/friends')return json({friendships:[{id,profileId:id,nickname:'별빛',avatarUrl:'/images/avatars/star-pink.webp',status:'friends'}]});
 if(path.startsWith('/api/me/social/profiles/'))return json({profile:{id,nickname:'별빛',avatarUrl:'/images/avatars/star-pink.webp'},relationship:{friendshipId:null,status:'none'},dm:{conversationId:null,status:'none',canSend:false},capabilities:{canRequestFriend:true,canRequestDm:true,canBlock:true}});
 const socialState=new URLSearchParams(location.search).get('state');
 if(path==='/api/me/social/conversations'){
  if(method==='POST'){chatStatus='outgoing_request';socialMessages=[{id:crypto.randomUUID(),senderProfileId:id,text:String(body?.text??''),createdAt:now,isMine:true}];return json({id});}
  const status=chatStatus??(socialState==='incoming'?'incoming_request':socialState==='outgoing'?'outgoing_request':socialState==='rejected'?'rejected':'accepted');
  return json({conversations:[{id,profileId:id,nickname:'별빛',avatarUrl:'/images/avatars/star-pink.webp',status,canSend:status==='accepted'&&socialState!=='denied',latestMessage:socialMessages.at(-1)?.text??null}]});
 }
 if(path===`/api/me/social/conversations/${id}`&&method==='PATCH'){chatStatus=body?.action==='accept'?'accepted':'rejected';return json({id,status:chatStatus});}
 if(path.endsWith('/messages')&&path.startsWith('/api/me/social')){
  if(socialState==='denied')return Response.json({error:{code:'SOCIAL_CONVERSATION_FORBIDDEN'}},{status:403});
  if(method==='POST'){const messageId=crypto.randomUUID();socialMessages.push({id:messageId,senderProfileId:id,text:String(body?.text??''),createdAt:new Date().toISOString(),isMine:true});return json({id:messageId});}
  return json({messages:socialMessages});
 }
 return feedbackFixtureResponse(url.href,method,locale);
}

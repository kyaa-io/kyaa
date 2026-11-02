import {GroupAdminOverview} from "../../components/admin/group-admin-overview";
import { raffleClaimFixture } from './raffle-claim-fixtures';
import { applicationFixture, adminApplicationFixtures } from './application-fixtures';
import { contentFixture } from './content-fixtures';
import { legacyVisualFixture,legacyVisualCreator } from "./legacy-visual-fixtures";
import { CelebrityFanPage } from "../../components/celebrity-fan-page";
import { MyScreen } from "../../features/my/ui/my-screen";
import { GroupSocialScreen } from "../../features/group-social/screen";
import { LocaleProvider } from "../../components/locale-provider";
import { GroupManageScreen } from "../../features/groups/ui/group-manage-screen";
import { membersFixture } from "./members-fixtures";
import { activityFixture } from "./activity-fixtures";
import { GroupEventScreen } from "../../features/groups/ui/group-event-screen";
import { GroupMissionScreen } from "../../features/groups/ui/group-mission-screen";
import { GroupActivitiesPanel,GroupCollections } from "../../features/groups/ui/group-activities";
import { GroupRaffleScreen } from "../../features/group-raffle/raffle-screen";
import { createRoot } from "react-dom/client";
import { GroupsReleaseProvider } from "../../features/groups/ui/groups-release";
import { CapsuleScreen } from "../../features/group-capsule/capsule-screen";
import { GroupDirectory } from "../../features/groups/ui/group-directory";
import { GroupDetailScreen } from "../../features/groups/ui/group-detail";
import { GroupApplication } from "../../features/groups/ui/group-application";
import { WalletScreen } from "../../features/group-wallet/ui/wallet-screen";
import { GroupApplicationManager } from "../../components/admin/group-application-manager";
import { GroupArtistManager } from "../../components/admin/group-artist-manager";
import { GroupOperationsManager } from "../../components/admin/group-operations-manager";
import { GroupCapsuleManager } from "../../components/admin/group-capsule-manager";
import { FanSiteFooter } from "../../components/fan-shell/fan-site-footer";
import { parseAppLocale } from "../../i18n/locales";
import "../../app/globals.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
const query = new URLSearchParams(location.search), locale = parseAppLocale(query.get("locale")), state = query.get("state"), view = query.get("view");
document.documentElement.lang=locale;
if(view==='creator'||view==='my'||view==='social'){const path=view==='creator'?'/elina':view==='social'?'/my/friends':'/my';history.replaceState(null,'',`${path}${location.search}`);}
const id = "e9200000-0000-4000-8000-000000000001", now="2026-11-01T12:00:00Z";
const names=["엔카이브 팬페이지","엘리나 팬페이지","한강 러닝 크루","RUN&MUSIC FESTIVAL","사진 산책 모임","주말 독서 모임","인디 음악 모임","공연 기록 모임","영화산책","아침요가","커피노트","전시산책","여행기록","동네산책"];
const descriptions=['공식 영상과 LIVE 소식','음악·일상 소식과 응원 글','같이 달리고 러닝 기록을 나눠요.','러닝·음악 행사 모임','일상의 순간을 사진으로 나눠요.','함께 읽고 감상을 나눠요.','좋아하는 음악과 공연 소식','다녀온 공연의 순간을 나눠요.'];
const counts=[1280,356,84,2450,128,96,214,173];
const items=names.map((name,i)=>({id:`e9200000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,kind:i<2?'fan':i===3?'brand':'hobby',celebrityId:null,slug:null,name:state==='long'&&i===7?'긴 이름의 모임에서도 줄바꿈과 카드 정렬을 확인하는 페이지':name,description:state==='long'&&i===7?'아주 긴 소개가 이어져도 마지막 행동과 카드 외곽이 같은 행에서 정렬되어야 합니다.':descriptions[i]??'',imageUrl:i===0?'/images/groups/nchive-pencil.jpg':i===1?'/images/groups/elina-pencil.jpg':i===2?'/images/groups/running-event.png':i===3?'/images/groups/runmusic-pencil.jpg':i<8?`/images/groups/${['photo','reading','music','concert'][i-4]}-placeholder.svg`:null,question:null,anonymous:false,memberCount:counts[i]??3}));
let fixtureJoined=state!=='invite';
const receipts=new Map<string,unknown>();let points=240,hearts=2,tickets=state==='zero-tickets'?0:12,checkedIn=false;
const json=(value:unknown,status=200)=>Promise.resolve(Response.json(value,{status})),realFetch=window.fetch.bind(window);
window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
 if(!url.pathname.startsWith('/api/'))return realFetch(input,init);
 const path=url.pathname,body=init?.body?JSON.parse(String(init.body)):null;
 if(state==='error' && (path.startsWith('/api/groups')||path.startsWith('/api/me/wallet')))return json({error:{code:'UNAVAILABLE'}},503);
 if(path.startsWith('/api/groups/media/'))return realFetch('/images/avatars/star-pink.webp');
 if(path==='/api/me/avatar')return json({avatar:{initialCharacterId:'star-pink',characterId:'star-pink',source:'character',hasImage:false,revision:0}});
 const contentState=contentFixture(url,init?.method??'GET',body,state,query.get('kind')==='brand');if(contentState)return contentState;
 const applicationState=applicationFixture(path,init?.method??'GET',body,state);if(applicationState)return applicationState;
 const people=membersFixture(url,state);if(people!==undefined)return json(people);
 const legacy=legacyVisualFixture(url,init?.method??'GET',locale,view,body);if(legacy)return legacy;
 const claim=raffleClaimFixture(url,init?.method??'GET',body,state);if(claim)return claim;
 const activity=activityFixture(path,init?.method??'GET',state,query.get('kind')==='brand');if(activity!==undefined)return json(activity);
 if(path==='/api/groups/admin/applications')return json({items:state==='empty'?[]:adminApplicationFixtures,nextCursor:null});
 if(path==='/api/groups/admin/reports')return json({items:[{id,page_id:id,target_type:'post',target_id:id,targetPostId:id,targetRoomId:null,reason:'광고성 게시물이 반복해서 올라와요.',status:'submitted',resolution:null}],nextCursor:null});
 if(path==='/api/groups/admin/event-support')return json({items:[{id,pageId:id,eventId:id,eventTitle:'한강 러닝 주말 행사',pageName:'한강 러닝 크루',description:'행사 진행 자료와 참석 기록을 제출합니다.',sourceUrl:null,status:'submitted',reason:null,attendanceCount:8,reviewCount:3}],nextCursor:null});
 if(path==='/api/groups/admin/official-events')return json({items:[{id,page_id:id,event_id:id,event_title:'한강 러닝과 음악이 함께하는 주말',page_name:'한강 러닝 크루',description:'주말 행사 공식 등록 신청입니다.',source_url:null,status:'submitted',reason:null}],nextCursor:null});
 if(path==='/api/groups/admin/missions')return json({items:[{id,pageId:id,pageName:'한강 러닝 크루',title:'이번 주 5km 달리기',rewardPoints:10,budgetPoints:1000,submissionCount:0}],nextCursor:null});
 if(path.endsWith('/artists'))return json({items:[{appUserId:id,nickname:'엔카이브',avatarUrl:null,verifiedBy:id}]});
 if(path==='/api/admin/fans')return json({items:[{fanId:id,nickname:'엔카이브',email:'fixture@example.test',accountStatus:'active'}],nextCursor:null});
 if(path==='/api/admin/lives')return json({celebrities:[]});
 if(path===`/api/groups/capsules/${id}/draw`&&init?.method==='POST'){
  const existing=receipts.get(body.requestKey);if(existing)return json(existing);
  if(state==='insufficient'||tickets<body.count)return json({error:{code:'GROUP_WALLET_INSUFFICIENT_BALANCE'}},409);
  tickets-=body.count;const result={requestKey:body.requestKey,campaignId:id,count:body.count,tickets,results:Array.from({length:body.count},(_,i)=>({index:i+1,prizeId:state!=='blank'&&i%2===0?id:null,name:state!=='blank'&&i%2===0?'팬 굿즈':null,imageUrl:state!=='blank'&&i%2===0?'/images/avatars/star-pink.webp':null}))};
  receipts.set(body.requestKey,result);if(state==='uncertain')throw new TypeError('Fixture response lost');return json(result);
 }
 if(path.startsWith('/api/me/wallet/capsule-requests/')){const result=receipts.get(path.split('/').at(-1)!);return result?json(result):json({error:{code:'CAPSULE_NOT_FOUND'}},404);}
 if(path==='/api/groups/capsules')return json({items:state==='empty'?[]:[{id,name:'주말 캡슐',status:'active',blankWeight:500000,weightTotal:1000000,prizes:[{id,name:'팬 굿즈',imageUrl:'/images/avatars/star-pink.webp',weight:500000,stock:30}]}]});
 if(path==='/api/admin/group-capsules')return json({items:state==='empty'?[]:[{id,name:'주말 캡슐',status:'draft',blankWeight:500000,prizes:[{id,name:'팬 굿즈',weight:500000,stock:30}]}]});
 if(path==='/api/groups'){const filtered=state==='empty'?[]:(url.searchParams.get('mine')==='joined'?items.slice(0,4):items).filter(p=>!url.searchParams.get('type')||url.searchParams.get('type')==='all'||p.kind===url.searchParams.get('type')).filter(p=>p.name.includes(url.searchParams.get('search')??'')),limit=Math.max(1,Math.min(50,Number(url.searchParams.get('limit'))||8)),start=url.searchParams.get('cursor')?filtered.findIndex(p=>p.id===url.searchParams.get('cursor'))+1:0,shown=filtered.slice(start,start+limit);return json({items:shown,totalCount:filtered.length,nextCursor:start+limit<filtered.length?shown.at(-1)?.id??null:null});}
 if(path===`/api/groups/${id}`&&state==='invite-invalid')return json({error:{code:'GROUP_NOT_FOUND'}},404);
 if(path===`/api/groups/${id}/membership`&&init?.method==='POST'){fixtureJoined=true;return json({joined:true});}
 if(path===`/api/groups/${id}`)return json({page:{...items[query.get('kind')==='brand'?3:query.get('kind')==='fan'?1:2],id,kind:query.get('kind')==='brand'?'brand':query.get('kind')==='fan'?'fan':'hobby',slug:query.get('kind')==='fan'?'elina':null,celebrityId:query.get('kind')==='fan'?id:null},membership:query.get('auth')==='off'||!fixtureJoined?null:{role:query.get('role')??(state==='invite'?'member':'owner'),joinedAt:now},bookmarked:false});
 if(path.endsWith('/posts'))return json({items:state==='empty'?[]:Array.from({length:8},(_,i)=>({id:`e9300000-0000-4000-8000-00000000000${i+1}`,pageId:id,title:`함께하는 이야기 ${i+1}`,body:'이번 주말 함께 활동해요.',visibility:'public',anonymous:false,profileId:id,nickname:'별빛',avatarUrl:null,createdAt:now})),nextCursor:null});

 if(path.endsWith('/rooms'))return json({items:[{id,name:'주말 러닝',minimumTier:null,status:'open',canEnter:true}]});
 if(path.endsWith('/messages'))return json({items:[{id,body:'이번 주말 아침에 만나요.',profileId:id,nickname:'별빛',createdAt:now}]});
 if(path==='/api/me/wallet')return json({sequence:1,points,hearts,tickets,policyVersion:'group-wallet-v1',pointCost:100,writeFenced:false,attendance:{date:'2026-11-07',checkedIn,streak:checkedIn?7:6,nextBonusIn:checkedIn?7:1,days:Array.from({length:checkedIn?7:6},(_,i)=>({date:`2026-11-0${i+1}`,points:i===6?30:10}))}});
 if(path==='/api/me/wallet/history')return json({entries:state==='empty'?[]:[{id,asset:'fan_point',amount:10,sourceType:'group_check_in',sourceId:id,celebrityId:null,createdAt:now}]});
 if(path.startsWith('/api/me/wallet/requests/'))return json(receipts.has(path.split('/').at(-1)!)?{status:'committed',result:receipts.get(path.split('/').at(-1)!)}:{status:'unknown'});
 if(path==='/api/me/wallet/exchange') {points-=body.units*100;if(body.target==='heart')hearts+=body.units;else tickets+=body.units;const result={...body,pointsSpent:body.units*100,pointLedgerId:id,creditLedgerId:id,createdAt:now,replayed:false};receipts.set(body.requestKey,result);return json(result);}
 if(path==='/api/me/wallet/support'){hearts-=body.units;const result={requestKey:body.requestKey,celebrityId:id,units:body.units,voucherLedgerId:id,policyVersion:'group-wallet-v1',createdAt:now,replayed:false};receipts.set(body.requestKey,result);return json(result);}
 if(path==='/api/me/wallet/check-in'){checkedIn=true;points+=30;const result={requestKey:body.requestKey,date:'2026-11-01',pointsAwarded:30,streak:7,ledgerId:id,replayed:false};receipts.set(body.requestKey,result);return json(result);}
 if(path==='/api/groups/applications')return json(init?.method==='POST'?{id,status:'submitted',pageId:null}:{items:[],nextCursor:null});
 return json({items:[],count:0,unreadCount:0});
}) as typeof fetch;
const content=view==='creator'?<CelebrityFanPage celebrity={legacyVisualCreator(locale)} locale={locale} groupsEnabled upcomingLive={null}/>:view==='my'?<MyScreen locale={locale}/>:view==='social'?<GroupSocialScreen locale={locale} profileId={query.get('profileId')??undefined} conversationId={query.get('conversationId')??undefined}/>:view==='manage'?<GroupManageScreen pageId={id} locale={locale} initialSection={query.get('section')??undefined}/>:view==='artists-admin'?<GroupArtistManager locale={locale==='ko'?'ko':'en'}/>:['reports','official-events','missions','event-support'].includes(view??'')?<GroupOperationsManager locale={locale==='ko'?'ko':'en'} view={view as 'reports'|'official-events'|'missions'|'event-support'}/>:view==='event'?<GroupEventScreen pageId={id} eventId={id} locale={locale}/>:view==='mission'?<GroupMissionScreen pageId={id} missionId={id} locale={locale}/>:view==='activities'?<GroupActivitiesPanel pageId={id} locale={locale}/>:view==='collections'?<GroupCollections pageId={id} locale={locale}/>:view==='raffle'?<GroupRaffleScreen pageId={id} raffleId={id} locale={locale}/>:view==='capsules'?<CapsuleScreen locale={locale} pageId={query.get('pageId')??undefined}/>:view==='wallet'?<WalletScreen locale={locale} attendance={query.get('section')==='attendance'} supportCreator={query.get('section')==='support'?query.get('creator')??'elina':undefined}/>:view==='admin-overview'?<GroupAdminOverview locale={locale==='ko'?'ko':'en'}/>:view==='admin'?<GroupApplicationManager locale={locale==='ko'?'ko':'en'}/>:view==='capsule-admin'?<GroupCapsuleManager locale={locale==='ko'?'ko':'en'}/>:view==='apply'?<GroupApplication locale={locale} initialKind={query.get('kind')==='fan'?'fan':query.get('kind')==='brand'?'brand':'hobby'}/>:view==='detail'?<GroupDetailScreen locale={locale} pageId={id} tab={query.get('tab')??'home'} initialReturnTo={query.get('returnTo')??undefined}/>:<GroupDirectory locale={locale}/>;
createRoot(document.getElementById('root')!).render(<GroupsReleaseProvider enabled><LocaleProvider initialLocale={locale}>{content}{!['creator','my','social','manage','wallet','admin-overview','admin','capsule-admin','capsules','reports','official-events','missions','artists-admin','event-support'].includes(view??'')&&<FanSiteFooter locale={locale}/>}</LocaleProvider></GroupsReleaseProvider>);

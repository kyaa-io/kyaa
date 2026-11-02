import {CreatorGroupCalendar} from "../../features/groups/ui/group-calendar";
import {serviceCalendarFixture} from "./service-calendar-fixtures";
import {eventApplicationFixture} from './event-application-fixtures';
import {GroupEventSupportScreen} from '../../features/groups/ui/group-event-support-screen';
import {activityEvidenceFixture} from './activity-evidence-fixtures';
import {GroupMembershipInvitationScreen} from '@/features/groups/ui/group-membership-invitation';
import {createGroupInvitationFixture} from './group-invitation-fixture';
import {GroupGiftScreen} from '@/features/groups/ui/group-gift-screen';
import {giftFixture} from './gift-fixtures';
import {GroupQualificationScreen} from "@/features/groups/ui/group-qualification";
import {GroupOwnReports} from '../../features/groups/ui/group-own-reports';
import {GroupReferralScreen} from '../../features/groups/ui/group-referral-screen';
import {groupReferralFixture} from './group-referral-fixture';
import {SourceConfirmPanel,SOURCE_CONFIRM_PANELS} from './source-confirm-panel';
import {CreateGroupRaffle} from '../../features/group-raffle/create-raffle';
import {PencilEventOperations} from './pencil-event-operations';
import {pendingEntrySchema} from '../../features/group-raffle/domain';
import {calendarPreviewFixture} from './pencil-calendar-fixture';
import {PencilCalendarPreview,PencilCalendarDetail} from './pencil-calendar-preview';
import {PencilBenefitsPreview,PENCIL_BENEFITS_IDS,type PencilBenefitsNodeId} from './pencil-benefits-preview';
import {PencilDetailPreview} from './pencil-detail-preview';
import {PencilMembersPreview} from './pencil-members-preview';
import {pencilPostPreview} from './pencil-post-preview';
import {PencilComposerPreview} from './pencil-composer-preview';
import {SourceActivityPanels,SOURCE_ACTIVITY_PANELS} from './source-activity-panels';
import {SourceCommunityPanel,SOURCE_COMMUNITY_PANELS} from './source-community-panels';
import {utilityFixture} from './utility-fixtures';
import {SourceSecondaryPanel,SOURCE_SECONDARY_PANELS} from './source-secondary-panel';
import {PassportDetailScreen,PassportCollectionScreen} from '../../features/passport/ui/passport-screens';
import {FanHistoryScreen} from '../../features/my/ui/fan-history-screen';
import {historyKindSchema} from '../../features/my/domain/fan-history';
import {LiveCalendarScreen} from '../../features/live/ui/live-calendar-screen';
import {BenefitsScreen} from '../../features/benefit/ui/benefit-screen';
import {CelebrityDirectory} from '../../components/celebrity-directory';
import {feedbackPublishedCreators} from '../lounge-local/feedback-fixture';
import {parseFanPageTab,resolveBoardSection} from '../../features/fanpage/domain/board-navigation';
import {sourceContentStateResponse,sourceContentStateFailure} from './source-content-states';
import {SettingsScreen} from '../../features/profile/ui/settings-screen';
import {parseSettingsSection} from '../../features/profile/domain/settings-navigation';
import {sourceStateResponse,sourceStateFailure,sourceStateResolved} from './source-state-fixtures';
import {SourceResultPanel,SOURCE_RESULT_PANELS} from './source-result-panel';
import {SourceFlowPanel,SOURCE_FLOW_PANELS} from './source-flow-panel';
import {SourceWalletState} from './source-wallet-state';
import {GroupSettingsMenu} from '../../features/profile/ui/group-settings-menu';
import {GroupNotificationPanel} from '../../features/notification/ui/group-notification-panel';
import {CreatorBoardAside} from '../../features/groups/ui/creator-board-aside';
import {CreatorGroupHeader} from '../../features/groups/ui/creator-group-header';
import {useEffect,useState,useRef} from 'react';
import {PencilVideoPreview} from './pencil-video-preview';
import type {CreatorMediaSelection} from '../../features/media/ui/creator-media-panel';
import {GroupShell} from '../../features/groups/ui/group-shell';
import {ProfileConnectionPanel} from '../../features/group-social/profile-connection';
import {ArtistPresenceSettings} from '../../features/groups/ui/artist-presence-settings';
import {pencilArtistCreator,pencilArtistFixture} from './pencil-artist-fixture';
import {CreatorGroupPostPage} from "../../features/groups/ui/creator-group-post-page";
import {FanPostDetail} from "../../features/fan-posts/ui/fan-post-detail";
import {FanAppFrame,FanContentContainer} from "../../components/fan-shell/fan-app-shell";
import {GroupAdminOverview} from "../../components/admin/group-admin-overview";
import {fixtureRoute} from './route';
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
import { GroupMissionScreen, GroupMissionsOverview } from "../../features/groups/ui/group-mission-screen";
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
const {query,view,pageId,postId,creatorSlug}=fixtureRoute(location.pathname,location.search), locale = parseAppLocale(query.get("locale")), state = query.get("state");
if(location.pathname==='/celebrities'&&query.get('groups')!=='off')history.replaceState(null,'',`/pages/groups?${query}`);
document.documentElement.lang=locale;
const groupsEnabled=query.get("groups")!=="off";
const pencilArtist=(query.get('calendarService')==='1'&&query.get('kind')==='fan')||(['creator','creator-post','mission','collections','members','video'].includes(view??''))&&(location.pathname==='/'||creatorSlug==='nchive');
const reviewCreator=pencilArtist?pencilArtistCreator:legacyVisualCreator;
if(!pencilArtist&&(view==='creator'||view==='my'||view==='social')){const path=view==='creator'?'/elina':view==='social'?'/my/friends':'/my';history.replaceState(null,'',`${path}${location.search}`);}
const id = pageId??"e9200000-0000-4000-8000-000000000001", now="2026-11-01T12:00:00Z";
const names=["엔카이브 팬페이지","엘리나 팬페이지","한강 러닝 크루","RUN&MUSIC FESTIVAL","사진 산책 모임","주말 독서 모임","인디 음악 모임","공연 기록 모임","아침 걷기 모임","주말 자전거 모임","영화 이야기 모임","카페 탐방 모임","전시 함께 보기","밤 산책 모임","책과 음악 모임","공연 함께 보기","주말 사진 모임","러닝 기록 모임","음악 감상 모임","함께 걷는 사람들"];
const descriptions=['공식 영상과 LIVE 소식','음악·일상 소식과 응원 글','같이 달리고 러닝 기록을 나눠요.','러닝·음악 행사 모임','일상의 순간을 사진으로 나눠요.','함께 읽고 감상을 나눠요.','좋아하는 음악과 공연 소식','다녀온 공연의 순간을 나눠요.','새 앨범과 공연 소식을 나눠요.','출연 소식과 작품 이야기를 나눠요.','무대 영상과 응원 글을 모아요.','영상과 일상 소식을 함께 봐요.','방송 소식과 응원 글을 나눠요.','공연 일정과 음악 이야기를 나눠요.'];
const counts=[1280,356,84,2450,128,96,214,173,87,154,203,142,118,92,137,185,116,108,164,103];
const items=names.map((name,i)=>({id:`e9200000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,kind:i<2?'fan':i===3?'brand':'hobby',celebrityId:null,slug:null,name:state==='long'&&i===7?'긴 이름의 모임에서도 줄바꿈과 카드 정렬을 확인하는 페이지':name,description:state==='long'&&i===7?'아주 긴 소개가 이어져도 마지막 행동과 카드 외곽이 같은 행에서 정렬되어야 합니다.':descriptions[i]??'',imageUrl:i===0?'/images/groups/nchive-pencil.jpg':i===1?'/images/groups/elina-pencil.jpg':i===2?'/images/groups/running-event.png':i===3?'/images/groups/runmusic-pencil.jpg':`/images/groups/source-hobby-${i-4}.svg`,question:null,anonymous:false,memberCount:counts[i]??3}));
let settingsNickname='별빛';
let fixtureJoined=state!=='invite',presenceEnabled=state==='presence-off'?false:sessionStorage.getItem('pencil-presence-enabled')!=='false';
const raffleReceipts=new Map<string,{id:string;amount:number;enteredTickets:number;tickets:number}>();let localEnteredTickets=30;
const receipts=new Map<string,unknown>();let points=240,hearts=2,tickets=state==='zero-tickets'?0:12,checkedIn=false;
const json=(value:unknown,status=200)=>Promise.resolve(Response.json(value,{status})),realFetch=window.fetch.bind(window);
const groupInvitationFixture=createGroupInvitationFixture({authenticated:query.get('auth')!=='off',failOnce:query.get('state')==='invite-save-failure'});
window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
 if(!url.pathname.startsWith('/api/'))return realFetch(input,init);
 const path=url.pathname,body=init?.body?JSON.parse(String(init.body)):null;
 if(path==='/api/groups/my/reports')return state==='error'?json({error:{code:'UNAVAILABLE'}},503):json({items:state==='empty'?[]:[{id:'e9900000-0000-4000-8000-000000000001',reason:'반복 광고',status:'submitted',resolution:null,createdAt:'2026-11-03T10:00:00Z',targetPath:`/pages/groups/${id}?tab=board&post=${id}`},{id:'e9900000-0000-4000-8000-000000000002',reason:'반복 광고',status:'resolved',resolution:'반복 광고 게시글을 확인해 조치했습니다.',createdAt:'2026-11-02T10:00:00Z',targetPath:null}],nextCursor:null});
 if(query.get('calendarService')==='1'){const calendar=serviceCalendarFixture(url);if(calendar)return calendar;}
 const invitationResponse=groupInvitationFixture(path,init?.method??'GET',body);if(invitationResponse)return invitationResponse;
 const referral=groupReferralFixture(path,init?.method??'GET',body,state);if(referral)return referral;
 if(state==='error' && (path.startsWith('/api/groups')||path.startsWith('/api/me/wallet')))return json({error:{code:'UNAVAILABLE'}},503);
 const gift=giftFixture(path,init?.method??'GET',body,state,id);if(gift)return gift;
 const utility=utilityFixture(path,locale);if(utility)return utility;
 if(path==='/api/me/activity')return json({items:[],nextCursor:null});
 if(path==='/api/benefits')return json({benefits:[]});
 const sourceAsset=path.match(/^\/api\/content-assets\/e9510000-0000-4000-8000-00000000000([123])$/);if(sourceAsset)return realFetch(['/images/groups/nchive-group.webp','/images/groups/source-community/51f39b3be29d92d4.jpg','/images/groups/source-community/3a5070751a8156c0.jpg'][Number(sourceAsset[1])-1]!);
 if(path.startsWith('/api/groups/media/'))return realFetch('/images/avatars/star-pink.webp');
 if(path==='/api/groups/me/presence'){if(init?.method==='PUT'&&query.get('role')!=='member'){presenceEnabled=body.enabled;sessionStorage.setItem('pencil-presence-enabled',String(presenceEnabled));}return json({enabled:presenceEnabled,canConfigure:query.get('role')!=='member'});}
 if(path==='/api/me/settings'){if(body?.nickname)settingsNickname=body.nickname;return json({settings:{nickname:settingsNickname,preferredLocale:locale==='ko'?'ko':'en',wallet:null}});}
 if(path==='/api/notifications/preferences')return json({preferences:{liveReminders:true,surveyReminders:true,benefitNotifications:true,replyNotifications:true,officialPostNotifications:true,scheduleNotifications:true,browserSubscription:'unsubscribed',...body}});
 if(path==='/api/me/notification-channels')return json({connections:{accounts:[],channels:[]}});
 if(path==='/api/me/avatar')return json({avatar:{initialCharacterId:'star-pink',characterId:'star-pink',source:'character',hasImage:false,revision:0}});
 if(view==='raffle'&&path===`/api/groups/${id}/raffles/${id}/entries`&&init?.method==='POST'){
  const parsed=pendingEntrySchema.safeParse(body);if(!parsed.success)return json({error:{code:'GROUP_RAFFLE_INVALID'}},400);
  const previous=raffleReceipts.get(parsed.data.requestId);if(previous)return previous.amount===parsed.data.amount?json(previous):json({error:{code:'GROUP_RAFFLE_CONFLICT'}},409);
  if(parsed.data.amount>tickets||localEnteredTickets+parsed.data.amount>100)return json({error:{code:'GROUP_RAFFLE_LIMIT'}},409);
  tickets-=parsed.data.amount;localEnteredTickets+=parsed.data.amount;const receipt={id:crypto.randomUUID(),amount:parsed.data.amount,enteredTickets:localEnteredTickets,tickets};raffleReceipts.set(parsed.data.requestId,receipt);return json(receipt);
 }
 if(pencilArtist||view==='capsules'||view==='raffle'||path==='/api/celebrities/nchive/posts'||path.startsWith('/api/posts/')){const artist=await pencilArtistFixture(url,init?.method??'GET',locale,view==='capsules'||view==='raffle'||view==='members'||view==='video'?'creator':pencilArtist?view:null,body);if(artist){if((view==='members'||view==='video'||query.get('tab')==='calendar')&&path==='/api/groups/resolve/nchive'){const detail=await artist.json();detail.page.memberCount=1280;return json(detail);}return artist;}}
 const contentState=contentFixture(url,init?.method??'GET',body,state,query.get('kind')==='brand',view==='creator');if(contentState)return contentState;
 const applicationState=applicationFixture(path,init?.method??'GET',body,state);if(applicationState)return applicationState;
 const people=membersFixture(url,state,view==='members');if(people!==undefined)return json(people);
 const legacy=legacyVisualFixture(url,init?.method??'GET',locale,['passport','passports','calendar','history','benefits','celebrities'].includes(view??'')?'my':view,body);if(legacy){if(view==='benefits'&&path==='/api/me/wallet'){const wallet=await legacy.json();return json({...wallet,points:2450});}return legacy;}
 const claim=raffleClaimFixture(url,init?.method??'GET',body,state);if(claim)return claim;
 if(query.get('confirmApplication')==='1'){const application=eventApplicationFixture(path,init?.method??'GET',body,id,state);if(application!==undefined)return application instanceof Response?application:json(application);}
 const evidence=activityEvidenceFixture(path,init?.method??'GET',body,query.get('activityMode'),state,id,locale);if(evidence!==undefined)return evidence instanceof Response?evidence:json(evidence);
 const activity=activityFixture(path,init?.method??'GET',state,query.get('kind')==='brand',id);if(activity!==undefined)return json(view==='raffle'&&'enteredTickets' in activity?{...activity,enteredTickets:localEnteredTickets}:activity);
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
  tickets-=body.count;const result={requestKey:body.requestKey,campaignId:id,count:body.count,tickets,results:Array.from({length:body.count},(_,i)=>({index:i+1,prizeId:state!=='blank'&&[1,7].includes(i)?id:null,name:state!=='blank'&&[1,7].includes(i)?'굿즈 당첨':null,imageUrl:state!=='blank'&&[1,7].includes(i)?'/images/groups/nchive-goods-concept.png':null}))};
  receipts.set(body.requestKey,result);if(state==='uncertain')throw new TypeError('Fixture response lost');return json(result);
 }
 if(path.startsWith('/api/me/wallet/capsule-requests/')){const result=receipts.get(path.split('/').at(-1)!);return result?json(result):json({error:{code:'CAPSULE_NOT_FOUND'}},404);}
 if(path==='/api/groups/capsules')return json({items:state==='empty'?[]:[{id,name:'주말 캡슐',status:'active',blankWeight:500000,weightTotal:1000000,prizes:[{id,name:'엔카이브 굿즈',imageUrl:'/images/groups/nchive-goods-concept.png',weight:500000,stock:30}]}]});
 if(path==='/api/admin/group-capsules')return json({items:state==='empty'?[]:[{id,name:'주말 캡슐',status:'draft',blankWeight:500000,prizes:[{id,name:'팬 굿즈',weight:500000,stock:30}]}]});
 if(path==='/api/groups'){const filtered=state==='empty'?[]:(url.searchParams.get('mine')==='joined'?items.slice(0,4):items).filter(p=>!url.searchParams.get('type')||url.searchParams.get('type')==='all'||p.kind===url.searchParams.get('type')).filter(p=>p.name.includes(url.searchParams.get('search')??'')).filter(p=>!url.searchParams.get('artistRole')||['idol','creator','singer','actor','singer','creator','creator','singer'][[0,1,8,9,10,11,12,13].indexOf(items.indexOf(p))]===url.searchParams.get('artistRole')).sort((a,b)=>url.searchParams.get('sort')==='popular'?b.memberCount-a.memberCount:0),limit=Math.max(1,Math.min(50,Number(url.searchParams.get('limit'))||8)),start=url.searchParams.get('cursor')?filtered.findIndex(p=>p.id===url.searchParams.get('cursor'))+1:0,shown=filtered.slice(start,start+limit);return json({items:shown,totalCount:filtered.length,nextCursor:start+limit<filtered.length?shown.at(-1)?.id??null:null});}
 if(path===`/api/groups/${id}`&&state==='invite-invalid')return json({error:{code:'GROUP_NOT_FOUND'}},404);
 if(path===`/api/groups/${id}/membership`&&init?.method==='POST'){fixtureJoined=true;return json({joined:true});}
 if(path===`/api/groups/${id}`&&view==='raffle')return json({page:{...items[0],id,slug:'groups-pencil-dev-1',celebrityId:id},membership:{role:'member',joinedAt:now},bookmarked:false});
 if(path===`/api/groups/${id}`)return json({page:{...(items.find(item=>pageId&&item.id===pageId)??items[query.get('kind')==='brand'?3:query.get('kind')==='fan'?1:2]),id,kind:query.get('kind')==='brand'?'brand':query.get('kind')==='fan'?'fan':'hobby',slug:query.get('kind')==='fan'?'elina':null,celebrityId:query.get('kind')==='fan'?id:null},membership:query.get('auth')==='off'||!fixtureJoined?null:{role:query.get('role')??(state==='invite'?'member':'owner'),joinedAt:now},bookmarked:false});
 if(path.endsWith('/posts'))return json({items:state==='empty'?[]:Array.from({length:8},(_,i)=>({id:`e9300000-0000-4000-8000-00000000000${i+1}`,pageId:id,title:`함께하는 이야기 ${i+1}`,body:'이번 주말 함께 활동해요.',visibility:'public',anonymous:false,profileId:id,nickname:'별빛',avatarUrl:null,createdAt:now})),nextCursor:null});

 if(path.endsWith('/rooms'))return json({items:[{id,name:'주말 러닝',minimumTier:null,status:'open',canEnter:true}]});
 if(path.endsWith('/messages'))return json({items:[{id,body:'이번 주말 아침에 만나요.',profileId:id,nickname:'별빛',createdAt:now}]});
 if(path==='/api/me/wallet')return json({sequence:1,points:view==='benefits'?2450:points,hearts,tickets,policyVersion:'group-wallet-v1',pointCost:100,writeFenced:false,attendance:{date:'2026-11-07',checkedIn,streak:checkedIn?7:6,nextBonusIn:checkedIn?7:1,days:Array.from({length:checkedIn?7:6},(_,i)=>({date:`2026-11-0${i+1}`,points:i===6?30:10}))}});
 if(path==='/api/me/wallet/history')return json({entries:state==='empty'?[]:[{id,asset:'fan_point',amount:10,sourceType:'group_check_in',sourceId:id,celebrityId:null,createdAt:now}]});
 if(path.startsWith('/api/me/wallet/requests/'))return json(receipts.has(path.split('/').at(-1)!)?{status:'committed',result:receipts.get(path.split('/').at(-1)!)}:{status:'unknown'});
 if(path==='/api/me/wallet/exchange') {points-=body.units*100;if(body.target==='heart')hearts+=body.units;else tickets+=body.units;const result={...body,pointsSpent:body.units*100,pointLedgerId:id,creditLedgerId:id,createdAt:now,replayed:false};receipts.set(body.requestKey,result);return json(result);}
 if(path==='/api/me/wallet/support'){hearts-=body.units;const result={requestKey:body.requestKey,celebrityId:id,units:body.units,voucherLedgerId:id,policyVersion:'group-wallet-v1',createdAt:now,replayed:false};receipts.set(body.requestKey,result);return json(result);}
 if(path==='/api/me/wallet/check-in'){checkedIn=true;points+=30;const result={requestKey:body.requestKey,date:'2026-11-01',pointsAwarded:30,streak:7,ledgerId:id,replayed:false};receipts.set(body.requestKey,result);return json(result);}
 if(path==='/api/groups/applications')return json(init?.method==='POST'?{id,status:'submitted',pageId:null}:{items:[],nextCursor:null});
 return json({items:[],count:0,unreadCount:0});
}) as typeof fetch;
const fixtureFetch=window.fetch;
let sourceProjectionState=state??query.get('apiState');
window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin),method=init?.method??(input instanceof Request?input.method:'GET');
 const fail=sourceStateFailure(url,method,sourceProjectionState)??sourceContentStateFailure(url,method,state);if(fail)return fail;
 if(typeof init?.body==='string'){try{const body=JSON.parse(init.body);if(typeof body.amount==='number')url.searchParams.set('fixtureAmount',String(body.amount));}catch{}}
 const calendarResponse=calendarPreviewFixture(url,method,typeof init?.body==='string'?JSON.parse(init.body):{},location.pathname==='/live/calendar'?'all':query.get('kind')==='brand'?'brand':view==='detail'?'hobby':'fan');if(calendarResponse)return calendarResponse;
 let response=await fixtureFetch(input,init);if(view==='manage'&&query.get('section')==='events'&&url.pathname===`/api/groups/${id}`){const detail=await response.json();response=Response.json({...detail,page:{...detail.page,name:'한강 러닝 크루',imageUrl:'/images/pencil-source/event-group.png'}});}if(view==='raffle'&&url.pathname==='/api/me/wallet'){const wallet=await response.json();response=Response.json({...wallet,tickets});}const projected=await sourceStateResponse(response,url,method,sourceProjectionState);
 if(sourceStateResolved(response,url,method,sourceProjectionState))sourceProjectionState=null;
 return sourceContentStateResponse(projected,url,method,state);
}) as typeof fetch;

function LocalProfilePreview(){
 const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[requested,setRequested]=useState(false),[requestId]=useState(()=>crypto.randomUUID());
 useEffect(()=>{const restore=(event:PopStateEvent)=>setRequested(Boolean(event.state?.pencilFriendRequest));window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[]);
 const request=async()=>{if(busy)return;setBusy(true);setFailed(false);try{const response=await fetch('/api/me/social/friends',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profileId:'e9200000-0000-4000-8000-000000000002',requestId})});if(!response.ok)throw Error();history.pushState({...history.state,pencilFriendRequest:true},'',`/my/friends?locale=${locale}&state=outgoing`);setRequested(true);setBusy(false);}catch{setFailed(true);setBusy(false);}};
 if(requested)return <GroupSocialScreen locale={locale} friendFilter='outgoing'/>;
 return <><ProfileConnectionPanel locale={locale} initialView={query.get('profileView')==='scan'?'scan':query.get('profileView')==='peer'?'peer':'profile'} identity={<><img src='/images/avatars/star-pink.webp' width={48} height={48} alt=''/><span>별빛</span></>} requestPending={busy} onRequestFriend={()=>void request()} peerIdentity={<><img src='/images/avatars/star-pink.webp' alt=''/><span>하늘</span><p>공개한 최애 · 엔카이브</p>{failed&&<p role='alert'>요청을 보내지 못했어요.</p>}</>} onClose={()=>location.assign('/nchive?tab=board')}/></>;
}

const sourceBoardEvent={title:'엔카이브 굿즈 추첨',image:'/images/groups/nchive-goods-concept.png',href:'/?view=raffle',exchangeHref:'/my/wallet?section=ticket'};
function CreatorPreview(){
 const [composer,setComposer]=useState<'Urthu'|'wCL5S'|null>(state==='Urthu'||state==='wCL5S'?state:query.get('composer')==='Urthu'?'Urthu':query.get('composer')==='wCL5S'?'wCL5S':null);
 const closeComposer=()=>{setComposer(null);const url=new URL(location.href);url.searchParams.delete('state');history.replaceState(history.state,'',url);};
 const [video,setVideo]=useState<CreatorMediaSelection|null>(history.state?.pencilVideo??(view==='video'?{id:'pencil-practice',kind:'videos',title:'엔카이브 (NCHIVE) - Racer Practice Video',image:'/images/groups/i591ou/practice.jpg',href:'https://www.youtube.com/watch?v=llP16jxxEsU',date:now,source:'YouTube'}:null));
 useEffect(()=>{const restore=(event:PopStateEvent)=>setVideo(event.state?.pencilVideo??null);window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[]);
 if(composer)return <PencilComposerPreview locale={locale} celebrity={reviewCreator(locale)} nodeId={composer} onClose={closeComposer}/>;
 return video?<><GroupShell locale={locale}><CreatorGroupHeader celebrity={pencilArtistCreator(locale)} locale={locale} tab='home'/><PencilVideoPreview locale={locale} media={video} backHref={`/nchive?locale=${locale}`} creatorName='NCHIVE'/></GroupShell><FanSiteFooter locale={locale}/></>:<CelebrityFanPage homeSchedule={{label:'11.07 19:00 · 팬 LIVE',note:'KST · 시안용 예시'}} boardEvent={sourceBoardEvent} onVideoSelect={media=>{setVideo(media);history.pushState({pencilVideo:media},'',`/nchive?view=video&locale=${locale}`);window.scrollTo(0,0);}} celebrity={reviewCreator(locale)} locale={locale} groupsEnabled={groupsEnabled} upcomingLive={null} initialBoardSource={query.get('source')==='official'?'official':query.get('source')==='fans'?'fans':'all'} initialNewsFilter={query.get('news')==='notice'?'notice':'all'} initialTab={parseFanPageTab(query.get('tab'))} initialBoardSection={resolveBoardSection(query.get('tab'),query.get('section'))}/>;
}
function SourceStateOverlay(){
 const [open,setOpen]=useState(true),ref=useRef<HTMLDialogElement>(null);
 const node=(state??'').replace(/^source-/,''),community=Object.hasOwn(SOURCE_COMMUNITY_PANELS,node),flow=Object.hasOwn(SOURCE_FLOW_PANELS,node)||community,result=Object.hasOwn(SOURCE_RESULT_PANELS,node);
 useEffect(()=>{if(open&&flow)ref.current?.showModal();return()=>ref.current?.close();},[open,flow]);
 const retry=()=>{const url=new URL(location.href);url.searchParams.delete('state');location.assign(url);};
 if(!open)return null;
 if(Object.hasOwn(SOURCE_CONFIRM_PANELS,node))return <SourceConfirmPanel nodeId={node} onClose={()=>setOpen(false)}/>;
 if(Object.hasOwn(SOURCE_ACTIVITY_PANELS,node))return <SourceActivityPanels nodeId={node as keyof typeof SOURCE_ACTIVITY_PANELS} onClose={()=>setOpen(false)} onRetry={retry}/>;
 if(Object.hasOwn(SOURCE_SECONDARY_PANELS,node))return <SourceSecondaryPanel nodeId={node as keyof typeof SOURCE_SECONDARY_PANELS} onClose={()=>setOpen(false)} onRetry={retry}/>;
 if(result)return <SourceResultPanel nodeId={node as keyof typeof SOURCE_RESULT_PANELS} onClose={()=>setOpen(false)} onRetry={retry}/>;
 if(community)return <dialog ref={ref} aria-labelledby={`source-community-title-${node}`} style={{padding:0,border:0,borderRadius:0,background:'transparent',width:node==='KJKkH'?800:640,maxWidth:'calc(100vw - 32px)',maxHeight:'calc(100dvh - 32px)',overflow:'auto'}} onCancel={e=>{e.preventDefault();setOpen(false);}}><SourceCommunityPanel nodeId={node} onClose={()=>setOpen(false)} onRetry={retry}/></dialog>;
 if(flow)return <dialog ref={ref} aria-labelledby={`source-flow-title-${node}`} style={{padding:0,border:0,borderRadius:20,width:640,maxWidth:'calc(100vw - 32px)',maxHeight:'calc(100dvh - 32px)',overflow:'auto'}} onCancel={e=>{e.preventDefault();setOpen(false);}}><SourceFlowPanel nodeId={node} onClose={()=>setOpen(false)} onRetry={retry}/></dialog>;
 return null;
}
const utilityCalendar={month:'2026-11',timeZone:'Asia/Seoul' as const,days:Array.from({length:30},(_,i)=>({date:`2026-11-${String(i+1).padStart(2,'0')}`,events:[]}))};
const content=query.get('calendarService')==='1'?(query.get('kind')==='fan'?<GroupShell locale={locale}><CreatorGroupHeader celebrity={pencilArtistCreator(locale)} locale={locale} tab='calendar'/><CreatorGroupCalendar slug='nchive' locale={locale} month={query.get('month')??undefined}/></GroupShell>:<GroupDetailScreen locale={locale} pageId={id} tab='calendar' calendarMonth={query.get('month')??undefined}/>):view==='own-reports'?<GroupOwnReports locale={locale}/>:view==='event-support-live'?<GroupEventSupportScreen pageId={id} eventId={id} locale={locale} history={query.get('history')==='1'}/>:view==='membership-invitation'?<GroupMembershipInvitationScreen locale={locale} invitationId={query.get('invitationId')!}/>:view==='referral'?<GroupReferralScreen locale={locale} initialInvite={query.get('invite')==='1'} code={query.get('code')??undefined} destination={query.get('destination')??undefined}/>:view==='calendar-live'?<PencilCalendarDetail locale={locale} kind='live' liveSlug={location.pathname.split('/').at(-1)}/>:view==='calendar-schedule'?<PencilCalendarDetail locale={locale} kind='schedule' scheduleId={location.pathname.split('/').at(-1)}/>:query.get('tab')==='calendar'?<PencilCalendarPreview locale={locale} month={query.get('month')??'2026-11'} kind={view==='detail'?(query.get('kind')==='brand'?'brand':'hobby'):'fan'} header={view==='detail'?undefined:<CreatorGroupHeader celebrity={pencilArtistCreator(locale)} locale={locale} tab='calendar'/>}/>:query.get('screen')?<PencilDetailPreview locale={locale} screen={query.get('screen')!}/>:view==='members'?<PencilMembersPreview locale={locale} pageId={id}/>:view==='passport'?<PassportDetailScreen id={query.get('passportId')!} explorerBaseUrl='https://sepolia-explorer.giwa.io'/>:view==='passports'?<PassportCollectionScreen/>:view==='history'?<FanHistoryScreen locale={locale} kind={historyKindSchema.catch('applications').parse(query.get('kind'))}/>:view==='calendar'?<PencilCalendarPreview locale={locale} month={query.get('month')??'2026-11'} kind='all' bodyOnly={state==='X5WprW'}/>:view==='benefits'?<PencilBenefitsPreview locale={locale} nodeId={PENCIL_BENEFITS_IDS.includes(state as PencilBenefitsNodeId)?state as PencilBenefitsNodeId:undefined}/>:view==='celebrities'?<CelebrityDirectory celebrities={feedbackPublishedCreators(locale).map(creator=>({...creator,upcomingLive:null}))} locale={locale}/>:view==='settings'?parseSettingsSection(query.get('section'))?<SettingsScreen locale={locale} initialSection={parseSettingsSection(query.get('section'))}/>:<FanAppFrame locale={locale} groupsEnabled><GroupSettingsMenu locale={locale}/></FanAppFrame>:view==='notifications'?<FanAppFrame locale={locale} groupsEnabled><FanContentContainer as='main' style={{paddingTop:40,paddingBottom:80}}><GroupNotificationPanel locale={locale} rows={[{id:'comment',label:'새 댓글',actionLabel:'게시글 보기',href:'/c/nchive/community/e9800000-0000-4000-8000-000000000001'},{id:'report',label:'신고 처리 결과',actionLabel:'결과 보기',href:'/?view=manage&section=reports'},{id:'certification',label:'인증 처리 결과',actionLabel:'내 인증 내역',href:'/?view=mission&state=VTA0g'},{id:'raffle',label:'추첨 결과',actionLabel:'결과 보기',href:'/?view=raffle&state=cWqGx'},{id:'receipt',label:'수령 결과',actionLabel:'수령 내역',href:'/?view=raffle&state=cWqGx'}]}/></FanContentContainer></FanAppFrame>:view==='presence'?<ArtistPresenceSettings locale={locale} previewName='엔카이브'/>:view==='profile'?<LocalProfilePreview/>:view==='creator-post'?<CreatorGroupPostPage boardPreview={locale==='ko'&&postId==='e9800000-0000-4000-8000-000000000001'?pencilPostPreview():undefined} boardEvent={sourceBoardEvent} celebrity={reviewCreator(locale)} postId={postId!} locale={locale}/>:(view==='creator'||view==='video')?<CreatorPreview/>:view==='my'?<MyScreen locale={locale}/>:view==='social'?<GroupSocialScreen localMediaPreview={{messages:query.get('conversationId')==='e9200000-0000-4000-8000-000000000003'?[]:[{id:'source-photo',kind:'image',src:'/images/groups/nchive-group.webp',label:'사진 · 오후 3:24'},{id:'source-video',kind:'video',label:'동영상 · 오후 3:25',isMine:true}],...(state==='attachment'?{attachment:{id:'pending-source',kind:'image',src:'/images/groups/nchive-group.webp',label:query.get('conversationId')==='e9200000-0000-4000-8000-000000000003'?'photo.jpg':'사진'}}:{})}} locale={locale} friendFilter={state==='incoming'?'incoming':state==='outgoing'?'outgoing':'friends'} profileId={query.get('profileId')??undefined} conversationId={query.get('conversationId')??undefined}/>:view==='gift'?<GroupGiftScreen pageId={id} locale={locale} applicationId={query.get('applicationId')??undefined} history={query.get('viewMode')==='history'}/>:view==='manage'?<GroupManageScreen raffleCreate={<CreateGroupRaffle pageId={id} locale={locale} sourcePresentation/>} eventOperations={<PencilEventOperations/>} localPresentation={{reports:{[id]:{title:'반복 광고 게시글 신고',target:'게시글 · 반복 광고'},'e9200000-0000-4000-8000-000000000002':{title:'댓글 신고',target:'댓글'}},posts:[{id:'source-notice',title:'처음 오셨다면 여기부터 확인해요',category:'notice'},{id:'source-free',title:'오늘 무대의 가장 좋았던 순간',category:'free'}],boards:[{id:'free',name:'자유게시판',description:'회원 작성 · 공개 읽기',anonymous:false},{id:'anonymous',name:'익명게시판',description:'회원 작성 · 익명',anonymous:true}]}} pageId={id} locale={locale} initialGiftId={query.get('giftApplicationId')??undefined} initialSection={query.get('section')??undefined}/>:view==='artists-admin'?<GroupArtistManager locale={locale==='ko'?'ko':'en'}/>:['reports','official-events','missions','event-support','event-support-live'].includes(view??'')?<GroupOperationsManager reportPresentation={{[id]:{title:'게시글 신고',pageName:'엔카이브 팬페이지',allowLocalAuthorRestriction:true}}} locale={locale==='ko'?'ko':'en'} view={view as 'reports'|'official-events'|'missions'|'event-support'}/>:view==='event'?<GroupEventScreen pageId={id} eventId={id} locale={locale}/>:view==='mission'?<PencilDetailPreview locale={locale} screen='M01'/>:view==='mission-legacy'?<GroupMissionsOverview pageId={id} locale={locale} creatorName='엔카이브' header={<CreatorGroupHeader celebrity={pencilArtistCreator(locale)} locale={locale} tab='activities'/>} missionLabels={{[id]:{category:'사진 인증',action:'인증하기'},'e9400000-0000-4000-8000-000000000002':{category:'설문',action:'설문 참여하기'},'e9400000-0000-4000-8000-000000000003':{category:'현장 참여',action:'행사 미션 보기'}}}/>:view==='mission-detail'?<GroupMissionScreen pageId={id} missionId={query.get('missionId')??(query.get('mission')==='survey'?'e9400000-0000-4000-8000-000000000002':query.get('mission')==='qr'?'e9400000-0000-4000-8000-000000000003':id)} locale={locale}/>:view==='activities'?<GroupActivitiesPanel pageId={id} locale={locale}/>:view==='collections'?<GroupShell locale={locale}><CreatorGroupHeader celebrity={pencilArtistCreator(locale)} locale={locale} tab='activities'/><GroupCollections pageId={id} locale={locale} heading='엔카이브의 컬렉션' description='브랜드 상품과 굿즈' productHeading='포토카드·키링 컬렉션' sellerLabel='판매처 · 외부 브랜드 스토어' initialItemId='e9500000-0000-4000-8000-000000000002' categories={[{id:'all',label:'전체',itemIds:[id,'e9500000-0000-4000-8000-000000000002']},{id:'daily',label:'일상',itemIds:[id]},{id:'collection',label:'컬렉션',itemIds:[id,'e9500000-0000-4000-8000-000000000002']}]}/></GroupShell>:view==='raffle'?<GroupRaffleScreen pageId={id} raffleId={id} locale={locale} localPresentation={{header:null,totalEntries:300,aside:<CreatorBoardAside slug='nchive' locale={locale} event={sourceBoardEvent}/>}}/>:view==='capsules'?<CapsuleScreen locale={locale} pageId={query.get('pageId')??undefined} localPresentation={{header:null,aside:<CreatorBoardAside slug='nchive' locale={locale} event={sourceBoardEvent}/>,creatorName:'엔카이브',historyHref:'/?view=capsules&state=es3y5',claimHref:'/?view=raffle&state=cWqGx'}}/>:view==='wallet'?<WalletScreen localPresentation={query.get('serviceState')==='1'?undefined:{benefitsHref:'/benefits',historyRows:[{label:'출석체크 · 오늘',value:'포인트 적립'},{label:'응모권 교환 · 어제',value:'포인트 사용 / 응모권 받음'},{label:'추첨 취소 · 10.29',value:'응모권 반환'}]}} localProfile={{nickname:'스타벅스라이프',avatarUrl:'/images/avatars/star-pink.webp'}} locale={locale} attendance={query.get('section')==='attendance'} supportCreator={query.get('section')==='support'?query.get('creator')??'elina':undefined}/>:view==='admin-overview'?<GroupAdminOverview locale={locale==='ko'?'ko':'en'}/>:view==='admin'?<GroupApplicationManager presentation={{'f1710000-0000-4000-8000-000000000001':{creatorName:'엔카이브',materialsLabel:'제출한 링크·자료 확인',materialsHref:'/images/groups/nchive-group.webp',relationship:'신청자와 아티스트 관계 확인'}}} locale={locale==='ko'?'ko':'en'}/>:view==='capsule-admin'?<GroupCapsuleManager locale={locale==='ko'?'ko':'en'}/>:view==='apply'&&query.get('qualification')==='1'?<GroupQualificationScreen locale={locale}/>:view==='apply'?<GroupApplication locale={locale} initialKind={query.get('kind')==='fan'?'fan':query.get('kind')==='brand'?'brand':'hobby'}/>:view==='detail'?<GroupDetailScreen boardHeading={locale==='ko'?'크루 이야기':undefined} introHeading={query.get('kind')==='brand'?undefined:'함께 달리고, 기록해요'} locale={locale} pageId={id} tab={query.get('tab')??'home'} initialReturnTo={query.get('returnTo')??undefined} initialRoomId={query.get('room')??undefined} initialPostId={query.get('post')??undefined} initialBoardState={{category:query.get('category')??'all',search:query.get('search')??'',sort:query.get('sort')??'recent',cursor:query.get('cursor')??undefined}}/>:<GroupDirectory locale={locale}/>;
createRoot(document.getElementById('root')!).render(<GroupsReleaseProvider enabled={groupsEnabled}><LocaleProvider initialLocale={locale}>{content}<SourceStateOverlay/>{(state==='fMkHm'||state==='Vgw4h')&&<SourceWalletState nodeId={state} onClose={()=>location.assign('/my/wallet')}/>}{!(view==='apply'&&query.get('qualification')==='1')&&!['own-reports','gift','referral','passport','passports','history','calendar','calendar-live','calendar-schedule','benefits','celebrities','settings','notifications','video','presence','profile','creator-post','creator','my','social','manage','wallet','admin-overview','admin','capsule-admin','capsules','reports','official-events','missions','artists-admin','event-support','event-support-live'].includes(view??'')&&<FanSiteFooter locale={locale}/>}</LocaleProvider></GroupsReleaseProvider>);

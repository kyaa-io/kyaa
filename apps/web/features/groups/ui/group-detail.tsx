"use client";
import {FanRouteLoading} from "@/components/fan-ui/fan-route-loading";
import {GroupRoomList} from "./group-room-list";
import {managementCopy} from "./management-copy";
import {WalletAttendanceDialog} from "@/features/group-wallet/ui/wallet-screen";
import {CreatorGroupHeader} from "./creator-group-header";
import {useLinkedFanpage} from "./use-linked-fanpage";
import {LinkedFanpageContent} from "./linked-fanpage-content";
import { GroupCalendarPanel } from "./group-calendar";
import { GroupImage } from "./group-image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {FanTabNav} from "./fan-tab-nav";
import Link from "next/link";
import type { Route } from "next";
import { Footprints, UsersRound, ArrowRight, LockKeyhole, BookOpen, Plus,  ArrowLeft, UserRound, BadgeCheck, MessagesSquare } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
import { groupDetailSchema, groupRoomsSchema, groupMessagesSchema } from "../domain/contracts";
import { GroupRequestError, useGroupRequest, useGroupResource } from "./use-group-resource";
import { GroupMembers } from "./group-members";
import { GroupPresence } from "./group-presence";
import { GroupActivitiesPanel, GroupEventsList, GroupCollections } from "./group-activities";
import { GroupBoard, type BoardLocation } from "./group-board";
import { roomEntryCopy, roomListCopy, roomMessageLabel, roomContextCopy } from "./room-entry-copy";
import { roomStatusCopy } from "./room-status-copy";
import { interactionCopy } from "./interaction-copy";
import { GroupPageMenu,useCompactHeader } from "./group-page-menu";
import { GroupManagement } from "./group-management";
import { sendLabel } from "./management-copy";
import { groupsCopy,pageUnavailable } from "./copy";
import { groupCalendarLabel } from "./group-calendar-label";
import { GroupIdentityHeader, GroupShell } from "./group-shell";
import { GroupHomeInfo,GroupBrandHomeEvent } from "./group-home-panels";
import { GroupRaffleList } from "@/features/group-raffle/raffle-list";
import { membersAndRank, brandJoin } from "./home-copy";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import styles from "./groups.module.css";
import {SourceStatePanel} from "./source-state-panel";
import {activityCardCopy} from "./activity-card-copy";
import roomStyles from "./group-rooms.module.css";
import homeStyles from "./group-home-source.module.css";
const parseDetail=(x:unknown)=>groupDetailSchema.parse(x),parseRooms=(x:unknown)=>groupRoomsSchema.parse(x),parseMessages=(x:unknown)=>groupMessagesSchema.parse(x);
function RoomMessages({pageId,roomId,locale,readonly=false}:{pageId:string;roomId:string;locale:AppLocale;readonly?:boolean}) {
  const t=groupsCopy(locale),url=`/api/groups/${pageId}/rooms/${roomId}/messages`,auth=useGroupRequest(),{request,ready,ownerKey}=auth;
  const [snapshot,setSnapshot]=useState<{key:string;items:ReturnType<typeof parseMessages>["items"];participants?:ReturnType<typeof parseMessages>["participants"];canSend?:boolean;failed:boolean;restricted?:boolean}>(),[draft,setDraft]=useState(""),[pending,setPending]=useState(false),[sendFailed,setSendFailed]=useState(false),[version,setVersion]=useState(0),operation=useRef<{body:string;requestId:string}|undefined>(undefined);
  useEffect(()=>{
    if(!ready)return;let active=true,inFlight=false,cursor:string|undefined,items:ReturnType<typeof parseMessages>["items"]=[],participants:ReturnType<typeof parseMessages>["participants"] = [],canSend:boolean|undefined;
    const controller=new AbortController();
    async function load(){
      if(!active||inFlight||document.visibilityState==='hidden')return;inFlight=true;
      let more=false;
      try{const next=parseMessages(await request(`${url}?limit=50${cursor?`&after=${cursor}`:''}`,{signal:controller.signal}));if(!active)return;const map=new Map(items.map(x=>[x.id,x]));for(const item of next.items)map.set(item.id,item);items=[...map.values()];if(next.items.length)cursor=next.items.at(-1)?.id;participants=next.participants??participants;canSend=next.canSend;setSnapshot({key:ownerKey,items,participants,canSend,failed:false});more=next.items.length===50;}catch(error){if(active){const restricted=error instanceof GroupRequestError&&[401,403,404].includes(error.status);if(restricted){items=[];participants=[];canSend=false;}setSnapshot({key:ownerKey,items,participants:restricted?[]:participants,canSend:restricted?false:canSend,failed:true,restricted});}}finally{inFlight=false;}
      if(more&&active)void load();
    }
    void load();const timer=setInterval(()=>void load(),3000),visibility=()=>{if(document.visibilityState==='visible')void load();};document.addEventListener('visibilitychange',visibility);
    return()=>{active=false;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visibility);};
  },[ready,request,ownerKey,url,version]);
  const visible=snapshot?.key===ownerKey?snapshot:undefined,canSend=!visible?.restricted&&(visible?.canSend??!readonly);
  const send=async(e:FormEvent)=>{e.preventDefault();if(pending||!canSend||!draft.trim())return;const body=draft.trim();if(operation.current?.body!==body)operation.current={body,requestId:crypto.randomUUID()};setPending(true);try{await request(url,{method:'POST',body:JSON.stringify(operation.current)});setDraft('');setSendFailed(false);operation.current=undefined;setVersion(x=>x+1);}catch{setSendFailed(true);}finally{setPending(false);}};
  return <div className={roomStyles.roomConversationLayout}><section className={roomStyles.roomConversation}>
    <div className={roomStyles.roomMessages} role="log" aria-label={t.rooms} aria-live="polite" tabIndex={0}>
      {!visible&&<p role="status">{t.loading}</p>}{visible?.failed&&<p role="alert">{t.error}</p>}
      {visible&&!visible.failed&&!visible.items.length&&<p>{roomEntryCopy(locale).empty}</p>}
      {visible?.items.map(item=><div className={roomStyles.roomMessage} data-mine={item.mine||undefined} data-artist={item.artist||undefined} key={item.id}>
        {!item.mine&&(item.avatarUrl?<GroupImage locale={locale} src={item.avatarUrl} alt='' className={roomStyles.roomMessageAvatar} width={40} height={40}/>:<span className={roomStyles.roomMessageAvatar} aria-hidden='true'><UserRound size={22}/></span>)}
        <div className={roomStyles.roomMessageCopy}>{!item.mine&&<strong>{item.nickname}{item.artist&&<span className={roomStyles.roomArtist}><BadgeCheck size={16} aria-hidden='true'/>{roomContextCopy[locale][1]}</span>}</strong>}<p>{item.body}</p><time className={styles.meta} dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})}</time></div>
      </div>)}
    </div>
    {sendFailed&&<p className={styles.error} role="alert">{t.error}</p>}
    {!canSend?<SourceStatePanel sourceId={readonly?'aWY6S':undefined} title={roomStatusCopy(locale).readonly} role='status'/>:!visible?.restricted&&<form onSubmit={send} className={roomStyles.roomComposer}>
      <label className={styles.field}>{roomMessageLabel[locale]}<input className={styles.input} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={2000} disabled={pending} required/></label>
      <FanAction type="submit" variant="primary" disabled={pending||!draft.trim()}>{sendFailed?t.retry:sendLabel[locale]}</FanAction>
    </form>}
  </section>{Boolean(visible?.participants?.length)&&<aside className={roomStyles.roomParticipants}><h3><UsersRound size={20} aria-hidden='true'/>{roomContextCopy[locale][0]}</h3>{visible!.participants!.map(person=><Link href={`/my/friends?locale=${locale}&profileId=${person.profileId}` as Route} key={person.profileId} className={roomStyles.roomParticipant}>{person.avatarUrl?<GroupImage src={person.avatarUrl} locale={locale} alt='' width={40} height={40} className={roomStyles.roomMessageAvatar}/>:<UserRound aria-hidden='true'/>}<span><strong>{person.nickname}</strong>{person.tier&&<span className={styles.meta}>{person.tier} · {roomEntryCopy(locale).verified}</span>}</span><span className={roomStyles.roomProfileAction}>{locale==='ko'?'프로필 보기':t.info}</span></Link>)}</aside>}</div>;
}
export function GroupRoomsPanel({pageId,locale,slug,imageUrl,initialRoomId}:{pageId:string;locale:AppLocale;slug?:string|null;imageUrl?:string|null;initialRoomId?:string}) {
 const t=groupsCopy(locale),c=interactionCopy(locale),entry=roomEntryCopy(locale),listCopy=roomListCopy(locale),[showConditions,setShowConditions]=useState(false),labels=roomStatusCopy(locale),rooms=useGroupResource(`/api/groups/${pageId}/rooms`,parseRooms),[selected,setSelected]=useState<string|undefined>(initialRoomId);
 const homeHref=slug?`/${slug}?locale=${locale}`:`/pages/groups/${pageId}?locale=${locale}`,roomHref=`${homeHref}&tab=rooms`;
 const minimumTiers=[...new Set(rooms.data?.items.map(item=>item.minimumTier).filter((tier):tier is string=>Boolean(tier)))];
 const hasFreeRoom=rooms.data?.items.some(item=>item.defaultKey==='free'), hasRestrictedRoom=rooms.data?.items.some(item=>item.defaultKey!=='free');
 const room=rooms.data?.items.find(x=>x.id===selected),accessible=room?.canEnter&&['open','readonly'].includes(room.status),unavailable=room&&['closed','scheduled'].includes(room.status);
 const selectRoom=(item:ReturnType<typeof parseRooms>["items"][number])=>{setSelected(item.id);if(item.canEnter&&['open','readonly'].includes(item.status))void rooms.request(`/api/groups/${pageId}/rooms/${item.id}/read`,{method:'POST'}).then(rooms.retry).catch(()=>{});};
 if(accessible&&room)return <section className={`${roomStyles.roomsPanel} ${roomStyles.openRoom}`}>
  <header className={roomStyles.roomHeading}><FanAction onClick={()=>setSelected(undefined)} leadingIcon={<ArrowLeft/>}>{t.rooms}</FanAction><h2>{room.name}</h2></header>
  <nav className={roomStyles.roomNav} aria-label={t.rooms}>{rooms.data!.items.map(item=><button key={item.id} className={styles.chip} aria-pressed={selected===item.id} onClick={()=>selectRoom(item)}>{item.name}</button>)}{slug&&<FanAction variant='neutral' href={`/pages/groups/${pageId}?locale=${locale}&tab=info`}>{locale==='ko'?'아티스트 정보':t.info}</FanAction>}</nav>
  <p className={styles.meta}>{slug&&room.defaultKey!=='free'?`${entry.verified}${room.minimumTier?` · ${entry.minimum.replace('{tier}',room.minimumTier)}`:''}`:t.membersOnly}</p>
  <RoomMessages key={`${rooms.ownerKey}:${room.id}`} pageId={pageId} roomId={room.id} locale={locale} readonly={room.status==='readonly'}/>
 </section>;
 return <section className={roomStyles.roomsPanel} data-group-room-list><h2><MessagesSquare aria-hidden size={28}/>{t.rooms}</h2>{rooms.authenticated&&rooms.data?.canManage===true&&<FanAction className={styles.roomCreateAction} href={`/pages/groups/${pageId}/manage?locale=${locale}&section=rooms`}>{managementCopy(locale).createRoom}</FanAction>}<p className={roomStyles.roomHint}>{listCopy.hint}</p>{Boolean(rooms.data?.items.length)&&<section className={roomStyles.roomConditions}><div className={roomStyles.roomConditionCopy}><h3><LockKeyhole aria-hidden='true'/>{entry.title}</h3><p>{slug&&hasFreeRoom?rooms.data!.items.map(item=>`${item.name}: ${item.defaultKey==='free'?t.membersOnly:[entry.verified,...(item.minimumTier?[entry.minimum.replace('{tier}',item.minimumTier)]:[])].join(' · ')}`).join(' / '):slug?[entry.verified,...(minimumTiers.length>1?rooms.data!.items.map(item=>`${item.name}: ${item.minimumTier?entry.minimum.replace('{tier}',item.minimumTier):t.membersOnly}`):minimumTiers.map(tier=>entry.minimum.replace('{tier}',tier)))].join(' · '):t.membersOnly}</p></div><FanAction trailingIcon={<LockKeyhole size={18} aria-hidden/>} aria-expanded={showConditions} aria-controls='room-entry-actions' onClick={()=>setShowConditions(value=>!value)}>{entry.check}</FanAction>{showConditions&&<div id='room-entry-actions' className={styles.actions}>{!rooms.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/pages/groups/${pageId}?locale=${locale}&tab=rooms`)}`}>{t.login}</FanAction>:slug&&hasRestrictedRoom?<><FanAction href={`/${slug}?locale=${locale}&tab=certifications`}>{c.verify}</FanAction><FanAction href={`/my?locale=${locale}`}>{c.tier}</FanAction></>:<FanAction href={`/pages/groups/${pageId}?locale=${locale}`}>{t.join}</FanAction>}</div>}</section>}{rooms.error?<div className={roomStyles.roomConditions} role='alert'>{rooms.failure?.status===401?<><LockKeyhole aria-hidden='true'/><p>{t.membersOnly}</p><FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(roomHref)}`}>{t.login}</FanAction></>:rooms.failure?.status===403?<><LockKeyhole aria-hidden='true'/><p>{t.membersOnly}</p><FanAction href={homeHref}>{t.join}</FanAction></>:rooms.failure?.status===404?<><LockKeyhole aria-hidden='true'/><p>{pageUnavailable[locale]}</p><FanAction href={`/pages/groups?locale=${locale}`}>{t.explore}</FanAction></>:<><p>{t.error}</p><FanAction onClick={rooms.retry}>{t.retry}</FanAction></>}</div>:rooms.data?.items.length?<GroupRoomList rooms={rooms.data.items} locale={locale} imageUrl={imageUrl} statusLabels={labels} unreadLabel={c.unread} onSelect={selectRoom}/>:<p>{rooms.loading?t.loading:t.empty}</p>}{room&&<SourceStatePanel sourceId={room.status==='closed'?'rc1U1':!unavailable&&!room.canEnter?'ipmTh':undefined} title={room.status==='closed'&&locale==='ko'?'종료된 비밀방':!unavailable&&!room.canEnter&&locale==='ko'?'멤버 전용 콘텐츠를 볼 수 없어요':unavailable||room.canEnter?labels[room.status as keyof typeof labels]:c.conditions}>{room.status==='scheduled'&&room.opensAt&&<time dateTime={room.opensAt}>{new Date(room.opensAt).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short'})}</time>}{!unavailable&&!room.canEnter&&<><p>{room.minimumTier?`${c.tier} · ${room.minimumTier}`:t.membersOnly}</p>{!rooms.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/pages/groups/${pageId}?locale=${locale}&tab=rooms`)}`}>{t.login}</FanAction>:slug&&room.defaultKey!=='free'?<div className={styles.actions}><FanAction href={`/${slug}?locale=${locale}&tab=certifications`}>{c.verify}</FanAction><FanAction href={`/my?locale=${locale}`}>{c.tier}</FanAction></div>:<FanAction href={`/pages/groups/${pageId}?locale=${locale}`}>{t.join}</FanAction>}</>}</SourceStatePanel>}</section>;
}
export function GroupDetailScreen({locale,pageId,tab='home',calendarMonth,initialPostId,initialRoomId,initialBoardState,initialReturnTo,introHeading,boardHeading}:{locale:AppLocale;pageId:string;tab?:string;calendarMonth?:string;initialPostId?:string;initialRoomId?:string;initialBoardState?:BoardLocation;initialReturnTo?:string;introHeading?:string;boardHeading?:string}) {
  const t=groupsCopy(locale),base=`/api/groups/${pageId}`,detail=useGroupResource(base,parseDetail),page=detail.data?.page;
  const compactHeader=useCompactHeader();
  const creator=useLinkedFanpage(!detail.error&&page?.id===pageId?page:undefined,locale);
  const [answer,setAnswer]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState(false),[joining,setJoining]=useState(false),[failedJoin,setFailedJoin]=useState(false);
  const [attendanceOpen,setAttendanceOpen]=useState(false);
  const attendanceTrigger=useRef<HTMLAnchorElement|null>(null);
const operation=useRef<{body:string;requestId:string}|undefined>(undefined);
  const href=(value:string)=>{const q=new URLSearchParams({locale,tab:value});if(initialReturnTo)q.set("returnTo",initialReturnTo);if(value==='rooms'&&initialRoomId)q.set('room',initialRoomId);if(value==='calendar'&&calendarMonth)q.set('month',calendarMonth);if(initialPostId&&['board','news'].includes(value)){q.set('post',initialPostId);for(const [key,text] of Object.entries(initialBoardState??{}))if(text)q.set(key,text);}return `/pages/groups/${pageId}?${q}` as Route;};
  const mutate=async(path:string,method:string,input:Record<string,unknown>={})=>{if(pending)return;setPending(true);setError(false);setFailedJoin(false);const body=JSON.stringify([path,method,input]);if(operation.current?.body!==body)operation.current={body,requestId:crypto.randomUUID()};try{await detail.request(`${base}/${path}`,{method,body:JSON.stringify({...input,requestId:operation.current.requestId})});operation.current=undefined;detail.retry();if(path==='membership')setJoining(false);if(path==='membership'&&method==='POST'&&initialReturnTo)window.location.assign(initialReturnTo);}catch{setError(true);setFailedJoin(path==='membership'&&method==='POST');}finally{setPending(false);}};

  const unavailable=detail.error||Boolean(page&&page.id!==pageId);
  if(!page||unavailable)return <GroupShell locale={locale}>{unavailable?<div className={styles.status} role='alert'>{detail.failure&&[403,404].includes(detail.failure.status)?<><LockKeyhole size={32} aria-hidden='true'/><h1>{pageUnavailable[locale]}</h1><FanAction href={`/pages/groups?locale=${locale}`}>{t.explore}</FanAction></>:<><p>{t.error}</p><FanAction onClick={detail.retry}>{t.retry}</FanAction></>}</div>:<FanRouteLoading locale={locale}/>}</GroupShell>;
  if(page.kind==='fan'&&!creator.data)return <GroupShell locale={locale} fanpage>{creator.error||!page.slug||!page.celebrityId?<div className={styles.status} role='alert'><p>{t.error}</p><FanAction onClick={creator.retry}>{t.retry}</FanAction></div>:<FanRouteLoading locale={locale}/>}</GroupShell>;
  const tabs=['home','board','rooms','calendar'] as const;
  const pageMenu=<GroupPageMenu key={detail.ownerKey} detail={detail.data!} locale={locale} refresh={detail.retry}/>;
  const joinAction=detail.data?.membership?<span className={styles.meta}>{t.joined}</span>:detail.authenticated?<FanAction variant="primary" trailingIcon={page.kind==='brand'?<Plus/>:undefined} disabled={pending} onClick={()=>{if(page.question)setJoining(true);else void mutate('membership','POST',{answer:''});}}>{page.kind==='brand'?brandJoin[locale]:t.join}</FanAction>:<FanAction variant="primary" href={`/login?locale=${locale}&returnTo=${encodeURIComponent(href(tab))}`}>{t.login}</FanAction>;
  return <GroupShell locale={locale} fanpage={Boolean(creator.data)}>{creator.data?<CreatorGroupHeader celebrity={creator.data} locale={locale} tab={tab} membershipAction={joinAction} navigationHref={href} groupResource={detail}/>:<><GroupIdentityHeader name={page.name} imageUrl={page.imageUrl} locale={locale} titleAction={compactHeader?pageMenu:undefined} meta={`${t[page.kind]} · ${t.members} ${page.memberCount.toLocaleString(locale)}${detail.data?.membership?` · ${t.joined}`:''}`} description={page.kind==='brand'?page.description:undefined} actions={detail.data?.membership?null:joinAction}/>
    <GroupPresence pageId={pageId} locale={locale} member={Boolean(detail.data?.membership)} mode={page.kind==='fan'?'summary':'hidden'}/>
    <div className={styles.pageNavigation} data-kind={page.kind}>{!compactHeader&&<div className={styles.pageUtilities}>{pageMenu}</div>}<FanTabNav className={styles.tabs} label={page.name} current={tab}>{tabs.map(k=><Link key={k} className={styles.tab} href={href(k)} aria-current={tab===k?'page':undefined}>{k==='calendar'?groupCalendarLabel[locale]:t[k]}</Link>)}<Link className={styles.tab} href={href('members')} aria-current={tab==='members'?'page':undefined}>{membersAndRank[locale]}</Link></FanTabNav></div></>}
    {error&&<SourceStatePanel sourceId={failedJoin?'LAbTd':undefined} title={locale==='ko'&&failedJoin?'가입하지 못했어요':t.error} description={t.error} role='alert' actions={failedJoin?[{label:t.retry,onClick:()=>void mutate('membership','POST',{answer}),disabled:pending,variant:'primary'}]:[]}/>}{joining&&<section className={styles.panel}><h2>{t.join}</h2><form className={styles.form} onSubmit={event=>{event.preventDefault();void mutate('membership','POST',{answer});}}><label className={styles.field}>{page.question}<textarea className={`${styles.textarea} ${styles.joinAnswer}`} value={answer} onChange={event=>setAnswer(event.target.value)} maxLength={2000} required disabled={pending}/></label><div className={styles.actions}><FanAction onClick={()=>setJoining(false)}>{t.cancel}</FanAction><FanAction type='submit' disabled={pending}>{t.join}</FanAction></div></form></section>}
    {creator.data&&(tab==='home'||tab==='board'&&!initialPostId)?<LinkedFanpageContent celebrity={creator.data} locale={locale} view={tab==='home'?'home':'board'} returnTo={href('board')}/>:tab==='calendar'?<GroupCalendarPanel page={page} locale={locale} month={calendarMonth} calendarPath={href('calendar')}/>:<div className={styles.layout}><div className={styles.main}>
      {tab==='manage'&&detail.data?.membership&&detail.data.membership.role!=='member'&&<GroupManagement key={`${detail.ownerKey}:${detail.data.membership.role}`} detail={detail.data} locale={locale} refresh={detail.retry}/>}
      {tab==='home'&&page.kind!=='brand'&&<><div className={styles.mobileParticipation}><section className={styles.sourceHomeCard}><h2>{activityCardCopy[locale].title}</h2><p>{activityCardCopy[locale].body}</p><FanAction href={`/pages/groups/${pageId}/missions?locale=${locale}`}>{activityCardCopy[locale].check}</FanAction><FanAction variant='text' href={`/my/wallet?view=attendance&locale=${locale}`} onClick={event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.currentTarget.target||event.currentTarget.hasAttribute('download'))return;event.preventDefault();attendanceTrigger.current=event.currentTarget;event.currentTarget.focus();setAttendanceOpen(true);}}>{activityCardCopy[locale].attendance}</FanAction></section></div><section className={`${styles.hobbyIntro} ${homeStyles.intro}`}><div><h2><Footprints aria-hidden="true"/>{introHeading??page.name}</h2><p>{page.description}</p><span className={styles.meta}>{t[page.kind]} · {t.members} {page.memberCount.toLocaleString(locale)}</span></div>{page.imageUrl&&<GroupImage locale={locale} src={page.imageUrl} alt=''/>}</section></>}
      {tab==='home'&&page.kind==='brand'&&<GroupBrandHomeEvent pageId={pageId} locale={locale}/>}
      {(tab==='board'||tab==='news'||tab==='home'&&page.kind!=='brand')&&detail.data&&<GroupBoard key={detail.ownerKey} detail={detail.data} locale={locale} preview={tab==='home'} heading={tab==='home'?boardHeading:undefined} initialPostId={initialPostId} initialBoardState={initialBoardState}/>}
      {tab==='home'&&page.kind!=='brand'&&<><FanAction className={styles.hobbyBenefits} href={`/benefits?locale=${locale}`} trailingIcon={<ArrowRight/>}>{locale==='ko'?'덕질에서 혜택·응원':'Benefits and support'}</FanAction><FanAction className={styles.hobbyPassport} href={`/my?locale=${locale}`} leadingIcon={<BookOpen/>} trailingIcon={<ArrowRight/>}>{walletCopy(locale).passport}</FanAction></>}
      {tab==='members'&&<GroupMembers key={`${detail.ownerKey}:${pageId}`} pageId={pageId} locale={locale} member={Boolean(detail.data?.membership)} presentation={{creatorName:page.name,subtitles:{},}}/>}
      {tab==='info'&&<section className={styles.panel}><h2>{t.info}</h2><p>{page.description}</p><span className={styles.meta}>{t[page.kind]} · {page.memberCount.toLocaleString(locale)}</span></section>}
      {tab==='rooms'&&<GroupRoomsPanel key={`${detail.ownerKey}:${initialRoomId??''}`} pageId={pageId} locale={locale} slug={page.slug} imageUrl={page.imageUrl} initialRoomId={initialRoomId}/>}
      {tab==='activities'&&<GroupActivitiesPanel pageId={pageId} locale={locale} pageName={page.name}/>}
      {tab==='events'&&<GroupEventsList pageId={pageId} locale={locale}/>}
      {tab==='collection'&&<GroupCollections key={`${detail.ownerKey}:${pageId}`} pageId={pageId} locale={locale} pageName={page.name}/>}
    </div>{page.kind==='brand'?tab==='home'&&detail.data&&<aside className={styles.brandNews}><GroupBoard detail={detail.data} locale={locale} preview compact/></aside>:creator.data?<LinkedFanpageContent celebrity={creator.data} locale={locale} view="aside" returnTo={href(tab)}/>:<GroupHomeInfo page={page} locale={locale}/>}</div>}
  {attendanceOpen&&<WalletAttendanceDialog locale={locale} open onClose={()=>{setAttendanceOpen(false);requestAnimationFrame(()=>attendanceTrigger.current?.focus());}}/>}
  </GroupShell>;
}

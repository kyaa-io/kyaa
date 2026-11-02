"use client";
import { GroupImage } from "./group-image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Route } from "next";
import { UsersRound, ArrowRight, LockKeyhole, BookOpen, Plus, MessageCircle, ArrowLeft, UserRound, BadgeCheck } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
import { groupDetailSchema, groupRoomsSchema, groupMessagesSchema } from "../domain/contracts";
import { GroupRequestError, useGroupRequest, useGroupResource } from "./use-group-resource";
import { GroupMembers } from "./group-members";
import { GroupPresence } from "./group-presence";
import { GroupActivitiesPanel, GroupEventsList, GroupCollections } from "./group-activities";
import { GroupBoard, type BoardLocation } from "./group-board";
import { roomEntryCopy, roomMessageLabel, roomContextCopy } from "./room-entry-copy";
import { roomStatusCopy } from "./room-status-copy";
import { interactionCopy } from "./interaction-copy";
import { GroupPageMenu } from "./group-page-menu";
import { GroupManagement } from "./group-management";
import { sendLabel } from "./management-copy";
import { groupsCopy,pageUnavailable } from "./copy";
import { GroupAvatar, GroupShell } from "./group-shell";
import { GroupHomeInfo,GroupBrandHomeEvent } from "./group-home-panels";
import { GroupRaffleList } from "@/features/group-raffle/raffle-list";
import { membersAndRank, brandJoin } from "./home-copy";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import styles from "./groups.module.css";
const parseDetail=(x:unknown)=>groupDetailSchema.parse(x),parseRooms=(x:unknown)=>groupRoomsSchema.parse(x),parseMessages=(x:unknown)=>groupMessagesSchema.parse(x);
function RoomMessages({pageId,roomId,locale,readonly=false}:{pageId:string;roomId:string;locale:AppLocale;readonly?:boolean}) {
  const t=groupsCopy(locale),url=`/api/groups/${pageId}/rooms/${roomId}/messages`,auth=useGroupRequest(),{request,ready,ownerKey}=auth;
  const [snapshot,setSnapshot]=useState<{key:string;items:ReturnType<typeof parseMessages>["items"];participants?:ReturnType<typeof parseMessages>["participants"];failed:boolean;restricted?:boolean}>(),[draft,setDraft]=useState(""),[pending,setPending]=useState(false),[sendFailed,setSendFailed]=useState(false),[version,setVersion]=useState(0),operation=useRef<{body:string;requestId:string}|undefined>(undefined);
  useEffect(()=>{
    if(!ready)return;let active=true,inFlight=false,cursor:string|undefined,items:ReturnType<typeof parseMessages>["items"]=[],participants:ReturnType<typeof parseMessages>["participants"] = [];
    const controller=new AbortController();
    async function load(){
      if(!active||inFlight||document.visibilityState==='hidden')return;inFlight=true;
      let more=false;
      try{const next=parseMessages(await request(`${url}?limit=50${cursor?`&after=${cursor}`:''}`,{signal:controller.signal}));if(!active)return;const map=new Map(items.map(x=>[x.id,x]));for(const item of next.items)map.set(item.id,item);items=[...map.values()];if(next.items.length)cursor=next.items.at(-1)?.id;participants=next.participants??participants;setSnapshot({key:ownerKey,items,participants,failed:false});more=next.items.length===50;}catch(error){if(active){const restricted=error instanceof GroupRequestError&&[401,403,404].includes(error.status);if(restricted)items=[];setSnapshot({key:ownerKey,items,participants:restricted?[]:participants,failed:true,restricted});}}finally{inFlight=false;}
      if(more&&active)void load();
    }
    void load();const timer=setInterval(()=>void load(),3000),visibility=()=>{if(document.visibilityState==='visible')void load();};document.addEventListener('visibilitychange',visibility);
    return()=>{active=false;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visibility);};
  },[ready,request,ownerKey,url,version]);
  const send=async(e:FormEvent)=>{e.preventDefault();if(pending||readonly||!draft.trim())return;const body=draft.trim();if(operation.current?.body!==body)operation.current={body,requestId:crypto.randomUUID()};setPending(true);try{await request(url,{method:'POST',body:JSON.stringify(operation.current)});setDraft('');setSendFailed(false);operation.current=undefined;setVersion(x=>x+1);}catch{setSendFailed(true);}finally{setPending(false);}};
  const visible=snapshot?.key===ownerKey?snapshot:undefined;
  return <div className={styles.roomConversationLayout}><section className={styles.roomConversation}>
    <div className={styles.roomMessages} role="log" aria-label={t.rooms} aria-live="polite" tabIndex={0}>
      {!visible&&<p role="status">{t.loading}</p>}{visible?.failed&&<p role="alert">{t.error}</p>}
      {visible&&!visible.failed&&!visible.items.length&&<p>{roomEntryCopy(locale).empty}</p>}
      {visible?.items.map(item=><div className={styles.roomMessage} data-mine={item.mine||undefined} key={item.id}>
        {!item.mine&&(item.avatarUrl?<GroupImage locale={locale} src={item.avatarUrl} alt='' className={styles.roomMessageAvatar} width={40} height={40}/>:<span className={styles.roomMessageAvatar} aria-hidden='true'><UserRound size={22}/></span>)}
        <div className={styles.roomMessageCopy}>{!item.mine&&<strong>{item.nickname}{item.artist&&<span className={styles.roomArtist}><BadgeCheck size={16} aria-hidden='true'/>{roomContextCopy[locale][1]}</span>}</strong>}<p>{item.body}</p><time className={styles.meta} dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})}</time></div>
      </div>)}
    </div>
    {sendFailed&&<p className={styles.error} role="alert">{t.error}</p>}
    {readonly?<p className={styles.roomComposer}>{roomStatusCopy(locale).readonly}</p>:!visible?.restricted&&<form onSubmit={send} className={styles.roomComposer}>
      <label className={styles.field}>{roomMessageLabel[locale]}<input className={styles.input} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={2000} disabled={pending} required/></label>
      <FanAction type="submit" variant="primary" disabled={pending||!draft.trim()}>{sendFailed?t.retry:sendLabel[locale]}</FanAction>
    </form>}
  </section>{Boolean(visible?.participants?.length)&&<aside className={styles.roomParticipants}><h3><UsersRound size={20} aria-hidden='true'/>{roomContextCopy[locale][0]}</h3>{visible!.participants!.map(person=><Link href={`/my/friends?locale=${locale}&profileId=${person.profileId}` as Route} key={person.profileId} className={styles.roomParticipant}>{person.avatarUrl?<GroupImage src={person.avatarUrl} locale={locale} alt='' width={40} height={40} className={styles.roomMessageAvatar}/>:<UserRound aria-hidden='true'/>}<span><strong>{person.nickname}</strong>{person.tier&&<span className={styles.meta}>{person.tier} · {roomEntryCopy(locale).verified}</span>}</span><ArrowRight size={18} aria-hidden='true'/></Link>)}</aside>}</div>;
}
export function GroupRoomsPanel({pageId,locale,slug}:{pageId:string;locale:AppLocale;slug?:string|null}) {
 const t=groupsCopy(locale),c=interactionCopy(locale),entry=roomEntryCopy(locale),[showConditions,setShowConditions]=useState(false),labels=roomStatusCopy(locale),rooms=useGroupResource(`/api/groups/${pageId}/rooms`,parseRooms),[selected,setSelected]=useState<string>();
 const homeHref=slug?`/${slug}?locale=${locale}`:`/pages/groups/${pageId}?locale=${locale}`,roomHref=`${homeHref}&tab=rooms`;
 const minimumTiers=[...new Set(rooms.data?.items.map(item=>item.minimumTier).filter((tier):tier is string=>Boolean(tier)))];
 const room=rooms.data?.items.find(x=>x.id===selected),accessible=room?.canEnter&&['open','readonly'].includes(room.status),unavailable=room&&['closed','scheduled'].includes(room.status);
 const selectRoom=(item:ReturnType<typeof parseRooms>["items"][number])=>{setSelected(item.id);if(item.canEnter&&['open','readonly'].includes(item.status))void rooms.request(`/api/groups/${pageId}/rooms/${item.id}/read`,{method:'POST'}).then(rooms.retry).catch(()=>{});};
 if(accessible&&room)return <section className={styles.roomsPanel}>
  <header className={styles.roomHeading}><FanAction onClick={()=>setSelected(undefined)} leadingIcon={<ArrowLeft/>}>{t.rooms}</FanAction><h2>{room.name}</h2></header>
  <nav className={styles.roomNav} aria-label={t.rooms}>{rooms.data!.items.map(item=><button key={item.id} className={styles.chip} aria-pressed={selected===item.id} onClick={()=>selectRoom(item)}>{item.name}</button>)}</nav>
  <p className={styles.meta}>{slug?`${entry.verified}${room.minimumTier?` · ${entry.minimum.replace('{tier}',room.minimumTier)}`:''}`:t.membersOnly}</p>
  <RoomMessages key={`${rooms.ownerKey}:${room.id}`} pageId={pageId} roomId={room.id} locale={locale} readonly={room.status==='readonly'}/>
 </section>;
 return <section className={styles.roomsPanel}><h2>{t.rooms}</h2>{rooms.error?<div className={styles.roomConditions} role='alert'>{rooms.failure?.status===401?<><LockKeyhole aria-hidden='true'/><p>{t.membersOnly}</p><FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(roomHref)}`}>{t.login}</FanAction></>:rooms.failure?.status===403?<><LockKeyhole aria-hidden='true'/><p>{t.membersOnly}</p><FanAction href={homeHref}>{t.join}</FanAction></>:rooms.failure?.status===404?<><LockKeyhole aria-hidden='true'/><p>{pageUnavailable[locale]}</p><FanAction href={`/pages/groups?locale=${locale}`}>{t.explore}</FanAction></>:<><p>{t.error}</p><FanAction onClick={rooms.retry}>{t.retry}</FanAction></>}</div>:rooms.data?.items.length?rooms.data.items.map(item=><button className={`${styles.card} ${styles.roomCard}`} key={item.id} onClick={()=>selectRoom(item)}>{item.canEnter&&['open','readonly'].includes(item.status)?<MessageCircle aria-hidden='true'/>:<LockKeyhole aria-hidden='true'/>}<span className={styles.cardCopy}><strong>{item.name}</strong>{item.canEnter&&['open','readonly'].includes(item.status)&&<span className={styles.roomPreview}>{item.latestMessage||entry.empty}</span>}{(!item.canEnter||item.status!=='open')&&<span className={styles.meta}>{labels[item.status as keyof typeof labels]}{item.minimumTier?` · ${item.minimumTier}`:''}</span>}</span>{item.canEnter&&['open','readonly'].includes(item.status)&&Boolean(item.unreadCount)&&<span className={styles.roomUnread} aria-label={`${c.unread} ${item.unreadCount}`}>{item.unreadCount}</span>}<ArrowRight aria-hidden='true'/></button>):<p>{rooms.loading?t.loading:t.empty}</p>}{Boolean(rooms.data?.items.length)&&<section className={styles.roomConditions}><h3><LockKeyhole aria-hidden='true'/>{entry.title}</h3><p>{slug?[entry.verified,...(minimumTiers.length>1?rooms.data!.items.map(item=>`${item.name}: ${item.minimumTier?entry.minimum.replace('{tier}',item.minimumTier):t.membersOnly}`):minimumTiers.map(tier=>entry.minimum.replace('{tier}',tier)))].join(' · '):t.membersOnly}</p><FanAction aria-expanded={showConditions} aria-controls='room-entry-actions' onClick={()=>setShowConditions(value=>!value)}>{entry.check}</FanAction>{showConditions&&<div id='room-entry-actions' className={styles.actions}>{!rooms.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/pages/groups/${pageId}?locale=${locale}&tab=rooms`)}`}>{t.login}</FanAction>:slug?<><FanAction href={`/${slug}?locale=${locale}&tab=certifications`}>{c.verify}</FanAction><FanAction href={`/my?locale=${locale}`}>{c.tier}</FanAction></>:<FanAction href={`/pages/groups/${pageId}?locale=${locale}`}>{t.join}</FanAction>}</div>}</section>}{room&&<section className={styles.panel}><h3>{unavailable||room.canEnter?labels[room.status as keyof typeof labels]:c.conditions}</h3>{room.status==='scheduled'&&room.opensAt&&<time dateTime={room.opensAt}>{new Date(room.opensAt).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short'})}</time>}{!unavailable&&!room.canEnter&&<><p>{room.minimumTier?`${c.tier} · ${room.minimumTier}`:t.membersOnly}</p>{!rooms.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/pages/groups/${pageId}?locale=${locale}&tab=rooms`)}`}>{t.login}</FanAction>:slug?<div className={styles.actions}><FanAction href={`/${slug}?locale=${locale}&tab=certifications`}>{c.verify}</FanAction><FanAction href={`/my?locale=${locale}`}>{c.tier}</FanAction></div>:<FanAction href={`/pages/groups/${pageId}?locale=${locale}`}>{t.join}</FanAction>}</>}</section>}</section>;
}
export function GroupDetailScreen({locale,pageId,tab='home',initialPostId,initialBoardState,initialReturnTo}:{locale:AppLocale;pageId:string;tab?:string;initialPostId?:string;initialBoardState?:BoardLocation;initialReturnTo?:string}) {
  const t=groupsCopy(locale),base=`/api/groups/${pageId}`,detail=useGroupResource(base,parseDetail),page=detail.data?.page;
  const [answer,setAnswer]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState(false),[joining,setJoining]=useState(false);
const operation=useRef<{body:string;requestId:string}|undefined>(undefined);
  const href=(value:string)=>{const q=new URLSearchParams({locale,tab:value});if(initialReturnTo)q.set("returnTo",initialReturnTo);if(initialPostId&&['board','news'].includes(value)){q.set('post',initialPostId);for(const [key,text] of Object.entries(initialBoardState??{}))if(text)q.set(key,text);}return `/pages/groups/${pageId}?${q}` as Route;};
  const mutate=async(path:string,method:string,input:Record<string,unknown>={})=>{if(pending)return;setPending(true);setError(false);const body=JSON.stringify([path,method,input]);if(operation.current?.body!==body)operation.current={body,requestId:crypto.randomUUID()};try{await detail.request(`${base}/${path}`,{method,body:JSON.stringify({...input,requestId:operation.current.requestId})});operation.current=undefined;detail.retry();if(path==='membership')setJoining(false);if(path==='membership'&&method==='POST'&&initialReturnTo)window.location.assign(initialReturnTo);}catch{setError(true);}finally{setPending(false);}};

  if(!page)return <GroupShell locale={locale}><div className={styles.status} role={detail.error?'alert':'status'}>{detail.error?detail.failure&&[403,404].includes(detail.failure.status)?<><LockKeyhole size={32} aria-hidden='true'/><h1>{pageUnavailable[locale]}</h1><FanAction href={`/pages/groups?locale=${locale}`}>{t.explore}</FanAction></>:<><p>{t.error}</p><FanAction onClick={detail.retry}>{t.retry}</FanAction></>:t.loading}</div></GroupShell>;
  const tabs=page.kind==='brand'?['home','news','events','collection'] as const:['home','board','rooms','activities'] as const;
  const joinAction=detail.data?.membership?<span className={styles.meta}>{t.joined}</span>:detail.authenticated?<FanAction variant="primary" trailingIcon={page.kind==='brand'?<Plus/>:undefined} disabled={pending} onClick={()=>{if(page.question)setJoining(true);else void mutate('membership','POST',{answer:''});}}>{page.kind==='brand'?brandJoin[locale]:t.join}</FanAction>:<FanAction variant="primary" href={`/login?locale=${locale}&returnTo=${encodeURIComponent(href(tab))}`}>{t.login}</FanAction>;
  return <GroupShell locale={locale}><header className={`${styles.identity} ${styles.nonFanIdentity} ${page.kind==='brand'?styles.brandIdentity:''}`}><GroupAvatar page={page} locale={locale}/><div className={styles.identityCopy}><h1>{page.name}</h1><p className={styles.meta}>{t[page.kind]} · {page.kind==='brand'?page.description:`${t.members} ${page.memberCount.toLocaleString(locale)}`}</p></div><div className={styles.pageDesktopJoin}>{joinAction}</div></header>
    <GroupPresence pageId={pageId} locale={locale} member={Boolean(detail.data?.membership)} mode={page.kind==='fan'?'summary':'hidden'}/>
    <div className={styles.pageNavigation}><div className={styles.pageUtilities}><Link className={styles.chip} href={href('members')}>{membersAndRank[locale]}<UsersRound size={18} aria-hidden="true"/></Link><GroupPageMenu key={detail.ownerKey} detail={detail.data!} locale={locale} refresh={detail.retry}/></div>{page.kind==='brand'&&<div className={styles.pageMobileJoin}>{joinAction}</div>}<nav className={styles.tabs} aria-label={page.name}>{tabs.map(k=><Link key={k} className={styles.tab} href={href(k)} aria-current={tab===k?'page':undefined}>{t[k]}</Link>)}</nav></div>
    {error&&<p role="alert" className={styles.error}>{t.error}</p>}{joining&&<section className={styles.panel}><h2>{t.join}</h2><form className={styles.form} onSubmit={event=>{event.preventDefault();void mutate('membership','POST',{answer});}}><label className={styles.field}>{page.question}<textarea className={styles.textarea} value={answer} onChange={event=>setAnswer(event.target.value)} maxLength={2000} required disabled={pending}/></label><div className={styles.actions}><FanAction onClick={()=>setJoining(false)}>{t.cancel}</FanAction><FanAction type='submit' disabled={pending}>{t.join}</FanAction></div></form></section>}
    <div className={`${styles.layout} ${page.kind==='brand'?styles.brandHomeLayout:''}`}><div className={styles.main}>
      {tab==='manage'&&detail.data?.membership&&detail.data.membership.role!=='member'&&<GroupManagement key={`${detail.ownerKey}:${detail.data.membership.role}`} detail={detail.data} locale={locale} refresh={detail.retry}/>}
      {tab==='home'&&page.kind!=='brand'&&<><section className={styles.hobbyIntro}><div><h2>{page.name}</h2><p>{page.description}</p><span className={styles.meta}>{t[page.kind]} · {t.members} {page.memberCount.toLocaleString(locale)}</span></div>{page.imageUrl&&<GroupImage locale={locale} src={page.imageUrl} alt=''/>}</section><div className={styles.pageMobileJoin}>{joinAction}</div></>}
      {tab==='home'&&page.kind==='brand'&&<GroupBrandHomeEvent pageId={pageId} locale={locale}/>}
      {(tab==='board'||tab==='news'||tab==='home'&&page.kind!=='brand')&&detail.data&&<GroupBoard key={detail.ownerKey} detail={detail.data} locale={locale} preview={tab==='home'} initialPostId={initialPostId} initialBoardState={initialBoardState}/>}
      {tab==='home'&&page.kind!=='brand'&&<><GroupRaffleList pageId={pageId} locale={locale} preview/><FanAction className={styles.hobbyPassport} href={`/my?locale=${locale}`} leadingIcon={<BookOpen/>} trailingIcon={<ArrowRight/>}>{walletCopy(locale).passport}</FanAction></>}
      {tab==='members'&&<GroupMembers key={`${detail.ownerKey}:${pageId}`} pageId={pageId} locale={locale} member={Boolean(detail.data?.membership)}/>}
      {tab==='info'&&<section className={styles.panel}><h2>{t.info}</h2><p>{page.description}</p><span className={styles.meta}>{t[page.kind]} · {page.memberCount.toLocaleString(locale)}</span></section>}
      {tab==='rooms'&&<GroupRoomsPanel pageId={pageId} locale={locale} slug={page.slug}/>}
      {tab==='activities'&&<GroupActivitiesPanel pageId={pageId} locale={locale}/>}
      {tab==='events'&&<GroupEventsList pageId={pageId} locale={locale}/>}
      {tab==='collection'&&<GroupCollections pageId={pageId} locale={locale}/>}
    </div>{page.kind==='brand'?tab==='home'&&detail.data&&<aside className={styles.brandNews}><GroupBoard detail={detail.data} locale={locale} preview compact/></aside>:<GroupHomeInfo page={page} locale={locale}/>}</div>
  </GroupShell>;
}

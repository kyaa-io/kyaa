"use client";
import {GroupPublicRoomList,GroupRoomList} from "./group-room-list";
import {groupPublicRoomsSchema} from "@/server/group-members/domain";
import {managementCopy,sendLabel} from "./management-copy";
import { GroupImage } from "./group-image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Route } from "next";
import { UsersRound, LockKeyhole, ArrowLeft, UserRound, BadgeCheck, MessagesSquare } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { fanLoginHref } from "@/components/login-href";
import { groupRoomsSchema, groupMessagesSchema } from "../domain/contracts";
import { GroupRequestError, useGroupRequest, useGroupResource } from "./use-group-resource";
import { roomEntryCopy, roomMessageLabel, roomContextCopy } from "./room-entry-copy";
import { roomStatusCopy } from "./room-status-copy";
import { interactionCopy } from "./interaction-copy";
import { groupsCopy,pageUnavailable } from "./copy";
import styles from "./groups.module.css";
import {SourceStatePanel} from "./source-state-panel";
import roomStyles from "./group-rooms.module.css";
const parseRooms=(x:unknown)=>groupRoomsSchema.parse(x),parseMessages=(x:unknown)=>groupMessagesSchema.parse(x),parsePublicRooms=(x:unknown)=>groupPublicRoomsSchema.parse(x);
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
export function GroupRoomsPanel({pageId,locale,slug,imageUrl,initialRoomId,onJoin,joinPending=false,joinLabel}:{pageId:string;locale:AppLocale;slug?:string|null;imageUrl?:string|null;initialRoomId?:string;onJoin?:()=>void;joinPending?:boolean;joinLabel?:string}) {
 const t=groupsCopy(locale),c=interactionCopy(locale),entry=roomEntryCopy(locale),[showConditions,setShowConditions]=useState(false),labels=roomStatusCopy(locale),auth=useGroupRequest(),rooms=useGroupResource(auth.ready&&auth.authenticated?`/api/groups/${pageId}/rooms`:null,parseRooms),nonMember=auth.ready&&(!auth.authenticated||rooms.failure?.status===403),publicRooms=useGroupResource(nonMember?`/api/groups/${pageId}/public-rooms`:null,parsePublicRooms),[selected,setSelected]=useState<string|undefined>(initialRoomId);
 const homeHref=slug?`/${slug}?locale=${locale}`:`/pages/groups/${pageId}?locale=${locale}`,roomHref=`${homeHref}&tab=rooms`;
 const joinButton=onJoin?<FanAction disabled={joinPending} onClick={onJoin}>{joinLabel??t.join}</FanAction>:<FanAction href={homeHref}>{joinLabel??t.join}</FanAction>;
 const minimumTiers=[...new Set(rooms.data?.items.map(item=>item.minimumTier).filter((tier):tier is string=>Boolean(tier)))];
 const hasFreeRoom=rooms.data?.items.some(item=>item.defaultKey==='free'), hasRestrictedRoom=rooms.data?.items.some(item=>item.defaultKey!=='free');
 const room=rooms.data?.items.find(x=>x.id===selected),accessible=room?.canEnter&&['open','readonly'].includes(room.status),unavailable=room&&['closed','scheduled'].includes(room.status);
 const selectRoom=(item:ReturnType<typeof parseRooms>["items"][number])=>{setSelected(item.id);if(item.canEnter&&['open','readonly'].includes(item.status))void rooms.request(`/api/groups/${pageId}/rooms/${item.id}/read`,{method:'POST'}).then(rooms.retry).catch(()=>{});};
 if(accessible&&room)return <section className={`${roomStyles.roomsPanel} ${roomStyles.openRoom}`}>
  <header className={roomStyles.roomHeading}><FanAction onClick={()=>setSelected(undefined)} leadingIcon={<ArrowLeft/>}>{t.rooms}</FanAction><h2>{room.name}</h2></header>
  <div className={roomStyles.roomNav}><FanTabs variant='chip' label={t.rooms} current={selected??''} items={rooms.data!.items.map(item=>({key:item.id,label:item.name,onSelect:()=>selectRoom(item)}))}/>{slug&&<FanAction variant='neutral' href={`/pages/groups/${pageId}?locale=${locale}&tab=info`}>{locale==='ko'?'아티스트 정보':t.info}</FanAction>}</div>
  <p className={styles.meta}>{slug&&room.defaultKey!=='free'?`${entry.verified}${room.minimumTier?` · ${entry.minimum.replace('{tier}',room.minimumTier)}`:''}`:t.membersOnly}</p>
  <RoomMessages key={`${rooms.ownerKey}:${room.id}`} pageId={pageId} roomId={room.id} locale={locale} readonly={room.status==='readonly'}/>
 </section>;
 if(nonMember)return <section className={roomStyles.roomsPanel} data-group-room-list><h2><MessagesSquare aria-hidden size={28}/>{t.rooms}{Boolean(publicRooms.data?.roomCount)&&<span className={roomStyles.roomCount}>{publicRooms.data!.roomCount.toLocaleString(locale)}</span>}</h2><section className={roomStyles.roomConditions}><div className={roomStyles.roomConditionCopy}><h3><LockKeyhole aria-hidden='true'/>{entry.title}</h3><p>{t.membersOnly}</p></div>{auth.authenticated?joinButton:<FanAction variant='neutral' href={fanLoginHref(locale,roomHref)}>{t.login}</FanAction>}</section>{publicRooms.error?<div className={roomStyles.roomConditions} role='alert'><p>{t.error}</p><FanAction onClick={publicRooms.retry}>{t.retry}</FanAction></div>:publicRooms.loading?<p role='status'>{t.loading}</p>:publicRooms.data?.items.length?<GroupPublicRoomList rooms={publicRooms.data.items} locale={locale} imageUrl={imageUrl} rowHref={auth.authenticated?undefined:fanLoginHref(locale,roomHref) as string}/>:null}</section>;
 return <section className={roomStyles.roomsPanel} data-group-room-list><h2><MessagesSquare aria-hidden size={28}/>{t.rooms}</h2>{rooms.authenticated&&rooms.data?.canManage===true&&<FanAction className={styles.roomCreateAction} href={`/pages/groups/${pageId}/manage?locale=${locale}&section=rooms`}>{managementCopy(locale).createRoom}</FanAction>}{Boolean(rooms.data?.items.length)&&<section className={roomStyles.roomConditions}><div className={roomStyles.roomConditionCopy}><h3><LockKeyhole aria-hidden='true'/>{entry.title}</h3><p>{slug&&hasFreeRoom?rooms.data!.items.map(item=>`${item.name}: ${item.defaultKey==='free'?t.membersOnly:[entry.verified,...(item.minimumTier?[entry.minimum.replace('{tier}',item.minimumTier)]:[])].join(' · ')}`).join(' / '):slug?[entry.verified,...(minimumTiers.length>1?rooms.data!.items.map(item=>`${item.name}: ${item.minimumTier?entry.minimum.replace('{tier}',item.minimumTier):t.membersOnly}`):minimumTiers.map(tier=>entry.minimum.replace('{tier}',tier)))].join(' · '):t.membersOnly}</p></div><FanAction trailingIcon={<LockKeyhole size={18} aria-hidden/>} aria-expanded={showConditions} aria-controls='room-entry-actions' onClick={()=>setShowConditions(value=>!value)}>{entry.check}</FanAction>{showConditions&&<div id='room-entry-actions' className={styles.actions}>{!rooms.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/pages/groups/${pageId}?locale=${locale}&tab=rooms`)}`}>{t.login}</FanAction>:slug&&hasRestrictedRoom?<><FanAction href={`/${slug}?locale=${locale}&tab=certifications`}>{c.verify}</FanAction><FanAction href={`/my?locale=${locale}`}>{c.tier}</FanAction></>:joinButton}</div>}</section>}{rooms.error?<div className={roomStyles.roomConditions} role='alert'>{rooms.failure?.status===401?<><LockKeyhole aria-hidden='true'/><p>{t.membersOnly}</p><FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(roomHref)}`}>{t.login}</FanAction></>:rooms.failure?.status===403?<><LockKeyhole aria-hidden='true'/><p>{t.membersOnly}</p>{joinButton}</>:rooms.failure?.status===404?<><LockKeyhole aria-hidden='true'/><p>{pageUnavailable[locale]}</p><FanAction href={`/pages/groups?locale=${locale}`}>{t.explore}</FanAction></>:<><p>{t.error}</p><FanAction onClick={rooms.retry}>{t.retry}</FanAction></>}</div>:rooms.data?.items.length?<GroupRoomList rooms={rooms.data.items} locale={locale} imageUrl={imageUrl} statusLabels={labels} unreadLabel={c.unread} proofHref={slug?`/c/${encodeURIComponent(slug)}/certifications?locale=${locale}`:undefined} onSelect={selectRoom}/>:<p>{rooms.loading||!auth.ready?t.loading:t.empty}</p>}{room&&<SourceStatePanel sourceId={room.status==='closed'?'rc1U1':!unavailable&&!room.canEnter?'ipmTh':undefined} title={room.status==='closed'&&locale==='ko'?'종료된 비밀방':!unavailable&&!room.canEnter&&locale==='ko'?'멤버 전용 콘텐츠를 볼 수 없어요':unavailable||room.canEnter?labels[room.status as keyof typeof labels]:c.conditions}>{room.status==='scheduled'&&room.opensAt&&<time dateTime={room.opensAt}>{new Date(room.opensAt).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short'})}</time>}{!unavailable&&!room.canEnter&&<><p>{room.minimumTier?`${c.tier} · ${room.minimumTier}`:t.membersOnly}</p>{!rooms.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/pages/groups/${pageId}?locale=${locale}&tab=rooms`)}`}>{t.login}</FanAction>:slug&&room.defaultKey!=='free'?<div className={styles.actions}><FanAction href={`/${slug}?locale=${locale}&tab=certifications`}>{c.verify}</FanAction><FanAction href={`/my?locale=${locale}`}>{c.tier}</FanAction></div>:joinButton}</>}</SourceStatePanel>}</section>;
}

"use client";
import { SECRET_ROOMS_ENABLED } from "../secret-room-config";
import {GroupPublicRoomList,GroupRoomEmpty,GroupRoomHub,GroupRoomHubSkeleton,pickFeaturedRoom} from "./group-room-list";
import {groupPublicRoomsSchema} from "@/server/group-members/domain";
import {managementCopy,sendLabel} from "./management-copy";
import { GroupImage } from "./group-image";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { UsersRound, LockKeyhole, ChevronLeft, UserRound, BadgeCheck, MessagesSquare, ImagePlus, X } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSurface } from "@/components/fan-ui/fan-surface";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanStarAction } from "@/components/fan-ui/fan-star-action";
import { useOptionalGroupPage } from "./group-page-context";
import { fanLoginHref } from "@/components/login-href";
import { groupRoomsSchema, groupMessagesSchema } from "../domain/contracts";
import { GroupRequestError, useGroupRequest, useGroupResource } from "./use-group-resource";
import { roomEntryCopy, roomMessageLabel, roomContextCopy } from "./room-entry-copy";
import { roomStatusCopy } from "./room-status-copy";
import { interactionCopy } from "./interaction-copy";
import { groupsCopy,pageUnavailable } from "./copy";
import styles from "./groups.module.css";
import { useWaveMediaUpload } from "@/features/content-safety/ui/use-wave-media-upload";
import { AuthenticatedMedia } from "@/features/content-safety/ui/authenticated-media";
import { mediaCopy } from "@/features/group-social/media-preview";
import {SourceStatePanel} from "./source-state-panel";
import {tierDisplayName} from "@/features/passport/domain/passport-read-model";
import roomStyles from "./group-rooms.module.css";
const parseRooms=(x:unknown)=>groupRoomsSchema.parse(x),parseMessages=(x:unknown)=>groupMessagesSchema.parse(x),parsePublicRooms=(x:unknown)=>groupPublicRoomsSchema.parse(x);
function RoomMessagesSkeleton({label}:{label:string}){return <div role="status" aria-busy="true" aria-label={label} className={roomStyles.roomMessagesLoading}>{[0,1,2].map(i=><div className={roomStyles.roomMessage} key={i} aria-hidden="true"><FanSkeleton shape="circle" width={40} height={40}/><div className={roomStyles.roomMessageCopy}><FanSkeleton width={96} height={16}/><FanSkeleton width={i===1?"40%":"70%"} height={20}/></div></div>)}</div>;}
function RoomMessages({pageId,roomId,locale,readonly=false}:{pageId:string;roomId:string;locale:AppLocale;readonly?:boolean}) {
  const t=groupsCopy(locale),url=`/api/groups/${pageId}/rooms/${roomId}/messages`,auth=useGroupRequest(),{request,ready,ownerKey}=auth;
  const [snapshot,setSnapshot]=useState<{key:string;items:ReturnType<typeof parseMessages>["items"];participants?:ReturnType<typeof parseMessages>["participants"];canSend?:boolean;failed:boolean;restricted?:boolean}>(),[draft,setDraft]=useState(""),[pending,setPending]=useState(false),[sendFailed,setSendFailed]=useState(false),[version,setVersion]=useState(0),operation=useRef<{body:string;assetId?:string;requestId:string}|undefined>(undefined);
  const uploads=useWaveMediaUpload("group_post",1),upload=uploads.items[0],fileInput=useRef<HTMLInputElement>(null);
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
  const send=async(e:FormEvent)=>{e.preventDefault();if(pending||!canSend||(!draft.trim()&&!upload)||Boolean(upload&&!uploads.ready))return;const body=draft.trim(),assetId=upload?.media?.assetId;if(operation.current?.body!==body||operation.current?.assetId!==assetId)operation.current={body,...(assetId?{assetId}:{}),requestId:crypto.randomUUID()};setPending(true);try{await request(url,{method:'POST',body:JSON.stringify(operation.current)});setDraft('');if(upload)uploads.markUsed(upload.key);setSendFailed(false);operation.current=undefined;setVersion(x=>x+1);}catch(error){setSendFailed(true);if(error instanceof GroupRequestError&&[401,403,404].includes(error.status)){if(upload)uploads.remove(upload.key);setDraft('');setSnapshot({key:ownerKey,items:[],participants:[],canSend:false,failed:true,restricted:true});}}finally{setPending(false);}};
  return <div className={roomStyles.roomConversationLayout}><section className={roomStyles.roomConversation}>
    <div className={roomStyles.roomMessages} role="log" aria-label={t.rooms} aria-live="polite" tabIndex={0}>
      {!visible&&<RoomMessagesSkeleton label={t.loading}/>}{visible?.failed&&<p role="alert">{t.error}</p>}
      {visible&&!visible.failed&&!visible.items.length&&<p>{roomEntryCopy(locale).empty}</p>}
      {visible?.items.map(item=><div className={roomStyles.roomMessage} data-mine={item.mine||undefined} data-artist={item.artist||undefined} key={item.id}>
        {!item.mine&&(item.avatarUrl?<GroupImage locale={locale} src={item.avatarUrl} alt='' className={roomStyles.roomMessageAvatar} width={40} height={40}/>:<span className={roomStyles.roomMessageAvatar} aria-hidden='true'><UserRound size={22}/></span>)}
        <div className={roomStyles.roomMessageCopy}>{!item.mine&&<strong>{item.nickname}{item.artist&&<span className={roomStyles.roomArtist}><BadgeCheck size={16} aria-hidden='true'/>{roomContextCopy[locale][1]}</span>}</strong>}{item.body&&<p>{item.body}</p>}{item.asset&&<div className={roomStyles.roomPhoto} style={{'--room-photo-max':`${item.asset.width}px`} as CSSProperties}><AuthenticatedMedia asset={item.asset} original locale={locale} alt={mediaCopy[locale][1]}/></div>}<time className={styles.meta} dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})}</time></div>
      </div>)}
    </div>
    {uploads.invalid&&<p role="alert" className={styles.error}>{t.error}</p>}
    {upload?.failed&&<div role="alert"><p>{t.error}</p><FanAction onClick={()=>uploads.retry(upload)}>{t.retry}</FanAction></div>}
    {sendFailed&&<p className={styles.error} role="alert">{t.error}</p>}
    {!canSend?<SourceStatePanel sourceId={readonly?'aWY6S':undefined} title={roomStatusCopy(locale).readonly} role='status'/>:!visible?.restricted&&<form onSubmit={send} className={roomStyles.roomComposer}>
      {upload&&<div className={roomStyles.roomUpload}><span>{upload.file.name} · {upload.failed?t.error:uploads.ready?mediaCopy[locale][3]:t.loading}</span><FanAction variant="text" disabled={pending} ariaLabel={mediaCopy[locale][4]} onClick={()=>uploads.remove(upload.key)} leadingIcon={<X size={20} aria-hidden/>}/></div>}
      <FanAction variant="text" disabled={pending||Boolean(upload)} ariaLabel={mediaCopy[locale][1]} onClick={()=>fileInput.current?.click()} leadingIcon={<ImagePlus size={20} aria-hidden/>}/>
      <input hidden type="file" ref={fileInput} accept="image/jpeg,image/png,image/webp" aria-label={mediaCopy[locale][1]} onChange={e=>{const file=e.target.files?.[0];if(file)uploads.add([file]);e.target.value="";}}/>
      <label className={styles.field}>{roomMessageLabel[locale]}<input className={styles.input} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={2000} disabled={pending} required={!upload}/></label>
      <FanAction type="submit" variant="primary" disabled={pending||(!draft.trim()&&!upload)||Boolean(upload&&!uploads.ready)}>{sendFailed?t.retry:sendLabel[locale]}</FanAction>
    </form>}
  </section>{Boolean(visible?.participants?.length)&&<aside className={roomStyles.roomParticipants}><h3><UsersRound size={20} aria-hidden='true'/>{roomContextCopy[locale][0]}</h3>{visible!.participants!.map(person=><Link href={`/my/friends?locale=${locale}&profileId=${person.profileId}` as Route} key={person.profileId} className={roomStyles.roomParticipant}>{person.avatarUrl?<GroupImage src={person.avatarUrl} locale={locale} alt='' width={40} height={40} className={roomStyles.roomMessageAvatar}/>:<UserRound aria-hidden='true'/>}<span><strong>{person.nickname}</strong>{person.tier&&<span className={styles.meta}>{tierDisplayName(locale,person.tier)} · {roomEntryCopy(locale).verified}</span>}</span><span className={roomStyles.roomProfileAction}>{locale==='ko'?'프로필 보기':t.info}</span></Link>)}</aside>}</div>;
}
function OpenGroupRoomsPanel({pageId,locale,slug,imageUrl,initialRoomId,onJoin,joinPending=false,joinLabel}:{pageId:string;locale:AppLocale;slug?:string|null;imageUrl?:string|null;initialRoomId?:string;onJoin?:()=>void;joinPending?:boolean;joinLabel?:string}) {
 const t=groupsCopy(locale),c=interactionCopy(locale),entry=roomEntryCopy(locale),labels=roomStatusCopy(locale),auth=useGroupRequest(),g=useOptionalGroupPage();
 const rooms=useGroupResource(auth.ready&&auth.authenticated?`/api/groups/${pageId}/rooms`:null,parseRooms),nonMember=auth.ready&&(!auth.authenticated||rooms.failure?.status===403),publicRooms=useGroupResource(nonMember?`/api/groups/${pageId}/public-rooms`:null,parsePublicRooms),[selected,setSelected]=useState<string|undefined>(initialRoomId);
 const homeHref=slug?`/${slug}?locale=${locale}`:`/pages/groups/${pageId}?locale=${locale}`,roomHref=`${homeHref}&tab=rooms`,loginHref=fanLoginHref(locale,roomHref) as string;
 const joinButton=onJoin?<FanAction disabled={joinPending} onClick={onJoin}>{joinLabel??t.join}</FanAction>:<FanAction href={homeHref}>{joinLabel??t.join}</FanAction>;
 const star=g?.star,joinAction=star?<FanStarAction {...star}/>:joinButton;
 const room=rooms.data?.items.find(x=>x.id===selected),accessible=room?.canEnter&&['open','readonly'].includes(room.status),unavailable=room&&['closed','scheduled'].includes(room.status);
 const featured=rooms.data?pickFeaturedRoom(rooms.data.items):undefined;
 const people=useGroupResource(auth.authenticated&&featured?`/api/groups/${pageId}/rooms/${featured.id}/messages?limit=1`:null,parseMessages);
 const selectRoom=(item:ReturnType<typeof parseRooms>["items"][number])=>{setSelected(item.id);if(item.canEnter&&['open','readonly'].includes(item.status))void rooms.request(`/api/groups/${pageId}/rooms/${item.id}/read`,{method:'POST'}).then(rooms.retry).catch(()=>{});};
 if(accessible&&room)return <section className={`${roomStyles.roomsPanel} ${roomStyles.openRoom}`}>
  <header className={roomStyles.roomHeading}><FanAction variant="text" ariaLabel={t.rooms} onClick={()=>setSelected(undefined)} leadingIcon={<ChevronLeft aria-hidden="true"/>}/><h2>{room.name}</h2></header>
  <p className={styles.meta}>{slug&&room.defaultKey!=='free'?`${entry.verified}${room.minimumTier&&room.minimumTier!=='Member'?` · ${entry.minimum.replace('{tier}',tierDisplayName(locale,room.minimumTier))}`:''}`:t.membersOnly}</p>
  <RoomMessages key={`${rooms.ownerKey}:${room.id}`} pageId={pageId} roomId={room.id} locale={locale} readonly={room.status==='readonly'}/>
 </section>;
 const count=nonMember?publicRooms.data?.roomCount:rooms.data?.items.length;
 const canManage=rooms.authenticated&&rooms.data?.canManage===true;
 const heading=<header className={roomStyles.roomHead}><h2><MessagesSquare aria-hidden size={28}/>{t.rooms}{count!==undefined&&<span className={roomStyles.roomCount} aria-hidden='true'>{count.toLocaleString(locale)}</span>}</h2>{canManage&&<FanSectionLink className={roomStyles.createAction} href={`/pages/groups/${pageId}/manage?locale=${locale}&section=rooms`}>{managementCopy(locale).createRoom}</FanSectionLink>}</header>;
 if(nonMember){
  const rowHref=!auth.authenticated?loginHref:star?.href,rowClick=auth.authenticated&&!rowHref?(star?.onClick??onJoin):undefined;
  return <section className={roomStyles.roomsPanel} data-group-room-list>{heading}
   {publicRooms.error?<div className={roomStyles.roomNotice} role='alert'><p>{t.error}</p><FanAction onClick={publicRooms.retry}>{t.retry}</FanAction></div>:publicRooms.loading||!publicRooms.data?<GroupRoomHubSkeleton label={t.loading} featured={false} rows={3}/>:<GroupPublicRoomList rooms={publicRooms.data.items} locale={locale} rowHref={rowHref} onRowClick={rowClick}/>}
   {auth.authenticated&&star?.state==='filled'?null:<div className={roomStyles.roomGate}>{auth.authenticated?joinAction:<FanAction variant='neutral' href={loginHref}>{t.login}</FanAction>}</div>}
  </section>;
 }
 const notice=(body:ReactNode)=><div className={roomStyles.roomNotice} role='alert'>{body}</div>;
 const failureStatus=rooms.failure?.status;
 return <section className={roomStyles.roomsPanel} data-group-room-list>{heading}
  {rooms.error?failureStatus===401?notice(<><LockKeyhole aria-hidden='true'/><p>{t.membersOnly}</p><FanAction href={loginHref}>{t.login}</FanAction></>):failureStatus===404?notice(<><LockKeyhole aria-hidden='true'/><p>{pageUnavailable[locale]}</p><FanAction href={`/pages/groups?locale=${locale}`}>{t.explore}</FanAction></>):notice(<><p>{t.error}</p><FanAction onClick={rooms.retry}>{t.retry}</FanAction></>)
  :rooms.data?.items.length?<GroupRoomHub rooms={rooms.data.items} locale={locale} imageUrl={imageUrl} statusLabels={labels} unreadLabel={c.unread} verifiable={Boolean(slug)} people={people.data?.participants??[]} proofHref={slug?`/c/${encodeURIComponent(slug)}/certifications?locale=${locale}`:undefined} onSelect={selectRoom}/>
  :rooms.data?<><GroupRoomEmpty locale={locale}/>{!canManage&&g&&<div className={roomStyles.roomGate}><FanAction variant='neutral' href={g.hrefFor('board')}>{t.board}</FanAction></div>}</>:<GroupRoomHubSkeleton label={t.loading}/>}
  {room&&<SourceStatePanel sourceId={room.status==='closed'?'rc1U1':!unavailable&&!room.canEnter?'ipmTh':undefined} title={room.status==='closed'&&locale==='ko'?'종료된 비밀방':!unavailable&&!room.canEnter&&locale==='ko'?'멤버 전용 콘텐츠를 볼 수 없어요':unavailable||room.canEnter?labels[room.status as keyof typeof labels]:c.conditions}>{room.status==='scheduled'&&room.opensAt&&<time dateTime={room.opensAt}>{new Date(room.opensAt).toLocaleString(locale,{dateStyle:'medium',timeStyle:'short'})}</time>}{!unavailable&&!room.canEnter&&<><p>{room.minimumTier?`${c.tier} · ${room.minimumTier}`:t.membersOnly}</p>{!rooms.authenticated?<FanAction href={loginHref}>{t.login}</FanAction>:slug&&room.defaultKey!=='free'?<div className={styles.actions}><FanAction href={`/${slug}?locale=${locale}&tab=certifications`}>{c.verify}</FanAction><FanAction href={`/my?locale=${locale}`}>{c.tier}</FanAction></div>:joinAction}</>}</SourceStatePanel>}
 </section>;
}

export function GroupRoomsPanel(props: Parameters<typeof OpenGroupRoomsPanel>[0]) {
 if (SECRET_ROOMS_ENABLED) return <OpenGroupRoomsPanel {...props}/>;
 return <FanSurface className={roomStyles.closedRoom}><LockKeyhole aria-hidden="true" size={32}/><FanHeading>{groupsCopy(props.locale).rooms}</FanHeading><FanText as="p" role="body" id="secret-room-description">{props.locale === "ko" ? "일정 등급 이상만 들어올 수 있는, 최애와 라이브 채팅을 하는 프라이빗 공간이에요." : "A private space for live chats with your favorite artist, available to fans at a certain tier or above."}</FanText><FanAction disabled ariaDescribedBy="secret-room-description">{props.locale === "ko" ? "곧 열려요" : "Coming soon"}</FanAction></FanSurface>;
}

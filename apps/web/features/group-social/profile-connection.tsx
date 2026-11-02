'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { ScanLine, Copy, ChevronLeft, X } from 'lucide-react';
import { AccessibleOverlay } from '@/components/ui/overlay/accessible-overlay';
import { FanAction } from '@/components/fan-ui/fan-action';
import type { AppLocale } from '@/i18n/locales';
import { waveFriendsCopy } from '@/i18n/catalogs/features__fanpage__wave-friends';
import { WaveFriendScanner } from '@/features/fanpage/ui/wave-friend-scanner';
import { useGroupRequest, useGroupResource } from '@/features/groups/ui/use-group-resource';
import { profileConnectionCopy } from './profile-copy';
import { parseSocialProfileLink, parseSocialLinkedProfile, socialFriendToken } from './profile-link';
import styles from './profile-connection.module.css';
export type ProfileConnectionView='profile'|'scan'|'peer';
export function ProfileConnectionPanel({locale,identity,onClose,initialView='profile',initialToken,peerIdentity,onRequestFriend,requestPending=false,onFriendChanged}:{locale:AppLocale;identity:ReactNode;onClose:()=>void;initialView?:ProfileConnectionView;initialToken?:string;peerIdentity?:ReactNode;onRequestFriend?:()=>void;requestPending?:boolean;onFriendChanged?:()=>void}){
 const t=profileConnectionCopy(locale),title=useId(),close=useRef<HTMLButtonElement>(null),auth=useGroupRequest();
 const [view,setView]=useState(initialToken!==undefined?'peer':initialView),[token,setToken]=useState(initialToken);
 return <AccessibleOverlay open onClose={onClose} labelledBy={title} initialFocusRef={close} backdropClassName={styles.backdrop} contentClassName={`${styles.panel} ${view!=='profile'?styles.connect:''}`} contentAs='section'>
 <header className={styles.header}>{view!=='profile'&&<button className={styles.icon} onClick={()=>setView('profile')} aria-label={t.profile}><ChevronLeft size={20}/></button>}{view==='profile'?<div className={styles.identity} id={title}>{identity??t.profile}</div>:<h2 id={title}>{view==='scan'?t.scan:t.peer}</h2>}<button ref={close} className={styles.icon} onClick={onClose} aria-label={t.close}><X size={20}/></button></header>
 {view==='profile'?<><ProfileQr key={auth.ownerKey} locale={locale} scanAction={<FanAction variant="primary" onClick={()=>setView('scan')} trailingIcon={<ScanLine size={20} aria-hidden/>}>{t.scan}</FanAction>}/></>:view==='scan'?<div className={styles.scanner}><WaveFriendScanner locale={locale} decode={socialFriendToken} hint={t.scanHelp} onScan={value=>{setToken(value);setView('peer');}}/><p className={styles.note}>{t.permission}</p></div>:<>{token!==undefined?<LinkedProfile key={`${auth.ownerKey}:${token}`} locale={locale} token={token} onFriendChanged={onFriendChanged}/>:<><div className={styles.peer}>{peerIdentity}</div><h3>{t.confirm}</h3><FanAction variant='primary' disabled={!onRequestFriend||requestPending} onClick={onRequestFriend}>{waveFriendsCopy(locale).requestFriend}</FanAction></>}<FanAction variant="primary" onClick={()=>setView('scan')}>{t.again}</FanAction><p className={styles.note}>{t.acceptance}</p></>}
 </AccessibleOverlay>;
}
function ProfileQr({locale,scanAction}:{locale:AppLocale;scanAction:ReactNode}){
 const t=profileConnectionCopy(locale),c=waveFriendsCopy(locale),r=useGroupResource('/api/me/social/profile-link',parseSocialProfileLink),canvas=useRef<HTMLCanvasElement>(null);
 const [drawn,setDrawn]=useState(false),[failed,setFailed]=useState(false),[copied,setCopied]=useState(false),[expired,setExpired]=useState(false),[drawAttempt,setDrawAttempt]=useState(0);
 const token=r.data?.token,expiresAt=r.data?.expiresAt,href=token?`${location.origin}/my/friends?locale=${locale}&friend=${token}`:'';
 useEffect(()=>{
  setExpired(false);if(!expiresAt)return;const remaining=Date.parse(expiresAt)-Date.now();if(remaining<=0){setExpired(true);return;}const timeout=setTimeout(()=>setExpired(true),remaining);return()=>clearTimeout(timeout);
 },[expiresAt]);
 useEffect(()=>{
  let disposed=false;setDrawn(false);setFailed(false);setCopied(false);
  if(href&&canvas.current)void import('qrcode').then(({toCanvas})=>{if(!disposed&&canvas.current)return toCanvas(canvas.current,href,{width:256,margin:4,errorCorrectionLevel:'M'});}).then(()=>{if(!disposed)setDrawn(true);}).catch(()=>{if(!disposed)setFailed(true);});return()=>{disposed=true;};
 },[href,drawAttempt]);
 const retry=()=>{setFailed(false);setDrawn(false);setCopied(false);setDrawAttempt(value=>value+1);r.retry();};
 return <><section className={styles.qr}><strong>{t.qr}</strong><canvas ref={canvas} role='img' aria-label={t.qr} hidden={!drawn||expired}/>{!r.error&&!failed&&!expired&&!drawn&&<p role='status'>{c.loading}</p>}{(r.error||failed||expired)&&<div role='alert'><p>{expired?c.invalidQr:c.error}</p><FanAction onClick={retry}>{c.retry}</FanAction></div>}{drawn&&!expired&&<small>{c.qrExpiry}</small>}<FanAction disabled={!drawn||r.error||failed||expired} trailingIcon={<Copy size={20} aria-hidden/>} onClick={()=>{void Promise.resolve().then(()=>navigator.clipboard.writeText(href)).then(()=>setCopied(true)).catch(()=>setFailed(true));}}>{copied?c.copied:t.copy}</FanAction></section><section className={styles.friendConnection}><h3>{t.addFriend}</h3><p className={styles.note}>{t.help}</p>{scanAction}</section></>;
}
function LinkedProfile({locale,token,onFriendChanged}:{locale:AppLocale;token:string;onFriendChanged?:()=>void}){
 const t=profileConnectionCopy(locale),c=waveFriendsCopy(locale),valid=z.uuid().safeParse(token).success,r=useGroupResource(valid?`/api/me/social/profile-links/${token}?locale=${locale==='ko'?'ko':'en'}`:null,parseSocialLinkedProfile),[pending,setPending]=useState(false),[failed,setFailed]=useState(false),[sent,setSent]=useState(false),attempt=useRef<string|null>(null),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 async function requestFriend(){if(pending||sent||!r.data||r.data.isSelf)return;const incoming=r.data.relationship.status==='incoming'&&Boolean(r.data.relationship.friendshipId);if(!incoming&&(!r.data.capabilities.canRequestFriend||r.data.relationship.status!=='none'))return;attempt.current??=crypto.randomUUID();setPending(true);setFailed(false);try{await r.request(incoming?`/api/me/social/friends/${r.data.relationship.friendshipId}`:'/api/me/social/friends',{method:incoming?'PATCH':'POST',body:JSON.stringify({...incoming?{action:'accept'}:{profileId:r.data.profile.id},requestId:attempt.current})});if(active.current){setSent(true);onFriendChanged?.();}}catch{if(active.current)setFailed(true);}finally{if(active.current)setPending(false);}}
 if(!valid||r.error)return <div role='alert'><p>{c.invalidQr}</p>{valid&&<FanAction onClick={r.retry}>{c.retry}</FanAction>}</div>;
 if(!r.data)return <p role='status'>{c.loading}</p>;
 const d=r.data;
 return <><div className={styles.peer}><img src={d.profile.avatarUrl} alt='' width={72} height={72}/><strong>{d.profile.nickname}</strong></div><h3>{t.confirm}</h3>{failed&&<p role='alert'>{c.error}</p>}{d.isSelf?<p role='status'>{c.selfQr}</p>:sent?<p role='status'>{d.relationship.status==='incoming'?c.alreadyFriends:c.requested}</p>:d.relationship.status==='outgoing'?<p role='status'>{c.requested}</p>:d.relationship.status==='friends'?<p role='status'>{c.alreadyFriends}</p>:d.relationship.status==='incoming'?<FanAction variant='primary' disabled={pending||!d.relationship.friendshipId} onClick={()=>void requestFriend()}>{c.accept}</FanAction>:d.capabilities.canRequestFriend?<FanAction variant='primary' disabled={pending} onClick={()=>void requestFriend()}>{c.requestFriend}</FanAction>:<p role='status'>{c.unavailable}</p>}</>;
}

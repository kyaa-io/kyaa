"use client";
import {useEffect,useId,useRef,useState} from 'react';
import {useGroupRequest} from './use-group-resource';
import {ArrowRight,X} from 'lucide-react';
import {AccessibleOverlay} from '@/components/ui/overlay/accessible-overlay';
import {FanAction} from '@/components/fan-ui/fan-action';
import {FanHeading} from '@/components/fan-ui/fan-heading';
import {cheerEventCopy} from '@/features/fanpage/domain/cheer-event-copy';
import type {AppLocale} from '@/i18n/locales';
import styles from './page-notice-modal.module.css';

const STORAGE_PREFIX='kyaa:page-notice:';
function remembered(key:string){try{return window.localStorage.getItem(STORAGE_PREFIX+key)==='seen';}catch{return false;}}
function remember(key:string){try{window.localStorage.setItem(STORAGE_PREFIX+key,'seen');}catch{/* Closing still works without storage. */}}

/** Closing by any route remembers this round; signed-in readers also sync with the server. */
export function PageNoticeModal({locale,storageKey,title,description,actionLabel,actionHref,enabled=true}:{locale:AppLocale;storageKey:string;title:string;description?:string;actionLabel:string;actionHref:string;enabled?:boolean}){
 const {request,authenticated,ready,ownerKey}=useGroupRequest();
 const key=`${ownerKey.split(':')[0]}:${storageKey}`,url=`/api/me/page-notices?key=${encodeURIComponent(storageKey)}`;
 const [open,setOpen]=useState(false),shown=useRef<string|null>(null),titleId=useId(),copy=cheerEventCopy(locale,false);
 const [verified,setVerified]=useState<string|null>(null);
 useEffect(()=>{
  if(!ready||!enabled)return;
  let active=true;
  setOpen(false);
  if(!authenticated){setVerified(key);return;}
  const sync=async()=>{
   try{
    if(remembered(key)){await request(url,{method:'POST'});}
    else {const value=await request(url) as {seen:boolean};if(value.seen)remember(key);}
   }catch{/* Local history remains usable when the server is unavailable. */}
   if(active)setVerified(key);
  };
  void sync();return()=>{active=false;};
 },[ready,enabled,authenticated,key,url,request]);
 useEffect(()=>{
  if(!enabled||!ready||verified!==key||shown.current===key)return;
  const check=()=>{
   if(shown.current===key||remembered(key)||document.visibilityState==='hidden')return;
   if(document.querySelector('[role="dialog"], [role="alertdialog"], [data-overlay-host]')||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'))return;
   shown.current=key;setOpen(true);
  };
  check();
  const observer=new MutationObserver(check);
  observer.observe(document.body,{childList:true,subtree:true});
  const interval=window.setInterval(check,30_000);
  return()=>{observer.disconnect();window.clearInterval(interval);};
 },[enabled,ready,verified,key]);
 const close=()=>{remember(key);setOpen(false);if(authenticated)void request(url,{method:'POST'}).catch(()=>undefined);};
 if(!enabled)return null;
 return <AccessibleOverlay open={open&&verified===key} onClose={close} labelledBy={titleId} backdropClassName={styles.backdrop} contentClassName={styles.modal}>
  <header className={styles.header}><FanHeading id={titleId}>{title}</FanHeading><span className={styles.closeSlot}><FanAction variant='text' className={styles.close} onClick={close} ariaLabel={copy.close} leadingIcon={<X size={20} aria-hidden='true'/>}/></span></header>
  {description&&<p className={styles.description}>{description}</p>}
  <FanAction variant='primary' href={actionHref} onClick={close} trailingIcon={<ArrowRight/>}>{actionLabel}</FanAction>
 </AccessibleOverlay>;
}

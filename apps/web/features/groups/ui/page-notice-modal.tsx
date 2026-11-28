"use client";
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {useGroupRequest} from './use-group-resource';
import {ArrowRight,X} from '@/components/fan-ui/fan-icons';
import {AccessibleOverlay} from '@/components/ui/overlay/accessible-overlay';
import {FanAction} from '@/components/fan-ui/fan-action';
import {FanIcon} from '@/components/fan-ui/fan-icon';
import {FanIconButton} from '@/components/fan-ui/fan-icon-button';
import {FanHeading} from '@/components/fan-ui/fan-heading';
import {cheerEventCopy} from '@/features/fanpage/domain/cheer-event-copy';
import type {AppLocale} from '@/i18n/locales';
import styles from './page-notice-modal.module.css';

const STORAGE_PREFIX='kyaa:page-notice:';
function remembered(key:string){try{return window.localStorage.getItem(STORAGE_PREFIX+key)==='seen';}catch{return false;}}
function remember(key:string){try{window.localStorage.setItem(STORAGE_PREFIX+key,'seen');}catch{/* Closing still works without storage. */}}

export function pageNoticeBlocked(){return document.querySelector('[role="dialog"], [role="alertdialog"], [data-overlay-host], [data-analytics-consent-bar]')||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');}

/** Closing by any route remembers this round; signed-in readers also sync with the server. */
export function PageNoticeModal({locale,storageKey,title,description,actionLabel,actionHref,enabled=true}:{locale:AppLocale;storageKey:string;title:string;description?:string;actionLabel:string;actionHref:string;enabled?:boolean}){
 const {request,authenticated,ready,ownerKey}=useGroupRequest();
 const key=`${ownerKey.split(':')[0]}:${storageKey}`,url=`/api/me/page-notices?key=${encodeURIComponent(storageKey)}`;
 const [open,setOpen]=useState(false),shown=useRef<string|null>(null);
 const [closedKey,setClosedKey]=useState<string|null>(null);
 const [verified,setVerified]=useState<string|null>(null);
 const dismissed=closedKey===key||(verified===key&&!open&&remembered(key));
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
   if(pageNoticeBlocked())return;
   shown.current=key;setOpen(true);
  };
  check();
  const observer=new MutationObserver(check);
  observer.observe(document.body,{childList:true,subtree:true});
  const interval=window.setInterval(check,30_000);
  return()=>{observer.disconnect();window.clearInterval(interval);};
 },[enabled,ready,verified,key]);
 const close=()=>{remember(key);setClosedKey(key);setOpen(false);if(authenticated)void request(url,{method:'POST'}).catch(()=>undefined);};
 if(!enabled)return null;
 return <>
  {!dismissed && <span hidden data-page-notice-priority="" />}
  <PageNoticeDialog open={open&&verified===key} onClose={close} locale={locale} title={title}
    description={description} actionLabel={actionLabel} actionHref={actionHref}/>
 </>;
}

export function PageNoticeDialog({open,onClose,locale,title,description,actionLabel,actionHref,children,secondary}:{
 open:boolean;onClose:()=>void;locale:AppLocale;title:string;description?:string;
 actionLabel:string;actionHref:string;children?:ReactNode;secondary?:ReactNode;
}){
 const titleId=useId(),copy=cheerEventCopy(locale,false);
 return <AccessibleOverlay open={open} trackHistory={!secondary} onClose={onClose} labelledBy={titleId} backdropClassName={styles.backdrop} contentClassName={secondary ? `${styles.modal} ${styles.eventModal}` : styles.modal}>
  <header className={styles.header}><FanHeading id={titleId}>{title}</FanHeading><FanIconButton className={styles.close} onClick={onClose} aria-label={copy.close}><FanIcon icon={X} size={20}/></FanIconButton></header>
  {children}
  {description&&<p className={styles.description}>{description}</p>}
  <FanAction variant='primary' href={actionHref} onClick={onClose} trailingIcon={secondary ? undefined : <ArrowRight/>}>{actionLabel}</FanAction>
  {secondary}
 </AccessibleOverlay>;
}

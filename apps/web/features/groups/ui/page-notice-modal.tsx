"use client";
import {useEffect,useId,useRef,useState} from 'react';
import {ArrowRight} from 'lucide-react';
import {AccessibleOverlay} from '@/components/ui/overlay/accessible-overlay';
import {FanAction} from '@/components/fan-ui/fan-action';
import {FanHeading} from '@/components/fan-ui/fan-heading';
import {cheerEventCopy} from '@/features/fanpage/domain/cheer-event-copy';
import type {AppLocale} from '@/i18n/locales';
import styles from './page-notice-modal.module.css';

const STORAGE_PREFIX='kyaa:page-notice:';
const today=()=>{const now=new Date(),pad=(value:number)=>String(value).padStart(2,'0');return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;};
function hiddenToday(key:string){try{return window.localStorage.getItem(STORAGE_PREFIX+key)===today();}catch{return false;}}
function hideToday(key:string){try{window.localStorage.setItem(STORAGE_PREFIX+key,today());}catch{/* 저장이 막혀도 닫기와 이동은 된다. */}}

/**
 * 페이지에 알릴 일을 띠 배너 대신 모달로 한 번 보여 준다. 같은 내용은 그 페이지 게시판 공지에도 있다.
 * `오늘 다시 열지 않기`를 고르고 닫으면 같은 알림(key)은 오늘 다시 열리지 않고, 내일 다시 열린다.
 * 다른 대화상자가 열려 있거나 입력 중이면 열지 않는다. 저장소를 못 쓰면 이 화면에서만 한 번 연다.
 */
export function PageNoticeModal({locale,storageKey,title,description,actionLabel,actionHref,enabled=true}:{locale:AppLocale;storageKey:string;title:string;description?:string;actionLabel:string;actionHref:string;enabled?:boolean}){
 const [open,setOpen]=useState(false),[checked,setChecked]=useState(false),shown=useRef<string|null>(null),titleId=useId(),copy=cheerEventCopy(locale,false);
 useEffect(()=>{
  if(!enabled||shown.current===storageKey)return;
  const check=()=>{
   if(shown.current===storageKey||hiddenToday(storageKey)||document.visibilityState==='hidden')return;
   if(document.querySelector('[role="dialog"], [role="alertdialog"], [data-overlay-host]')||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'))return;
   shown.current=storageKey;setChecked(false);setOpen(true);
  };
  check();
  const observer=new MutationObserver(check);
  observer.observe(document.body,{childList:true,subtree:true});
  const interval=window.setInterval(check,30_000);
  return()=>{observer.disconnect();window.clearInterval(interval);};
 },[enabled,storageKey]);
 const close=()=>{if(checked)hideToday(storageKey);setOpen(false);};
 if(!enabled)return null;
 return <AccessibleOverlay open={open} onClose={close} labelledBy={titleId} backdropClassName={styles.backdrop} contentClassName={styles.modal}>
  <header className={styles.header}><FanHeading id={titleId}>{title}</FanHeading></header>
  {description&&<p className={styles.description}>{description}</p>}
  <FanAction variant='primary' href={actionHref} onClick={close} trailingIcon={<ArrowRight/>}>{actionLabel}</FanAction>
  <footer className={styles.footer}><label><input type='checkbox' checked={checked} onChange={event=>setChecked(event.target.checked)}/>{copy.hideToday}</label><FanAction variant='neutral' onClick={close}>{copy.close}</FanAction></footer>
 </AccessibleOverlay>;
}

"use client";
import { useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore } from 'react';
import { z } from 'zod';
import { CalendarDays, MoreHorizontal,Bell,Radio,Settings,LogOut,KeyRound } from 'lucide-react';
import type { AppLocale } from '@/i18n/locales';
import type { GroupDetail } from '../domain/contracts';
import { FanAction } from '@/components/fan-ui/fan-action';
import { useGroupResource } from './use-group-resource';
import { groupsCopy } from './copy';
import { managementCopy } from './management-copy';
import { interactionCopy } from './interaction-copy';
import styles from './groups.module.css';
import menuStyles from './group-page-menu.module.css';
import {rememberOverlayTrigger} from '@/components/ui/overlay/focus-return';
import {ArtistPresenceDialog} from './artist-presence-dialog';
import {presenceCopy} from './presence-copy';
import {SourceConfirmDialog} from './source-confirm-dialog';
import {FanSkeleton} from '@/components/fan-ui/fan-skeleton';
import {GroupNotificationSettingsDialog,groupNotificationSettingsSchema,type GroupNotificationCategories,type GroupNotificationSettings} from './group-notification-settings';
import {groupNotificationSettingsCopy} from './group-notification-settings-copy';
const parse=(v:unknown)=>groupNotificationSettingsSchema.parse(v);
const parsePresence=(v:unknown)=>z.object({enabled:z.boolean(),canConfigure:z.boolean()}).parse(v);
const compactHeaderQuery='(max-width:1023px)';
const subscribeCompactHeader=(notify:()=>void)=>{if(typeof window.matchMedia!=='function')return()=>{};const m=window.matchMedia(compactHeaderQuery);m.addEventListener('change',notify);return()=>m.removeEventListener('change',notify);};
const getCompactHeader=()=>typeof window.matchMedia==='function'&&window.matchMedia(compactHeaderQuery).matches;
export const useCompactHeader=()=>useSyncExternalStore(subscribeCompactHeader,getCompactHeader,()=>false);
/** 역할별 ⋯ 메뉴. 가입하지 않았거나 로그인하지 않았으면 남는 항목이 없어 버튼을 그리지 않는다. SNS는 머리에 있고 `socialLinks`는 더 쓰지 않는다. */
export function GroupPageMenu({detail,locale,refresh}:{detail:GroupDetail;locale:AppLocale;refresh:()=>void;socialLinks?:ReadonlyArray<{platform:string;url:string}>}){
 const t=groupsCopy(locale),m=managementCopy(locale),c=interactionCopy(locale),base=`/api/groups/${detail.page.id}`,r=useGroupResource(detail.membership?`${base}/notifications`:null,parse),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),panel=useRef<HTMLDetailsElement>(null),summary=useRef<HTMLElement>(null);
 const [leaveOpen,setLeaveOpen]=useState(false);
 const notificationsScope=detail.membership?`${r.ownerKey}:${detail.page.id}`:null,notificationIdentity=useRef(notificationsScope);
 const [notificationsOpen,setNotificationsOpen]=useState<{scope:string;settings:GroupNotificationSettings}|null>(null),[notificationsSaved,setNotificationsSaved]=useState<string|null>(null),[notificationsBusy,setNotificationsBusy]=useState(false),[notificationsFailed,setNotificationsFailed]=useState(false);
 useEffect(()=>{const close=(event:PointerEvent)=>{const el=panel.current;if(el?.open&&event.target instanceof Node&&!el.contains(event.target))el.open=false;};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
 useLayoutEffect(()=>{notificationIdentity.current=notificationsScope;},[notificationsScope]);
 useEffect(()=>{setNotificationsOpen(null);setNotificationsSaved(null);setNotificationsBusy(false);setNotificationsFailed(false);},[notificationsScope]);
 const closeNotifications=()=>{if(notificationsBusy)return;setNotificationsOpen(null);setNotificationsSaved(null);};
 async function saveNotifications(categories:GroupNotificationCategories){if(notificationsBusy||!notificationsScope)return;const scope=notificationsScope;setNotificationsBusy(true);setNotificationsFailed(false);setNotificationsSaved(null);try{await r.request(base+'/notifications',{method:'PUT',body:JSON.stringify(categories)});if(notificationIdentity.current!==scope)return;r.retry();setNotificationsSaved(scope);}catch{if(notificationIdentity.current===scope)setNotificationsFailed(true);}finally{if(notificationIdentity.current===scope)setNotificationsBusy(false);}}
 const presence=useGroupResource(detail.membership?'/api/groups/me/presence':null,parsePresence),[presenceOpen,setPresenceOpen]=useState(false),[presenceBusy,setPresenceBusy]=useState(false),[presenceFailed,setPresenceFailed]=useState(false);
 async function savePresence(enabled:boolean){if(presenceBusy||!presence.data?.canConfigure)return;setPresenceBusy(true);setPresenceFailed(false);try{await presence.request('/api/groups/me/presence',{method:'PUT',body:JSON.stringify({enabled})});presence.retry();setPresenceOpen(false);}catch{setPresenceFailed(true);}finally{setPresenceBusy(false);}}
 async function mutate(path:string,method:string,input?:unknown){if(busy)return;setBusy(true);setFailed(false);try{await r.request(base+path,{method,...(input?{body:JSON.stringify(input)}:{})});r.retry();refresh();setLeaveOpen(false);}catch{setFailed(true);}finally{setBusy(false);}}
 if(!detail.membership)return null;
 const closePanel=()=>{if(panel.current)panel.current.open=false;};
 const manage=`/pages/groups/${detail.page.id}/manage?locale=${locale}`;
 return <>{leaveOpen&&<SourceConfirmDialog compact sourceId='N9TgPu' title={m.leave} cancelLabel={t.cancel} confirmLabel={m.leave} closeLabel={t.cancel} danger pending={busy} onClose={()=>setLeaveOpen(false)} onConfirm={()=>void mutate('/membership','DELETE')}><strong>{detail.page.name}</strong><p>{locale==='ko'?'모임을 나가면 멤버용 글과 활동을 이용할 수 없어요.':c.leave}</p>{failed&&<p role='alert'>{t.error}</p>}</SourceConfirmDialog>}<details ref={panel} className={styles.pageMenu} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();closePanel();summary.current?.focus();}}}><summary ref={summary} className={styles.chip} aria-label={c.menu}><MoreHorizontal aria-hidden='true' size={20}/></summary><div className={menuStyles.panel}>
  <div className={menuStyles.group}>
   {r.data?<FanAction variant='text' fullWidth className={menuStyles.row} leadingIcon={<Bell/>} onClick={()=>{closePanel();summary.current?.focus();setNotificationsFailed(false);setNotificationsSaved(null);setNotificationsOpen(notificationsScope&&r.data?{scope:notificationsScope,settings:r.data}:null);}}>{groupNotificationSettingsCopy(locale).title}</FanAction>:r.error?<FanAction variant='text' fullWidth className={menuStyles.row} leadingIcon={<Bell/>} onClick={r.retry}>{t.retry}</FanAction>:<div className={menuStyles.skeleton}><FanSkeleton width='100%' height={20}/></div>}
   {presence.data?.canConfigure&&<FanAction variant='text' fullWidth className={menuStyles.row} leadingIcon={<Radio/>} onClick={()=>{if(summary.current)rememberOverlayTrigger(summary.current);closePanel();setPresenceFailed(false);setPresenceOpen(true);}}>{locale==='ko'?'접속 상태 공개':presenceCopy(locale).setting}</FanAction>}
  </div>
  {detail.membership.role!=='member'&&<div className={menuStyles.group}>
   <FanAction variant='text' fullWidth className={menuStyles.row} leadingIcon={<CalendarDays/>} href={`${manage}&section=events#group-event-list`}>{t.events}</FanAction>
   <FanAction variant='text' fullWidth className={menuStyles.row} leadingIcon={<Settings/>} href={manage}>{m.manage}</FanAction>
  </div>}
  <div className={menuStyles.group}>
   {detail.membership.role==='owner'?<FanAction variant='text' fullWidth className={menuStyles.row} leadingIcon={<KeyRound/>} href={`${manage}&section=settings`}>{m.transfer}</FanAction>:<FanAction variant='text' fullWidth className={menuStyles.row} leadingIcon={<LogOut/>} disabled={busy} onClick={()=>{closePanel();setLeaveOpen(true);}}>{m.leave}</FanAction>}
  </div>
  {failed&&<p role='alert' className={menuStyles.error}>{t.error}</p>}
 </div></details>{notificationsOpen!==null&&notificationsOpen.scope===notificationsScope&&<GroupNotificationSettingsDialog key={notificationsScope} locale={locale} pageName={detail.page.name} settings={notificationsOpen.settings} pending={notificationsBusy} failed={notificationsFailed} saved={notificationsSaved===notificationsScope} onChange={()=>setNotificationsSaved(null)} onClose={closeNotifications} onSave={draft=>void saveNotifications(draft)}/>}{presenceOpen&&presence.data?.canConfigure&&<ArtistPresenceDialog locale={locale} enabled={presence.data.enabled} pending={presenceBusy} failed={presenceFailed} onClose={()=>setPresenceOpen(false)} onSave={enabled=>void savePresence(enabled)}/>}</>;
}

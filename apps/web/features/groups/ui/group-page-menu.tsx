"use client";
import { useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore } from 'react';
import { z } from 'zod';
import { CalendarDays, MoreHorizontal,Bell,Radio,Settings,LogOut,KeyRound } from 'lucide-react';
import type { AppLocale } from '@/i18n/locales';
import type { GroupDetail } from '../domain/contracts';
import { FanMenu } from '@/components/fan-ui/fan-menu';
import { FanIconButton } from '@/components/fan-ui/fan-icon-button';
import { useOptionalGroupPage } from './group-page-context';
import { useGroupResource } from './use-group-resource';
import { groupsCopy } from './copy';
import { managementCopy } from './management-copy';
import { interactionCopy } from './interaction-copy';
import styles from './groups.module.css';
import {rememberOverlayTrigger} from '@/components/ui/overlay/focus-return';
import {ArtistPresenceDialog} from './artist-presence-dialog';
import {presenceCopy} from './presence-copy';
import {SourceConfirmDialog} from './source-confirm-dialog';
import {GroupNotificationSettingsDialog,groupNotificationSettingsSchema,type GroupNotificationCategories,type GroupNotificationSettings} from './group-notification-settings';
import {groupNotificationSettingsCopy} from './group-notification-settings-copy';
const parse=(v:unknown)=>groupNotificationSettingsSchema.parse(v);
const parsePresence=(v:unknown)=>z.object({enabled:z.boolean(),canConfigure:z.boolean()}).parse(v);
const compactHeaderQuery='(max-width:1023px)';
const subscribeCompactHeader=(notify:()=>void)=>{if(typeof window.matchMedia!=='function')return()=>{};const m=window.matchMedia(compactHeaderQuery);m.addEventListener('change',notify);return()=>m.removeEventListener('change',notify);};
const getCompactHeader=()=>typeof window.matchMedia==='function'&&window.matchMedia(compactHeaderQuery).matches;
export const useCompactHeader=()=>useSyncExternalStore(subscribeCompactHeader,getCompactHeader,()=>false);
/** 역할별 ⋯ 메뉴. 가입하지 않았거나 로그인하지 않았으면 남는 항목이 없어 버튼을 그리지 않는다. SNS는 머리에 있다. */
export function GroupPageMenu({detail,locale,refresh}:{detail:GroupDetail;locale:AppLocale;refresh:()=>void}){
 const t=groupsCopy(locale),m=managementCopy(locale),c=interactionCopy(locale),base=`/api/groups/${detail.page.id}`,r=useGroupResource(detail.membership?`${base}/notifications`:null,parse),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),trigger=useRef<HTMLButtonElement>(null);
 const [leaveOpen,setLeaveOpen]=useState(false);
 const notificationsScope=detail.membership?`${r.ownerKey}:${detail.page.id}`:null,notificationIdentity=useRef(notificationsScope);
 const [notificationsOpen,setNotificationsOpen]=useState<{scope:string;settings:GroupNotificationSettings}|null>(null),[notificationsSaved,setNotificationsSaved]=useState<string|null>(null),[notificationsBusy,setNotificationsBusy]=useState(false),[notificationsFailed,setNotificationsFailed]=useState(false);
 useLayoutEffect(()=>{notificationIdentity.current=notificationsScope;},[notificationsScope]);
 useEffect(()=>{setNotificationsOpen(null);setNotificationsSaved(null);setNotificationsBusy(false);setNotificationsFailed(false);},[notificationsScope]);
 const closeNotifications=()=>{if(notificationsBusy)return;setNotificationsOpen(null);setNotificationsSaved(null);};
 async function saveNotifications(categories:GroupNotificationCategories){if(notificationsBusy||!notificationsScope)return;const scope=notificationsScope;setNotificationsBusy(true);setNotificationsFailed(false);setNotificationsSaved(null);try{await r.request(base+'/notifications',{method:'PUT',body:JSON.stringify(categories)});if(notificationIdentity.current!==scope)return;r.retry();setNotificationsSaved(scope);}catch{if(notificationIdentity.current===scope)setNotificationsFailed(true);}finally{if(notificationIdentity.current===scope)setNotificationsBusy(false);}}
 const presence=useGroupResource(detail.membership?'/api/groups/me/presence':null,parsePresence),[presenceOpen,setPresenceOpen]=useState(false),[presenceBusy,setPresenceBusy]=useState(false),[presenceFailed,setPresenceFailed]=useState(false);
 async function savePresence(enabled:boolean){if(presenceBusy||!presence.data?.canConfigure)return;setPresenceBusy(true);setPresenceFailed(false);try{await presence.request('/api/groups/me/presence',{method:'PUT',body:JSON.stringify({enabled})});presence.retry();setPresenceOpen(false);}catch{setPresenceFailed(true);}finally{setPresenceBusy(false);}}
 async function mutate(path:string,method:string,input?:unknown){if(busy)return;setBusy(true);setFailed(false);try{await r.request(base+path,{method,...(input?{body:JSON.stringify(input)}:{})});r.retry();refresh();setLeaveOpen(false);}catch{setFailed(true);}finally{setBusy(false);}}
 const star=useOptionalGroupPage()?.star;
 if(!detail.membership)return null;
 const passportHolder=detail.page.kind==='fan'&&star?.state==='filled';
 const manage=`/pages/groups/${detail.page.id}/manage?locale=${locale}`;
 return <>{leaveOpen&&<SourceConfirmDialog compact sourceId='N9TgPu' title={m.leave} cancelLabel={t.cancel} confirmLabel={m.leave} closeLabel={t.cancel} danger pending={busy} onClose={()=>setLeaveOpen(false)} onConfirm={()=>void mutate('/membership','DELETE')}><strong>{detail.page.name}</strong><p>{locale==='ko'?'모임을 나가면 멤버용 글과 활동을 이용할 수 없어요.':c.leave}</p>{failed&&<p role='alert'>{t.error}</p>}</SourceConfirmDialog>}<FanMenu label={c.menu} align='end' trigger={<FanIconButton ref={trigger} className={`${styles.chip} ${styles.pageMenu}`} aria-label={c.menu}><MoreHorizontal aria-hidden='true' size={20}/></FanIconButton>}>
  {r.data?<FanMenu.Item icon={<Bell/>} onSelect={()=>{if(trigger.current)rememberOverlayTrigger(trigger.current);setNotificationsFailed(false);setNotificationsSaved(null);setNotificationsOpen(notificationsScope&&r.data?{scope:notificationsScope,settings:r.data}:null);}}>{groupNotificationSettingsCopy(locale).title}</FanMenu.Item>:r.error?<FanMenu.Item icon={<Bell/>} onSelect={r.retry}>{t.retry}</FanMenu.Item>:<FanMenu.Item icon={<Bell/>} disabled>{groupNotificationSettingsCopy(locale).title}</FanMenu.Item>}
  {presence.data?.canConfigure&&<FanMenu.Item icon={<Radio/>} onSelect={()=>{if(trigger.current)rememberOverlayTrigger(trigger.current);setPresenceFailed(false);setPresenceOpen(true);}}>{locale==='ko'?'접속 상태 공개':presenceCopy(locale).setting}</FanMenu.Item>}
  {detail.membership.role!=='member'&&<><FanMenu.Separator/>
   <FanMenu.Item icon={<CalendarDays/>} href={`${manage}&section=events#group-event-list`}>{t.events}</FanMenu.Item>
   <FanMenu.Item icon={<Settings/>} href={manage}>{m.manage}</FanMenu.Item>
  </>}
  {passportHolder&&detail.membership.role==='member'?null:<><FanMenu.Separator/>{detail.membership.role==='owner'?<FanMenu.Item icon={<KeyRound/>} href={`${manage}&section=settings`}>{m.transfer}</FanMenu.Item>:<FanMenu.Item icon={<LogOut/>} destructive disabled={busy} onSelect={()=>{if(trigger.current)rememberOverlayTrigger(trigger.current);setLeaveOpen(true);}}>{m.leave}</FanMenu.Item>}</>}
 </FanMenu>{notificationsOpen!==null&&notificationsOpen.scope===notificationsScope&&<GroupNotificationSettingsDialog key={notificationsScope} locale={locale} pageName={detail.page.name} settings={notificationsOpen.settings} pending={notificationsBusy} failed={notificationsFailed} saved={notificationsSaved===notificationsScope} onChange={()=>setNotificationsSaved(null)} onClose={closeNotifications} onSave={draft=>void saveNotifications(draft)}/>}{presenceOpen&&presence.data?.canConfigure&&<ArtistPresenceDialog locale={locale} enabled={presence.data.enabled} pending={presenceBusy} failed={presenceFailed} onClose={()=>setPresenceOpen(false)} onSave={enabled=>void savePresence(enabled)}/>}</>;
}

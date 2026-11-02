"use client";
import { useRef,useState } from 'react';
import { z } from 'zod';
import { MoreHorizontal,Info,Bell,Settings,LogOut } from 'lucide-react';
import { FanAction } from '@/components/fan-ui/fan-action';
import type { AppLocale } from '@/i18n/locales';
import type { GroupDetail } from '../domain/contracts';
import { useGroupResource } from './use-group-resource';
import { groupsCopy } from './copy';
import { managementCopy } from './management-copy';
import { interactionCopy } from './interaction-copy';
import styles from './groups.module.css';
import {rememberOverlayTrigger} from '@/components/ui/overlay/focus-return';
import {ArtistPresenceDialog} from './artist-presence-dialog';
import {presenceCopy} from './presence-copy';
import {GroupBookmarkAction} from './group-bookmark-action';
const parse=(v:unknown)=>z.object({enabled:z.boolean()}).parse(v);
const parsePresence=(v:unknown)=>z.object({enabled:z.boolean(),canConfigure:z.boolean()}).parse(v);
export function GroupPageMenu({detail,locale,refresh,socialLinks=[]}:{detail:GroupDetail;locale:AppLocale;refresh:()=>void;socialLinks?:ReadonlyArray<{platform:string;url:string}>}){
 const t=groupsCopy(locale),m=managementCopy(locale),c=interactionCopy(locale),base=`/api/groups/${detail.page.id}`,r=useGroupResource(detail.membership?`${base}/notifications`:null,parse),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),panel=useRef<HTMLDetailsElement>(null),summary=useRef<HTMLElement>(null);
 const presence=useGroupResource(detail.membership?'/api/groups/me/presence':null,parsePresence),[presenceOpen,setPresenceOpen]=useState(false),[presenceBusy,setPresenceBusy]=useState(false),[presenceFailed,setPresenceFailed]=useState(false);
 async function savePresence(enabled:boolean){if(presenceBusy||!presence.data?.canConfigure)return;setPresenceBusy(true);setPresenceFailed(false);try{await presence.request('/api/groups/me/presence',{method:'PUT',body:JSON.stringify({enabled})});presence.retry();setPresenceOpen(false);}catch{setPresenceFailed(true);}finally{setPresenceBusy(false);}}
 async function mutate(path:string,method:string,input?:unknown){if(busy)return;setBusy(true);setFailed(false);try{await r.request(base+path,{method,...(input?{body:JSON.stringify(input)}:{})});r.retry();refresh();}catch{setFailed(true);}finally{setBusy(false);}}
 return <><details ref={panel} className={styles.pageMenu} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();if(panel.current)panel.current.open=false;summary.current?.focus();}}}><summary ref={summary} className={styles.chip} aria-label={c.menu}><MoreHorizontal aria-hidden='true' size={20}/></summary><div className={styles.menuPanel}><GroupBookmarkAction detail={detail} locale={locale} refresh={refresh} disabled={busy}/><FanAction href={`/pages/groups/${detail.page.id}?locale=${locale}&tab=info`} leadingIcon={<Info/>}>{t.info}</FanAction>{socialLinks.length>0&&<nav className={styles.menuSocials} aria-label={detail.page.name}>{socialLinks.map(social=><a key={social.platform} href={social.url} target='_blank' rel='noopener noreferrer' aria-label={social.platform} data-outbound-kind='social'><img src={social.platform==='chzzk'?'/images/guest-home/chzzk.png':`/images/guest-home/${social.platform}.svg`} width={20} height={20} alt=''/></a>)}</nav>}{detail.membership&&<><section><h3><Bell size={18} aria-hidden='true'/> {c.notifications}</h3>{r.data?<label><input type='checkbox' checked={r.data.enabled} disabled={busy} onChange={e=>void mutate('/notifications','PUT',{enabled:e.target.checked})}/> {c.receive}</label>:r.error?<FanAction onClick={r.retry}>{t.retry}</FanAction>:<p>{t.loading}</p>}</section>{presence.data?.canConfigure&&<FanAction leadingIcon={<Settings/>} onClick={()=>{if(summary.current)rememberOverlayTrigger(summary.current);if(panel.current)panel.current.open=false;setPresenceFailed(false);setPresenceOpen(true);}}>{locale==='ko'?'접속 상태 공개':presenceCopy(locale).setting}</FanAction>}{detail.membership.role!=='member'&&<FanAction href={`/pages/groups/${detail.page.id}/manage?locale=${locale}`} leadingIcon={<Settings/>}>{m.manage}</FanAction>}{detail.membership.role==='owner'?<p>{c.transferFirst}</p>:<FanAction disabled={busy} leadingIcon={<LogOut/>} onClick={()=>{if(window.confirm(c.leave))void mutate('/membership','DELETE');}}>{m.leave}</FanAction>}</>}{failed&&<p role='alert'>{t.error}</p>}</div></details>{presenceOpen&&presence.data?.canConfigure&&<ArtistPresenceDialog locale={locale} enabled={presence.data.enabled} pending={presenceBusy} failed={presenceFailed} onClose={()=>setPresenceOpen(false)} onSave={enabled=>void savePresence(enabled)}/>}</>;
}

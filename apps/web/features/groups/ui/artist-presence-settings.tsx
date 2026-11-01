"use client";
import { useState } from 'react';
import { z } from 'zod';
import { FanAppFrame,FanContentContainer } from '@/components/fan-shell/fan-app-shell';
import { FanAction } from '@/components/fan-ui/fan-action';
import type { AppLocale } from '@/i18n/locales';
import { useGroupResource } from './use-group-resource';
import { groupsCopy } from './copy';
import { presenceCopy,artistOnlyCopy } from './presence-copy';
import styles from './groups.module.css';
const parse=(v:unknown)=>z.object({enabled:z.boolean(),canConfigure:z.boolean()}).parse(v);
export function ArtistPresenceSettings({locale}:{locale:AppLocale}){
 const t=groupsCopy(locale),c=presenceCopy(locale),r=useGroupResource('/api/groups/me/presence',parse),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const toggle=async()=>{if(busy||!r.data?.canConfigure)return;setBusy(true);setFailed(false);try{await r.request('/api/groups/me/presence',{method:'PUT',body:JSON.stringify({enabled:!r.data.enabled})});r.retry();}catch{setFailed(true);}finally{setBusy(false);}};
 return <FanAppFrame locale={locale} groupsEnabled currentPath='/my' mainId='presence-main'><FanContentContainer as='main' id='presence-main' className={styles.page}><h1>{c.setting}</h1>{!r.ready?<p role='status'>{t.loading}</p>:!r.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/my/presence?locale=${locale}`)}`}>{t.login}</FanAction>:r.error?<section className={styles.status} role='alert'><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></section>:r.data?.canConfigure?<section className={styles.panel}><p>{c.description}</p><button role='switch' aria-checked={r.data.enabled} className={styles.chip} disabled={busy} onClick={()=>void toggle()}>{r.data.enabled?c.on:c.off}</button>{failed&&<p role='alert'>{t.error}</p>}</section>:r.data?<p className={styles.status}>{artistOnlyCopy[locale]}</p>:<p role='status'>{t.loading}</p>}</FanContentContainer></FanAppFrame>;
}

"use client";
import {useState} from 'react';
import type {Route} from 'next';
import {useRouter} from 'next/navigation';
import {z} from 'zod';
import {FanAppFrame} from '@/components/fan-shell/fan-app-shell';
import {FanAction} from '@/components/fan-ui/fan-action';
import type {AppLocale} from '@/i18n/locales';
import {GroupSettingsMenu} from '@/features/profile/ui/group-settings-menu';
import {useGroupResource} from './use-group-resource';
import {groupsCopy} from './copy';
import {artistOnlyCopy} from './presence-copy';
import manage from './group-manage.module.css';
import {ArtistPresenceDialog} from './artist-presence-dialog';
const parse=(v:unknown)=>z.object({enabled:z.boolean(),canConfigure:z.boolean()}).parse(v);
export function ArtistPresenceSettings({locale,previewName}:{locale:AppLocale;previewName?:string}){
 const t=groupsCopy(locale),router=useRouter(),r=useGroupResource('/api/groups/me/presence',parse),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const close=()=>router.push(`/settings?locale=${locale}` as Route);
 const save=async(enabled:boolean)=>{if(busy||!r.data?.canConfigure)return;setBusy(true);setFailed(false);try{await r.request('/api/groups/me/presence',{method:'PUT',body:JSON.stringify({enabled})});r.retry();close();}catch{setFailed(true);}finally{setBusy(false);}};
 return <FanAppFrame locale={locale} groupsEnabled currentPath='/my' mainId='settings-content'><GroupSettingsMenu locale={locale}/>{!r.ready?<p role='status'>{t.loading}</p>:!r.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/my/presence?locale=${locale}`)}`}>{t.login}</FanAction>:r.error?<section role='alert'><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></section>:r.data?.canConfigure?<ArtistPresenceDialog locale={locale} variant='my' previewName={previewName} enabled={r.data.enabled} pending={busy} failed={failed} onClose={close} onSave={enabled=>void save(enabled)}/>:r.data?<p className={manage.presenceNotice}>{artistOnlyCopy[locale]}</p>:<p role='status'>{t.loading}</p>}</FanAppFrame>;
}

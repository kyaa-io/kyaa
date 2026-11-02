"use client";
import {useId,useState} from 'react';
import {Star} from 'lucide-react';
import {fanActionClassName} from '@/components/fan-ui/fan-action';
import type {AppLocale} from '@/i18n/locales';
import type {GroupDetail} from '../domain/contracts';
import {useGroupRequest} from './use-group-resource';
import {groupsCopy} from './copy';
import styles from './groups.module.css';
export function GroupBookmarkAction({detail,locale,refresh,iconOnly=false,disabled=false}:{detail:GroupDetail;locale:AppLocale;refresh:()=>void;iconOnly?:boolean;disabled?:boolean}){
 const {request,authenticated,ready}=useGroupRequest(),t=groupsCopy(locale),errorId=useId(),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 async function toggle(){if(busy)return;setBusy(true);setFailed(false);try{await request(`/api/groups/${detail.page.id}/bookmark`,{method:detail.bookmarked?'DELETE':'PUT',body:JSON.stringify({requestId:crypto.randomUUID()})});refresh();}catch{setFailed(true);}finally{setBusy(false);}}
 const label=detail.bookmarked?t.unbookmark:t.bookmark;
 return <span className={styles.bookmarkControl}><button type='button' className={fanActionClassName(iconOnly?'text':'neutral',{className:iconOnly?styles.bookmarkIcon:styles.bookmarkButton})} disabled={disabled||busy||!ready||!authenticated} aria-label={label} aria-pressed={detail.bookmarked} aria-busy={busy} aria-describedby={failed?errorId:undefined} onClick={()=>void toggle()}><Star size={22} fill={detail.bookmarked?'currentColor':'none'} aria-hidden='true'/>{!iconOnly&&label}</button>{failed&&<span id={errorId} role='alert' className={styles.bookmarkError}>{t.error}</span>}</span>;
}

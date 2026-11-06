"use client";
import { fanUiText } from '@/components/fan-ui/fan-ui-copy';
import { FanSkeleton, FanSkeletonStatus } from '@/components/fan-ui/fan-skeleton';
import { Radio } from 'lucide-react';
import type { AppLocale } from '@/i18n/locales';
import { useGroupPresence } from './use-group-presence';
import { groupsCopy } from './copy';
import { presenceCopy, presenceUnavailableCopy } from './presence-copy';
import styles from '@/components/fan-ui/fan-presence-strip.module.css';

/** 접속 띠. 한 줄 높이 56px로 고정이고, 값을 읽는 동안에도 같은 자리를 차지한다. 첫 칸은 팬 수다. */
export function GroupPresence({pageId,locale,member=false,mode="compact",memberCount}:{pageId:string|null;locale:AppLocale;member?:boolean;mode?:"hidden"|"compact";memberCount?:number}){
 const r=useGroupPresence(pageId,true,member),t=groupsCopy(locale),c=presenceCopy(locale);
 if(mode==='hidden')return null;
 const count=(value:number)=>value.toLocaleString(locale);
 const fans=memberCount===undefined?<span className={styles.cell}><FanSkeleton width={56} height={16}/></span>:<span className={styles.cell}>{fanUiText(locale,'fanCount',[count(memberCount)])}</span>;
 if(!r.data)return <section className={styles.strip} aria-label={t.groups} aria-busy={r.error?undefined:true}>{fans}{r.error
  ?<span className={styles.errorCell} role='status'><span className={styles.errorText}>{presenceUnavailableCopy[locale]}</span><button type='button' className={styles.retry} onClick={r.retry}>{t.retry}</button></span>
  :<><span className={styles.cell}><FanSkeleton width={72} height={16}/></span><span className={styles.cell}><FanSkeleton width={72} height={16}/></span><FanSkeletonStatus locale={locale}/></>}</section>;
 const seen=r.data.artists.filter(artist=>artist.online||artist.visitedToday),live=seen.some(artist=>artist.online)?seen.filter(artist=>artist.online):seen,online=live.some(artist=>artist.online);
 return <section className={styles.strip} aria-label={t.groups}>{fans}
  <span className={styles.cell}>{fanUiText(locale,'presenceNow',[count(r.data.onlineCount)])}</span>
  <span className={styles.cell}>{fanUiText(locale,'presenceToday',[count(r.data.todayCount)])}</span>
  {live.length>0&&<span className={styles.artistCell} data-online={online}><Radio size={16} aria-hidden='true'/><strong className={styles.artistName}>{live.map(artist=>artist.nickname).join(', ')}</strong><span className={styles.artistState}>{online?c.connected:c.visited}</span></span>}
 </section>;
}

"use client";
import { fanUiText } from '@/components/fan-ui/fan-ui-copy';
import { RollingNumber } from '@/components/fan-ui/rolling-number';
import { FanSkeleton, FanSkeletonStatus } from '@/components/fan-ui/fan-skeleton';
import { Radio } from 'lucide-react';
import type { AppLocale } from '@/i18n/locales';
import { useGroupPresence } from './use-group-presence';
import { useOptionalGroupPage } from './group-page-context';
import { groupsCopy } from './copy';
import { presenceCopy, presenceUnavailableCopy } from './presence-copy';
import { PageChallengeStat } from './page-challenge-stat';
import styles from './group-presence.module.css';

/** 머리의 접속 한 줄(261107-2 U1): `팬 123 · 지금 접속 4 · 오늘 방문 31`. 0인 접속·방문은 그리지 않고, 팬 수는 늘 첫 값이다. 높이 24px로 고정이라 읽는 동안에도 같은 자리를 차지한다. */
export function GroupPresence({pageId,locale,member=false,mode="compact",memberCount,challengeSlug}:{pageId:string|null;locale:AppLocale;member?:boolean;mode?:"hidden"|"compact";memberCount?:number;/** 찐팬 100 챌린지 항목을 읽을 팬페이지(VISUAL-K ②). */challengeSlug?:string}){
 const r=useGroupPresence(pageId,true,member),t=groupsCopy(locale),c=presenceCopy(locale);
 // 팬페이지면 연결 계정 닉네임 대신 그 페이지의 표시 이름(예: 엘리나)을 쓴다(11/13 감독).
 const pageName=useOptionalGroupPage()?.celebrity?.name;
 if(mode==='hidden')return null;
 const count=(value:number)=>value.toLocaleString(locale);
 const metric=(key:'fanCount'|'presenceNow'|'presenceToday',value:number)=>{
  const [before,after]=fanUiText(locale,key,['\u0001']).split('\u0001');
  return <>{before}<RollingNumber value={value} format={count} initialFromZero emphasized />{after}</>;
 };
 const fans=memberCount===undefined?<span className={styles.item}><FanSkeleton width={56} height={16}/></span>:<span className={styles.item}>{metric('fanCount',memberCount)}</span>;
 if(!r.data)return <section className={styles.line} aria-label={t.groups} aria-busy={r.error?undefined:true}>{fans}{r.error
  ?<span className={styles.error} role='status'><span className={styles.errorText}>{presenceUnavailableCopy[locale]}</span><button type='button' className={styles.retry} onClick={r.retry}>{t.retry}</button></span>
  :<><span className={styles.item}><FanSkeleton width={72} height={16}/></span><FanSkeletonStatus locale={locale}/></>}</section>;
 const seen=r.data.artists.filter(artist=>artist.online||artist.visitedToday),live=seen.some(artist=>artist.online)?seen.filter(artist=>artist.online):seen,online=live.some(artist=>artist.online);
 // 아티스트 표시는 팬 수 바로 뒤에 둔다(390에서 줄 끝에 잘리지 않게). 지금 접속 중이면 핑크 알약 + 점이 세 번 퍼진다.
 return <section className={styles.line} aria-label={t.groups} data-wrap={challengeSlug?'':undefined}>{fans}
  {live.length>0&&<span className={styles.artist} data-online={online} role={online?'status':undefined}>{online?<span className={styles.liveDot} aria-hidden='true'/>:<Radio size={16} aria-hidden='true'/>}<strong className={styles.artistName}>{pageName??live.map(artist=>artist.nickname).join(', ')}</strong><span className={styles.artistState}>{online?c.connected:c.visited}</span></span>}
  {r.data.onlineCount>0&&<span className={styles.item} data-presence='online'><span className={styles.onlineDot} aria-hidden="true"/>{metric('presenceNow',r.data.onlineCount)}</span>}
  {r.data.todayCount>0&&<span className={styles.item} data-presence='today'>{metric('presenceToday',r.data.todayCount)}</span>}
  {challengeSlug&&<PageChallengeStat slug={challengeSlug} locale={locale} className={styles.item}/>}
 </section>;
}

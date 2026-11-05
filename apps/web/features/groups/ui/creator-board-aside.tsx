"use client";
import {useState} from "react";
import {CreatorAttendanceEntry} from "@/features/dukjil/ui/creator-attendance-entry";
import Link from 'next/link';
import type {Route} from 'next';
import {ArrowRight,BookOpen,Heart,Medal,MessageCircle} from 'lucide-react';
import type {AppLocale} from '@/i18n/locales';
import type {MySummary} from '@/features/my/domain/my-summary';
import {FanAction} from '@/components/fan-ui/fan-action';
import {fanStageLabel} from '@/features/rewards/domain/fan-stage';
import {levelLabel} from '@/features/passport/domain/passport-read-model';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {groupBenefitsCopy} from './group-benefits-copy';
import {groupsCopy} from './copy';
import {managementMembersCopy} from './management-members-copy';
import {creatorAsideCopy} from './creator-aside-copy';
import styles from './creator-board-aside.module.css';

export type CreatorBoardEvent={title:string;image:string;href:string;exchangeHref?:string};
export function CreatorBoardAside({slug,locale,owned,passportId,event}:{slug:string;locale:AppLocale;owned?:MySummary['creators'][number];passportId?:string|null;event?:CreatorBoardEvent}){
 const [attendanceOpen,setAttendanceOpen]=useState(false);
 const t=groupsCopy(locale),c=creatorAsideCopy(locale),w=walletCopy(locale),passport=passportId??owned?.passport?.id;
 const passportHref=passport?`/passports/${passport}?locale=${locale}`:`/${slug}?locale=${locale}&tab=certifications`;
 return <aside className={styles.aside}>
  <section><h2>{locale==='ko'?'팬 활동':t.activities}</h2>
   <Link className={styles.attendance} href={`/my/wallet?view=attendance&locale=${locale}`} onClick={event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();setAttendanceOpen(true);}}><img src='/images/community-stamps/daily-checkin.png' width={48} height={48} alt=''/><strong>{w.attendance}</strong><ArrowRight size={16} aria-hidden='true'/></Link>
   <div className={styles.tiles}><Link href={passportHref as Route}><Medal size={24} aria-hidden='true'/><span>{managementMembersCopy(locale).tier}{owned?.passport&&` · ${owned.passport.stageProgress?.current?fanStageLabel(locale,owned.passport.stageProgress.current):levelLabel(locale,owned.passport.tier)}`}</span></Link><Link href={passportHref as Route}><BookOpen size={24} aria-hidden='true'/><span>{locale==='ko'?'패스포트':c.passport}</span></Link></div><Link className={styles.firstPost} href={`/${slug}?tab=board&source=fans&locale=${locale}`}><MessageCircle size={20}/><strong>{locale==='ko'?'오늘 첫 게시글':'First post today'}</strong><ArrowRight size={18}/></Link>
  </section>
  <section className={styles.events}><h2>{locale==='ko'?'응원과 이벤트':t.events}</h2>
   {event&&<div className={styles.goods}><Link href={event.href as Route}><img src={event.image} alt='' width={256} height={160}/><strong>{event.title}</strong></Link>{event.exchangeHref&&<FanAction variant='neutral' href={event.exchangeHref}>{locale==='ko'?'응모권 교환':w.exchange}</FanAction>}</div>}
   <FanAction variant='text' href={`/benefits?locale=${locale}`} leadingIcon={<Heart/>} trailingIcon={<ArrowRight/>}>{groupBenefitsCopy(locale).title}</FanAction>
  </section>
 {attendanceOpen&&<CreatorAttendanceEntry slug={slug} locale={locale} reviewHref={passportHref} onClose={()=>setAttendanceOpen(false)}/>}
 </aside>;
}

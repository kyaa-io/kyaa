"use client";
import {useState} from "react";
import {CreatorAttendanceEntry} from "@/features/dukjil/ui/creator-attendance-entry";
import {DukjilProvider} from "@/features/dukjil/ui/dukjil-provider";
import {FanMissions} from "@/features/dukjil/ui/fan-missions";
import {JjinfanGauge} from "@/features/rankings/ui/jjinfan-gauge";
import Link from 'next/link';
import type {Route} from 'next';
import {ArrowRight,Heart} from 'lucide-react';
import type {AppLocale} from '@/i18n/locales';
import type {MySummary} from '@/features/my/domain/my-summary';
import {FanAction} from '@/components/fan-ui/fan-action';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {groupBenefitsCopy} from './group-benefits-copy';
import {groupsCopy} from './copy';
import {FanGradeCard} from '@/features/rewards/ui/fan-grade-card';
import {nextTierStep} from '@/features/my/ui/my-passport-card';
import {creatorAsideCopy} from './creator-aside-copy';
import {useOptionalGroupPage} from './group-page-context';
import styles from './creator-board-aside.module.css';

export type CreatorBoardEvent={title:string;image:string;href:string;exchangeHref?:string};
export function CreatorBoardAside({slug,locale,owned,passportId,event}:{slug:string;locale:AppLocale;owned?:MySummary['creators'][number];passportId?:string|null;event?:CreatorBoardEvent}){
 const [attendanceOpen,setAttendanceOpen]=useState(false);
 const framed=useOptionalGroupPage(),pageName=owned?.celebrity.name??framed?.celebrity?.name??framed?.page?.name,t=groupsCopy(locale),c=creatorAsideCopy(locale),w=walletCopy(locale),passport=passportId??owned?.passport?.id;
 const passportHref=passport?`/passports/${passport}?locale=${locale}`:`/${slug}?locale=${locale}&tab=certifications`;
 return <aside className={styles.aside}>
  <JjinfanGauge slug={slug} locale={locale}/>
  <DukjilProvider slug={slug} locale={locale}><FanMissions locale={locale} slug={slug} title={locale==='ko'?'팬 활동':t.activities} passportHref={passportHref} proofHref={`/${slug}?tab=certifications&locale=${locale}`} onAttendance={()=>setAttendanceOpen(true)} footer={<FanGradeCard locale={locale} href={owned?.passport?`/guide/jjinfan?locale=${locale}`:passportHref} tier={owned?.passport?.tier} stage={owned?.passport?.stageProgress} step={owned?.passport?nextTierStep(locale,owned.passport):null}/>}/></DukjilProvider>
  <section className={styles.events}><h2>{locale==='ko'?'응원과 이벤트':t.events}</h2>
   {event&&<div className={styles.goods}><Link href={event.href as Route}><img src={event.image} alt='' width={256} height={160}/><strong>{event.title}</strong></Link>{event.exchangeHref&&<FanAction variant='neutral' href={event.exchangeHref}>{locale==='ko'?'응모권 교환':w.exchange}</FanAction>}</div>}
   <FanAction variant='text' href={`/benefits?locale=${locale}`} leadingIcon={<Heart/>} trailingIcon={<ArrowRight/>}>{groupBenefitsCopy(locale).title}</FanAction>
  </section>
 {attendanceOpen&&<CreatorAttendanceEntry slug={slug} locale={locale} pageName={pageName} reviewHref={passportHref} onClose={()=>setAttendanceOpen(false)}/>}
 </aside>;
}

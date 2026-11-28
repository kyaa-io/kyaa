'use client';
import {useState} from 'react';
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import {useDukjil} from '@/features/dukjil/ui/dukjil-provider';
import {activeToday} from '@/features/dukjil/domain/dukjil-ui';
import {CelebrityMiniCalendar} from '@/features/fanpage/ui/celebrity-calendar';
import type {PublishedCelebrity} from '@/server/content/content-domain';
import type {AppLocale} from '@/i18n/locales';
import {creatorHomeCardCopy} from './creator-home-card-copy';
import styles from './groups.module.css';
import cardStyles from './creator-schedule-card.module.css';
export function CreatorScheduleCard({celebrity,locale}:{celebrity:PublishedCelebrity;locale:AppLocale;schedule?:{label:string;note:string}}){
 const [month,setMonth]=useState<string>();
 const dukjil=useDukjil();
 const attendance=dukjil?.authenticated && dukjil.status==="on" && dukjil.slug===celebrity.slug ? dukjil : null;
 const today=activeToday(attendance?.today);
 const checkedDates=[attendance?.attendance?.result?.attendanceDate, today?.attendance?.attendedToday ? today.kstDate : undefined];
 const card=creatorHomeCardCopy(locale);
 return <section className={styles.sourceHomeCard}>
  <header className={cardStyles.header}><h2>{card.schedule}</h2><FanSectionLink className={cardStyles.action} href={`/${celebrity.slug}?tab=calendar&locale=${locale}${month?`&month=${month}`:""}`}>{card.calendar}</FanSectionLink></header>
  <CelebrityMiniCalendar celebrity={celebrity} locale={locale} upcomingLive={null} embedded collapseEmpty attendanceDates={checkedDates} onMonthChange={setMonth}/>
 </section>;
}

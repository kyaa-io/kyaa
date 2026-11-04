'use client';
import {useState} from 'react';
import {FanAction} from '@/components/fan-ui/fan-action';
import {CelebrityMiniCalendar} from '@/features/fanpage/ui/celebrity-calendar';
import type {PublishedCelebrity} from '@/server/content/content-domain';
import type {AppLocale} from '@/i18n/locales';
import styles from './groups.module.css';
import cardStyles from './creator-schedule-card.module.css';
export function CreatorScheduleCard({celebrity,locale}:{celebrity:PublishedCelebrity;locale:AppLocale;schedule?:{label:string;note:string}}){
 const [month,setMonth]=useState<string>();
 return <section className={styles.sourceHomeCard}>
  <header className={cardStyles.header}><h2>{locale==='ko'?'다가오는 일정':'Upcoming schedule'}</h2><FanAction className={cardStyles.action} variant='text' href={`/${celebrity.slug}?tab=calendar&locale=${locale}${month?`&month=${month}`:""}`}>{locale==='ko'?'캘린더 크게 보기':'View calendar'}</FanAction></header>
  <CelebrityMiniCalendar celebrity={celebrity} locale={locale} upcomingLive={null} embedded onMonthChange={setMonth}/>
 </section>;
}

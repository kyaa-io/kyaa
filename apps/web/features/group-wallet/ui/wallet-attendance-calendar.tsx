import { Check } from "lucide-react";
import { CalendarDayNumber } from "@/components/fan-calendar/calendar-parts";
import type { AppLocale } from "@/i18n/locales";
import { walletCopy } from "./copy";
import styles from "./wallet.module.css";

export function WalletAttendanceCalendar({locale,today,days}:{locale:AppLocale;today:string;days:{date:string;points:10|30}[]}) {
 const month=today.slice(0,7), first=new Date(`${month}-01T00:00:00Z`), offset=first.getUTCDay(), length=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 const completed=new Map(days.map(day=>[day.date,day.points])), c=walletCopy(locale);
 return <div className={styles.calendar}>
  <h3><time dateTime={month}>{new Intl.DateTimeFormat(locale,{year:'numeric',month:'long',timeZone:'UTC'}).format(first)}</time></h3>
  <div className={styles.weekdays} aria-hidden="true">{Array.from({length:7},(_,index)=><span key={index}>{new Intl.DateTimeFormat(locale,{weekday:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2026,10,1+index)))}</span>)}</div>
  <ol className={styles.calendarDays} aria-label={c.attendance}>
   {Array.from({length},(_,index)=>{const date=`${month}-${String(index+1).padStart(2,'0')}`,points=completed.get(date);return <li key={date} style={index===0?{gridColumnStart:offset+1}:undefined} data-complete={Boolean(points)}>
    <CalendarDayNumber date={date} today={today}/>
    {points&&<span aria-label={`${date} · ${c.attendance} · ${points}P`}><Check aria-hidden="true" size={14}/>{points}P</span>}
   </li>;})}
  </ol>
 </div>;
}

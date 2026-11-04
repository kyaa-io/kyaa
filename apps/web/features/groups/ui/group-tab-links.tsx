"use client";
import Link from "next/link";
import type {Route} from "next";
import type {AppLocale} from "@/i18n/locales";
import {FanTabNav} from "./fan-tab-nav";
import {groupsCopy} from "./copy";
import {groupCalendarLabel} from "./group-calendar-label";
import {membersAndRank} from "./home-copy";
import styles from "./groups.module.css";

/** 모임·팬페이지가 함께 쓰는 탭 목록. 홈·게시판·방·캘린더 뒤에 멤버·랭킹을 붙인다. */
export const groupTabs=['home','board','rooms','calendar'] as const;

export function GroupTabLinks({id,label,locale,current,active,href,members=true,scroll=true}:{id?:string;label:string;locale:AppLocale;current:string;active:string;href:(tab:string)=>string;members?:boolean;scroll?:boolean}){
 const t=groupsCopy(locale);
 return <FanTabNav id={id} className={styles.tabs} label={label} current={current}>{groupTabs.map(value=><Link className={styles.tab} key={value} href={href(value) as Route} scroll={scroll?undefined:false} aria-current={active===value?'page':undefined}>{value==='calendar'?groupCalendarLabel[locale]:t[value]}</Link>)}{members&&<Link className={styles.tab} href={href('members') as Route} aria-current={active==='members'?'page':undefined}>{membersAndRank[locale]}</Link>}</FanTabNav>;
}
